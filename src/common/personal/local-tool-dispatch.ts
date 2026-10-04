import type { AixTools_ToolDefinition } from '~/modules/aix/server/api/aix.wiretypes';
import { folderTools, isFolderTool, folderToolInput } from './folder-tools';
import { flushDisk, localJSON, LocalStorageHTTPError } from './disk-storage';
import type { Phase } from './attention';
import { subagentTool } from './subagent-tool';

export const localTools: AixTools_ToolDefinition[] = [...folderTools, { type: 'function_call', function_call: { name: 'local_command', description: 'Run a shell command with the connected folder as its working directory. This is the local Mac with the app permissions, not a sandbox. Use for terminal tools, tests and Git. Output is bounded, timeout up to 300 seconds. Do not expose credentials in output.', input_schema: { properties: { folder_id: { type: 'string' }, command: { type: 'string' }, timeout_ms: { type: 'integer' } }, required: ['folder_id', 'command'] } } }];
localTools.push(subagentTool);
export const isLocalTool = (name: string) => isFolderTool(name) || name === 'local_command' || name === 'spawn_agent';
export function localToolPhase(name: string): Phase {
  switch (name) {
    case 'spawn_agent': return 'Running subagent';
    case 'local_command': return 'Running command';
    case 'folder_list': return 'Listing files';
    case 'folder_read': return 'Reading files';
    case 'folder_search': return 'Searching';
    default: return 'Editing files';
  }
}
export async function dispatchLocalTool(call: { id: string; name: string; args: string }, projectId: string | undefined, conversationId: string, signal: AbortSignal, onOutput?: (text: string) => void): Promise<Record<string, unknown>> {
  await flushDisk(); signal.throwIfAborted();
  if (call.name === 'spawn_agent') return (await import('./subagents')).runSubagent(call, conversationId, signal);
  const args = JSON.parse(call.args);
  if (call.name !== 'local_command') return localJSON('folders', { method: 'POST', signal, body: JSON.stringify({ projectId, conversationId, invocationId: call.id, input: folderToolInput.parse({ ...args, name: call.name }) }) });
  const scope = { projectId, conversationId, folderId: args.folder_id, invocationId: call.id };
  let jobId: string | undefined;
  const chunks: { stream: string; text: string }[] = [];
  try {
    let result = await localJSON('commands', { method: 'POST', signal, body: JSON.stringify({ ...scope, action: 'start', command: args.command, timeoutMs: args.timeout_ms }) });
    jobId = result.jobId;
    const accept = () => { chunks.push(...result.chunks); onOutput?.(chunks.map(chunk => chunk.text).join('')); };
    accept();
    while (result.status === 'running') {
      await new Promise<void>((resolve, reject) => {
        const done = () => { signal.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(done, 250);
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason || new Error('Stopped.')); };
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      });
      result = await localJSON('commands', { method: 'POST', signal, body: JSON.stringify({ ...scope, action: 'poll', jobId, cursor: result.cursor }) }); accept();
    }
    return { ...result, chunks };
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Local command stopped.';
    if (!jobId && error instanceof LocalStorageHTTPError && error.status < 500) return { error: message, chunks, stopped: signal.aborted };
    let cancellationUnconfirmed = false;
    const cancellation = jobId ? { ...scope, action: 'cancel', jobId } : { ...scope, action: 'cancel-start', command: args.command, timeoutMs: args.timeout_ms };
    try { await localJSON('commands', { method: 'POST', signal: AbortSignal.timeout(5000), body: JSON.stringify(cancellation) }); }
    catch {
      cancellationUnconfirmed = true;
      message += ' Command cancellation could not be confirmed. Check the connected folder before retrying.';
    }
    return { error: message, chunks, stopped: signal.aborted, ...(cancellationUnconfirmed ? { cancellationUnconfirmed: true } : {}) };
  }
}
