import { readBoundedJSON } from '~/server/local/request-body';
import { skillCatalog, skillSnapshot, projectSkillContext } from '~/server/local/skills';
import { failure } from '~/server/local/route-error';
import { safeId } from '~/common/personal/workspace-schema';
import { localAccessError } from '~/common/personal/local-access';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const denied = localAccessError(request.url, request.headers, request.method);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  try {
    const query = new URL(request.url).searchParams;
    const origin = query.get('origin') ?? 'claude';
    const conversationId = safeId.optional().parse(query.get('conversationId') ?? undefined);
    const { roots, instructions } = await projectSkillContext(conversationId, origin);
    return Response.json({ skills: await skillCatalog(roots, origin), instructions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const denied = localAccessError(request.url, request.headers, request.method);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  try {
    const { id, resources = [], conversationId } = await readBoundedJSON(request);
    if (typeof id !== 'string' || !Array.isArray(resources) || resources.some(path => typeof path !== 'string')) throw new Error('Invalid skill selection.');
    const { roots } = await projectSkillContext(safeId.optional().parse(conversationId));
    return Response.json({ skill: await skillSnapshot(id, resources, roots) });
  } catch (error) { return failure(error); }
}
