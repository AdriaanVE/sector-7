import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_EFFORTS, chatParameters, normalizeChatConfig } from './chat-config';
import { buildInstructions } from './instructions';
import { migrateProjects, estimateContextBudget } from './project-context';
test('all effort stops build curated replacements without stale global parameters', () => {
  for (const effort of CHAT_EFFORTS) {
    const parameters = chatParameters({ ...normalizeChatConfig(), effort });
    assert.equal(parameters.llmVndAntEffort, effort); assert.equal(parameters.llmVndAntThinkingBudget, -1);
    assert.equal(parameters.llmVndAntSkills, undefined); assert.equal(parameters.llmVndAntInfSpeed, undefined);
    assert.equal(parameters.llmVndAntWebSearch, undefined);
  }
});
test('instructions layer in order and remain stable throughout one day', () => {
  const input = { model: 'claude-opus-5-5', personal: 'PERSONAL', project: 'PROJECT', edited: 'EDITED' };
  const early = buildInstructions({ ...input, date: new Date(2026, 9, 3, 1) });
  assert.equal(early, buildInstructions({ ...input, date: new Date(2026, 9, 3, 23) }));
  assert.ok(early.indexOf('PERSONAL') < early.indexOf('PROJECT')); assert.ok(early.indexOf('PROJECT') < early.indexOf('EDITED'));
});
test('legacy project migration picks first display membership without deleting chats', () => {
  const result = migrateProjects([{ id: 'first', title: 'First', conversationIds: ['a'], instructions: '', fileIds: [], revision: 0 }, { id: 'second', title: 'Second', conversationIds: ['a', 'b'], instructions: '', fileIds: [], revision: 0 }]);
  assert.deepEqual(result.folders.map(folder => folder.conversationIds), [['a'], ['b']]); assert.equal(result.removedMemberships, 1);
});
test('estimated context budget reserves output, thinking and safety margin', () => {
  assert.equal(estimateContextBudget(100, 1000, 100, 100).total, 400);
  assert.equal(estimateContextBudget(800, 1000, 100, 100).fits, false);
});

test('invalid imported model settings normalize to Opus medium', () => { assert.deepEqual(normalizeChatConfig(), { llmId: 'claude-opus-5-5', effort: 'medium', tools: { webSearch: false, webFetch: false, codeSandbox: false } }); });


test('personal native web tools select basic versions without dynamic code', () => {
  const parameters = chatParameters({ ...normalizeChatConfig(), tools: { webSearch: true, webFetch: true, codeSandbox: false } });
  assert.equal(parameters.llmVndAntWebSearch, 'auto'); assert.equal(parameters.llmVndAntWebFetch, 'auto'); assert.equal(parameters.llmVndAntWebDynamic, undefined);
});
