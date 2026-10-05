import type { DMessageFragment, DMessageToolResponsePart, DVoidPlaceholderMOp } from '~/common/stores/chat/chat.fragments';
import type { Immutable } from '~/common/types/immutable.types';
import type { Phase } from './attention';
import type { NativeHistory } from './native-history';

/** Display projections never replace the stored provider history. */
export function toolDisplayFragments(fragments: readonly Immutable<DMessageFragment>[], showAll: boolean, hideProgress = false): Immutable<DMessageFragment>[] {
  if (showAll) return [...fragments];
  return fragments.flatMap<Immutable<DMessageFragment>>(fragment => {
    if (fragment.ft === '_ft_sentinel') return [];
    const part = fragment.part;
    if (part.pt === 'tool_invocation') return [];
    if (part.pt === 'tool_response') {
      if (!part.error) return [];
      return [{ ft: 'content', fId: `display:${fragment.fId}`, part: { pt: 'error', hint: 'tool-display', error: `Tool failed: ${typeof part.error === 'string' ? part.error.slice(0, 400) : 'The operation could not complete.'}` } } satisfies DMessageFragment];
    }
    if (part.pt === 'ph' && part.pType !== 'notice' && !part.aixControl && (hideProgress || part.opLog?.length)) {
      const failure = part.opLog?.find(operation => operation.state === 'error');
      if (failure) return [{ ft: 'content', fId: `display:${fragment.fId}`, part: { pt: 'error', hint: 'tool-display', error: failure.text.slice(0, 400) || 'A tool operation failed.' } } satisfies DMessageFragment];
      return [];
    }
    return [fragment];
  });
}

export function hasVisibleAnswer(fragments: readonly Immutable<DMessageFragment>[]): boolean {
  return fragments.some(fragment => {
    if (fragment.ft === '_ft_sentinel') return false;
    const { part } = fragment;
    if (part.pt === 'ma') return false;
    if (part.pt === 'ph') return true;
    if (part.pt === 'text') return !!part.text.trim();
    return true;
  });
}

