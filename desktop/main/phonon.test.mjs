import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createPhonon } from './phonon.mjs';

async function fixture(t, mode = 'ready') {
  const dir = await mkdtemp(join(tmpdir(), 'phonon-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  const command = join(dir, 'fermion');
  await writeFile(command, `#!${process.execPath}
const fs = require('node:fs');
const http = require('node:http');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(join(dir, 'args.json'))}, JSON.stringify(args));
console.log(args[args.indexOf('--api-key') + 1]);
${mode === 'ready' ? "http.createServer((req,res) => { res.writeHead(200, {'Content-Type':'application/json'}); res.end('{}'); if (req.url === '/exit') setTimeout(() => process.exit(0), 10); }).listen(Number(args[args.indexOf('--port') + 1]), '127.0.0.1');" : 'setInterval(() => {}, 1000);'}
`);
  await chmod(command, 0o700);
  const phonon = createPhonon({ command, port }, dir, { healthTimeoutMs: mode === 'ready' ? 10000 : 1200, pollMs: 20 });
  t.after(() => phonon.stop());
  return { phonon, dir, port };
}

test('Phonon stays idle until ensure, shares startup and redacts the launch key', async t => {
  const { phonon, dir, port } = await fixture(t);
  assert.equal(phonon.status().state, 'idle');
  const [first, second] = await Promise.all([phonon.ensure(), phonon.ensure()]);
  assert.equal(first.url, second.url);
  assert.match(first.url, new RegExp(`^ws://127.0.0.1:${port}/v1/audio/stream\\?api_key=`));
  const args = JSON.parse(await readFile(join(dir, 'args.json'), 'utf8'));
  assert.deepEqual(args.slice(0, 6), ['serve', 'phonon-2', '--host', '127.0.0.1', '--port', String(port)]);
  const key = new URL(first.url).searchParams.get('api_key');
  assert.equal(args[7], key);
  assert.equal(phonon.status().state, 'running');
  await phonon.stop();
  assert.equal(phonon.status().state, 'idle');
  const log = await readFile(join(dir, 'phonon.log'), 'utf8');
  assert.ok(!log.includes(key));
  assert.ok(log.includes('[redacted]'));
});

test('missing command returns installation guidance and can be tried again', async t => {
  const { dir, port } = await fixture(t);
  const phonon = createPhonon({ command: join(dir, 'missing'), port }, dir, { healthTimeoutMs: 1000, pollMs: 10 });
  await assert.rejects(phonon.ensure(), /pip install fermion-research/);
  assert.equal(phonon.status().state, 'not-installed');
  await assert.rejects(phonon.ensure(), /pip install fermion-research/);
});

test('health timeout and stop during startup terminate the owned process', async t => {
  const { phonon } = await fixture(t, 'unready');
  await assert.rejects(phonon.ensure(), /phonon.log/);
  assert.equal(phonon.status().state, 'idle');
  const starting = phonon.ensure();
  await phonon.stop();
  await assert.rejects(starting, /stopped/);
  assert.equal(phonon.status().state, 'idle');
});

test('an exited Phonon server restarts on the next ensure with a fresh launch key', async t => {
  const { phonon, port, dir } = await fixture(t);
  const first = await phonon.ensure();
  const args = JSON.parse(await readFile(join(dir, 'args.json'), 'utf8'));
  assert.equal(args[5], String(port));
  // Ask the stub to exit through its public HTTP control, rather than inspecting the manager.
  await fetch(`http://127.0.0.1:${port}/exit`);
  for (let attempt = 0; attempt < 100 && phonon.status().state === 'running'; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(phonon.status().state, 'idle');
  assert.match(phonon.status().message, /unexpectedly/);
  const second = await phonon.ensure();
  assert.notEqual(second.url, first.url);
  assert.equal(phonon.status().state, 'running');
});
