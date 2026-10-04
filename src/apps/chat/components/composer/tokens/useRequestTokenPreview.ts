import * as React from 'react';

import type { DConversation } from '~/common/stores/chat/chat.conversation';
import type { DLLM } from '~/common/stores/llms/llms.types';
import type { DComposerPendingPart } from '~/common/chat-overlay/store-perchat-composer_slice';
import type { AttachmentDraft } from '~/common/attachment-drafts/attachment.types';
import type { SkillSnapshot } from '~/common/personal/skills';
import { assembleRequest } from '~/common/personal/assemble-request';
import { createDMessageFromFragments } from '~/common/stores/chat/chat.message';
import { createHostedResourceContentFragment, createTextContentFragment } from '~/common/stores/chat/chat.fragments';
import { estimateTokensForFragments } from '~/common/stores/chat/chat.tokens';
import { preloadTiktokenLibrary } from '~/common/tokens/tokens.text';
import { useAppChatStore } from '../../../store-app-chat';
import { createPreviewFragmentCounter } from './preview-fragment-counter';

interface PreviewInput {
  chat: DConversation | undefined;
  llm: DLLM | null;
  mode: string;
  text: string;
  attachmentDrafts: AttachmentDraft[];
  selectedSkills: SkillSnapshot[];
  pendingParts: DComposerPendingPart[] | null;
}

type Preview = (Awaited<ReturnType<typeof assembleRequest>> & { error: string }) | { error: string };

/** Reuse unchanged fragments after typing settles. Final Send always assembles without this cache. */
export function useRequestTokenPreview(input: PreviewInput): Preview | null {
  const countingMethod = useAppChatStore(state => state.tokenCountingMethod);
  const counter = React.useMemo(() => {
    if (!input.chat?.id || !input.llm) return estimateTokensForFragments;
    return createPreviewFragmentCounter(estimateTokensForFragments, countingMethod);
  }, [input.chat?.id, input.llm, countingMethod]);
  const [completed, setCompleted] = React.useState<{ input: PreviewInput; counter: typeof counter; result: Preview } | null>(null);

  React.useEffect(() => {
    const { chat, llm } = input;
    if (!chat || !llm || input.mode !== 'generate-content') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Do not cache a temporary approximate fallback while the tokenizer is loading.
      const tokenizerReady = countingMethod !== 'accurate' || await preloadTiktokenLibrary().then(() => true, () => false);
      if (cancelled) return;
      let result: Preview;
      try {
        const draft = createDMessageFromFragments('user', [createTextContentFragment(input.text),
          ...(input.pendingParts || []).map(part => createHostedResourceContentFragment(part.resource)),
          ...input.attachmentDrafts.flatMap(draft => draft.outputFragments)]);
        if (input.selectedSkills.length) draft.metadata = { selectedSkills: input.selectedSkills };
        result = { ...await assembleRequest(chat.id, llm.id, [...chat.messages, draft], { allowOverBudget: true, estimateFragments: tokenizerReady ? counter : estimateTokensForFragments }), error: '' };
      } catch (error) {
        result = { error: error instanceof Error ? error.message : 'Context could not be estimated.' };
      }
      if (!cancelled) setCompleted({ input, counter, result });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [input, counter, countingMethod]);

  // Hide the previous count on the first changed render, including a switch to another chat/model.
  return completed?.input === input && completed.counter === counter ? completed.result : null;
}
