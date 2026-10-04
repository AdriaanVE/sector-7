import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalUrl, isAppUrl } from './security.mjs';
import { defaults, validateConfig } from './config.mjs';

test('navigation accepts the exact local origin and filters external schemes', () => {
  assert.equal(isAppUrl('http://127.0.0.1:47100/chat', 'http://127.0.0.1:47100'), true);
  for (const url of ['http://127.0.0.1:47101/', 'http://127.0.0.1.evil:47100/', 'http://user@127.0.0.1:47100/', 'javascript:alert(1)', 'file:///tmp/test']) assert.equal(isAppUrl(url, 'http://127.0.0.1:47100'), false);
  assert.equal(externalUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(externalUrl('mailto:user@example.com'), 'mailto:user@example.com');
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:password@example.com/', 'sector7:run']) assert.equal(externalUrl(url), null);
});

test('config has stable origin, preserves data defaults and rejects credential fields', () => {
  assert.deepEqual(validateConfig(defaults, {}), { ...defaults, dataDir: undefined });
  assert.equal(validateConfig({ dataDir: '/tmp/workspace' }, { SECTOR7_DESKTOP_PORT: '47101' }).port, 47101);
  for (const value of [{ port: 0 }, { port: 'invalid' }, { dataDir: 'relative' }, { bifrost: { apiKey: 'secret' } }, { token: 'secret' }, { bifrost: { baseUrl: 'https://user:secret@host/' } }]) assert.throws(() => validateConfig(value, {}));
});
