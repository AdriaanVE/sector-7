import type { DMessageFragment, DVoidPlaceholderMOp } from '~/common/stores/chat/chat.fragments';
import type { Immutable } from '~/common/types/immutable.types';
import type { Phase } from './attention';

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
    const invocationPhase = name === 'local_command' ? 'Running command' : name === 'folder_list' ? 'Listing files' : name === 'folder_read' ? 'Reading files' : name === 'folder_search' || name === 'web_search' || name === 'web_fetch' ? 'Searching' : name.startsWith('folder_') ? 'Editing files' : undefined;
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
