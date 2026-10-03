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

const compact = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 90);
const fileName = (value: unknown) => typeof value === 'string' ? compact(value.split(/[\\/]/).filter(Boolean).at(-1) || '') : '';

export function toolActivityLabel(fragments: readonly Immutable<DMessageFragment>[], phase: Phase): string {
  if (phase === 'Thinking' || phase === 'Connecting' || phase === 'Responding' || phase === 'Stopping') return phase === 'Responding' ? 'Writing the answer' : phase;
  for (const fragment of [...fragments].reverse()) {
    if (fragment.ft === '_ft_sentinel') continue;
    const part = fragment.part;
    if (part.pt === 'ph') {
      const operation = [...(part.opLog || [])].reverse().find(operation => operation.state === 'active');
      if (operation) return nativeOperationLabel(operation);
    }
    if (part.pt !== 'tool_invocation') continue;
    if (part.invocation.type === 'code_execution') return 'Running code';
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(part.invocation.args); } catch { /* Arguments may still be streaming. */ }
    const path = fileName(args?.path);
    switch (part.invocation.name) {
      case 'folder_list': return path ? `Listing ${path}` : 'Listing files';
      case 'folder_read': return path ? `Reading ${path}` : 'Reading files';
      case 'folder_edit': case 'folder_write': case 'folder_move': case 'folder_delete': return path ? `Updating ${path}` : 'Updating files';
      case 'folder_search': return 'Searching project files';
      case 'local_command': return 'Running a command';
      default: return phase;
    }
  }
  return phase;
}

function nativeOperationLabel(operation: Immutable<DVoidPlaceholderMOp>): string {
  if (operation.mot === 'search-web') return operation.iTexts?.[0] ? `Searching: ${compact(operation.iTexts[0])}` : 'Searching the web';
  if (operation.mot === 'code-exec') return 'Running code';
  return 'Generating an image';
}
