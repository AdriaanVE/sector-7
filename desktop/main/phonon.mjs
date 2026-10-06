import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { availablePort, logger, shellPath } from './server.mjs';

export const PHONON_INSTALL = 'pip install fermion-research mlx mlx-audio mlx-lm soundfile scipy zstandard';

/**
 * Own one lazy loopback server. Status never starts a process.
 * @param {{command: string, port: number}} config
 * @param {string} logs
 * @param {{healthTimeoutMs?: number, pollMs?: number}} [options]
 */
export function createPhonon(config, logs, options = {}) {
  /** @type {{child?: import('node:child_process').ChildProcess, cancelled: boolean, missing?: boolean, failure?: Error, url: string} | undefined} */ let run;
  /** @type {Promise<{url: string}> | undefined} */ let starting;
  /** @type {Promise<void> | undefined} */ let stopping;
  /** @type {'idle' | 'starting' | 'running' | 'not-installed'} */ let state = 'idle';
  /** @type {string | undefined} */ let message;

  /** @param {NonNullable<typeof run>} current */
  async function terminate(current) {
    const child = current.child;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const pid = child.pid;
    const exited = new Promise(resolve => child.once('exit', resolve));
    /** @param {NodeJS.Signals} signal */
    const kill = signal => { try { process.kill(-pid, signal); } catch { /* Already exited. */ } };
    kill('SIGTERM');
    const timer = setTimeout(() => kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }

  async function stop() {
    if (stopping) return stopping;
    const current = run;
    if (!current) return;
    current.cancelled = true;
    stopping = (async () => {
      await starting?.catch(() => {});
      await terminate(current);
      if (run === current) { run = undefined; state = 'idle'; message = undefined; }
    })();
    try { await stopping; } finally { stopping = undefined; }
  }

  async function ensure() {
    if (stopping) await stopping;
    if (starting) return starting;
    if (state === 'running' && run) return { url: run.url };
    const key = randomBytes(24).toString('hex');
    /** @type {NonNullable<typeof run>} */
    const current = { cancelled: false, url: `ws://127.0.0.1:${config.port}/v1/audio/stream?api_key=${key}` };
    run = current;
    state = 'starting'; message = undefined;
    starting = (async () => {
      try {
        await availablePort(config.port);
        if (current.cancelled) throw new Error('Phonon startup stopped.');
        /** @type {NodeJS.ProcessEnv} */ const env = { PATH: shellPath() };
        for (const name of ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG']) if (process.env[name]) env[name] = process.env[name];
        const child = spawn(config.command, ['serve', 'phonon-2', '--host', '127.0.0.1', '--port', String(config.port), '--api-key', key],
          { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        current.child = child;
        const log = logger(join(logs, 'phonon.log'), [key]);
        child.stdout.on('data', bytes => log(String(bytes)));
        child.stderr.on('data', bytes => log(String(bytes)));
        child.once('error', error => {
          const missing = /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT';
          current.missing = missing;
          current.failure = new Error(missing ? `Phonon is not installed. ${PHONON_INSTALL}` : 'Phonon could not start. See phonon.log in Help > Open Logs Folder.');
        });
        child.once('exit', () => {
          current.failure ??= new Error('Phonon stopped unexpectedly. Try the mic again to restart it. See phonon.log in Help > Open Logs Folder.');
          if (run === current && !current.cancelled) { state = 'idle'; message = current.failure.message; }
        });
        const deadline = Date.now() + (options.healthTimeoutMs ?? 180000);
        while (Date.now() < deadline) {
          if (current.cancelled) throw new Error('Phonon startup stopped.');
          if (current.failure) throw current.failure;
          try {
            const health = await fetch(`http://127.0.0.1:${config.port}/health`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1000) });
            if (health.ok && !current.cancelled && !current.failure) { state = 'running'; return { url: current.url }; }
          } catch { /* Model download and warm-up can take minutes on the first run. */ }
          await delay(options.pollMs ?? 250);
        }
        throw new Error('Phonon did not become ready within the startup deadline. See phonon.log in Help > Open Logs Folder.');
      } catch (error) {
        await terminate(current);
        if (run === current) {
          run = undefined;
          state = current.missing ? 'not-installed' : 'idle';
          message = error instanceof Error ? error.message : 'Phonon could not start. See phonon.log.';
        }
        throw error;
      }
    })();
    try { return await starting; } finally { starting = undefined; }
  }
  return { ensure, stop, status: () => ({ state, message }) };
}