// Keep full concise context for assistive text; the activity line clips visually.
// eslint-disable-next-line no-control-regex -- Strip control characters from untrusted tool input before display.
const contextText = (value: unknown, max = 2048) => typeof value === 'string' ? value.replace(/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim().slice(0, max) : '';
const relativePath = (value: unknown) => {
  const path = contextText(value).replace(/\\/g, '/');
  return path.startsWith('/') || /^[A-Za-z]:/.test(path) ? '' : path.replace(/^\.\//, '');
};

export interface ToolActivityContext {
  folders?: readonly { id: string; name: string }[];
  toolId?: string;
}

export function toolActivityLabel(fragments: readonly Immutable<DMessageFragment>[], phase: Phase, context: ToolActivityContext = {}): string {
  if (phase === 'Thinking' || phase === 'Connecting' || phase === 'Responding' || phase === 'Stopping') return phase === 'Responding' ? 'Writing the answer' : phase;
  for (const fragment of [...fragments].reverse()) {
    if (fragment.ft === '_ft_sentinel') continue;
    const part = fragment.part;
    if (part.pt === 'ph') {
      const operation = [...(part.opLog || [])].reverse().find(operation => {
        if (operation.state !== 'active') return false;
        if (context.toolId) return operation.opId === context.toolId;
        if (operation.mot === 'search-web') return phase === 'Searching';
        return operation.mot === 'code-exec' && phase === 'Running code';
      });
      if (operation) return nativeOperationLabel(operation);
    }
    if (part.pt !== 'tool_invocation' || context.toolId && part.id !== context.toolId) continue;
    if (part.invocation.type === 'code_execution') {
      if (phase === 'Running code') return 'Running code';
      continue;
    }
    const { name } = part.invocation;
    const invocationPhase = name === 'spawn_agent' || name === 'continue_agent' ? 'Running subagent' : name === 'local_command' ? 'Running command' : name === 'folder_list' ? 'Listing files' : name === 'folder_read' ? 'Reading files' : name === 'folder_search' || name === 'web_search' || name === 'web_fetch' ? 'Searching' : name.startsWith('folder_') ? 'Editing files' : undefined;
    if (invocationPhase !== phase) continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(part.invocation.args);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch { /* Arguments may still be streaming. */ }
    const folder = contextText(context.folders?.find(folder => folder.id === args.folder_id)?.name, 256);
    const path = relativePath(args.path);
    const location = [folder, path].filter(Boolean).join('/');
    const query = contextText(args.query, 256);
    switch (name) {
      case 'spawn_agent': return `Running ${contextText(args.model, 64) || 'GPT-6.1 Sol'} subagent${contextText(args.description, 120) ? `: ${contextText(args.description, 120)}` : ''}`;
      case 'continue_agent': return 'Continuing subagent';
      case 'folder_list': return location ? `Listing ${location}` : 'Listing files';
      case 'folder_read': return location ? `Reading ${location}` : 'Reading files';
      case 'folder_move': {
        const destination = relativePath(args.destination);
        return path && destination ? `Moving ${location} to ${destination}` : location ? `Moving ${location}` : 'Moving files';
      }
      case 'folder_delete': return location ? `Deleting ${location}` : 'Deleting files';
      case 'folder_edit': case 'folder_write': return location ? `Updating ${location}` : 'Updating files';
      case 'folder_search': return `Searching${location ? ` ${location}` : ' project files'}${query ? `: ${query}` : ''}`;
      case 'local_command': return `${commandTask(args.command)}${folder ? ` in ${folder}` : ''}`;
      case 'web_search': return query ? `Searching the web: ${query}` : 'Searching the web';
      case 'web_fetch': return fetchLabel(args.url);
    }
  }
  return phase;
}

/** Only fixed task names reach the UI. Shell arguments, scripts and environment values never do. */
function commandTask(command: unknown): string {
  if (typeof command !== 'string' || /[;|&`$<>\r\n]/.test(command)) return 'Running a command';
  const tokens = command.trim().split(/\s+/);
  const pair = tokens.slice(0, 2).join(' ');
  if (['git status', 'git diff', 'git log', 'npm test', 'npm build', 'npm lint', 'pnpm test', 'pnpm build', 'pnpm lint', 'yarn test', 'yarn build', 'yarn lint'].includes(pair)) return `Running ${pair}`;
  if (['npm run', 'pnpm run', 'yarn run'].includes(pair) && ['test', 'build', 'lint', 'tscheck', 'typecheck'].includes(tokens[2])) return `Running ${pair} ${tokens[2]}`;
  if (tokens[0] === 'pwd') return 'Checking the working folder';
  if (tokens[0] === 'ls') return 'Listing files';
  return 'Running a command';
}

function fetchLabel(value: unknown): string {
  try {
    const url = new URL(contextText(value, 4096));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Fetching a web page';
    // Query strings, fragments and credentials can contain access tokens.
    return `Fetching ${url.origin}${url.pathname}`;
  } catch { return 'Fetching a web page'; }
}

function nativeOperationLabel(operation: Immutable<DVoidPlaceholderMOp>): string {
  if (operation.mot === 'search-web') {
    const input = contextText(operation.iTexts?.[0], 4096);
    if (/^URL:\s*/i.test(input) || /^https?:\/\//i.test(input) && /^Fetching/i.test(operation.text)) return fetchLabel(input.replace(/^URL:\s*/i, ''));
    if (/^Fetching/i.test(operation.text)) return 'Fetching a web page';
    const query = input.replace(/^(?:Search query|Query):\s*/i, '').replace(/^"(.*)"$/, '$1');
    return query ? `Searching the web: ${contextText(query, 256)}` : 'Searching the web';
  }
  if (operation.mot === 'code-exec') return 'Running code';
  return 'Generating an image';
}


const summaryCategories = {
  list: ['Listed files', 'File listing'],
  read: ['Read files', 'File reads'],
  search: ['Searched files', 'File search'],
  write: ['Updated files', 'File updates'],
  move: ['Moved files', 'File moves'],
  delete: ['Deleted files', 'File deletion'],
  command: ['Ran commands', 'Commands'],
  agent: ['Ran subagents', 'Subagents'],
  web: ['Searched the web', 'Web search'],
  fetch: ['Fetched web pages', 'Web fetch'],
  code: ['Ran code', 'Code execution'],
  image: ['Generated images', 'Image generation'],
  tool: ['Used tools', 'Tools'],
} as const;
type SummaryCategory = keyof typeof summaryCategories;
type SummaryState = 'done' | 'failed' | 'stopped' | 'incomplete';

function functionSummaryCategory(name: string): SummaryCategory {
  switch (name) {
    case 'folder_list': return 'list';
    case 'folder_read': return 'read';
    case 'folder_search': return 'search';
    case 'folder_write': case 'folder_edit': return 'write';
    case 'folder_move': return 'move';
    case 'folder_delete': return 'delete';
    case 'local_command': return 'command';
    case 'spawn_agent': case 'continue_agent': return 'agent';
    case 'web_search': return 'web';
    case 'web_fetch': return 'fetch';
    case 'code_execution': return 'code';
    default: return 'tool';
  }
}

function nativeSummaryCategory(operation: Immutable<DVoidPlaceholderMOp>): SummaryCategory {
  if (operation.mot === 'gen-image') return 'image';
  if (operation.mot === 'search-web') {
    // Providers retain either a fetch status or explicit URL input in their operation log.
    return /^(?:Fetch|Retrieved)/i.test(operation.text) || operation.iTexts?.some(text => /^(?:URL:\s*|https?:\/\/)/i.test(text)) ? 'fetch' : 'web';
  }
  if (/^(?:Bash|Executing bash|Running bash)/.test(operation.text)) return 'command';
  if (/^(?:Viewed file|Viewing )/.test(operation.text)) return 'read';
  if (/^(?:File updated|File created|Edit applied|Creating |Editing |Inserting |Undoing |Editor)/.test(operation.text)) return 'write';
  if (/^(?:Code executed|Executing code|Execution error|Executing\.\.\.|Running code|Writing code|Written code)/.test(operation.text)) return 'code';
  return 'tool';
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function responseSummaryState(part: Immutable<DMessageToolResponsePart>): SummaryState {
  // Local command receipts can report an unsuccessful exit without setting the tool error flag.
  let result: Record<string, unknown> = {};
  try {
    result = jsonObject(JSON.parse(part.response.result)) ?? {};
  } catch { /* Other providers may return plain text. */ }
  if (result.stopped === true || result.status === 'cancelled' || result.status === 'interrupted') return 'stopped';
  if (result.status === 'incomplete') return 'incomplete';
  if (part.error || result.error || ['failed', 'timed_out', 'output_limit'].includes(String(result.status))) return 'failed';
  if (part.response.type === 'function_call' && part.response.name === 'local_command' && result.status !== 'succeeded') return 'incomplete';
  return result.status === 'running' ? 'incomplete' : 'done';
}

/** A fixed vocabulary derived from saved outcomes, never tool arguments or answer prose. */
export function completedToolSummary(fragments: readonly Immutable<DMessageFragment>[], showAll = false, pending = false, nativeHistory?: Immutable<NativeHistory>): string | null {
  if (showAll || pending) return null;
  const operations = new Map<string, { category: SummaryCategory; state: SummaryState }>();
  // Clean provider completion removes transient opLog placeholders. Durable native blocks remain.
  for (const segment of nativeHistory?.segments ?? []) {
    for (const block of segment.content) {
      if (block.type === 'server_tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
        const input = jsonObject(block.input);
        const category = block.name === 'bash_code_execution' ? 'command'
          : block.name === 'text_editor_code_execution' ? input?.command === 'view' ? 'read' : 'write'
            : functionSummaryCategory(block.name);
        operations.set(block.id, { category, state: 'incomplete' });
      } else if (block.type.endsWith('_tool_result') && typeof block.tool_use_id === 'string') {
        const operation = operations.get(block.tool_use_id);
        if (!operation) continue;
        const content = jsonObject(block.content);
        const error = typeof content?.type === 'string' && content.type.endsWith('_error');
        const exitFailed = typeof content?.return_code === 'number' && content.return_code !== 0;
        const confirmed = Array.isArray(block.content) || typeof content?.type === 'string' && content.type.endsWith('_result');
        operations.set(block.tool_use_id, { ...operation, state: error || exitFailed ? 'failed' : confirmed ? 'done' : 'incomplete' });
      }
    }
  }
  for (const fragment of fragments) {
    if (fragment.ft === '_ft_sentinel') continue;
    const { part } = fragment;
    if (part.pt === 'tool_invocation') {
      if (part.invocation.type === 'function_call' && part.invocation.name === 'ask_user_question') continue;
      if (!operations.has(part.id)) operations.set(part.id, {
        category: part.invocation.type === 'code_execution' ? 'code' : functionSummaryCategory(part.invocation.name), state: 'incomplete',
      });
    } else if (part.pt === 'tool_response') {
      if (part.response.type === 'function_call' && part.response.name === 'ask_user_question') continue;
      operations.set(part.id, {
        category: part.response.type === 'code_execution' ? 'code' : functionSummaryCategory(part.response.name), state: responseSummaryState(part),
      });
    } else if (part.pt === 'ph') {
      for (const operation of part.opLog ?? []) operations.set(operation.opId, {
        category: nativeSummaryCategory(operation),
        state: operation.state === 'done' ? 'done' : operation.state === 'active' ? 'incomplete'
          : operation.oTexts?.includes('Terminated with reason: done-client-aborted') ? 'stopped' : 'failed',
      });
    }
  }
  const labels = new Set<string>();
  for (const { category, state } of operations.values()) {
    const [done, task] = summaryCategories[category];
    const label = state === 'done' ? done : `${task} ${state}`;
    labels.add(label);
  }
  return labels.size ? [...labels].map((label, index) => index ? label.charAt(0).toLowerCase() + label.slice(1) : label).join(', ') : null;
}
