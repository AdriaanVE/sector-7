import { hasChatRun, useChatRuns } from '~/common/personal/chat-run';
import { assembleRequest } from '~/common/personal/assemble-request';
import { createDMessageFromFragments } from '~/common/stores/chat/chat.message';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { useProjectFilesStore } from '~/common/personal/store-project-files';
import { usePersonalSettings } from '~/common/personal/store-personal-settings';
import { SkillSelectionScope } from '~/common/personal/skill-selection';
import { localJSON } from '~/common/personal/disk-storage';
import { skillSnapshotSchema, skillOriginForModel, type SkillSnapshot } from '~/common/personal/skills';
import { assertQuestionGeneration, questionOperation } from '~/common/personal/questions';
import { sendComposerQuestionAnswer } from '~/common/personal/question-composer';
import { getConversation } from '~/common/stores/chat/store-chats';
import { runPersonaOnConversationHead } from '../../editors/chat-persona';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ColorPaletteProp, SxProps, VariantProp } from '@mui/joy/styles/types';
import { Box, Button, Card, IconButton, Textarea, Typography } from '@mui/joy';
import SendIcon from '@mui/icons-material/Send';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';

import type { AppChatIntent } from '../../AppChat';
import { useChatAutoSuggestAttachmentPrompts, useChatMicTimeoutMsValue } from '../../store-app-chat';

import { useAgiAttachmentPrompts } from '~/modules/aifn/agiattachmentprompts/useAgiAttachmentPrompts';
import { useBrowseCapability } from '~/modules/browse/store-module-browsing';

