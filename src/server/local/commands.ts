import { spawn, ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import { dataDirectory, WorkspaceError } from './workspace';

export const commandRequestSchema = z.object({
  scope: z.string().min(1).max(512), invocationId: z.string().min(1).max(128),
  root: z.string().min(1).refine(isAbsolute, 'Command root must be absolute.'),
  command: z.string().min(1).max(32 * 1024).refine(value => !value.includes('\0'), 'Command contains a null byte.'),
  timeoutMs: z.number().int().min(1).max(300_000).default(60_000),
});
export type CommandRequest = z.input<typeof commandRequestSchema>;
const chunkSchema = z.object({ stream: z.enum(['stdout', 'stderr']), text: z.string() });
const receiptSchema = z.object({
  jobId: z.string(), invocationId: z.string(), fingerprint: z.string(), scope: z.string(),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled', 'timed_out', 'output_limit', 'interrupted']),
  chunks: z.array(chunkSchema), exitCode: z.number().nullable(), signal: z.string().nullable(),
  startedAt: z.number(), finishedAt: z.number().nullable(), truncated: z.boolean(), outputExpired: z.boolean().default(false),
});
type Receipt = z.infer<typeof receiptSchema>;
export type CommandResult = Omit<Receipt, 'scope' | 'fingerprint'> & { cursor: number };
type Job = { receipt: Receipt; child?: ChildProcess; deadline?: NodeJS.Timeout; escalation?: NodeJS.Timeout; bytes: number; saved?: Promise<void>; stopStatus?: 'cancelled' | 'timed_out' | 'output_limit' };
const OUTPUT_LIMIT = 256 * 1024;
const MAX_RECEIPTS = 128;
const MAX_CHUNKS = 4096;
const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Commands run with the local app's permissions. The working directory is not a sandbox. */
export class LocalCommandManager {
  private jobs = new Map<string, Job>();
  private operation: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}

  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.operation.then(run, run);
    this.operation = result.catch(() => undefined);
    return result;
  }

  private path(jobId: string) { return join(this.directory, `${jobId}.json`); }
  private async persist(receipt: Receipt) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.path(receipt.jobId)}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(receipt)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, this.path(receipt.jobId));
    const directory = await open(this.directory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }

  private async load(jobId: string): Promise<Job | undefined> {
    const live = this.jobs.get(jobId);
    if (live) return live;
    if (!/^[a-f0-9]{64}$/.test(jobId)) throw new WorkspaceError('Invalid command job.', 400);
    let receipt: Receipt;
    try { receipt = receiptSchema.parse(JSON.parse(await readFile(this.path(jobId), 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new WorkspaceError('Command receipt is unreadable; this invocation will not be replayed.', 422);
    }
    if (receipt.jobId !== jobId) throw new WorkspaceError('Command receipt identity is invalid.', 422);
    if (receipt.status === 'running') {
      receipt.status = 'interrupted'; receipt.finishedAt = Date.now();
      await this.persist(receipt);
    }
    const job = { receipt, bytes: receipt.chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.text), 0) };
    if (!receipt.outputExpired) this.jobs.set(jobId, job);
    return job;
  }

  private async prune() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const retained: Receipt[] = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const id = name.slice(0, -5);
      const live = this.jobs.get(id);
      if (live?.saved) await live.saved;
      const receipt = live?.receipt ?? receiptSchema.parse(JSON.parse(await readFile(this.path(id), 'utf8')));
      if (receipt.status !== 'running' && !receipt.outputExpired) retained.push(receipt);
    }
    retained.sort((a, b) => b.startedAt - a.startedAt);
    for (const [index, receipt] of retained.entries()) {
      if (index < MAX_RECEIPTS - 1 && receipt.startedAt >= Date.now() - RETENTION_MS) continue;
      // Keep the identity and outcome indefinitely. Dropping them would replay side effects.
      receipt.chunks = []; receipt.outputExpired = true;
      await this.persist(receipt); this.jobs.delete(receipt.jobId);
    }
    // Only active jobs and recent output need to remain in memory.
    for (const [id, job] of this.jobs) if (job.receipt.status !== 'running' && job.receipt.outputExpired) this.jobs.delete(id);
  }

  async start(value: CommandRequest): Promise<CommandResult> {
    const request = commandRequestSchema.parse(value);
    return this.exclusive(async () => {
      const jobId = createHash('sha256').update(JSON.stringify([request.scope, request.invocationId])).digest('hex');
      const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const existing = await this.load(jobId);
      if (existing) {
        if (existing.receipt.fingerprint !== fingerprint) throw new WorkspaceError('This command invocation already has different arguments.', 409);
        return this.result(existing, 0);
      }
      if ([...this.jobs.values()].filter(job => job.receipt.status === 'running').length >= 2)
        throw new WorkspaceError('Two local commands are already running.', 429);
      await this.prune();
      const receipt: Receipt = { jobId, invocationId: request.invocationId, scope: request.scope, fingerprint,
        status: 'running', chunks: [], exitCode: null, signal: null, startedAt: Date.now(), finishedAt: null, truncated: false, outputExpired: false };
      // Reserve on disk before spawning, so a restart cannot repeat a command with side effects.
      await this.persist(receipt);
      const job: Job = { receipt, bytes: 0 }; this.jobs.set(jobId, job);
      try {
        const child = spawn('/bin/zsh', ['-c', request.command], { cwd: request.root, env: commandEnvironment(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        job.child = child;
        const stdout = new StringDecoder('utf8'); const stderr = new StringDecoder('utf8');
        child.stdout!.on('data', (bytes: Buffer) => this.append(job, 'stdout', stdout.write(bytes)));
        child.stderr!.on('data', (bytes: Buffer) => this.append(job, 'stderr', stderr.write(bytes)));
        child.on('error', error => { this.append(job, 'stderr', error.message); this.finish(job, null, null); });
        child.on('close', (code, signal) => {
          this.append(job, 'stdout', stdout.end()); this.append(job, 'stderr', stderr.end());
          this.finish(job, code, signal);
        });
        job.deadline = setTimeout(() => this.stop(job, 'timed_out'), request.timeoutMs);
      } catch (error) {
        this.append(job, 'stderr', error instanceof Error ? error.message : 'Command could not start.');
        this.finish(job, null, null);
      }
      return this.result(job, 0);
    });
  }

  private append(job: Job, stream: 'stdout' | 'stderr', text: string) {
    if (!text || job.receipt.truncated || job.receipt.finishedAt !== null) return;
    const bytes = Buffer.from(text); const remaining = OUTPUT_LIMIT - job.bytes;
    if (bytes.length <= remaining && job.receipt.chunks.length < MAX_CHUNKS) {
      job.receipt.chunks.push({ stream, text }); job.bytes += bytes.length;
    } else {
      // StringDecoder drops an incomplete final codepoint instead of producing invalid UTF-8.
      const decoder = new StringDecoder('utf8'); const bounded = decoder.write(bytes.subarray(0, remaining));
      if (bounded) job.receipt.chunks.push({ stream, text: bounded });
      job.bytes = OUTPUT_LIMIT; job.receipt.truncated = true; this.stop(job, 'output_limit');
    }
  }

  private signal(job: Job, signal: NodeJS.Signals) {
    if (!job.child?.pid) return;
    try { process.kill(-job.child.pid, signal); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') job.child.kill(signal);
    }
  }

  private stop(job: Job, status: 'cancelled' | 'timed_out' | 'output_limit') {
    if (job.receipt.finishedAt !== null || job.escalation) return;
    job.stopStatus = status; this.signal(job, 'SIGTERM');
    job.escalation = setTimeout(() => {
      this.signal(job, 'SIGKILL');
      // Descendants can retain inherited pipes. Always bound the job's lifetime.
      job.child?.stdout?.destroy(); job.child?.stderr?.destroy();
      this.finish(job, null, 'SIGKILL');
    }, 500);
  }

  private finish(job: Job, exitCode: number | null, signal: string | null) {
    if (job.receipt.finishedAt !== null) return;
    if (job.deadline) clearTimeout(job.deadline);
    // Kill the remaining process group even if the shell already exited.
    this.signal(job, 'SIGKILL');
    if (job.escalation) clearTimeout(job.escalation);
    job.receipt.status = job.stopStatus ?? (exitCode === 0 ? 'succeeded' : 'failed');
    job.receipt.exitCode = exitCode; job.receipt.signal = signal; job.receipt.finishedAt = Date.now();
    job.saved = this.persist(job.receipt);
    void job.saved.catch(() => { /* Reserved receipt prevents replay after a failed final write. */ });
  }

  private result(job: Job, cursor: number): CommandResult {
    const { scope: _scope, fingerprint: _fingerprint, ...receipt } = job.receipt;
    return { ...receipt, chunks: receipt.chunks.slice(cursor), cursor: receipt.chunks.length };
  }

  private async authorized(scope: string, invocationId: string, jobId: string) {
    const job = await this.load(jobId);
    if (!job || job.receipt.scope !== scope || job.receipt.invocationId !== invocationId)
      throw new WorkspaceError('Command job is not part of this invocation.', 404);
    return job;
  }

  async poll(scope: string, invocationId: string, jobId: string, cursor = 0) {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new WorkspaceError('Invalid command output cursor.', 400);
    const job = await this.authorized(scope, invocationId, jobId);
    if (job.saved) await job.saved;
    if (cursor > job.receipt.chunks.length) throw new WorkspaceError('Command output cursor is ahead of the job.', 400);
    return this.result(job, cursor);
  }

  shutdown() {
    for (const job of this.jobs.values()) if (job.receipt.status === 'running') this.signal(job, 'SIGKILL');
  }

  async cancel(scope: string, invocationId: string, jobId: string) {
    const job = await this.authorized(scope, invocationId, jobId);
    this.stop(job, 'cancelled'); return this.result(job, 0);
  }
}

function commandEnvironment() {
  const env = { ...process.env };
  // Server-injected inference credentials belong to the app, not command subprocesses.
  for (const key of ['BIFROST_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY']) delete env[key];
  return env;
}

const globals = globalThis as typeof globalThis & { sector7CommandManager?: LocalCommandManager };
export function localCommandManager() {
  if (!globals.sector7CommandManager) {
    const manager = new LocalCommandManager(join(dataDirectory(), 'commands'));
    process.once('exit', () => manager.shutdown());
    globals.sector7CommandManager = manager;
  }
  return globals.sector7CommandManager;
}
