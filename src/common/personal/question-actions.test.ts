import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments, createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { create_FunctionCallInvocation_ContentFragment, isContentFragment, isToolResponsePart } from '~/common/stores/chat/chat.fragments';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { emptyWorkspace, validateWorkspace } from './workspace-schema';
import { currentWorkspace, flushDisk, installWorkspace, pauseDiskWrites } from './disk-storage';
import { answerQuestions, assertNoPendingQuestion, assertQuestionGeneration, continueQuestions, questionAnswerKey } from './questions';

function setupQuestion() {
  installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  const chat = createDConversation();
  const message = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('question', 'ask_user_question', JSON.stringify({ questions: [{ id: 'choice', text: 'Which option?' }] }))]);
  chat.messages = [message];
  chat.pendingQuestions = [{ invocationId: 'question', messageId: message.id, model: chat.chatConfig.llmId, questions: [{ id: 'choice', text: 'Which option?' }] }];
  useChatStore.setState({ conversations: [chat] });
  return chat;
}
function successfulSave() {
  let revision = 0;
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); validateWorkspace(body.workspace);
    return Response.json({ workspace: { ...body.workspace, revision: ++revision } });
  };
}
function responses(conversationId: string) {
  return getConversation(conversationId)!.messages[0].fragments.filter(isContentFragment).map(fragment => fragment.part).filter(isToolResponsePart);
}

test('Dismiss saves one paired error response and unlocks the chat without generation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = successfulSave();
  try {
    const chat = setupQuestion();
    assert.throws(() => assertQuestionGeneration(chat.id));
    assert.equal(await answerQuestions(chat.id, {}, true), true);
    assert.deepEqual(getConversation(chat.id)!.pendingQuestions, []);
    const result = responses(chat.id);
    assert.equal(result.length, 1); assert.equal(result[0].id, 'question');
    assert.equal(result[0].error, 'dismissed by user');
    assert.deepEqual(JSON.parse(result[0].response.result), { dismissed: true });
    assert.doesNotThrow(() => assertNoPendingQuestion(chat.id));
    assert.doesNotThrow(() => assertQuestionGeneration(chat.id));
    assert.equal(getConversation(chat.id)!.messages.length, 1);
    assert.equal(await answerQuestions(chat.id, {}, true), false);
    assert.equal(responses(chat.id).length, 1);
    const workspace = currentWorkspace();
    useChatStore.setState({ conversations: [] }); installWorkspace(workspace);
    await useChatStore.persist.rehydrate();
    assert.deepEqual(getConversation(chat.id)!.pendingQuestions, []);
    assert.equal(responses(chat.id).length, 1);
  } finally { globalThis.fetch = originalFetch; pauseDiskWrites(true); }
});

test('failed Dismiss restores pending questions and preserves concurrent messages', async () => {
  const originalFetch = globalThis.fetch;
  let reject!: (error: Error) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => entered = resolve);
  globalThis.fetch = async () => { entered(); return await new Promise<Response>((_resolve, fail) => reject = fail); };
  try {
    const chat = setupQuestion();
    const saving = answerQuestions(chat.id, {}, true);
    await started;
    assert.throws(() => assertNoPendingQuestion(chat.id), /Wait/);
    assert.equal(await answerQuestions(chat.id, {}, true), false);
    const concurrent = createDMessageTextContent('user', 'Keep this message');
    useChatStore.getState()._editConversation(chat.id, current => ({ messages: [...current.messages, concurrent] }));
    reject(new Error('Disk unavailable'));
    await assert.rejects(saving, /Disk unavailable/);
    assert.equal(getConversation(chat.id)!.messages.at(-1)?.id, concurrent.id);
    assert.equal(responses(chat.id).length, 0);
    assert.equal(getConversation(chat.id)!.pendingQuestions![0].answered, undefined);
    assert.throws(() => assertQuestionGeneration(chat.id));
    globalThis.fetch = successfulSave();
    assert.equal(await answerQuestions(chat.id, {}, true), true);
    assert.equal(responses(chat.id).length, 1);
  } finally { globalThis.fetch = originalFetch; pauseDiskWrites(true); }
});

