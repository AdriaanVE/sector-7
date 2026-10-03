import { connectedFolderSchema } from './folder-tools';
import { skillSnapshotSchema } from './skills';
import { nativeHistorySchema } from './native-history';
import * as z from 'zod/v4';
import { CHAT_MODELS, normalizeChatConfig } from './chat-config';
import { questionSchema } from './attention';

export const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const STORE_NAMES = ['app-chats', 'app-folders', 'app-project-files', 'app-personal-settings', 'app-personal-ui', 'app-app-chat', 'app-ui', 'app-app-chat-panes-2'] as const;
const record = z.record(z.string(), z.unknown());
const storeSchema = z.object({ version: z.number().int().nonnegative(), state: record });
export const workspaceSchema = z.object({
  formatVersion: z.literal(1), revision: z.number().int().nonnegative(), revisionEpoch: z.string().uuid().optional(), migrated: z.boolean(),
  stores: z.partialRecord(z.enum(STORE_NAMES), storeSchema),
  assets: z.record(safeId, z.object({ size: z.number().int().nonnegative(), mime: z.string().min(1), metadata: record })),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const emptyWorkspace = (): Workspace => ({ formatVersion: 1, revision: 0, migrated: false, stores: {}, assets: {} });
const timestamp = z.number().finite().nonnegative();
const dataRef = z.discriminatedUnion('reftype', [
  z.object({ reftype: z.literal('dblob'), dblobAssetId: safeId, mimeType: z.string(), bytesSize: timestamp }).passthrough(),
  z.object({ reftype: z.literal('url'), url: z.string().url() }).passthrough(),
]);
const imagePart = z.object({ pt: z.literal('image_ref'), dataRef, width: timestamp.optional(), height: timestamp.optional() }).passthrough();
const invocation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('function_call'), name: z.string(), args: z.string() }).passthrough(),
  z.object({ type: z.literal('code_execution'), language: z.string(), code: z.string(), author: z.string() }).passthrough(),
]);
const response = z.discriminatedUnion('type', [
  z.object({ type: z.literal('function_call'), name: z.string(), result: z.string() }).passthrough(),
  z.object({ type: z.literal('code_execution'), executor: z.string(), result: z.string() }).passthrough(),
]);
const part = z.discriminatedUnion('pt', [
  z.object({ pt: z.literal('text'), text: z.string() }).passthrough(),
  z.object({ pt: z.literal('error'), error: z.string() }).passthrough(), imagePart,
  z.object({ pt: z.literal('doc'), vdt: z.string(), data: z.object({ idt: z.literal('text'), text: z.string() }).passthrough(), ref: z.string(), l1Title: z.string() }).passthrough(),
  z.object({ pt: z.literal('reference'), rt: z.literal('zync'), zType: z.literal('asset'), zUuid: safeId, assetType: z.enum(['image', 'audio']), _legacyImageRefPart: imagePart.optional() }).passthrough(),
  z.object({ pt: z.literal('tool_invocation'), id: z.string().min(1), invocation }).passthrough(),
  z.object({ pt: z.literal('tool_response'), id: z.string().min(1), error: z.union([z.boolean(), z.string()]), response, environment: z.enum(['upstream', 'server', 'client']) }).passthrough(),
  z.object({ pt: z.literal('hosted_resource'), resource: z.object({ via: z.enum(['anthropic', 'gemini-file', 'openai-container', 'url']), fileId: z.string().optional(), fileName: z.string().optional(), containerId: z.string().optional(), url: z.string().url().optional() }).passthrough() }).passthrough(),
  z.object({ pt: z.literal('annotations'), annotations: z.array(z.object({ type: z.literal('citation'), url: z.string(), title: z.string(), ranges: z.array(z.object({ startIndex: timestamp, endIndex: timestamp }).passthrough()) }).passthrough()) }).passthrough(),
  z.object({ pt: z.literal('ma'), aType: z.literal('reasoning'), aText: z.string(), textSignature: z.string().optional(), redactedData: z.array(z.string()).optional() }).passthrough(),
  z.object({ pt: z.literal('ph'), pText: z.string(), opLog: z.array(z.object({ opId: z.string(), mot: z.enum(['search-web', 'gen-image', 'code-exec']), text: z.string(), state: z.enum(['active', 'done', 'error']), level: timestamp, cts: timestamp }).passthrough()).optional() }).passthrough(),
  z.object({ pt: z.literal('_pt_sentinel') }).passthrough(),
]);
const fragment = z.object({ ft: z.enum(['content', 'attachment', 'void']), fId: safeId, part }).passthrough();
const projectContext = z.object({ projectId: safeId, instructionRevision: timestamp, files: z.array(z.object({ id: safeId, version: z.string().min(1) })) });
const generator = z.discriminatedUnion('mgt', [
  z.object({ mgt: z.literal('named'), name: z.string(), nativeHistory: nativeHistorySchema.optional(), projectContext: projectContext.optional() }).passthrough(),
  z.object({ mgt: z.literal('aix'), name: z.string(), aix: z.object({ mId: z.string(), vId: z.string() }), nativeHistory: nativeHistorySchema.optional(), projectContext: projectContext.optional() }).passthrough(),
]);
const message = z.object({ id: safeId, role: z.enum(['user', 'assistant', 'system']), fragments: z.array(fragment), metadata: z.object({ selectedSkills: z.array(skillSnapshotSchema).optional() }).passthrough().optional(), generator: generator.optional(), created: timestamp, updated: timestamp.nullable(), tokenCount: timestamp, userFlags: z.array(z.string()).optional(), pendingIncomplete: z.boolean().optional() }).passthrough();
const pendingQuestion = questionSchema.extend({ invocationId: z.string().min(1), messageId: safeId, model: z.string(), answered: z.boolean().optional() });
const conversation = z.object({ id: safeId, messages: z.array(message), created: timestamp, updated: timestamp.nullable(), tokenCount: timestamp, systemPurposeId: z.string(), _isIncognito: z.literal(false).optional(), pendingQuestions: z.array(pendingQuestion).optional(), lastOutcome: z.enum(['ok', 'error', 'stopped', 'interrupted']).optional(), chatConfig: z.object({ llmId: z.string(), effort: z.string(), tools: z.object({ webSearch: z.boolean(), webFetch: z.boolean(), codeSandbox: z.boolean() }) }).optional() }).passthrough();
const folder = z.object({ connectedFolders: z.array(connectedFolderSchema).max(20).optional(), id: safeId, title: z.string(), conversationIds: z.array(safeId), instructions: z.string(), fileIds: z.array(safeId), revision: timestamp, color: z.string().optional() }).passthrough();
const projectFile = z.object({ id: safeId, assetId: safeId, version: z.string().min(1), name: z.string(), folderSnapshot: z.object({ id: safeId, name: z.string().min(1), selectedAt: timestamp, excludedCount: timestamp }).optional(), relativePath: z.string().min(1).optional(), mime: z.string(), size: timestamp, status: z.enum(['processing', 'ready', 'failed']), warnings: z.array(z.string()), fragments: z.array(fragment), convertedAssetIds: z.array(safeId).optional(), tokenEstimates: z.record(z.string(), timestamp) }).passthrough();

