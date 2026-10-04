import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** @param {string} path @param {string[]} [secrets] */
export function logger(path, secrets = []) {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  return (/** @type {string} */ message) => {
    let safe = message;
    for (const secret of secrets) if (secret) safe = safe.split(secret).join('[redacted]');
    try {
      if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > 5 * 1024 * 1024) renameSync(path, `${path}.old`);
      appendFileSync(path, safe, { mode: 0o600 });
    } catch { /* Logging must not prevent shutdown. */ }
  };
}

/** @param {number} port */
export function availablePort(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is in use. Close the other app or change port in Sector 7/config.json. The app will not switch origins automatically.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve(port)));
  });
}

export function shellPath() {
  // Login shells retain the user's development tools when launched from Finder.
  const lookup = spawnSync('/bin/zsh', ['-ilc', 'printf "\\nSECTOR7_PATH=%s\\n" "$PATH"'], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  return lookup.status === 0 ? lookup.stdout.match(/(?:^|\n)SECTOR7_PATH=(.+)/)?.[1] ?? '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    : '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
}

/** @param {ReturnType<import('./config.mjs').validateConfig>} config */
export function gatewayKey(config) {
  if (process.env.BIFROST_API_KEY) return process.env.BIFROST_API_KEY;
  const lookup = spawnSync('/usr/bin/security', ['find-generic-password', '-a', config.bifrost.keychainAccount, '-s', config.bifrost.keychainService, '-w'], { encoding: 'utf8', timeout: 30000, maxBuffer: 65536 });
  if (lookup.status === 0 && lookup.stdout.trim()) return lookup.stdout.trim();
  throw new Error(`Bifrost key unavailable. In Keychain Access, check account "${config.bifrost.keychainAccount}" and service "${config.bifrost.keychainService}". Or launch with BIFROST_API_KEY set. No key is saved in the app.`);
}

function backendExecutable() {
  if (process.platform !== 'darwin' || !process.versions.electron) return process.execPath;
  // The helper's LSUIElement keeps the backend out of the Dock and app switcher.
  const name = `${basename(process.execPath)} Helper`;
  return join(dirname(dirname(process.execPath)), 'Frameworks', `${name}.app`, 'Contents', 'MacOS', name);
}

/** @param {ReturnType<import('./config.mjs').validateConfig>} config @param {string} directory @param {string} logs */
export async function startBackend(config, directory, logs) {
  await availablePort(config.port);
  const key = gatewayKey(config);
  const token = randomBytes(32).toString('base64url');
  const origin = `http://127.0.0.1:${config.port}`;
  /** @type {NodeJS.ProcessEnv} */
  const env = { NODE_ENV: 'production', ELECTRON_RUN_AS_NODE: '1', NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1', PORT: String(config.port), SECTOR7_DESKTOP_TOKEN: token,
    ANTHROPIC_API_KEY: key, ANTHROPIC_API_HOST: config.bifrost.baseUrl, PATH: shellPath(),
    OPENAI_API_KEY: key, OPENAI_API_HOST: config.bifrost.openaiBaseUrl,
    ...(config.dataDir ? { AI_GUI_DATA_DIR: config.dataDir } : {}) };
  for (const name of ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG']) if (process.env[name]) env[name] = process.env[name];
  const log = logger(join(logs, 'server.log'), [key, token]);
  const child = spawn(backendExecutable(), [join(directory, 'server-entry.cjs')], { cwd: directory, env, stdio: ['pipe', 'pipe', 'pipe'] });
  /** @type {Error | undefined} */ let failed;
  child.once('error', () => { failed = new Error('The bundled server could not start. Open the logs for details.'); });
  child.once('exit', code => { failed = new Error(`The bundled server exited (${code ?? 'signal'}). Open the logs for details.`); });
  child.stdout.on('data', bytes => log(String(bytes)));
  child.stderr.on('data', bytes => log(String(bytes)));
  log(`\n[${new Date().toISOString()}] Starting ${origin}\n`);
  const backend = { child, origin, token, log };
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (failed) throw failed;
      try {
        const response = await fetch(`${origin}/api/local/health`, { headers: { 'X-Sector7-Token': token }, signal: AbortSignal.timeout(1000) });
        const health = response.ok ? await response.json() : null;
        if (health?.ok && health.version === '0.1.0' && health.instance === token.slice(-12)) return backend;
      } catch { /* Wait for the owned listener and Next routes to become ready. */ }
      await delay(250);
    }
    throw new Error('The local server did not become ready within 60 seconds. Open the logs for details.');
  } catch (error) { await stopBackend(backend); throw error; }
}

/** @param {{child: import('node:child_process').ChildProcess}} backend */
export async function stopBackend(backend) {
  const { child } = backend;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin?.end();
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1000)]);
  }
}
