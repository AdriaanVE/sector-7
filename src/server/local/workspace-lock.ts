import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';
import { flockSync } from 'fs-ext';

export class WorkspaceLockBusyError extends Error {
  constructor(directory: string) {
    super(`Workspace at ${directory} is busy with another save, backup or recovery. Wait for it to finish, then retry.`);
  }
}

/**
 * Keep this inode permanently: replacing/unlinking it would let two owners lock different files.
 * Kernel ownership spans route bundles and processes and ends on close or process death, without
 * time-based stale takeover. Only local filesystems supporting flock are supported.
 */
export async function withWorkspaceLock<T>(directory: string, run: () => Promise<T>, timeoutMs = 10_000): Promise<T> {
  await mkdir(directory, { recursive: true });
  const lock = await open(join(directory, '.workspace.lock'), 'a', 0o600);
  const deadline = performance.now() + timeoutMs;
  try {
    for (;;) {
      try { flockSync(lock.fd, 'exnb'); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EAGAIN' && code !== 'EWOULDBLOCK') throw error;
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw new WorkspaceLockBusyError(directory);
        await setTimeout(Math.min(remaining, 25));
      }
    }
    return await run();
  } finally {
    // Closing our own descriptor releases only our ownership, including when run throws.
    await lock.close();
  }
}