/** Normalize detached legacy records before scanning, validation, or hydration. Originals stay untouched. */
export function normalizeWorkspace(value: unknown): Workspace {
  const workspace = workspaceSchema.parse(structuredClone(value));
  const chats = workspace.stores['app-chats'];
  if (chats) {
    const cs = z.array(record).parse(chats.state.conversations);
    for (const chat of cs) {
      const messages = z.array(record).parse(chat.messages);
      if (chats.version < 4) for (const m of messages) {
        if (!Array.isArray(m.fragments)) {
          const text = z.string().parse(m.text);
          m.fragments = [{ ft: 'content', fId: crypto.randomUUID(), part: { pt: 'text', text } }];
          if (typeof m.originLLM === 'string' && !m.generator) m.generator = { mgt: 'named', name: m.originLLM };
          if (m.metadata && typeof m.metadata === 'object' && 'inReplyToText' in m.metadata && typeof m.metadata.inReplyToText === 'string') {
            const { inReplyToText, ...metadata } = m.metadata;
            m.metadata = { ...metadata, inReferenceTo: [{ mrt: 'dmsg', mText: inReplyToText, mRole: 'assistant' }] };
          }
          delete m.text; delete m.sender; delete m.typing; delete m.originLLM;
        }
      }
      for (const m of messages) for (const f of z.array(record).parse(m.fragments)) {
        if ((f.ft === 'content' || f.ft === 'attachment') && f.part && typeof f.part === 'object') {
          const doc = f.part as Record<string, unknown>;
          if (doc.pt === 'doc' && 'type' in doc && !('vdt' in doc)) { doc.vdt = doc.type; delete doc.type; }
        }
      }
      chat.messages = messages;
      let model: string | undefined;
      for (const m of [...messages].reverse()) {
        const recovered = z.object({ mgt: z.literal('aix'), aix: z.object({ mId: z.string() }) }).safeParse(m.generator);
        if (recovered.success && CHAT_MODELS.some(id => id === recovered.data.aix.mId)) { model = recovered.data.aix.mId; break; }
      }
      chat.chatConfig = normalizeChatConfig(chat.chatConfig as Parameters<typeof normalizeChatConfig>[0], model);
    }
    chats.state.conversations = cs; chats.version = 5;
  }
  const folders = workspace.stores['app-folders'];
  if (folders && folders.version < 1) {
    const owned = new Set<string>(); let removed = 0;
    folders.state.folders = z.array(record).parse(folders.state.folders).map(f => ({ ...f, instructions: f.instructions ?? '', fileIds: f.fileIds ?? [], revision: f.revision ?? 0,
      conversationIds: z.array(safeId).parse(f.conversationIds).filter(id => { if (owned.has(id)) { removed++; return false; } owned.add(id); return true; }) }));
    if (removed) folders.state.migrationSummary = `${removed} duplicate project memberships removed. All chats kept.`;
    folders.version = 1;
  }
  const projectFiles = workspace.stores['app-project-files'];
  if (projectFiles) projectFiles.state.files = Object.fromEntries(Object.entries(z.record(safeId, projectFile).parse(projectFiles.state.files)).map(([id, file]) => [id,
    file.status === 'processing' ? { ...file, status: 'failed', warnings: [...file.warnings, 'Extraction was interrupted. Remove and add the file again.'] } : file,
  ]));
  return workspace;
}

