import { readBoundedJSON } from '~/server/local/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeFolderInvocation } from '~/server/local/folders';
import { localCommandManager } from '~/server/local/commands';
import { failure } from '~/server/local/route-error';
import { localAccessError } from '~/common/personal/local-access';
import { WorkspaceError } from '~/server/local/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const identity = { projectId: z.string().min(1), conversationId: z.string().min(1), folderId: z.string().min(1), invocationId: z.string().min(1).max(128) };
const requestSchema = z.discriminatedUnion('action', [
  z.object({ ...identity, action: z.literal('start'), command: z.string().min(1).max(32 * 1024), timeoutMs: z.number().int().min(1).max(300_000).optional() }),
  z.object({ ...identity, action: z.literal('poll'), jobId: z.string(), cursor: z.number().int().nonnegative().optional() }),
  z.object({ ...identity, action: z.literal('cancel'), jobId: z.string() }),
]);

export async function POST(request: Request) {
  try {
    const accessError = localAccessError(request.url, request.headers, request.method);
    if (accessError) throw new WorkspaceError(accessError, 403);
    const value = requestSchema.parse(await readBoundedJSON(request));
    const scope = JSON.stringify([value.projectId, value.conversationId, value.folderId]);
    const manager = localCommandManager();
    if (value.action === 'start') {
      const { folder, args, responded } = await authorizeFolderInvocation(value.projectId, value.conversationId, value.folderId, value.invocationId, 'local_command');
      if (responded) throw new WorkspaceError('This command invocation already has a saved response.', 409);
      if (args.command !== value.command || (args.timeout_ms ?? 60_000) !== (value.timeoutMs ?? 60_000))
        throw new WorkspaceError('Command arguments do not match the saved invocation.', 409);
      const job = await manager.start({ scope, invocationId: value.invocationId, root: folder.path, command: value.command, timeoutMs: value.timeoutMs });
      const cancel = () => { void manager.cancel(scope, value.invocationId, job.jobId).catch(() => undefined); };
      if (request.signal.aborted) cancel();
      else request.signal.addEventListener('abort', cancel, { once: true });
      return NextResponse.json(job);
    }
    return NextResponse.json(value.action === 'poll'
      ? await manager.poll(scope, value.invocationId, value.jobId, value.cursor)
      : await manager.cancel(scope, value.invocationId, value.jobId));
  } catch (error) { return failure(error); }
}
