import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPersonalModel, assertServerAnthropicAccess, assertPersonalHostedTools, PERSONAL_ANTHROPIC_USER_AGENT } from './personal-access';
test('central access rejects client destination and credentials on every API path', () => {
  for (const path of ['messages', 'models', 'skills', 'files']) {
    assert.throws(() => assertServerAnthropicAccess({ anthropicKey: '', anthropicHost: `https://attacker.test/${path}` }, true));
    assert.throws(() => assertServerAnthropicAccess({ anthropicKey: 'client' }, true));
    assert.throws(() => assertServerAnthropicAccess({ anthropicKey: '', clientSideFetch: true }, true));
  }
  assert.doesNotThrow(() => assertServerAnthropicAccess({ anthropicKey: '', anthropicHost: null }, true));
});
test('server enforces the Claude allowlist and adaptive effort', () => {
  const model = { id: 'claude-opus-5-5', reasoningEffort: 'medium', vndAntThinkingBudget: 'adaptive' };
  assert.doesNotThrow(() => assertPersonalModel({ dialect: 'anthropic' }, model));
  assert.throws(() => assertPersonalModel({ dialect: 'openai' }, model));
  assert.throws(() => assertPersonalModel({ dialect: 'anthropic' }, { ...model, id: 'other' }));
  assert.throws(() => assertPersonalModel({ dialect: 'anthropic' }, { ...model, vndAntThinkingBudget: null }));
  assert.throws(() => assertPersonalModel({ dialect: 'anthropic' }, { ...model, vndAntSkills: 'pdf' }));
});


test('native policy rejects browser overrides without configured credentials and unsupported code', () => {
  for (const access of [{ anthropicKey: 'client' }, { anthropicKey: '', anthropicHost: 'https://attacker.test' }, { anthropicKey: '', clientSideFetch: true }]) assert.throws(() => assertServerAnthropicAccess(access, false));
  assert.throws(() => assertPersonalHostedTools({ enableCodeExecution: true }), /unsupported/);
  assert.equal(PERSONAL_ANTHROPIC_USER_AGENT, 'AI-GUI/0.1 (claude-code-compatible)');
});
