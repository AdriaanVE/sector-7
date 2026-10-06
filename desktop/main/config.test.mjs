import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './config.mjs';

test('Phonon config defaults and environment overrides preserve a separate loopback port', () => {
  assert.deepEqual(validateConfig({}, {}).phonon, { command: 'fermion', port: 8010 });
  assert.deepEqual(validateConfig({ phonon: { command: '/opt/bin/fermion', port: 8011 } }, {}).phonon, { command: '/opt/bin/fermion', port: 8011 });
  assert.deepEqual(validateConfig({ phonon: { command: 'other', port: 8011 } }, { SECTOR7_PHONON_COMMAND: 'fermion-custom', SECTOR7_PHONON_PORT: '8012' }).phonon, { command: 'fermion-custom', port: 8012 });
  for (const phonon of [[], null, 'fermion', { enabled: true }, { command: '' }, { command: ' ' }, { command: 1 }, { port: 0 }, { port: 65536 }, { port: 8010.5 }, { port: 47100 }])
    assert.throws(() => validateConfig({ phonon }, {}));
  assert.throws(() => validateConfig({}, { SECTOR7_DESKTOP_PORT: '8010' }));
});
