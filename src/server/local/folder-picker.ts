import { spawn } from 'node:child_process';
import type { ConnectedFolder } from '~/common/personal/folder-tools';
import { validateFolderPath } from './folders';
import { WorkspaceError } from './workspace';

const PICKER_SCRIPT = `tell current application
  activate
  set selectedFolder to choose folder with prompt "Connect a folder to Sector 7"
  return POSIX path of selectedFolder
end tell`;
const OUTPUT_LIMIT = 16 * 1024;
const TIMEOUT_MS = 120000;

type PickerOutput = { stdout: string; stderr: string; exitCode: number | null };
type PickerRunner = (signal: AbortSignal) => Promise<PickerOutput>;
type PickerResult = { folder: ConnectedFolder } | { cancelled: true };

/** The native process receives a fixed script and only the OS environment it needs. */
const runPicker: PickerRunner = signal => new Promise((resolve, reject) => {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', NODE_ENV: process.env.NODE_ENV };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  const child = spawn('/usr/bin/osascript', ['-e', PICKER_SCRIPT], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = []; const stderr: Buffer[] = [];
  let bytes = 0; let failure: Error | undefined;
  const stop = () => { child.kill('SIGKILL'); };
  const collect = (chunks: Buffer[], chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > OUTPUT_LIMIT) {
      failure ??= new WorkspaceError('The folder picker returned too much output. Try again.', 502);
      stop();
    } else chunks.push(chunk);
  };
  child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
  child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
  child.on('error', () => { failure ??= new WorkspaceError('The native folder picker could not start.', 502); });
  // Keep the busy reservation until the child closes after cancellation or timeout.
  child.on('close', exitCode => {
    signal.removeEventListener('abort', stop);
    if (failure) reject(failure);
    else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode });
  });
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
});

/** A single dialog at a time prevents duplicate clicks and competing project requests. */
export function createNativeFolderPicker({ runner = runPicker, platform = process.platform, timeoutMs = TIMEOUT_MS }: {
  runner?: PickerRunner; platform?: NodeJS.Platform; timeoutMs?: number;
} = {}) {
  let pending = false;
  return async (requestSignal?: AbortSignal): Promise<PickerResult> => {
    if (platform !== 'darwin') throw new WorkspaceError('The native folder picker requires Sector 7 running locally on macOS.', 501);
    if (requestSignal?.aborted) return { cancelled: true };
    if (pending) throw new WorkspaceError('A folder picker is already open. Finish or cancel it before opening another.', 409);
    pending = true;
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    requestSignal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      let output: PickerOutput;
      try { output = await runner(controller.signal); }
      catch (error) { if (!controller.signal.aborted) throw error; return cancelled(); }
      if (controller.signal.aborted) return cancelled();
      if (output.exitCode !== 0) {
        if (/\(-128\)\s*$/.test(output.stderr)) return { cancelled: true };
        throw new WorkspaceError('The native folder picker failed. Check macOS permissions and try again.', 502);
      }
      // osascript adds one newline. Do not trim spaces or newlines in directory names.
      if (!output.stdout.endsWith('\n')) throw new WorkspaceError('The native folder picker returned an invalid path.', 502);
      const folder = await validateFolderPath(output.stdout.slice(0, -1));
      if (controller.signal.aborted) return cancelled();
      return { folder };
    } finally {
      clearTimeout(timeout);
      requestSignal?.removeEventListener('abort', cancel);
      pending = false;
    }
    function cancelled(): PickerResult {
      if (timedOut) throw new WorkspaceError('The folder picker timed out. Open it again to choose a folder.', 408);
      return { cancelled: true };
    }
  };
}

export const pickNativeFolder = createNativeFolderPicker();
