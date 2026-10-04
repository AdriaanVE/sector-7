import { readBoundedJSON } from '~/server/local/request-body';
import { NextResponse } from 'next/server';
import { failure } from '~/server/local/route-error';
import { authorizeFolderInvocation, executeFolderTool, validateFolderPath, inspectAgentFolders } from '~/server/local/folders';
import { folderToolInput } from '~/common/personal/folder-tools';
import { withFolderReceipt } from '~/server/local/folder-receipts';
import { safeId } from '~/common/personal/workspace-schema';
import { localAccessError } from '~/common/personal/local-access';
import { pickNativeFolder } from '~/server/local/folder-picker';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const denied = localAccessError(request.url, request.headers, request.method);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });
  try {
    const value = await readBoundedJSON(request);
    if (value.action === 'pick') return NextResponse.json(await pickNativeFolder(request.signal));
    if (value.action === 'connect' || value.action === 'inspect') {
      if (typeof value.path !== 'string') return NextResponse.json({ error: 'Choose an absolute folder path.' }, { status: 400 });
      return NextResponse.json(value.action === 'inspect' ? await inspectAgentFolders(value.path) : { folder: await validateFolderPath(value.path) });
    }
    const input = folderToolInput.parse(value.input);
    const projectId = safeId.optional().parse(value.projectId); const conversationId = safeId.parse(value.conversationId); const invocationId = safeId.parse(value.invocationId);
    const { folder, args, responded } = await authorizeFolderInvocation(projectId, conversationId, input.folder_id, invocationId, input.name);
    if (responded) throw new Error('This invocation already has a saved result.');
    if (JSON.stringify(folderToolInput.parse({ ...args, name: input.name })) !== JSON.stringify(input)) throw new Error('Saved invocation arguments do not match.');
    return NextResponse.json(await withFolderReceipt(`${projectId ?? ''}:${conversationId}:${folder.id}`, invocationId, input, () => executeFolderTool(folder, input, request.signal)));
  } catch (error) { return failure(error); }
}
