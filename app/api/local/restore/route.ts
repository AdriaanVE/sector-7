import { restoreWorkspace } from '~/server/local/workspace';
import { failure } from '~/server/local/route-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { try { const expectedRevision = request.headers.get('x-workspace-revision') === 'corrupt' ? null : Number(request.headers.get('x-workspace-revision')); return Response.json({ workspace: await restoreWorkspace(new Uint8Array(await request.arrayBuffer()), expectedRevision, undefined, request.headers.get('x-workspace-epoch') ?? undefined) }); } catch (error) { return failure(error); } }
