import { backupWorkspace, restoreWorkspace, recoverWorkspace } from '~/server/local/workspace';
import { failure } from '~/server/local/route-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { try { return new Response(await backupWorkspace(), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="ai-gui-backup.zip"' } }); } catch (error) { return failure(error); } }