test('saved answers survive reload, are never dismissed or auto-run, and allow explicit Continue', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = successfulSave();
  try {
    const chat = setupQuestion();
    assert.equal(await answerQuestions(chat.id, { [questionAnswerKey('question', 'choice')]: 'A' }), true);
    assert.equal(getConversation(chat.id)!.messages.length, 1);
    assert.equal(await answerQuestions(chat.id, {}, true), false);
    assert.deepEqual(JSON.parse(responses(chat.id)[0].response.result), { answers: { choice: 'A' } });
    const workspace = currentWorkspace();
    useChatStore.setState({ conversations: [] }); installWorkspace(workspace);
    await useChatStore.persist.rehydrate();
    assert.equal(getConversation(chat.id)!.pendingQuestions![0].answered, true);
    assert.equal(getConversation(chat.id)!.messages.length, 1);
    assert.throws(() => assertQuestionGeneration(chat.id));
    let generated = 0;
    assert.equal(await continueQuestions(chat.id, async () => { generated++; return true; }), true);
    assert.equal(generated, 1);
    await flushDisk();
  } finally { globalThis.fetch = originalFetch; pauseDiskWrites(true); }
});


test('composer refuses saved answers, alternate modes and extra context without consuming drafts', async () => {
  const { sendComposerQuestionAnswer } = await import('./question-composer');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = successfulSave();
  try {
    const chat = setupQuestion();
    let cleared = 0; let generated = 0;
    const clear = () => { cleared++; }; const generate = async () => { generated++; return true; };
    for (const mode of ['append-user', 'generate-image', 'beam-content']) {
      await assert.rejects(sendComposerQuestionAnswer(chat.id, { mode, text: 'A', hasContext: false }, clear, generate), /another message mode/);
    }
    await assert.rejects(sendComposerQuestionAnswer(chat.id, { mode: 'generate-content', text: 'A', hasContext: true }, clear, generate), /keeping attachments/);
    await assert.rejects(sendComposerQuestionAnswer(chat.id, { mode: 'generate-content', text: ' ', hasContext: false }, clear, generate), /Answer every question/);
    assert.equal(cleared, 0); assert.equal(generated, 0); assert.equal(responses(chat.id).length, 0);
    assert.equal(await answerQuestions(chat.id, { [questionAnswerKey('question', 'choice')]: 'A' }), true);
    await assert.rejects(sendComposerQuestionAnswer(chat.id, { mode: 'generate-content', text: 'My next task', hasContext: false }, clear, generate), /Click Continue/);
    assert.equal(cleared, 0); assert.equal(generated, 0); assert.equal(responses(chat.id).length, 1);
  } finally { globalThis.fetch = originalFetch; pauseDiskWrites(true); }
});

test('composer saves before consuming a plain answer, preserves it on failure, and does not resend after continuation failure', async () => {
  const { sendComposerQuestionAnswer } = await import('./question-composer');
  const originalFetch = globalThis.fetch;
  let reject!: (error: Error) => void; let entered!: () => void;
  const started = new Promise<void>(resolve => entered = resolve);
  globalThis.fetch = async () => { entered(); return await new Promise<Response>((_resolve, fail) => reject = fail); };
  try {
    const chat = setupQuestion();
    let cleared = 0; let generated = 0;
    const draft = { mode: 'generate-content', text: 'A', hasContext: false };
    const sending = sendComposerQuestionAnswer(chat.id, draft, () => { cleared++; }, async () => { generated++; return true; });
    await started;
    assert.equal(cleared, 0); assert.equal(generated, 0);
    reject(new Error('Save failed')); await assert.rejects(sending, /Save failed/);
    assert.equal(cleared, 0); assert.equal(generated, 0); assert.equal(responses(chat.id).length, 0);
    globalThis.fetch = successfulSave();
    await assert.rejects(sendComposerQuestionAnswer(chat.id, draft, () => { cleared++; }, async () => {
      generated++;
      const savedChat = (currentWorkspace().stores['app-chats']!.state.conversations as ReturnType<typeof createDConversation>[])[0];
      assert.equal(savedChat.pendingQuestions![0].answered, true);
      throw new Error('Gateway unavailable');
    }), /Gateway unavailable/);
    assert.equal(cleared, 1); assert.equal(generated, 1); assert.equal(responses(chat.id).length, 1);
    await assert.rejects(sendComposerQuestionAnswer(chat.id, draft, () => { cleared++; }, async () => { generated++; return true; }), /Click Continue/);
    assert.equal(cleared, 1); assert.equal(generated, 1);
  } finally { globalThis.fetch = originalFetch; pauseDiskWrites(true); }
});
