import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory, WorkspaceError } from './workspace';

/** Never repeat an ambiguous mutation after restart or a failed conversation save. */
export async function withFolderReceipt(scope: string, invocationId: string, input: unknown, run: () => Promise<Record<string, unknown>>, directory = dataDirectory()) {
  const key = createHash('sha256').update(`${scope}:${invocationId}`).digest('hex');
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const folder = join(directory, 'folder-operations'); await mkdir(folder, { recursive: true });
  const path = join(folder, `${key}.json`);
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let saved;
    try { saved = JSON.parse(await readFile(path, 'utf8')); } catch { throw new WorkspaceError('Earlier operation receipt is incomplete. Inspect the file and recovery copies; this invocation will not be repeated.', 409); }
    if (saved.inputHash !== inputHash) throw new WorkspaceError('Invocation was replayed with different arguments.', 409);
    if (saved.result) return saved.result as Record<string, unknown>;
    throw new WorkspaceError('Earlier operation was interrupted or is still running. Inspect the file and its recovery copies before issuing a new operation.', 409);
  }
  try {
    await file.writeFile(JSON.stringify({ inputHash, status: 'started' })); await file.sync();
    const dir = await open(folder, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    let result: Record<string, unknown>;
    try { result = await run(); } catch (error) { result = { error: error instanceof Error ? error.message : 'Folder operation failed.', outcome: 'unconfirmed', next_step: 'Read the current file and recovery copies before issuing another mutation.' }; }
    const bytes = Buffer.from(JSON.stringify({ inputHash, status: 'completed', result }));
    await file.write(bytes, 0, bytes.length, 0); await file.truncate(bytes.length); await file.sync();
    return result;
  } finally { await file.close(); }
}
