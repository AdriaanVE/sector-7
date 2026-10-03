import { readBoundedBody } from '~/server/local/request-body';
import { WORKSPACE_BYTE_LIMIT } from '~/server/local/workspace-archive';
import { readAsset, writeAsset } from '~/server/local/workspace';
import { failure } from '~/server/local/route-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return new Response(await readAsset((await params).id), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await writeAsset((await params).id, await readBoundedBody(request, WORKSPACE_BYTE_LIMIT, 'Asset')); return Response.json({ saved: true }); }
  catch (error) { return failure(error); }
}
