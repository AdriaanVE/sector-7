import { acquireChatRun } from '~/common/personal/chat-run';
import { compactionPrefix } from '~/common/personal/compaction';
import { pendingFunctionCalls } from '~/common/personal/folder-tools';
import { dispatchLocalTool, isLocalTool, localToolPhase } from '~/common/personal/local-tool-dispatch';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { assertQuestionGeneration } from '~/common/personal/questions';
import { createPlaceholderVoidFragment, createTextContentFragment, create_FunctionCallResponse_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { messagePhase, questionInvocations, PendingQuestion, questionSchema, type IncompleteReason } from '~/common/personal/attention';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { assembleRequest } from '~/common/personal/assemble-request';
import { flushDisk } from '~/common/personal/disk-storage';
import { filterCrossModelReasoning } from '~/common/personal/reasoning';
import { chatParameters, normalizeChatConfig } from '~/common/personal/chat-config';
import { SECTOR7_CHAT_EXECUTION } from '~/common/personal/runtime-config';
import { createToolProgressGuard } from '~/common/personal/tool-progress';

import { aixChatGenerateContent_DMessage_FromConversation, AixChatGenerateContent_DMessageGuts } from '~/modules/aix/client/aix.client';
import { autoChatFollowUps } from '~/modules/aifn/auto-chat-follow-ups/autoChatFollowUps';
import { autoConversationTitle } from '~/modules/aifn/autotitle/autoTitle';

import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import type { DLLMId } from '~/common/stores/llms/llms.types';
import { AudioGenerator } from '~/common/util/audio/AudioGenerator';
import { ConversationsManager } from '~/common/chat-overlay/ConversationsManager';
import { createDMessageTextContent, DMessage, MESSAGE_FLAG_AIX_SKIP, MESSAGE_FLAG_NOTIFY_COMPLETE, messageWasInterruptedAtStart } from '~/common/stores/chat/chat.message';
import { getLabsHighPerformance } from '~/common/stores/store-ux-labs';

import { getChatAutoAI, getChatThinkingPolicy, getIsNotificationEnabledForModel } from '../store-app-chat';
import { getInstantAppChatPanesCount } from '../components/panes/store-panes-manager';


// configuration
export const CHATGENERATE_RESPONSE_PLACEHOLDER = '...'; // 💫 ..., 🖊️ ...


export interface PersonaProcessorInterface {
  handleMessage(accumulatedMessage: AixChatGenerateContent_DMessageGuts, messageComplete: boolean): void;
}


/**
 * The main "chat" function.
 * @returns `true` if the operation was successful, `false` otherwise.
 */
export async function runPersonaOnConversationHead(
  assistantLlmId: DLLMId,
  conversationId: DConversationId,
  questionContinuation = false,
  parentSignal?: AbortSignal,
): Promise<boolean> {

  assertQuestionGeneration(conversationId, questionContinuation);
  const cHandler = ConversationsManager.getHandler(conversationId);
  const abortController = new AbortController();
  const stopChild = () => abortController.abort(parentSignal?.reason || new Error('Parent chat stopped.'));
  parentSignal?.addEventListener('abort', stopChild, { once: true });
  if (parentSignal?.aborted) stopChild();
  const lease = acquireChatRun(conversationId);
  let issueMessageId: string | undefined;
  let incompleteReason: IncompleteReason | undefined;
  const recordIssue = (error: unknown, fallback: string) => {
    cHandler.messageAppendAssistantText(error instanceof Error ? error.message : fallback, 'issue');
    issueMessageId = getConversation(conversationId)?.messages.at(-1)?.id;
    if (issueMessageId) cHandler.messageSetUserFlag(issueMessageId, MESSAGE_FLAG_AIX_SKIP, true, false);
    useChatStore.getState()._editConversation(conversationId, { lastCompletedMessageId: issueMessageId, lastOutcome: abortController.signal.aborted ? 'stopped' : 'error', incompleteReason: undefined });
  };
  const showStopping = () => {
    if (!lease.isCurrent()) return;
    cHandler.conversationOverlayStore.setState(state => ({ activity: state.activity ? { ...state.activity, phase: 'Stopping' } : null }));
  };
  try {
    abortController.signal.addEventListener('abort', showStopping);
    const config = normalizeChatConfig(getConversation(conversationId)?.chatConfig);
    const isSubagent = !!getConversation(conversationId)?.subagent;
    assistantLlmId = config.llmId;

    const _history = cHandler.historyViewHeadOrThrow('runPersonaOnConversationHead') as Readonly<DMessage[]>;
    if (_history.length === 0)
      return false;

    // assemble personal, project and chat instructions with the request history
    let assembled: Awaited<ReturnType<typeof assembleRequest>>;
    try { assembled = await assembleRequest(conversationId, assistantLlmId, _history); }
    catch (error) { recordIssue(error, 'Could not prepare request.'); await flushDisk(); return false; }
    const chatSystemInstruction = assembled.system;
    const chatHistory = assembled.messages;

    // assistant response placeholder
    const isNotifyEnabled = getIsNotificationEnabledForModel(assistantLlmId);
    let { assistantMessageId } = cHandler.messageAppendAssistantPlaceholder(
      CHATGENERATE_RESPONSE_PLACEHOLDER,
      {
        purposeId: chatSystemInstruction?.purposeId,
        generator: { mgt: 'named', name: assistantLlmId },
        ...(isNotifyEnabled ? { userFlags: [MESSAGE_FLAG_NOTIFY_COMPLETE] } : {}),
      },
    );

    cHandler.conversationOverlayStore.setState({ activity: { opId: assistantMessageId, phase: 'Connecting' } });

    const parallelViewCount = getLabsHighPerformance() ? 0 : getInstantAppChatPanesCount();

    // ai follow-up operations (fire/forget)
    const { autoSuggestDiagrams, autoSuggestHTMLUI, autoSuggestQuestions, autoTitleChat } = isSubagent
      ? { autoSuggestDiagrams: false, autoSuggestHTMLUI: false, autoSuggestQuestions: false, autoTitleChat: false }
      : getChatAutoAI();

    // when an abort controller is set, the UI switches to the "stop" mode
    cHandler.setAbortController(abortController, 'chat-persona');

    // stream the assistant's messages directly to the state store
    let messageStatus;
    let requestHistory = chatHistory;
    let retriedConnection = false;
    let toolRounds = 0;
    const stalled = createToolProgressGuard();
    for (;;) {
      const summaryOnly = !!incompleteReason;
      const requestConfig = summaryOnly ? { ...config, tools: { webSearch: false, webFetch: false, codeSandbox: false } } : config;
      const responseAbort = new AbortController();
      const stopResponse = () => responseAbort.abort(abortController.signal.reason);
      abortController.signal.addEventListener('abort', stopResponse, { once: true });
      if (abortController.signal.aborted) stopResponse();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const responseActivity = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          incompleteReason = 'idle-timeout';
          responseAbort.abort(new DOMException('Model response was inactive for too long.', 'AbortError'));
        }, SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs);
      };
      responseActivity();
      try {
        messageStatus = await aixChatGenerateContent_DMessage_FromConversation(
          assistantLlmId,
          chatSystemInstruction,
          filterCrossModelReasoning(requestHistory, assistantLlmId),
          'conversation',
          conversationId,
          { abortSignal: responseAbort.signal, onResponseActivity: responseActivity, throttleParallelThreads: parallelViewCount, llmUserParametersReplacement: chatParameters(requestConfig), antContainerPolicy: getConversation(conversationId)?.freshContainer ? 'fresh' : 'reuse-linear', tools: summaryOnly ? [] : isSubagent ? assembled.tools : [...assembled.tools, { type: 'function_call', function_call: { name: 'ask_user_question', description: 'Ask the user up to three questions when you need a decision or missing information.', input_schema: { properties: { questions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } }, required: ['id', 'text'] } } }, required: ['questions'] } } }], toolsPolicy: { type: 'auto' } },
          (messageOverwrite: AixChatGenerateContent_DMessageGuts, messageComplete: boolean) => {

            // Note: there was an abort check here, but it removed the last packet, which contained the cause and final text.
            // if (abortController.signal.aborted)
            //   console.warn('runPersonaOnConversationHead: Aborted', { conversationId, assistantLlmId, messageOverwrite });

            // fragments and generator are already immutable (new refs per update) - no deep clone needed
            if (!lease.isCurrent()) return;
            const { fragments, ...rest } = messageOverwrite;
            cHandler.conversationOverlayStore.setState({ activity: { opId: assistantMessageId, phase: abortController.signal.aborted ? 'Stopping' : messagePhase(messageOverwrite) } });

            // [Cosmetic Logic] if the content hasn't come yet, don't replace the fragments to still show the placeholder
            const includeFragments = !!fragments?.length || messageComplete || !messageOverwrite.pendingIncomplete;

            // update the message
            cHandler.messageEdit(assistantMessageId, { ...(includeFragments && { fragments }), ...rest, ...(rest.generator && assembled.context ? { generator: { ...rest.generator, projectContext: assembled.context } } : {}) }, messageComplete, false);

            // if (messageComplete)
            //   AudioGenerator.basicAstralChimes({ volume: 0.4 }, 0, 2, 250);
          },
        );
      } finally {
        clearTimeout(idleTimer);
        abortController.signal.removeEventListener('abort', stopResponse);
      }

      const settled = getConversation(conversationId)?.messages.find(message => message.id === assistantMessageId);
      if (settled?.generator?.compaction && messageStatus.outcome === 'completed') {
        const history = [...assembled.fullMessages, settled];
        const prefix = await compactionPrefix(assistantLlmId, assembled.system, history);
        cHandler.messageEdit(assistantMessageId, { generator: { ...settled.generator, compaction: { ...settled.generator.compaction, prefix } } }, true, false);
      }
      if (!retriedConnection && settled && JSON.stringify(settled.fragments).includes('The Sol connection changed since compaction.')) {
        retriedConnection = true;
        assembled = await assembleRequest(conversationId, assistantLlmId, assembled.rawHistory, { ignoreCompaction: true });
        requestHistory = assembled.messages;
        continue;
      }

      if (!settled) break;
      const calls = pendingFunctionCalls(settled);
      let executedLocal = false;
      const roundLimit = SECTOR7_CHAT_EXECUTION.maxToolRounds;
      if (!summaryOnly && calls.some(call => isLocalTool(call.name)) && roundLimit !== null && toolRounds >= roundLimit) incompleteReason = 'round-limit';

      for (const call of calls) {
        if (call.name === 'ask_user_question') {
          let error: string | undefined;
          if (incompleteReason) error = 'The run is paused. Report remaining decisions in the summary.';
          else if (isSubagent) error = 'Report the missing decision to the parent chat; subagents cannot ask the user questions.';
          else if (messageStatus.outcome !== 'completed' || abortController.signal.aborted) error = 'Question was not issued because the response was interrupted.';
          else { try { questionSchema.parse(JSON.parse(call.args)); } catch { error = 'Question arguments were invalid. Ask again with up to three valid questions.'; } }
          if (!error) continue;
          const current = getConversation(conversationId)?.messages.find(message => message.id === assistantMessageId);
          if (current) cHandler.messageEdit(assistantMessageId, { fragments: [...current.fragments, create_FunctionCallResponse_ContentFragment(call.id, error, call.name, JSON.stringify({ error }), 'client')] }, true, false);
          continue;
        }
        let result: Record<string, unknown>;
        const project = useFolderStore.getState().folders.find(project => project.conversationIds.includes(conversationId));
        if (messageStatus.outcome !== 'completed' || abortController.signal.aborted) result = { error: 'Tool was not executed because the response was interrupted.' };
        else if (incompleteReason) result = { status: 'incomplete', reason: incompleteReason, notExecuted: true };
        else if (!isLocalTool(call.name)) result = { error: 'This function is not available in the local app.' };
        else {
          executedLocal = true;
          cHandler.conversationOverlayStore.setState({ activity: { opId: assistantMessageId, phase: localToolPhase(call.name), toolId: call.id } });
          try { result = await dispatchLocalTool(call, project?.id, conversationId, abortController.signal, detail => {
            if (lease.isCurrent()) cHandler.conversationOverlayStore.setState({ activity: { opId: assistantMessageId, phase: abortController.signal.aborted ? 'Stopping' : localToolPhase(call.name), detail: detail.slice(-12000), toolId: call.id } });
          }); }
          catch (error) { result = { error: error instanceof Error ? error.message : 'Local tool failed.' }; }
          if (await stalled(call, result)) incompleteReason = 'repeat-guard';
        }
        const current = getConversation(conversationId)?.messages.find(message => message.id === assistantMessageId);
        if (current) cHandler.messageEdit(assistantMessageId, { fragments: [...current.fragments, create_FunctionCallResponse_ContentFragment(call.id, result.error ? String(result.error) : false, call.name, JSON.stringify(result), 'client')] }, true, false);
      }
      try { await flushDisk(); } catch (error) { recordIssue(error, 'Could not save tool results. Reload before continuing.'); break; }
      const questionPending = getConversation(conversationId)?.messages.find(message => message.id === assistantMessageId);
      const hasQuestion = questionPending && pendingFunctionCalls(questionPending).some(call => call.name === 'ask_user_question');
      if (summaryOnly || hasQuestion || abortController.signal.aborted || messageStatus.outcome !== 'completed' || !executedLocal && !incompleteReason) break;
      if (executedLocal) toolRounds++;
      try { assembled = await assembleRequest(conversationId, assistantLlmId, cHandler.historyViewHeadOrThrow('local-tool-continuation')); requestHistory = assembled.messages; }
      catch (error) { recordIssue(error, 'Tool context exceeds the model limit.'); break; }
      if (incompleteReason) requestHistory = [...requestHistory, createDMessageTextContent('user', 'The run is paused. Tools are disabled for this response. Summarize completed work, unfinished tasks and next steps. Do not claim the task is complete. Return the summary to the parent if this is a subagent.')];
      cHandler.messageSetUserFlag(assistantMessageId, MESSAGE_FLAG_NOTIFY_COMPLETE, false, false);
      ({ assistantMessageId } = cHandler.messageAppendAssistantPlaceholder(CHATGENERATE_RESPONSE_PLACEHOLDER, { generator: { mgt: 'named', name: assistantLlmId }, ...(isNotifyEnabled ? { userFlags: [MESSAGE_FLAG_NOTIFY_COMPLETE] } : {}) }));
    }

    // final message update
    const lastDMessage = messageStatus.lastDMessage;
    const saved = getConversation(conversationId)?.messages.find(message => message.id === assistantMessageId);
    let questions: PendingQuestion[] = [];
    try { questions = saved ? questionInvocations(saved, assistantLlmId) : []; } catch (error) { cHandler.messageAppendAssistantText(error instanceof Error ? error.message : 'Invalid question.', 'issue'); }
    if (incompleteReason && !abortController.signal.aborted && !issueMessageId) {
      const notice = createPlaceholderVoidFragment(incompleteReason === 'idle-timeout' ? 'Paused: the model response was inactive. Send a follow-up to continue.' : incompleteReason === 'repeat-guard' ? 'Paused: repeated tool calls returned no new information. Send a follow-up to continue.' : 'Paused at the configured tool round limit. Send a follow-up to continue.', 'notice');
      const current = getConversation(conversationId)?.messages.find(message => message.id === assistantMessageId);
      if (current) cHandler.messageEdit(assistantMessageId, { fragments: [...current.fragments, notice] }, true, false);
    }
    useChatStore.getState()._editConversation(conversationId, { lastCompletedMessageId: issueMessageId ?? assistantMessageId, lastOutcome: abortController.signal.aborted ? 'stopped' : issueMessageId ? 'error' : incompleteReason ? 'incomplete' : messageStatus.outcome === 'completed' ? 'ok' : messageStatus.outcome === 'aborted' ? 'stopped' : 'error', incompleteReason, pendingQuestions: questions });

    // special case: if the last message was aborted and had no content, delete it
    if (!issueMessageId && !incompleteReason && messageWasInterruptedAtStart(lastDMessage)) {
      if (isSubagent) {
        cHandler.messageEdit(assistantMessageId, { fragments: [createTextContentFragment('Subagent stopped before the model responded.')], pendingIncomplete: false, userFlags: [MESSAGE_FLAG_AIX_SKIP] }, true, false);
        await flushDisk();
        return false;
      }
      // Remove this turn's empty placeholder without entering the user-edit guard.
      useChatStore.getState()._editConversation(conversationId, current => {
        const messages = current.messages.filter(message => message.id !== assistantMessageId);
        return { messages, tokenCount: messages.length ? messages.reduce((total, message) => total + 4 + (message.tokenCount || 0), 3) : 0, updated: Date.now(), ...(current.lastCompletedMessageId === assistantMessageId ? { lastCompletedMessageId: undefined } : {}) };
      });
      await flushDisk().catch(() => undefined);
      // NOTE: ok to exit here, as the abort was already done
      return false;
    }

    // notify when complete, if set
    if (cHandler.messageHasUserFlag(assistantMessageId, MESSAGE_FLAG_NOTIFY_COMPLETE)) {
      cHandler.messageSetUserFlag(assistantMessageId, MESSAGE_FLAG_NOTIFY_COMPLETE, false, false);
      AudioGenerator.chatNotifyResponse();
    }

    // check if aborted
    const hasBeenAborted = abortController.signal.aborted;

    useChatStore.getState()._editConversation(conversationId, { freshContainer: false });

    if (autoTitleChat) {
      // fire/forget, this will only set the title if it's not already set
      void autoConversationTitle(conversationId, false);
    }

    if (!hasBeenAborted && !issueMessageId && !incompleteReason && (autoSuggestDiagrams || autoSuggestHTMLUI || autoSuggestQuestions))
      void autoChatFollowUps(conversationId, assistantMessageId, autoSuggestDiagrams, autoSuggestHTMLUI, autoSuggestQuestions);

    const chatThinkingPolicy = getChatThinkingPolicy();
    if (chatThinkingPolicy === 'last-only' || chatThinkingPolicy === 'discard-all') {
      const preservedMessageIds = [
        ...questions.map(question => question.messageId),
        ...(getConversation(conversationId)?.messages.filter(message => message.generator?.nativeHistory).map(message => message.id) || []),
      ];
      cHandler.historyStripThinking(chatThinkingPolicy === 'last-only' ? 1 : 0, preservedMessageIds);
    }

    await flushDisk().catch(() => undefined);

    // return true if this succeeded
    return !issueMessageId && !incompleteReason && messageStatus.outcome === 'completed';
  } finally {
    parentSignal?.removeEventListener('abort', stopChild);
    abortController.signal.removeEventListener('abort', showStopping);
    try {
      if (lease.isCurrent()) {
        try {
          if (getConversation(conversationId)?._abortController === abortController) cHandler.clearAbortController('chat-persona');
        } finally {
          cHandler.conversationOverlayStore.setState({ activity: null });
        }
      }
    } finally {
      lease.release();
    }
  }
}
