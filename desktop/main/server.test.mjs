import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig } from './config.mjs';
import { startBackend, stopBackend } from './server.mjs';

test('desktop launches Sol with its separate gateway and the same server key as Opus', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sector7-sol-backend-'));
  const previousKey = process.env.BIFROST_API_KEY;
  process.env.BIFROST_API_KEY = 'fixture-server-key';
  let backend;
  try {
    // Stand in for the bundled Next server at the process/HTTP boundary.
    await writeFile(join(directory, 'server-entry.cjs'), `
      const { createServer } = require('node:http');
      const server = createServer((request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ ok: true, version: '0.1.0', instance: process.env.SECTOR7_DESKTOP_TOKEN.slice(-12),
          opusHost: process.env.ANTHROPIC_API_HOST, solHost: process.env.OPENAI_API_HOST,
          sharedKey: process.env.OPENAI_API_KEY === 'fixture-server-key' && process.env.ANTHROPIC_API_KEY === 'fixture-server-key' }));
      });
      server.listen(Number(process.env.PORT), '127.0.0.1');
      process.on('SIGTERM', () => server.close(() => process.exit(0)));
    `);
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const config = validateConfig({ port, bifrost: { baseUrl: 'https://opus.example.test/anthropic' } }, {
      BIFROST_OPENAI_BASE_URL: 'https://sol.example.test/openai/',
    });
    backend = await startBackend(config, directory, join(directory, 'logs'));
    const response = await fetch(`${backend.origin}/api/local/health`, { headers: { 'X-Sector7-Token': backend.token } });
    const { opusHost, solHost, sharedKey } = await response.json();
    assert.deepEqual({ opusHost, solHost, sharedKey }, {
      opusHost: 'https://opus.example.test/anthropic', solHost: 'https://sol.example.test/openai', sharedKey: true,
    });
  } finally {
    if (backend) await stopBackend(backend);
    if (previousKey === undefined) delete process.env.BIFROST_API_KEY;
    else process.env.BIFROST_API_KEY = previousKey;
    await rm(directory, { recursive: true, force: true });
  }
});
