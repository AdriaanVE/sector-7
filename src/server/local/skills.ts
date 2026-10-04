import { load, JSON_SCHEMA } from 'js-yaml';
import { readdir, realpath, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import type { SkillSnapshot } from '~/common/personal/skills';
import { WorkspaceError, loadWorkspace } from './workspace';
import { connectedFolderSchema } from '~/common/personal/folder-tools';
import { checkedFolderPath, textHandle } from './folders';

export type { SkillSnapshot } from '~/common/personal/skills';

type SkillRoot = { origin: string; path: string; scope?: 'project'; idPrefix?: string };
const defaultRoots: SkillRoot[] = [{ origin: 'claude', path: join(homedir(), '.claude', 'skills') }, { origin: 'codex', path: join(homedir(), '.codex', 'skills') }];
const MAX_BYTES = 256 * 1024;
const revisionOf = (text: string) => createHash('sha256').update(text).digest('hex');
type Entry = Omit<SkillSnapshot, 'resources'> & { scope: 'user' | 'project'; packagePath: string; description: string; unsupported: string[]; references: string[] };
async function textFile(path: string) { if ((await stat(path)).size > MAX_BYTES) throw new WorkspaceError('Skill resource exceeds 256 KB.', 413); return readFile(path, 'utf8'); }
async function catalog(roots: SkillRoot[] = defaultRoots, deduplicate = true): Promise<Entry[]> {
  const entries: Entry[] = []; const revisions = new Set<string>();
  for (const root of roots) {
    let names: string[];
    try { names = await readdir(root.path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const name of names.sort()) {
      if (name.startsWith('.')) continue;
      try {
        // Existing root/package symlinks are trusted. Resource symlinks cannot leave this resolved package.
        const packagePath = await realpath(join(root.path, name));
        const instructions = await textFile(join(packagePath, 'SKILL.md'));
        const revision = revisionOf(instructions); if (deduplicate && revisions.has(revision)) continue; revisions.add(revision);
        const frontmatter = instructions.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1];
        const metadata: unknown = frontmatter === undefined ? undefined : load(frontmatter, { schema: JSON_SCHEMA });
        const description = metadata && typeof metadata === 'object' && 'description' in metadata && typeof metadata.description === 'string'
          ? metadata.description.trim() || 'Local instruction skill' : 'Local instruction skill';
        const references = [...instructions.matchAll(/(?:\]\(|`)([^\s`<>]+\.(?:md|txt|json|ya?ml))(?:\)|`)/g)].map(match => match[1]).filter(path => !isAbsolute(path) && !path.includes('://'));
        const unsupported = /\b(?:shell|bash|MCP|connectors?|delegat\w*|subagents?|imagegen|image generation)\b/i.test(instructions) ? ['Skill instructions do not grant shell, MCP, connectors, image generation or delegation.'] : [];
        entries.push({ id: revisionOf(`${root.idPrefix ?? root.origin}/${name}`), scope: root.scope ?? 'user', origin: root.origin, name, revision, instructions, packagePath, description, unsupported, references: [...new Set(references)] });
      } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
    }
  }
  return entries;
}
export async function skillCatalog(roots: SkillRoot[] = defaultRoots, origin?: string) {
  if (origin !== undefined && origin !== 'claude' && origin !== 'codex') throw new WorkspaceError('Invalid skill origin.', 400);
  return (await catalog(origin ? roots.filter(root => root.origin === origin) : roots)).map(({ id, origin, name, revision, description, unsupported, references, scope }) => ({ id, origin, name, revision, description, unsupported, references, scope })); }
export async function skillSnapshot(id: string, resources: string[] = [], roots = defaultRoots): Promise<SkillSnapshot> {
  const entry = (await catalog(roots, false)).find(entry => entry.id === id);
  if (!entry) throw new WorkspaceError('Skill no longer exists. Select it again.', 404);
  if (resources.length > 8) throw new WorkspaceError('Select at most eight skill references.', 400);
  const loaded = [];
  for (const path of resources) {
    if (!entry.references.includes(path)) throw new WorkspaceError('Resource is not an explicit skill reference.', 400);
    const resolved = await realpath(join(entry.packagePath, path)); const within = relative(entry.packagePath, resolved);
    if (within.startsWith('..') || isAbsolute(within)) throw new WorkspaceError('Skill resource leaves its package.', 400);
    const content = await textFile(resolved); loaded.push({ path, revision: revisionOf(content), content });
  }
  return { id: entry.id, origin: entry.origin, name: entry.name, revision: entry.revision, instructions: entry.instructions, resources: loaded };
}

/** Project roots come from saved membership and opt-ins, never from a client-supplied path. */
export async function projectSkillContext(conversationId?: string, origin?: string) {
  const roots: SkillRoot[] = [...defaultRoots]; const instructions: string[] = [];
  if (!conversationId) return { roots, instructions };
  const { workspace } = await loadWorkspace();
  const projects = workspace?.stores['app-folders']?.state.folders;
  if (!Array.isArray(projects)) return { roots, instructions };
  for (const project of projects) {
    if (!project || typeof project !== 'object' || !('id' in project) || !('conversationIds' in project) || !Array.isArray(project.conversationIds) || !project.conversationIds.includes(conversationId) || !('connectedFolders' in project) || !Array.isArray(project.connectedFolders)) continue;
    for (const value of project.connectedFolders) {
      const folder = connectedFolderSchema.parse(value);
      for (const agent of ['codex', 'claude'] as const) {
        if (!folder.agentFolders?.[agent] || (origin && origin !== agent)) continue;
        const subdir = `.${agent}`;
        try {
          const path = await checkedFolderPath(folder, subdir);
          roots.push({ origin: agent, path: join(path, 'skills'), scope: 'project', idPrefix: `project/${project.id}/${folder.id}/${agent}` });
          const instructionPath = `${subdir}/${agent === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'}`;
          try {
            if ((await stat(await checkedFolderPath(folder, instructionPath))).size > MAX_BYTES) throw new WorkspaceError('Project instructions exceed 256 KB.', 413);
            const file = await textHandle(folder, instructionPath);
            try { instructions.push(file.text); } finally { await file.handle.close(); }
          } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
        } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
      }
    }
  }
  return { roots, instructions };
}
