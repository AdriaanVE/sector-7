import { failure } from '~/server/local/route-error';
import { NextResponse } from 'next/server';
import { loadWorkspace, commitWorkspace, workspaceRecoveryRevision } from '~/server/local/workspace';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return NextResponse.json(new URL(request.url).searchParams.has('recovery') ? await workspaceRecoveryRevision() : await loadWorkspace()); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const { workspace, expectedRevision, expectedEpoch } = await request.json();
    return NextResponse.json({ workspace: await commitWorkspace(workspace, expectedRevision, undefined, expectedEpoch) });
  } catch (error) { return failure(error); }
}