import type { DComposerPendingPart } from '~/common/chat-overlay/store-perchat-composer_slice';
import { DLLM, getLLMLabel, LLM_IF_OAI_Vision } from '~/common/stores/llms/llms.types';
import { AudioGenerator } from '~/common/util/audio/AudioGenerator';
import { AudioPlayer } from '~/common/util/audio/AudioPlayer';
import { openFileForAttaching } from '~/common/components/ButtonAttachFiles';
import { ConfirmationModal } from '~/common/components/modals/ConfirmationModal';
import { ConversationsManager } from '~/common/chat-overlay/ConversationsManager';
import { DMessageId, DMessageMetadata, DMetaReferenceItem, messageFragmentsReduceText } from '~/common/stores/chat/chat.message';
import { PhPaintBrush } from '~/common/components/icons/phosphor/PhPaintBrush';
import { ShortcutKey, ShortcutObject, useGlobalShortcuts } from '~/common/components/shortcuts/useGlobalShortcuts';
import { addSnackbar } from '~/common/components/snackbar/useSnackbarsStore';
import { browserSpeechRecognitionCapability, PLACEHOLDER_INTERIM_TRANSCRIPT, SpeechResult, useSpeechRecognition } from '~/common/components/speechrecognition/useSpeechRecognition';
import { DConversationId } from '~/common/stores/chat/chat.conversation';
import { copyToClipboard, supportsClipboardRead } from '~/common/util/clipboardUtils';
import { createHostedResourceContentFragment, createTextContentFragment, DMessageAttachmentFragment, DMessageContentFragment, duplicateDMessageFragments } from '~/common/stores/chat/chat.fragments';
import { marshallWrapDocFragments } from '~/common/stores/chat/chat.tokens';
import { isValidConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { getModelParameterValueWithFallback } from '~/common/stores/llms/llms.parameters';
import { removeQueryParam, useRouterQuery } from '~/common/app.routes';
import { lineHeightTextareaMd, themeBgAppChatComposer } from '~/common/app.theme';
import { optimaOpenPreferences } from '~/common/layout/optima/useOptima';
import { supportsCameraCapture } from '~/common/components/camera/useCameraCapture';
import { supportsScreenCapture } from '~/common/util/screenCaptureUtils';
import { useAttachHandler_CameraOpen, useAttachHandler_Files, useAttachHandler_PasteIntercept, useAttachHandler_ScreenCapture, useAttachHandler_UrlWebLinks } from '~/common/attachment-drafts/attachment-sources/useAttachmentSourceHandlers';
import { useChatComposerOverlayStore } from '~/common/chat-overlay/store-perchat_vanilla';
import { useComposerStartupText } from '~/common/logic/store-logic-sherpa';
import { useOverlayComponents } from '~/common/layout/overlays/useOverlayComponents';
import { getUIEnterIsNewline, useUICounter, useUIPreferencesStore } from '~/common/stores/store-ui';
import { useUXLabsStore } from '~/common/stores/store-ux-labs';

import type { ActileItem } from './actile/ActileProvider';
import { providerAttachmentLabels } from './actile/providerAttachmentLabels';
import { providerCommands } from './actile/providerCommands';
import { providerStarredMessages, StarredMessageItem } from './actile/providerStarredMessage';
import { useActileManager } from './actile/useActileManager';

import type { AttachmentDraftId, AttachmentDraftsAction } from '~/common/attachment-drafts/attachment.types';
import { AttachmentInputEnhancersOptions } from '~/common/attachment-drafts/attachment.enhancers';
import { AttachmentSourcesMemo } from '~/common/attachment-drafts/attachment-sources/AttachmentSources';
import { useAttachmentDrafts } from '~/common/attachment-drafts/useAttachmentDrafts';
import { useAttachmentDraftsEnrichment } from '~/common/attachment-drafts/llm-enrichment/useAttachmentDraftsEnrichment';

import type { ChatExecuteMode } from '../../execute-mode/execute-mode.types';
import { chatExecuteModeCanAttach, useChatExecuteMode } from '../../execute-mode/useChatExecuteMode';

import { ButtonGroupDrawRepeat } from './buttons/ButtonGroupDrawRepeat';
import { ButtonMicContinuationMemo } from './buttons/ButtonMicContinuation';
import { ButtonMicMemo } from './buttons/ButtonMic';
import { COMPOSER_INPUT_ENHANCERS } from './composer.input-enhancers';
import { useComposerEnhancerHint } from './useComposerEnhancerHint';
import { ComposerAttachmentDraftsList } from './llmattachments/ComposerAttachmentDraftsList';
import { ComposerTextAreaActions } from './textarea/ComposerTextAreaActions';
import { ComposerTextAreaDrawActions } from './textarea/ComposerTextAreaDrawActions';
import { StatusBarMemo } from '../StatusBar';
import { ComposerRim } from './ComposerRim';
import { ComposerChatConfigPicker } from './ComposerChatConfigPicker';
import { useComposerDragDrop } from './useComposerDragDrop';
import { useRequestTokenPreview } from './tokens/useRequestTokenPreview';


// configuration
const zIndexComposerOverlayMic = 10;


const paddingBoxSx: SxProps = {
  p: { xs: 1, md: 2 },
};


const minimizedSx: SxProps = {
  ...paddingBoxSx,
  display: 'none',
};

const stopButtonSx: SxProps = {
  borderRadius: '50%',
  '--IconButton-size': { xs: '40px', sm: '36px' },
  '--Icon-color': 'currentColor',
  backgroundColor: '#A855F7',
  color: '#060F14',
  '&:not(:disabled):not([aria-disabled="true"]):hover, &:not(:disabled):focus-visible': {
    backgroundColor: '#bc7bff',
    boxShadow: '0 0 12px rgba(168, 85, 247, .4)',
  },
  '&:not(:disabled):active': { backgroundColor: '#A855F7' },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  '@media (forced-colors: active)': {
    backgroundColor: 'ButtonFace',
    color: 'ButtonText',
    '&:not(:disabled):not([aria-disabled="true"]):hover, &:not(:disabled):focus-visible': {
      backgroundColor: 'ButtonFace', boxShadow: 'none',
    },
  },
};


/**
 * A React component for composing messages, with attachments and different modes.
 */
export function Composer(props: {
  isMobile: boolean;
  chatLLM: DLLM | null;
  composerTextAreaRef: React.RefObject<HTMLTextAreaElement>;
  configButtonRef: React.Ref<HTMLButtonElement>;
  targetConversationId: DConversationId | null;
  capabilityHasT2I: boolean;
  capabilityHasT2IEdit: boolean;
  isMulticast: boolean | null;
  isDeveloperMode: boolean;
  onAction: (conversationId: DConversationId, chatExecuteMode: ChatExecuteMode, fragments: (DMessageContentFragment | DMessageAttachmentFragment)[], metadata?: DMessageMetadata) => boolean;
  onConversationBeamEdit: (conversationId: DConversationId, editMessageId?: DMessageId) => Promise<void>;
  onConversationsImportFromFiles: (files: File[]) => Promise<void>;
  onTextImagine: (conversationId: DConversationId, text: string) => void;
  setIsMulticast: (on: boolean) => void;
  onComposerHasContent: (hasContent: boolean) => void;
  sx?: SxProps;
}) {

  // state
  const [skillReferences, setSkillReferences] = React.useState<Record<string, string[]>>({});
  const [selectedSkills, setSelectedSkills] = React.useState<SkillSnapshot[]>([]);
  const skillSelectionScope = React.useRef(new SkillSelectionScope()).current;
  skillSelectionScope.setChat(props.targetConversationId);
  const skillModel = props.chatLLM?.id || '';
  skillSelectionScope.setModel(skillModel);
  const [composeText, setComposeText] = React.useState('');
  const [drawRepeat, setDrawRepeat] = React.useState(1);
  const [micContinuation, setMicContinuation] = React.useState(false);
  const [speechInterimResult, setSpeechInterimResult] = React.useState<SpeechResult | null>(null);
  const [sendStarted, setSendStarted] = React.useState(false);
  const sendInFlight = React.useRef(false);
  const {
    chatExecuteMode,
    chatExecuteModeSendColor, chatExecuteModeSendLabel,
    setChatExecuteMode,
  } = useChatExecuteMode();
  const [isMinimized, setIsMinimized] = React.useState(false);
  const micCardRef = React.useRef<HTMLDivElement>(null);

  // external state
  const { showPromisedOverlay } = useOverlayComponents();
  const { newChat: appChatNewChatIntent } = useRouterQuery<Partial<AppChatIntent>>();
  const { labsComposerAttachmentsInline, labsShowShortcutBar } = useUXLabsStore(useShallow(state => ({
    labsComposerAttachmentsInline: state.labsComposerAttachmentsInline,
    labsShowShortcutBar: state.labsShowShortcutBar,
  })));
  const { touch: touchShiftEnter } = useUICounter('composer-shift-enter');

  const [startupText, setStartupText] = useComposerStartupText();
  const enterIsNewline = useUIPreferencesStore(state => state.enterIsNewline);
  const chatMicTimeoutMs = useChatMicTimeoutMsValue();
  const { assistantAbortible, abortConversationTemp } = useChatStore(useShallow(state => {
    const conversation = state.conversations.find(_c => _c.id === props.targetConversationId);
    return {
      assistantAbortible: conversation ? !!conversation._abortController : false,
      abortConversationTemp: state.abortConversationTemp,
    };
  }));

  const chatRunActive = useChatRuns(state => !!props.targetConversationId && !!state.active[props.targetConversationId]);
  const assistantBusy = assistantAbortible || chatRunActive;

  // external overlay state (extra conversationId-dependent state)
  const conversationOverlayStore = props.targetConversationId
    ? ConversationsManager.getHandler(props.targetConversationId)?.conversationOverlayStore ?? null
    : null;

  // composer-overlay: for the in-reference-to state, comes from the conversation overlay
  const allowInReferenceTo = chatExecuteMode === 'generate-content';
  const inReferenceTo = useChatComposerOverlayStore(conversationOverlayStore, store => allowInReferenceTo ? store.inReferenceTo : null);

  // composer-overlay: parts added by input enhancers (e.g. pasted video URLs, outside the attachment pipeline)
  const pendingParts = useChatComposerOverlayStore(conversationOverlayStore, store => store.pendingParts.length ? store.pendingParts : null);

  // LLM-derived
  const chatLLMSupportsImages = !!props.chatLLM?.interfaces?.includes(LLM_IF_OAI_Vision);

  // don't load URLs if the user is typing a command or there's no capability
  const browseCapability = useBrowseCapability();
  const enableLoadURLsInComposer = browseCapability.inComposer && !composeText.startsWith('/');

  // user message for attachments
  const { onConversationsImportFromFiles } = props;
  const handleFilterAGIFile = React.useCallback(async (file: File): Promise<boolean> =>
    await showPromisedOverlay('composer-open-or-attach', { rejectWithValue: false }, ({ onResolve, onUserReject }) => (
      <ConfirmationModal
        open onClose={onUserReject}
        onPositive={() => {
          onConversationsImportFromFiles([file]);
          onResolve(true);
        }}
        title='Open Conversation or Attach?'
        positiveActionText='Open' negativeActionText='Attach'
        confirmationText={`Would you like to open the conversation "${file.name}" or attach it to the message?`}
      />
    )), [onConversationsImportFromFiles, showPromisedOverlay]);

  // attachments-overlay: comes from the attachments slice of the conversation overlay
  const showChatAttachments = chatExecuteModeCanAttach(chatExecuteMode, props.capabilityHasT2IEdit);

  // input enhancers: intercept recognized pasted text into pending parts - off in image-only modes
  const addPendingPart = React.useCallback((part: DComposerPendingPart) => {
    conversationOverlayStore?.getState().addPendingPart(part);
  }, [conversationOverlayStore]);
  const { enhancerHintItem, onEnhancerDisabledMatch, clearEnhancerHint } = useComposerEnhancerHint(conversationOverlayStore, setComposeText, props.targetConversationId);
  const enhancersOff = !props.chatLLM || showChatAttachments === 'only-images';
  const enhancersOptions = React.useMemo((): AttachmentInputEnhancersOptions | undefined => {
    if (enhancersOff || !props.chatLLM) return undefined;
    return { enhancers: COMPOSER_INPUT_ENHANCERS, enhancerLLM: props.chatLLM, onEnhancerAddPendingPart: addPendingPart, onEnhancerDisabledMatch };
  }, [enhancersOff, props.chatLLM, addPendingPart, onEnhancerDisabledMatch]);

  const {
    /* items */ attachmentDrafts,
    /* append */ attachAppendClipboardItems, attachAppendDataTransfer, attachAppendEgoFragments, attachAppendFile, attachAppendUrl,
    /* take */ attachmentsRemoveAll, attachmentsTakeAllFragments, attachmentsTakeFragmentsByType,
  } = useAttachmentDrafts(conversationOverlayStore, enableLoadURLsInComposer, chatLLMSupportsImages, handleFilterAGIFile, showChatAttachments === 'only-images', enhancersOptions);

  // attachments derived state
  const { enrichment: attEnrichment, summary: attEnrichSummary } = useAttachmentDraftsEnrichment(attachmentDrafts, props.chatLLM, chatLLMSupportsImages);

  // drag/drop
  const { dragContainerSx, dropComponent, handleContainerDragEnter, handleContainerDragStart } = useComposerDragDrop(!props.isMobile, attachAppendDataTransfer);

  // ai functions
  const agiAttachmentPrompts = useAgiAttachmentPrompts(useChatAutoSuggestAttachmentPrompts(), attachmentDrafts);


  // derived state

  const { composerTextAreaRef, targetConversationId, onAction, onTextImagine } = props;
  const isMobile = props.isMobile;
  const isDesktop = !props.isMobile;
  const noConversation = !targetConversationId;

  const composerTextSuffix = chatExecuteMode === 'generate-image' && isDesktop && drawRepeat > 1 ? ` x${drawRepeat}` : '';

  const micIsRunning = !!speechInterimResult;
  // more mic way below, as we use complex hooks


  // Subscribe to the complete request prefix, so project and instruction edits refresh this preview.
  const budgetChat = useChatStore(state => state.conversations.find(chat => chat.id === targetConversationId));
  const budgetProjects = useFolderStore(state => state.folders);
  const budgetFiles = useProjectFilesStore(state => state.files);
  const personalInstructions = usePersonalSettings(state => state.instructions);
  const previewInput = React.useMemo(() => ({
    chat: budgetChat, llm: props.chatLLM, mode: chatExecuteMode, text: composeText,
    attachmentDrafts, selectedSkills, pendingParts, budgetProjects, budgetFiles, personalInstructions,
  }), [budgetChat, props.chatLLM, chatExecuteMode, composeText, attachmentDrafts, selectedSkills, pendingParts, budgetProjects, budgetFiles, personalInstructions]);
  const preview = useRequestTokenPreview(previewInput);


  // Effect: load initial text if queued up (e.g. by /link/share_targetF)
  React.useEffect(() => {
    if (startupText) {
      setStartupText(null);
      setComposeText(startupText);
    }
  }, [setComposeText, setStartupText, startupText]);

  // Effect: notify the parent of presence/absence of content
  const isContentful = composeText.length > 0 || !!attachmentDrafts.length || !!pendingParts?.length;
  const { onComposerHasContent } = props;
  React.useEffect(() => {
    onComposerHasContent?.(isContentful);
  }, [isContentful, onComposerHasContent]);


  // Overlay actions

  const handleRemoveInReferenceTo = React.useCallback((item: DMetaReferenceItem) => {
    conversationOverlayStore?.getState().removeInReferenceTo(item);
  }, [conversationOverlayStore]);

  const handleInReferenceToClear = React.useCallback(() => {
    conversationOverlayStore?.getState().clearInReferenceTo();
  }, [conversationOverlayStore]);

  const handleRemovePendingPart = React.useCallback((part: DComposerPendingPart) => {
    conversationOverlayStore?.getState().removePendingPart(part);
  }, [conversationOverlayStore]);

  React.useEffect(() => {
    if (inReferenceTo?.length)
      setTimeout(() => composerTextAreaRef.current?.focus(), 1 /* prevent focus theft */);
  }, [composerTextAreaRef, inReferenceTo]);


  // Confirmation Modals

  const confirmProceedIfAttachmentsNotSupported = React.useCallback(async (): Promise<boolean> => {
    if (attEnrichSummary.allCompatible) return true;
    return await showPromisedOverlay('composer-unsupported-attachments', { rejectWithValue: false }, ({ onResolve, onUserReject }) => (
      <ConfirmationModal
        open
        onClose={onUserReject}
        onPositive={() => onResolve(true)}
        confirmationText='Some attached files may not be fully compatible with the current AI model. This could affect processing. Would you like to review or proceed?'
        positiveActionText='Proceed'
        negativeActionText='Review Attachments'
        title='Attachment Compatibility Notice'
      />
    ));
  }, [attEnrichSummary.allCompatible, showPromisedOverlay]);


  // Primary button

  const _handleClearText = React.useCallback(() => {
    setComposeText('');
    clearEnhancerHint();
    attachmentsRemoveAll();
    handleInReferenceToClear();
    conversationOverlayStore?.getState().clearPendingParts();
  }, [attachmentsRemoveAll, clearEnhancerHint, conversationOverlayStore, handleInReferenceToClear, setComposeText]);

  const _handleSendActionUnguarded = React.useCallback(async (_chatExecuteMode: ChatExecuteMode, composerText: string): Promise<boolean> => {
    if (!isValidConversation(targetConversationId)) return false;

    if (hasChatRun(targetConversationId) || getConversation(targetConversationId)?._abortController) {
      addSnackbar({ key: 'chat-running', message: 'Wait for the running chat and local tools to finish before sending again.', type: 'info' });
      return false;
    }
    if (questionOperation(targetConversationId)) return false;
    const pendingChat = getConversation(targetConversationId);
    if (pendingChat?.pendingQuestions?.length) {
      try {
        return await sendComposerQuestionAnswer(targetConversationId, {
          mode: _chatExecuteMode, text: composerText,
          hasContext: !!(attachmentDrafts.length || pendingParts?.length || selectedSkills.length || inReferenceTo?.length || composerTextSuffix),
        }, () => setComposeText(current => current === composerText ? '' : current),
        () => runPersonaOnConversationHead(pendingChat.chatConfig.llmId, targetConversationId, true)) ?? false;
      } catch (error) {
        addSnackbar({ key: 'question-answer', message: error instanceof Error ? error.message : 'Your answer could not be saved. Try again.', type: 'issue' });
        return false;
      }
    }
    try { assertQuestionGeneration(targetConversationId); }
    catch (error) { addSnackbar({ key: 'chat-running', message: error instanceof Error ? error.message : 'Wait for the running chat to finish.', type: 'info' }); return false; }

    // await user confirmation (or rejection) if attachments are not supported
    if (!await confirmProceedIfAttachmentsNotSupported()) return false;

    // validate some chat mode inputs
    const isDraw = _chatExecuteMode === 'generate-image';
    const isBlank = !composerText.trim();
    if (isDraw && isBlank) {
      addSnackbar({ key: 'chat-draw-empty', message: 'Please enter a description to generate an image.', type: 'info' });
      return false;
    }

    // Estimate before taking drafts, so a blocked send keeps every attachment available.
    if (_chatExecuteMode === 'generate-content' && pendingChat) {
      const draft = createDMessageFromFragments('user', [createTextContentFragment(composerText + composerTextSuffix),
        ...(pendingParts || []).map(part => createHostedResourceContentFragment(part.resource)),
        ...attachmentDrafts.flatMap(draft => draft.outputFragments)]);
      if (selectedSkills.length) draft.metadata = { selectedSkills };
      try { await assembleRequest(targetConversationId, pendingChat.chatConfig.llmId, [...pendingChat.messages, draft]); }
      catch (error) { addSnackbar({ key: 'context-limit', message: error instanceof Error ? error.message : 'Context could not be estimated.', type: 'issue' }); return false; }
    }

    // prepare the fragments: content (if any) and attachments (if allowed, and any)
    const fragments: (DMessageContentFragment | DMessageAttachmentFragment)[] = [];
    if (composerText)
      fragments.push(createTextContentFragment(composerText + composerTextSuffix));

    const canAttach = chatExecuteModeCanAttach(_chatExecuteMode, props.capabilityHasT2IEdit);
    if (canAttach) {
      // enhancer-pending parts (e.g. video URLs) become content fragments after the text
      fragments.push(...(pendingParts || []).map(part => createHostedResourceContentFragment(part.resource)));
      const attachmentFragments = await attachmentsTakeAllFragments('global', 'app-chat');
      fragments.push(...attachmentFragments);
    }

    if (!fragments.length) {
      // addSnackbar({ key: 'chat-composer-empty', message: 'Please enter a message or attach files.', type: 'info' });
      return false;
    }

    // prepare the metadata
    const metadata = { ...(inReferenceTo?.length ? { inReferenceTo } : {}), ...(selectedSkills.length ? { selectedSkills } : {}) };

    // send the message - NOTE: if successful, the ownership of the fragments is transferred to the receiver, so we just clear them
    const enqueued = onAction(targetConversationId, _chatExecuteMode, fragments, metadata);
    if (enqueued) { skillSelectionScope.clear(); setSelectedSkills([]); _handleClearText(); }
    return enqueued;
  }, [targetConversationId, confirmProceedIfAttachmentsNotSupported, composerTextSuffix, props.capabilityHasT2IEdit, inReferenceTo, onAction, _handleClearText, attachmentsTakeAllFragments, attachmentDrafts, pendingParts, selectedSkills, skillSelectionScope, setComposeText]);

  const handleSendAction = React.useCallback(async (chatExecuteMode: ChatExecuteMode, composerText: string): Promise<boolean> => {
    if (sendInFlight.current) return false;
    sendInFlight.current = true;
    setSendStarted(true);
    try { return await _handleSendActionUnguarded(chatExecuteMode, composerText); }
    finally { sendInFlight.current = false; setSendStarted(false); }
  }, [_handleSendActionUnguarded, setSendStarted]);


  // Mic typing & continuation mode - NOTE: this is here because needs the handleSendAction, and provides recognitionState

  const onSpeechResultCallback = React.useCallback((result: SpeechResult) => {
    // not done: show interim
    if (!result.done) {
      setSpeechInterimResult({ ...result });
      return;
    }

    // done
    setSpeechInterimResult(null);
    const transcript = result.transcript.trim();
    let nextText = (composeText || '').trim();
    nextText = nextText ? nextText + ' ' + transcript : transcript;

    // auto-send (mic continuation mode) if requested
    const autoSend = (result.flagSendOnDone || micContinuation) && nextText.length >= 1 && !noConversation; //&& assistantAbortible;
    const notUserStop = result.doneReason !== 'manual';
    if (autoSend) {
      // if (notUserStop) {
      void AudioGenerator.chatAutoSend();
      // void AudioPlayer.playUrl('/sounds/mic-off-mid.mp3');
      // }
      void handleSendAction(chatExecuteMode, nextText); // fire/forget
    } else {
      // if scheduled for send but not sent, clear the send state
      if (result.flagSendOnDone)
        setSendStarted(false);

      // mic off sound
      if (!micContinuation && notUserStop)
        void AudioPlayer.playUrl('/sounds/mic-off-mid.mp3').catch(() => {
          // This happens on Is.Browser.Safari, where the audio is not allowed to play without user interaction
        });

      // update with the spoken text
      if (nextText) {
        composerTextAreaRef.current?.focus();
        setComposeText(nextText);
      }
    }
  }, [chatExecuteMode, composeText, composerTextAreaRef, handleSendAction, micContinuation, noConversation, setComposeText]);

  const { recognitionState, toggleRecognition } = useSpeechRecognition('webSpeechApi', onSpeechResultCallback, chatMicTimeoutMs || 2000);

  const micContinuationTrigger = micContinuation && !micIsRunning && !assistantBusy && !recognitionState.errorMessage;
  const micColor: ColorPaletteProp = recognitionState.errorMessage ? 'danger' : recognitionState.isActive ? 'primary' : recognitionState.hasAudio ? 'primary' : 'neutral';
  const micVariant: VariantProp = recognitionState.hasSpeech ? 'solid' : recognitionState.hasAudio ? 'soft' : 'soft';  //(isDesktop ? 'soft' : 'plain');

  const handleToggleMic = React.useCallback(() => {
    if (micIsRunning && micContinuation)
      setMicContinuation(false);
    toggleRecognition();
  }, [micContinuation, micIsRunning, toggleRecognition]);

  const handleToggleMicContinuation = React.useCallback(() => {
    setMicContinuation(continued => !continued);
  }, []);

  React.useEffect(() => {
    // autostart the microphone if the assistant stopped typing
    if (micContinuationTrigger)
      toggleRecognition();
  }, [toggleRecognition, micContinuationTrigger]);

  React.useEffect(() => {
    // auto-scroll the mic card to the bottom
    micCardRef.current?.scrollTo({
      top: micCardRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [speechInterimResult]);

  React.useEffect(() => {
    // auto-start the microphone if appChat was created with a particular intent
    if (appChatNewChatIntent === 'voiceInput') {
      toggleRecognition();
      void removeQueryParam('newChat');
    }
  }, [appChatNewChatIntent, toggleRecognition]);


  // Other send actins

  const handleAppendTextAndSend = React.useCallback(async (appendText: string) => {
    const newText = composeText ? `${composeText} ${appendText}` : appendText;
    setComposeText(newText);
    await handleSendAction(chatExecuteMode, newText);
  }, [chatExecuteMode, composeText, handleSendAction, setComposeText]);

  const handleFinishMicAndSend = React.useCallback(() => {
    if (!sendStarted) {
      setSendStarted(true);
      toggleRecognition(true);
    }
  }, [sendStarted, toggleRecognition]);

  const handleSendClicked = React.useCallback(async () => {
    // Auto-send as soon as the mic is done
    if (recognitionState.isActive) {
      handleFinishMicAndSend();
      return;
    }
    // Safety option
    if (micIsRunning) {
      addSnackbar({ key: 'chat-mic-running', message: 'Please wait for the microphone to finish.', type: 'info' });
      return;
    }
    await handleSendAction(chatExecuteMode, composeText); // 'chat/write/...' button
  }, [chatExecuteMode, composeText, handleFinishMicAndSend, handleSendAction, micIsRunning, recognitionState.isActive]);

  const handleStopClicked = React.useCallback(() => {
    targetConversationId && abortConversationTemp(targetConversationId);
  }, [abortConversationTemp, targetConversationId]);


  // Secondary buttons

  React.useEffect(() => { setSelectedSkills([]); setSkillReferences({}); }, [targetConversationId]);
  React.useEffect(() => () => skillSelectionScope.clear(), [skillSelectionScope]);

  // Actiles

  const onActileCommandPaste = React.useCallback(({ label, key }: ActileItem, searchPrefix: string) => {
    if (key.startsWith('skill:')) {
      const isCurrent = skillSelectionScope.begin(key.slice(6));
      void localJSON('skills', { method: 'POST', body: JSON.stringify({ id: key.slice(6), conversationId: targetConversationId ?? undefined }) }).then(({ skill }) => {
        if (!isCurrent()) return;
        const snapshot = skillSnapshotSchema.parse(skill);
        void localJSON(`skills?origin=${skillOriginForModel(skillModel)}${targetConversationId ? `&conversationId=${encodeURIComponent(targetConversationId)}` : ''}`).then(({ skills }) => { if (!isCurrent()) return; const entry = skills.find((item: { id: string }) => item.id === snapshot.id); setSkillReferences(prior => ({ ...prior, [snapshot.id]: entry?.references ?? [] })); }).catch(error => { if (isCurrent()) addSnackbar({ key: 'skill-reference-catalog', message: error.message, type: 'issue' }); });
        setSelectedSkills(prior => [...prior.filter(item => item.id !== snapshot.id), snapshot]);
        setComposeText(previous => previous.replace(/\/[^\s]*$/, ''));
      }).catch(error => { if (isCurrent()) addSnackbar({ key: 'skill-load', message: error.message, type: 'issue' }); });
      return;
    }
    if (composerTextAreaRef.current) {
      const textArea = composerTextAreaRef.current;
      const currentText = textArea.value;
      const cursorPos = textArea.selectionStart;

      // Find the position where the command starts
      const commandStart = currentText.lastIndexOf(searchPrefix, cursorPos);

      // Construct the new text with the autocompleted command
      setComposeText((prevText) => prevText.substring(0, commandStart) + label + ' ' + prevText.substring(cursorPos));

      // Schedule setting the cursor position after the state update
      const newCursorPos = commandStart + label.length + 1;
      setTimeout(() => composerTextAreaRef.current?.setSelectionRange(newCursorPos, newCursorPos), 0);
    }
  }, [composerTextAreaRef, setComposeText, skillSelectionScope, skillModel, targetConversationId]);

  const onActileEmbedMessage = React.useCallback(async ({ conversationId, messageId }: StarredMessageItem) => {
    // get the message
    const cHandler = ConversationsManager.getHandler(conversationId);
    const messageToEmbed = cHandler.historyFindMessageOrThrow(messageId);
    if (messageToEmbed) {
      const fragmentsCopy = duplicateDMessageFragments(messageToEmbed.fragments, true); // [attach] deep copy a message's fragments to attach to ego
      if (fragmentsCopy.length) {
        const chatTitle = cHandler.title() ?? '';
        const messageText = messageFragmentsReduceText(fragmentsCopy);
        const label = `${chatTitle} > ${messageText.slice(0, 10)}...`;
        await attachAppendEgoFragments(fragmentsCopy, label, chatTitle, conversationId, messageId);
      }
    }
  }, [attachAppendEgoFragments]);


  const actileProviders = React.useMemo(() => [
    providerAttachmentLabels(conversationOverlayStore, onActileCommandPaste),
    providerCommands(onActileCommandPaste, skillModel, targetConversationId),
    providerStarredMessages(onActileEmbedMessage),
  ], [conversationOverlayStore, onActileCommandPaste, onActileEmbedMessage, skillModel, targetConversationId]);

  const { actileComponent, actileInterceptKeydown, actileInterceptTextChange } = useActileManager(actileProviders, composerTextAreaRef, targetConversationId);


  // Type...

  const handleTextareaTextChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComposeText(e.target.value);
    isMobile && actileInterceptTextChange(e.target.value);
  }, [actileInterceptTextChange, isMobile, setComposeText]);

  const handleTextareaKeyDown = React.useCallback(async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // disable keyboard handling if the actile is visible
    if (actileInterceptKeydown(e))
      return;

    // Enter: primary action
    if (e.key === 'Enter') {
      // Skip if composing (e.g., CJK input methods) - issue #784
      if (e.nativeEvent.isComposing)
        return;

      // Alt (Windows) or Option (Mac) + Enter: append the message instead of sending it
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (await handleSendAction('append-user', composeText)) // 'alt+enter' -> write
          e.stopPropagation();
        return e.preventDefault();
      }

      // Ctrl + Enter sends the message.
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        if (await handleSendAction('generate-content', composeText)) // Ctrl + Enter sends.
          e.stopPropagation();
        return e.preventDefault();
      }

      // Shift: toggles the 'enter is newline'
      if (e.shiftKey)
        touchShiftEnter();
      if (getUIEnterIsNewline() ? e.shiftKey : !e.shiftKey) {
        if (!assistantBusy)
          await handleSendAction(chatExecuteMode, composeText); // enter -> send
        return e.preventDefault();
      }
    }

  }, [actileInterceptKeydown, assistantBusy, chatExecuteMode, composeText, handleSendAction, touchShiftEnter]);


  // Focus mode

  // const handleFocusModeOn = React.useCallback(() => setIsFocusedMode(true), [setIsFocusedMode]);

  // const handleFocusModeOff = React.useCallback(() => setIsFocusedMode(false), [setIsFocusedMode]);

  // useMediaSessionCallbacks({ play: toggleRecognition, pause: toggleRecognition });


  // Minimize

  const handleToggleMinimized = React.useCallback(() => setIsMinimized(hide => !hide), []);


  // Attachments Up

  const handleAttachCtrlV = useAttachHandler_PasteIntercept(attachAppendDataTransfer, enhancersOptions);
  const handleAttachFiles = useAttachHandler_Files(attachAppendFile);
  const handleOpenCamera = useAttachHandler_CameraOpen(attachAppendFile);
  const handleAttachScreenCapture = useAttachHandler_ScreenCapture(attachAppendFile);
  const { openWebInputDialog, webInputDialogComponent } = useAttachHandler_UrlWebLinks(attachAppendUrl, composeText);


  // Attachments Down

  const handleAttachmentDraftsAction = React.useCallback((attachmentDraftIdOrAll: AttachmentDraftId | null, action: AttachmentDraftsAction) => {
    switch (action) {
      case 'copy-text':
        const copyFragments = attachmentsTakeFragmentsByType('doc', attachmentDraftIdOrAll, false);
        const copyString = marshallWrapDocFragments(null, copyFragments, false, '\n\n---\n\n');
        copyToClipboard(copyString, attachmentDraftIdOrAll ? 'Attachment Text' : 'Attachments Text');
        break;
      case 'inline-text':
        const inlineFragments = attachmentsTakeFragmentsByType('doc', attachmentDraftIdOrAll, true);
        setComposeText(currentText => marshallWrapDocFragments(currentText, inlineFragments, 'markdown-code', '\n\n'));
        break;
    }
  }, [attachmentsTakeFragmentsByType, setComposeText]);


  // Keyboard Shortcuts

  useGlobalShortcuts('ChatComposer.Gen', React.useMemo(() => [
    ...(assistantAbortible ? [{ key: ShortcutKey.Esc, action: handleStopClicked, description: 'Stop response', level: 2 }] : []),
  ], [assistantAbortible, handleStopClicked]));

  useGlobalShortcuts('ChatComposer', React.useMemo(() => {
    const composerShortcuts: ShortcutObject[] = [];
    if (showChatAttachments) {
      composerShortcuts.push({ key: 'f', ctrl: true, shift: true, action: () => openFileForAttaching(true, handleAttachFiles), description: 'Attach File' /*, startDecoratorIcon: AddRoundedIcon as ShortcutObject['startDecoratorIcon'] */ });
      composerShortcuts.push({ key: 'l', ctrl: true, shift: true, action: openWebInputDialog, description: 'Attach Link' });
      if (supportsClipboardRead())
        composerShortcuts.push({ key: 'v', ctrl: true, shift: true, action: attachAppendClipboardItems, description: 'Attach Clipboard' /*, startDecoratorIcon: AddRoundedIcon as ShortcutObject['startDecoratorIcon'] */ });
      // Future: keep reactive state here to support Live Screen Capture and more
      // if (supportsScreenCapture)
      //   composerShortcuts.push({ key: 's', ctrl: true, shift: true, action: openScreenCaptureDialog, description: 'Attach Screen Capture' });
    }
    if (recognitionState.isActive) {
      composerShortcuts.push({ key: 'm', ctrl: true, action: handleFinishMicAndSend, description: 'Mic · Send', disabled: !recognitionState.hasSpeech || sendStarted, endDecoratorIcon: PlayArrowRoundedIcon as any, level: 4 });
      composerShortcuts.push({
        key: ShortcutKey.Esc, action: () => {
          setMicContinuation(false);
          toggleRecognition(false);
        }, description: 'Mic · Stop', level: 4,
      });
    } else if (browserSpeechRecognitionCapability().mayWork)
      composerShortcuts.push({
        key: 'm', ctrl: true, action: () => {
          // steal focus from the textarea, in case it has - so that enter cannot work against us
          (document.activeElement as HTMLElement)?.blur?.();
          toggleRecognition(false);
        }, description: 'Microphone',
      });
    return composerShortcuts;
  }, [attachAppendClipboardItems, handleAttachFiles, handleFinishMicAndSend, openWebInputDialog, recognitionState.hasSpeech, recognitionState.isActive, sendStarted, showChatAttachments, toggleRecognition]));


  // ...

  const isAppend = chatExecuteMode === 'append-user';
  const isDraw = chatExecuteMode === 'generate-image';

  const sendButtonColor: ColorPaletteProp =
    assistantBusy ? 'warning'
      : !attEnrichSummary.allCompatible ? 'warning'
        : chatExecuteModeSendColor;

  const sendButtonLabel = chatExecuteModeSendLabel;

  const sendButtonIcon =
    isAppend ? <SendIcon sx={{ fontSize: 18 }} />
            : isDraw ? <PhPaintBrush />
              : <PlayArrowRoundedIcon />;

  const showTint: ColorPaletteProp | undefined = isDraw ? 'warning' : undefined;

  const textPlaceholder = isDraw ? 'Describe an image...' : props.chatLLM ? `Message ${getLLMLabel(props.chatLLM)}, or / for skills` : 'Message, or / for skills';

  const stableGridSx: SxProps = React.useMemo(() => ({
    // basically a position:relative to enable the inner drop area
    ...dragContainerSx,
    // This used to be in the outer box, but we put it here instead
    // p: { xs: 1, md: 2 },
  }), [dragContainerSx]);

  return (
    <Box
      data-chat-composer
      aria-label='New Message'
      component='section'
      bgcolor={showTint ? `var(--joy-palette-${showTint}-softBg)` : themeBgAppChatComposer}
      sx={[...(Array.isArray(props.sx) ? props.sx : [props.sx]), {
        '&:focus-within > .composer-rim .composer-border': { stroke: 'rgba(0,255,179,.65)' },
      }]}
    >
      <ComposerRim />

      {!isMobile && labsShowShortcutBar && <StatusBarMemo toggleMinimized={handleToggleMinimized} isMinimized={isMinimized} />}

      {/* This container is here just to let the potential statusbar fill the whole space, so we moved the padding here and not in the parent */}
      <Box sx={(!isMinimized || isMobile || !labsShowShortcutBar) ? paddingBoxSx : minimizedSx}>

        <Box onDragEnter={handleContainerDragEnter} onDragStart={handleContainerDragStart} sx={stableGridSx}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Top: Textarea & Mic & Overlays, Bottom, Attachment Drafts */}
            <Box sx={{
              flexGrow: 1,
              // layout
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              minWidth: 120, // flex: enable X-scrolling (resetting any possible minWidth due to the attachment drafts)
            }}>

              {/* Text Edit + Mic buttons + MicOverlay */}
              <Box sx={{ position: 'relative' /* for Mic overlay */, height: '100%' }}>

                <Box sx={{ height: '100%' }}>

                  <Textarea
                    variant='plain'
                    color={isDraw ? 'warning' : undefined}
                    autoFocus={isDesktop}
                    minRows={2}
                    maxRows={isMobile ? 8 : 10}
                    startDecorator={selectedSkills.length ? <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{selectedSkills.map(skill => <Box key={skill.id}>
                      <Button size='sm' variant='soft' onClick={() => { skillSelectionScope.remove(skill.id); setSelectedSkills(prior => prior.filter(item => item.id !== skill.id)); }}>{skill.name} ({skill.origin}) - remove</Button>
                      {(skillReferences[skill.id] ?? []).filter(path => !skill.resources.some(resource => resource.path === path)).map(path => <Button key={path} size='sm' variant='plain' onClick={() => {
                        const isCurrent = skillSelectionScope.begin(skill.id);
                        void localJSON('skills', { method: 'POST', body: JSON.stringify({ id: skill.id, conversationId: targetConversationId ?? undefined, resources: [...skill.resources.map(resource => resource.path), path] }) }).then(({ skill: loaded }) => {
                          if (!isCurrent()) return;
                          const current = skillSnapshotSchema.parse(loaded);
                          if (current.revision !== skill.revision) throw new Error('Skill changed. Remove it and select it again.');
                          setSelectedSkills(prior => prior.map(item => item.id === current.id ? current : item));
                        }).catch(error => { if (isCurrent()) addSnackbar({ key: 'skill-reference', message: error.message, type: 'issue' }); });
                      }}>Load {path}</Button>)}
                    </Box>)}</Box> : undefined}
                    placeholder={selectedSkills.length ? `Skills selected: ${selectedSkills.map(skill => skill.name).join(', ')}. Enter your task.` : textPlaceholder}
                    value={composeText}
                    onChange={handleTextareaTextChange}
                    onKeyDown={handleTextareaKeyDown}
                    onPasteCapture={handleAttachCtrlV}
                    // onFocusCapture={handleFocusModeOn}
                    // onBlurCapture={handleFocusModeOff}
                    endDecorator={isDraw
                      ? <ComposerTextAreaDrawActions
                        composerText={composeText}
                        onReplaceText={setComposeText}
                      />
                      : <ComposerTextAreaActions
                        agiAttachmentPrompts={agiAttachmentPrompts}
                        inReferenceTo={inReferenceTo}
                        pendingParts={pendingParts}
                        pendingPartsEnhancers={COMPOSER_INPUT_ENHANCERS}
                        enhancerDisabledHint={enhancerHintItem}
                        onAppendAndSend={handleAppendTextAndSend}
                        onRemoveReferenceTo={handleRemoveInReferenceTo}
                        onRemovePendingPart={handleRemovePendingPart}
                      />
                    }
                    slotProps={{
                      textarea: {
                        tabIndex: !recognitionState.isActive ? undefined : -1,
                        height: '100%',
                        enterKeyHint: enterIsNewline ? 'enter' : 'send',
                        sx: {
                          ...(recognitionState.isAvailable && { pr: { md: 5 } }),
                        },
                        ref: composerTextAreaRef,
                      },
                    }}
                    sx={{
                      height: '100%',
                      backgroundColor: 'transparent',
                      '--Textarea-focusedThickness': '0px',
                      fontSize: '0.9375rem',
                      lineHeight: lineHeightTextareaMd,
                    }} />

                </Box>

                {/* overlay: Mic */}
                {micIsRunning && (
                  <Card
                    ref={micCardRef}
                    color='primary' variant='soft'
                    sx={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
                      // alignItems: 'center', justifyContent: 'center',
                      border: '1px solid',
                      borderColor: 'primary.solidBg',
                      borderRadius: 'sm',
                      boxShadow: 'inset 1px 1px 4px -3px var(--joy-palette-primary-solidHoverBg)',
                      zIndex: zIndexComposerOverlayMic,
                      pl: 1.5,
                      pr: { xs: 1.5, md: 5 },
                      py: 0.625,
                      overflow: 'auto',
                      // '[data-joy-color-scheme="light"] &': {
                      //   backgroundColor: 'primary.50',
                      // },
                    }}>
                    <Typography sx={{
                      color: 'primary.softColor',
                      fontSize: '0.9375rem',
                      lineHeight: lineHeightTextareaMd,
                      '& > .preceding': {
                        color: 'primary.softDisabledColor',
                        // color: 'rgba(var(--joy-palette-primary-mainChannel) / 0.6)',
                        overflowWrap: 'break-word',
                        textWrap: 'wrap',
                        whiteSpaceCollapse: 'preserve',
                      },
                      '& > .interim': {
                        textDecoration: 'underline',
                        textDecorationThickness: '0.25em',
                        textDecorationColor: 'rgba(var(--joy-palette-primary-mainChannel) / 0.1)',
                        textDecorationSkipInk: 'none',
                        textUnderlineOffset: '0.25em',
                      },
                      '& > .placeholder': {
                        fontStyle: 'italic',
                      },
                    }}>
                      {!!composeText && <span className='preceding'>{composeText.endsWith(' ') ? composeText : composeText + ' '}</span>}
                      {speechInterimResult.transcript}
                      <span className={speechInterimResult.interimTranscript === PLACEHOLDER_INTERIM_TRANSCRIPT ? 'placeholder' : 'interim'}>{speechInterimResult.interimTranscript}</span>
                    </Typography>
                  </Card>
                )}

              </Box>

              {/* Render any Attachments & menu items */}
              {!!conversationOverlayStore && showChatAttachments && (
                <ComposerAttachmentDraftsList
                  attachmentDraftsStoreApi={conversationOverlayStore}
                  attachmentDrafts={attachmentDrafts}
                  enrichment={attEnrichment}
                  enrichmentSummary={attEnrichSummary}
                  agiAttachmentPrompts={agiAttachmentPrompts}
                  onAttachmentDraftsAction={handleAttachmentDraftsAction}
                />
              )}

            </Box>

          </Box>
          {preview?.error && <Typography level='body-xs' color='danger'>{preview.error}</Typography>}
          {preview && 'budget' in preview && !preview.budget.fits && <Typography level='body-xs' color='danger' sx={{ mt: 0.5, textAlign: 'right' }}>Context exceeds the limit. Start a shorter chat or request less file/command output.</Typography>}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, pt: 1, flexWrap: isDraw ? 'wrap' : undefined }}>
            {showChatAttachments && <AttachmentSourcesMemo mode='menu-compact' canBrowse={browseCapability.mayWork}
              hasScreenCapture={supportsScreenCapture} hasCamera={supportsCameraCapture()} onlyImages={showChatAttachments === 'only-images'}
              onAttachClipboard={attachAppendClipboardItems} onAttachFiles={handleAttachFiles} onAttachScreenCapture={handleAttachScreenCapture}
              onOpenCamera={handleOpenCamera} onOpenWebInput={openWebInputDialog} />}
            {recognitionState.isAvailable && <ButtonMicMemo variant={micVariant} color={micColor} errorMessage={recognitionState.errorMessage} onClick={handleToggleMic} />}
            {micIsRunning && <ButtonMicContinuationMemo isActive={micContinuation} variant='soft' color={micContinuation ? 'primary' : 'neutral'} onClick={handleToggleMicContinuation} />}
            {isDraw && <ButtonGroupDrawRepeat drawRepeat={drawRepeat} setDrawRepeat={setDrawRepeat} />}
            <Box sx={{ flex: 1 }} />
            <ComposerChatConfigPicker conversationId={targetConversationId} buttonRef={props.configButtonRef}
              mode={chatExecuteMode} onSetMode={setChatExecuteMode} capabilityHasT2I={props.capabilityHasT2I} disabled={sendStarted || assistantBusy}
              preview={preview} chatLLM={props.chatLLM} />
            {!assistantAbortible
              ? <IconButton aria-label={chatRunActive ? 'Stopping response' : sendButtonLabel} variant='solid' color={sendButtonColor} sx={{
                borderRadius: '50%', '--IconButton-size': { xs: '40px', sm: '36px' },
                '&:not(:disabled):not([aria-disabled="true"]):hover, &:not(:disabled):not([aria-disabled="true"]):focus-visible': { boxShadow: '0 0 12px rgba(0,255,179,.45)' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }} disabled={noConversation || sendStarted || chatRunActive} onClick={handleSendClicked}>{sendButtonIcon}</IconButton>
              : <IconButton aria-label='Stop response' variant='solid' color='neutral' sx={stopButtonSx} disabled={noConversation} onClick={handleStopClicked}><StopRoundedIcon sx={{ fontSize: 22 }} /></IconButton>}
          </Box>

          {/* overlay: Drag & Drop*/}
          {dropComponent}

        </Box>

      </Box> {/* Padding container of the whole composer */}

      {/* Web Input Dialog (when open) */}
      {webInputDialogComponent}

      {/* Actile (when open) */}
      {actileComponent}

    </Box>
  );
}
