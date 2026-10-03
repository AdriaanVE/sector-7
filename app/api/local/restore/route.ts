import { WORKSPACE_BYTE_LIMIT } from '~/server/local/workspace-archive';
import { readBoundedBody } from '~/server/local/request-body';
import { restoreWorkspace } from '~/server/local/workspace';
import { failure } from '~/server/local/route-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { try { const expectedRevision = request.headers.get('x-workspace-revision') === 'corrupt' ? null : Number(request.headers.get('x-workspace-revision')); return Response.json({ workspace: await restoreWorkspace(await readBoundedBody(request, WORKSPACE_BYTE_LIMIT, 'Backup'), expectedRevision, undefined, request.headers.get('x-workspace-epoch') ?? undefined) }); } catch (error) { return failure(error); } }