/** All live and historical references own their bytes; unsent drafts never enter this set. */
export function workspaceAssetIds(workspace: Workspace): Set<string> {
  const ids = new Set<string>(); const upstreamIds = new Set<string>();
  const scan = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(scan); return; }
    const item = value as Record<string, unknown>;
    if (item.reftype === 'dblob') ids.add(safeId.parse(item.dblobAssetId));
    if (item.via === 'anthropic' && typeof item.fileId === 'string') upstreamIds.add(item.fileId);
    Object.values(item).forEach(scan);
  };
  scan(workspace.stores['app-chats']?.state);
  const files = z.record(safeId, projectFile).parse(workspace.stores['app-project-files']?.state.files ?? {});
  const fileIds = new Set<string>();
  for (const f of z.array(folder).parse(workspace.stores['app-folders']?.state.folders ?? [])) f.fileIds.forEach(id => fileIds.add(id));
  for (const chat of z.array(conversation).parse(workspace.stores['app-chats']?.state.conversations ?? []))
    for (const m of chat.messages) for (const ref of m.generator?.projectContext?.files ?? []) {
      if (!files[ref.id] || files[ref.id].version !== ref.version) throw new Error(`Historical project file ${ref.id} is missing or has a different version.`);
      fileIds.add(ref.id);
    }
  for (const id of fileIds) {
    const file = files[id]; if (!file) throw new Error(`Project file ${id} is missing.`);
    ids.add(file.assetId); file.convertedAssetIds?.forEach(id => ids.add(id)); scan(file.fragments);
  }
  for (const [id, asset] of Object.entries(workspace.assets)) if (typeof asset.metadata.upstreamFileId === 'string' && upstreamIds.has(asset.metadata.upstreamFileId)) ids.add(id);
  return ids;
}

