import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillSelectionScope } from './skill-selection';
import { skillOriginForModel } from './skills';
import { extractChatCommand } from '../../apps/chat/commands/commands.registry';
import { ActileQuery } from '../../apps/chat/components/composer/actile/ActileQuery';

test('delayed skill selection and references cannot cross chat or selection lifecycles', async () => {
  const scope = new SkillSelectionScope(); scope.setChat('one');
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  const isCurrent = scope.begin('skill'); let applied = false;
  const pending = wait.then(() => { if (isCurrent()) applied = true; });
  scope.setChat('two'); finish(); await pending; assert.equal(applied, false);
  scope.setChat('one'); assert.equal(isCurrent(), false);
  const removed = scope.begin('skill'); scope.remove('skill'); assert.equal(removed(), false);
  const oldReference = scope.begin('skill'); const latestReference = scope.begin('skill');
  assert.equal(oldReference(), false); assert.equal(latestReference(), true);
  scope.clear(); assert.equal(latestReference(), false);
});

test('delayed slash catalog preserves /front and rejects close/reopen stale results', async () => {
  const query = new ActileQuery(); const request = query.begin('/');
  for (const text of ['/f', '/fr', '/fro', '/fron', '/front']) query.update(text);
  await Promise.resolve(); assert.equal(query.isCurrent(request), true);
  query.settle(); assert.deepEqual(['/frontend:codex', '/code', '/frontend:claude'].filter(label => label.startsWith(query.query)), ['/frontend:codex', '/frontend:claude']);
  query.close(); assert.equal(query.isCurrent(request), false);
  const newer = query.begin('/'); query.update('/front');
  assert.equal(query.isCurrent(request), false); assert.equal(query.isCurrent(newer), true);
  query.close(); assert.equal(query.pending, false);
});

test('model changes cancel pending skill loads without changing saved snapshots', () => {
  const scope = new SkillSelectionScope(); scope.setChat('chat'); scope.setModel('claude-opus-5-5');
  const old = scope.begin('skill'); scope.setModel('claude-sonnet-5-5'); assert.equal(old(), false);
  assert.equal(skillOriginForModel('claude-opus-5-5'), 'claude'); assert.equal(skillOriginForModel('gpt-5.5'), 'codex');
  assert.equal(skillOriginForModel('unknown'), undefined);
});
test('unmatched slash remains a literal message and whitespace cancels a delayed catalog', () => {
  assert.deepEqual(extractChatCommand('/fr hello'), [{ type: 'nocmd', value: '/fr hello' }]);
  const query = new ActileQuery(); const pending = query.begin('/'); query.update('/fr'); query.close();
  assert.equal(query.isCurrent(pending), false);
});
