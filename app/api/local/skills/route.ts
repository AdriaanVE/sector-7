import { skillCatalog, skillSnapshot } from '~/server/local/skills';
import { failure } from '~/server/local/route-error';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { return Response.json({ skills: await skillCatalog(undefined, new URL(request.url).searchParams.get('origin') ?? 'claude') }, { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { const { id, resources = [] } = await request.json(); if (typeof id !== 'string' || !Array.isArray(resources) || resources.some(path => typeof path !== 'string')) throw new Error('Invalid skill selection.'); return Response.json({ skill: await skillSnapshot(id, resources) }); } catch (error) { return failure(error); } }
