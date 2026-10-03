import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireChatRun, hasChatRun } from './chat-run';
import { assertNoPendingQuestion, assertQuestionGeneration, continueQuestions, questionOperation } from './questions';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { pauseDiskWrites } from './disk-storage';

function setupChat() {
  pauseDiskWrites(true);
  const chat = createDConversation();
  useChatStore.setState({ conversations: [chat] });
  return chat;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => resolve = done);
  return { promise, resolve };
}

test('Stop keeps sends and edits blocked until deferred command and disk cleanup finishes', async () => {
  const chat = setupChat();
  const lease = acquireChatRun(chat.id);
  const commandCleanup = deferred();
  const diskCleanup = deferred();
  const enteredDiskCleanup = deferred();
  useChatStore.getState().setAbortController(chat.id, new AbortController(), 'test');
  const finishing = (async () => {
    try {
      await commandCleanup.promise;
      enteredDiskCleanup.resolve();
      await diskCleanup.promise;
    } finally { lease.release(); }
  })();
  try {
    useChatStore.getState().abortConversationTemp(chat.id);
    assert.equal(getConversation(chat.id)?._abortController, null);
    assert.throws(() => assertQuestionGeneration(chat.id), /Wait for the running chat/);
    assert.throws(() => assertNoPendingQuestion(chat.id), /Wait for the running chat/);
    assert.throws(() => acquireChatRun(chat.id), /Wait for the running chat/);
    commandCleanup.resolve();
    await enteredDiskCleanup.promise;
    assert.equal(hasChatRun(chat.id), true);
    assert.throws(() => assertQuestionGeneration(chat.id), /Wait for the running chat/);
    diskCleanup.resolve();
    await finishing;
    assert.doesNotThrow(() => assertQuestionGeneration(chat.id));
    assert.doesNotThrow(() => assertNoPendingQuestion(chat.id));
  } finally { commandCleanup.resolve(); diskCleanup.resolve(); await finishing; }
});

test('a late release cannot unlock a subsequent turn', () => {
  const chat = setupChat();
  const oldLease = acquireChatRun(chat.id);
  oldLease.release();
  const newLease = acquireChatRun(chat.id);
  try {
    oldLease.release();
    assert.equal(oldLease.isCurrent(), false);
    assert.equal(newLease.isCurrent(), true);
    assert.throws(() => assertQuestionGeneration(chat.id), /Wait for the running chat/);
  } finally { newLease.release(); }
});

test('generation failure releases ownership through finally', async () => {
  const chat = setupChat();
  const failed = (async () => {
    const lease = acquireChatRun(chat.id);
    try { await Promise.resolve(); throw new Error('generation failed'); }
    finally { lease.release(); }
  })();
  assert.throws(() => assertQuestionGeneration(chat.id), /Wait for the running chat/);
  await assert.rejects(failed, /generation failed/);
  assert.equal(hasChatRun(chat.id), false);
  assert.doesNotThrow(() => assertQuestionGeneration(chat.id));
});

test('question continuation stays registered until its leased turn finishes', async () => {
  const chat = setupChat();
  useChatStore.getState()._editConversation(chat.id, { pendingQuestions: [{ invocationId: 'question', messageId: 'message', model: chat.chatConfig.llmId, questions: [{ id: 'choice', text: 'Choose' }], answered: true }] });
  const cleanup = deferred();
  const active = continueQuestions(chat.id, async () => {
    assert.doesNotThrow(() => assertQuestionGeneration(chat.id, true));
    const lease = acquireChatRun(chat.id);
    try { await cleanup.promise; return true; }
    finally { lease.release(); }
  });
  try {
    assert.equal(questionOperation(chat.id), 'continuing');
    assert.throws(() => assertQuestionGeneration(chat.id, true), /Wait for the running chat/);
    assert.equal(await continueQuestions(chat.id, async () => { throw new Error('duplicate generation'); }), false);
    cleanup.resolve();
    assert.equal(await active, true);
    assert.equal(questionOperation(chat.id), undefined);
    assert.equal(hasChatRun(chat.id), false);
    assert.throws(() => assertQuestionGeneration(chat.id), /Wait for the answer/);
  } finally { cleanup.resolve(); await active; }
});
