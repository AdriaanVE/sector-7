import { backupWorkspace, restoreWorkspace, recoverWorkspace } from '~/server/local/workspace';
import { failure } from '~/server/local/route-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST() { try { return Response.json({ workspace: await recoverWorkspace() }); } catch (error) { return failure(error); } }
