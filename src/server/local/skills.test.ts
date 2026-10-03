import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skillCatalog, skillSnapshot } from './skills';
import { skillInstructionFragments, skillSnapshotSchema } from '~/common/personal/skills';
import { createDMessageTextContent, duplicateDMessage } from '~/common/stores/chat/chat.message';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { emptyWorkspace } from '~/common/personal/workspace-schema';
import { commitWorkspace, loadWorkspace } from './workspace';

test('read-only skill catalog resolves trusted package symlinks, deduplicates and confines references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-gui-skills-'));
  for (const name of ['claude', 'codex', 'shared']) await mkdir(join(dir, name));
  await writeFile(join(dir, 'shared', 'SKILL.md'), '---\nname: example\ndescription: Example skill\n---\nRead [reference](reference.md). Shell and MCP unavailable.');
  await writeFile(join(dir, 'shared', 'reference.md'), 'Original supporting content');
  await symlink(join(dir, 'shared'), join(dir, 'claude', 'example'));
  await symlink(join(dir, 'shared'), join(dir, 'codex', 'same'));
  await mkdir(join(dir, 'codex', 'example')); await writeFile(join(dir, 'codex', 'example', 'SKILL.md'), 'Conflicting skill content');
  const roots = [{ origin: 'claude', path: join(dir, 'claude') }, { origin: 'codex', path: join(dir, 'codex') }];
  const catalog = await skillCatalog(roots);
  assert.equal(catalog.length, 2); assert.equal(catalog[0].name, catalog[1].name); assert.notEqual(catalog[0].origin, catalog[1].origin);
  assert.ok(catalog[0].unsupported.length);
  assert.ok((await skillCatalog(roots, 'claude')).every(skill => skill.origin === 'claude'));
  const codex = await skillCatalog(roots, 'codex'); assert.equal(codex.length, 2); assert.ok(codex.every(skill => skill.origin === 'codex'));
  assert.equal((await skillSnapshot(codex.find(skill => skill.name === 'same')!.id, [], roots)).origin, 'codex');
  await assert.rejects(skillCatalog(roots, 'invalid'), /Invalid skill origin/);
  const snapshot = skillSnapshotSchema.parse(await skillSnapshot(catalog[0].id, ['reference.md'], roots));
  assert.equal(snapshot.resources[0].content, 'Original supporting content');
  await assert.rejects(skillSnapshot(catalog[0].id, ['../outside.md'], roots), /explicit/);
  await assert.rejects(skillSnapshot('../../outside', [], roots), /no longer/);
  await writeFile(join(dir, 'outside.md'), 'External'); await symlink(join(dir, 'outside.md'), join(dir, 'shared', 'escape.md'));
  await writeFile(join(dir, 'shared', 'SKILL.md'), '[escape](escape.md)');
  await assert.rejects(skillSnapshot(catalog[0].id, ['escape.md'], roots), /leaves/);
  assert.notEqual((await skillSnapshot(catalog[0].id, [], roots)).revision, snapshot.revision);
  assert.ok(skillInstructionFragments([snapshot])[0].includes('Original supporting content'));
  assert.ok(!skillInstructionFragments([snapshot])[0].includes('[escape]'));
  const message = createDMessageTextContent('user', 'Task'); message.metadata = { selectedSkills: [snapshot] };
  assert.deepEqual(duplicateDMessage(message, false).metadata?.selectedSkills, [snapshot]);
  const workspace = emptyWorkspace(); const { _abortController, ...chat } = createDConversation(); chat.messages = [message];
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
  const savedDir = await mkdtemp(join(tmpdir(), 'ai-gui-skill-history-')); await commitWorkspace(workspace, 0, savedDir);
  const saved = (await loadWorkspace(savedDir)).workspace!;
  assert.deepEqual((saved.stores['app-chats']!.state.conversations as typeof chat[])[0].messages[0].metadata?.selectedSkills, [snapshot]);
});

test('skill catalog flags delegation and plural unsupported capabilities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-gui-skill-capabilities-'));
  for (const requirement of ['Delegate the work.', 'Requires delegation.', 'Use connectors.', 'Run subagents.']) {
    const packagePath = join(dir, String(requirement.length));
    await mkdir(packagePath, { recursive: true });
    await writeFile(join(packagePath, 'SKILL.md'), requirement);
    const entries = await skillCatalog([{ origin: 'test', path: dir }]);
    assert.ok(entries.find(entry => entry.revision && entry.name === String(requirement.length))?.unsupported.length, requirement);
  }
});

test('skill descriptions parse bounded YAML frontmatter, including multiline and quoted scalars', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-gui-skill-yaml-'));
  const cases = [
    ['folded', 'description: >\n  First line\n  second: line\n', 'First line second: line'],
    ['literal', 'description: |-\n  First line\n  second line\n', 'First line\nsecond line'],
    ['chomp', 'description: >+\n  First\n  second\n\n', 'First second'],
    ['double', 'description: "Quoted: value"\n', 'Quoted: value'],
    ['single', "description: 'It''s a skill'\n", "It's a skill"],
    ['body-only', '', 'Local instruction skill'],
  ];
  for (const [name, yaml, expected] of cases) {
    const path = join(dir, name); await mkdir(path);
    await writeFile(join(path, 'SKILL.md'), (yaml ? `---\n${yaml}---\n` : '') + 'description: Body text must not become metadata.');
    assert.equal((await skillCatalog([{ origin: 'test', path: dir }])).find(entry => entry.name === name)?.description, expected);
  }
  await writeFile(join(dir, 'folded', 'SKILL.md'), '---\ndescription: [unterminated\n---\nBody');
  await assert.rejects(skillCatalog([{ origin: 'test', path: dir }]), /unexpected end/);
});