/** Validate complete supported records before any durable swap. Preserve unknown protocol metadata. */
export function validateWorkspace(value: unknown): Workspace {
  const initial = workspaceSchema.parse(value);
  const supportedVersions: Record<string, number> = { 'app-chats': 5, 'app-folders': 1, 'app-project-files': 1, 'app-personal-settings': 1, 'app-personal-ui': 1, 'app-app-chat': 3, 'app-ui': 3, 'app-app-chat-panes-2': 1 };
  for (const [name, store] of Object.entries(initial.stores)) if (store && store.version > supportedVersions[name]) throw new Error(`Workspace ${name} was created by a newer app version.`);
  const workspace = normalizeWorkspace(initial);
  for (const [name, store] of Object.entries(workspace.stores)) {
    if (!store) continue;
    const allowed = name === 'app-chats' ? ['conversations'] : name === 'app-folders' ? ['folders', 'enableFolders', 'migrationSummary']
      : name === 'app-project-files' ? ['files'] : name === 'app-personal-settings' ? ['instructions']
      : name === 'app-app-chat' ? ['autoSuggestAttachmentPrompts', 'autoSuggestDiagrams', 'autoSuggestHTMLUI', 'autoSuggestQuestions', 'autoTitleChat', 'tokenCountingMethod', 'micTimeoutMs', 'showTextDiff', 'showSystemMessages']
      : name === 'app-app-chat-panes-2' ? ['chatPanes', 'chatPaneFocusIndex']
      : name === 'app-ui' ? ['enterIsNewline', 'contentScaling', 'doubleClickToEdit', 'centerMode', 'complexityMode'] : ['sidebarOpen'];
    if (Object.keys(store.state).some(key => !allowed.includes(key))) throw new Error(`Unexpected durable field in ${name}.`);
    if (name === 'app-chats') {
      const chats = z.array(conversation).parse(store.state.conversations);
      uniqueIds(chats, 'chat');
      for (const chat of chats) {
        uniqueIds(chat.messages, 'message');
        for (const q of chat.pendingQuestions ?? []) {
          const m = chat.messages.find(m => m.id === q.messageId);
          const call = m?.fragments.find(f => f.part.pt === 'tool_invocation' && f.part.id === q.invocationId);
          if (!call || call.part.pt !== 'tool_invocation' || call.part.invocation.type !== 'function_call' || call.part.invocation.name !== 'ask_user_question') throw new Error('Pending question has no matching invocation.');
          const result = m?.fragments.some(f => f.part.pt === 'tool_response' && f.part.id === q.invocationId);
          if (!!q.answered !== !!result) throw new Error('Pending question answer does not match its tool response.');
        }
      }
    }
    if (name === 'app-folders') { uniqueIds(z.array(folder).parse(store.state.folders), 'project'); z.boolean().parse(store.state.enableFolders); }
    if (name === 'app-project-files') { const files = z.record(safeId, projectFile).parse(store.state.files); for (const [id, file] of Object.entries(files)) if (id !== file.id) throw new Error('Project file key does not match its ID.'); }
    if (name === 'app-personal-settings') z.string().parse(store.state.instructions);
  }
  if (/"(?:anthropicKey|anthropicHost|accessToken|apiKey|sessionToken|_abortController)"\s*:/.test(JSON.stringify(workspace))) throw new Error('Workspace contains transient or credential fields.');
  for (const id of workspaceAssetIds(workspace)) if (!workspace.assets[id]) throw new Error(`Referenced asset ${id} is missing from the manifest.`);
  return workspace;
}
function uniqueIds(items: { id: string }[], kind: string) { if (new Set(items.map(i => i.id)).size !== items.length) throw new Error(`Duplicate ${kind} IDs.`); }

export function reviveAssetDates<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if ('provider' in value && value.provider === 'anthropic-messages') return structuredClone(value);
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map(reviveAssetDates) as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['createdAt', 'updatedAt'].includes(key) && typeof item === 'string' ? new Date(item) : reviveAssetDates(item)])) as T;
}
