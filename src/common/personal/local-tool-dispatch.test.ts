import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalCommandManager } from '~/server/local/commands';
import { currentWorkspace, diskStorage, installWorkspace, pauseDiskWrites } from './disk-storage';
import { dispatchLocalTool } from './local-tool-dispatch';
import { emptyWorkspace } from './workspace-schema';

const identity = { projectId: 'project', conversationId: 'chat', folderId: 'folder', invocationId: 'invocation' };
const call = { id: identity.invocationId, name: 'local_command', args: JSON.stringify({ folder_id: identity.folderId, command: 'printf output', timeout_ms: 1000 }) };
const chunk = (stream: 'stdout' | 'stderr', text: string) => ({ stream, text });
const response = (status: string, chunks = [chunk('stdout', 'first')], cursor = chunks.length) => Response.json({ jobId: 'job', status, chunks, cursor });
const body = (init?: RequestInit) => JSON.parse(String(init?.body));
const cancellationWarning = ' Command cancellation could not be confirmed. Check the connected folder before retrying.';

function cancellationSignal(init?: RequestInit, interrupted?: AbortSignal) {
  assert.ok(init?.signal instanceof AbortSignal);
  assert.equal(init.signal.aborted, false);
  assert.notEqual(init.signal, interrupted);
  return init.signal;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => resolve = done);
  return { promise, resolve };
}

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  globalThis.fetch = fetcher;
  try { await run(); }
  finally { installWorkspace(emptyWorkspace()); pauseDiskWrites(true); globalThis.fetch = original; }
}

function dirtyInstructions() {
  diskStorage().setItem('app-personal-settings', { version: 1, state: { instructions: 'Saved before tool execution' } });
}

function dispatch(signal = new AbortController().signal, onOutput?: (text: string) => void) {
  return dispatchLocalTool(call, identity.projectId, identity.conversationId, signal, onOutput);
}

test('dispatch waits for a durable save and accumulates labelled output across cursored polls', async () => {
  const saving = deferred<void>(); const saved = deferred<Response>();
  const requests: unknown[] = []; const output: string[] = [];
  await withFetch(async (url, init) => {
    const request = body(init); requests.push({ path: String(url), body: request });
    if (String(url) === '/api/local/workspace') {
      assert.equal(init?.method, 'PUT');
      assert.equal(request.workspace.stores['app-personal-settings'].state.instructions, 'Saved before tool execution');
      saving.resolve(); return saved.promise;
    }
    assert.equal(currentWorkspace().revision, 1);
    assert.equal(new Headers(init?.headers).get('X-AI-GUI'), '1');
    if (request.action === 'start') {
      assert.deepEqual(request, { ...identity, action: 'start', command: 'printf output', timeoutMs: 1000 });
      return response('running');
    }
    assert.deepEqual(request, { ...identity, action: 'poll', jobId: 'job', cursor: 1 });
    return response('succeeded', [chunk('stderr', 'warning'), chunk('stdout', 'last')], 3);
  }, async () => {
    dirtyInstructions();
    const pending = dispatch(undefined, text => output.push(text));
    await saving.promise;
    assert.equal(requests.length, 1);
    saved.resolve(Response.json({ workspace: { revision: 1 } }));
    const result = await pending;
    assert.equal(result.status, 'succeeded');
    assert.deepEqual(result.chunks, [chunk('stdout', 'first'), chunk('stderr', 'warning'), chunk('stdout', 'last')]);
    assert.deepEqual(output, ['first', 'firstwarninglast']);
    assert.equal(requests.length, 3);
  });
});

test('failed durable save prevents command dispatch', async () => {
  const paths: string[] = [];
  await withFetch(async url => {
    paths.push(String(url)); return Response.json({ error: 'Disk full' }, { status: 507 });
  }, async () => {
    dirtyInstructions();
    await assert.rejects(dispatch(), /Disk full/);
    assert.deepEqual(paths, ['/api/local/workspace']);
  });
});

test('folder mutation aborted during durable save never reaches the folder API', async () => {
  const saving = deferred<void>(); const saved = deferred<Response>(); const paths: string[] = [];
  await withFetch(async url => {
    paths.push(String(url)); saving.resolve(); return saved.promise;
  }, async () => {
    dirtyInstructions();
    const controller = new AbortController();
    const mutation = { id: 'write', name: 'folder_write', args: JSON.stringify({ folder_id: 'folder', path: 'file.txt', text: 'changed' }) };
    const pending = dispatchLocalTool(mutation, 'project', 'chat', controller.signal);
    const rejected = assert.rejects(pending, /Stopped during save/);
    await saving.promise; controller.abort(new Error('Stopped during save'));
    saved.resolve(Response.json({ workspace: { revision: 1 } }));
    await rejected;
    assert.deepEqual(paths, ['/api/local/workspace']);
  });
});

for (const failure of ['transport', 'abort', 'body'] as const) test(`${failure} failure before receiving a start identity cancels the invocation independently`, async () => {
  const controller = new AbortController(); const actions: string[] = [];
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') {
      assert.equal(init?.signal, controller.signal);
      if (failure === 'body') return new Response('{');
      if (failure === 'abort') controller.abort(new Error('Stopped during start'));
      throw failure === 'abort' ? controller.signal.reason : new Error('Start response lost');
    }
    assert.deepEqual(request, { ...identity, action: 'cancel-start', command: 'printf output', timeoutMs: 1000 });
    cancellationSignal(init, controller.signal);
    return response('cancelled', []);
  }, async () => {
    const result = await dispatch(controller.signal);
    if (failure === 'body') assert.match(String(result.error), /JSON|property|Unexpected/);
    else assert.equal(result.error, failure === 'abort' ? 'Stopped during start' : 'Start response lost');
    assert.equal(result.stopped, failure === 'abort');
    assert.equal(result.cancellationUnconfirmed, undefined);
    assert.deepEqual(result.chunks, []);
    assert.deepEqual(actions, ['start', 'cancel-start']);
  });
});

for (const status of [403, 409, 429, 503]) test(`HTTP ${status} start failure ${status < 500 ? 'does not reserve cancellation' : 'cancels an uncertain invocation'}`, async () => {
  const actions: string[] = [];
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') return Response.json({ error: 'Start unavailable' }, { status });
    assert.equal(request.action, 'cancel-start'); cancellationSignal(init);
    return response('cancelled', []);
  }, async () => {
    const result = await dispatch();
    assert.equal(result.error, 'Start unavailable');
    assert.equal(result.cancellationUnconfirmed, undefined);
    assert.deepEqual(actions, status < 500 ? ['start'] : ['start', 'cancel-start']);
  });
});

test('lost start response cancellation terminates a real command without replaying it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sector7-lost-start-'));
  const manager = new LocalCommandManager(join(root, 'receipts'));
  const scope = JSON.stringify([identity.projectId, identity.conversationId, identity.folderId]);
  const request = { scope, invocationId: identity.invocationId, root, command: '(sleep 1; printf escaped > escaped) & printf ready; wait', timeoutMs: 5000 };
  const lostCall = { ...call, args: JSON.stringify({ folder_id: identity.folderId, command: request.command, timeout_ms: request.timeoutMs }) };
  const actions: string[] = [];
  try {
    await withFetch(async (_url, init) => {
      const value = body(init); actions.push(value.action);
      assert.equal(value.invocationId, request.invocationId);
      if (value.action === 'start') {
        const started = await manager.start(request);
        let ready = false;
        for (let count = 0; count < 100; count++) {
          ready = (await manager.poll(scope, request.invocationId, started.jobId)).chunks.some(chunk => chunk.text.includes('ready'));
          if (ready) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(ready, true);
        throw new Error('Start response lost after command started');
      }
      assert.equal(value.action, 'cancel-start');
      assert.deepEqual(value, { ...identity, action: 'cancel-start', command: request.command, timeoutMs: request.timeoutMs });
      cancellationSignal(init);
      return Response.json(await manager.cancelStart(request));
    }, async () => {
      const result = await dispatchLocalTool(lostCall, identity.projectId, identity.conversationId, new AbortController().signal);
      assert.equal(result.error, 'Start response lost after command started');
      assert.equal(result.cancellationUnconfirmed, undefined);
      assert.deepEqual(actions, ['start', 'cancel-start']);
    });
    let result = await manager.start(request);
    for (let count = 0; result.status === 'running' && count < 100; count++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      result = await manager.poll(scope, request.invocationId, result.jobId);
    }
    assert.equal(result.status, 'cancelled');
    await new Promise(resolve => setTimeout(resolve, 1100));
    await assert.rejects(readFile(join(root, 'escaped')), { code: 'ENOENT' });
    assert.equal((await new LocalCommandManager(join(root, 'receipts')).start(request)).status, 'cancelled');
  } finally { manager.shutdown(); await rm(root, { recursive: true, force: true }); }
});

test('failed cancellation of a lost start response reports an unconfirmed cancellation', async () => {
  const actions: string[] = [];
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') throw new Error('Start response lost');
    assert.equal(request.action, 'cancel-start'); cancellationSignal(init);
    throw new Error('Cancellation unreachable');
  }, async () => {
    const result = await dispatch();
    assert.equal(result.error, 'Start response lost' + cancellationWarning);
    assert.equal(result.cancellationUnconfirmed, true);
    assert.equal(result.stopped, false);
    assert.deepEqual(result.chunks, []);
    assert.deepEqual(actions, ['start', 'cancel-start']);
  });
});

test('abort while waiting to poll sends explicit cancellation without the aborted signal', async () => {
  const controller = new AbortController(); const actions: string[] = [];
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') return response('running');
    cancellationSignal(init, controller.signal);
    assert.deepEqual(request, { ...identity, action: 'cancel', jobId: 'job' });
    return response('cancelled');
  }, async () => {
    const result = await dispatch(controller.signal, () => {
      setTimeout(() => controller.abort(new Error('User stopped command')), 20);
    });
    assert.equal(result.error, 'User stopped command'); assert.equal(result.stopped, true);
    assert.deepEqual(result.chunks, [chunk('stdout', 'first')]);
    assert.deepEqual(actions, ['start', 'cancel']);
  });
});

test('abort in an in-flight poll keeps received output and sends cancellation independently', async () => {
  const controller = new AbortController(); const polling = deferred<void>(); const actions: string[] = [];
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') return response('running');
    if (request.action === 'poll') {
      assert.equal(init?.signal, controller.signal); polling.resolve();
      return new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      });
    }
    cancellationSignal(init, controller.signal); return response('cancelled');
  }, async () => {
    const pending = dispatch(controller.signal);
    await polling.promise; controller.abort(new Error('Stopped during poll'));
    const result = await pending;
    assert.equal(result.error, 'Stopped during poll'); assert.equal(result.stopped, true);
    assert.deepEqual(result.chunks, [chunk('stdout', 'first')]);
    assert.deepEqual(actions, ['start', 'poll', 'cancel']);
  });
});

for (const failure of ['http', 'transport'] as const) test(`${failure} polling failure preserves useful chunks even if cancellation fails`, async () => {
  const actions: string[] = []; const output: string[] = [];
  const controller = new AbortController();
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') return response('running');
    if (request.action === 'poll' && request.cursor === 1) return response('running', [chunk('stderr', 'warning')], 2);
    if (request.action === 'cancel') { cancellationSignal(init, controller.signal); throw new Error('Cancel unreachable'); }
    if (failure === 'transport') throw new Error('Connection lost');
    return Response.json({ error: 'Poll unavailable' }, { status: 503 });
  }, async () => {
    const result = await dispatch(controller.signal, text => output.push(text));
    assert.equal(result.error, (failure === 'http' ? 'Poll unavailable' : 'Connection lost') + cancellationWarning);
    assert.equal(result.cancellationUnconfirmed, true);
    assert.equal(result.stopped, false);
    assert.deepEqual(result.chunks, [chunk('stdout', 'first'), chunk('stderr', 'warning')]);
    assert.deepEqual(output, ['first', 'firstwarning']);
    assert.deepEqual(actions, ['start', 'poll', 'poll', 'cancel']);
  });
});

for (const lostStart of [false, true]) test(`a stalled ${lostStart ? 'cancel-start' : 'cancel'} times out with retained output and an unconfirmed cancellation warning`, { timeout: 10_000 }, async () => {
  const controller = new AbortController(); const actions: string[] = [];
  await withFetch(async (_url, init) => {
    const request = body(init); actions.push(request.action);
    if (request.action === 'start') {
      if (lostStart) { controller.abort(new Error('User stopped command')); throw controller.signal.reason; }
      return response('running');
    }
    assert.equal(request.action, lostStart ? 'cancel-start' : 'cancel');
    const signal = cancellationSignal(init, controller.signal);
    return new Promise<Response>((_resolve, reject) => {
      // A real pending HTTP connection keeps Node alive; AbortSignal.timeout alone does not.
      const connection = setTimeout(() => reject(new Error('Cancellation timeout missing')), 9000);
      signal.addEventListener('abort', () => { clearTimeout(connection); reject(signal.reason); }, { once: true });
    });
  }, async () => {
    const started = Date.now();
    const result = await dispatch(controller.signal, () => {
      setTimeout(() => controller.abort(new Error('User stopped command')), 20);
    });
    assert.equal(result.error, 'User stopped command' + cancellationWarning);
    assert.equal(result.cancellationUnconfirmed, true); assert.equal(result.stopped, true);
    assert.deepEqual(result.chunks, lostStart ? [] : [chunk('stdout', 'first')]);
    assert.deepEqual(actions, ['start', lostStart ? 'cancel-start' : 'cancel']);
    assert.ok(Date.now() - started >= 4500);
    assert.ok(Date.now() - started < 9000);
  });
});

test('dispatch accepts an interrupted durable receipt without polling or repeating its mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sector7-dispatch-'));
  const directory = join(root, 'receipts'); const marker = join(root, 'executions');
  const manager = new LocalCommandManager(directory);
  const scope = JSON.stringify([identity.projectId, identity.conversationId, identity.folderId]);
  const request = { scope, invocationId: identity.invocationId, root, command: "printf once >> executions; printf saved-output", timeoutMs: 1000 };
  const recoveredCall = { ...call, args: JSON.stringify({ folder_id: identity.folderId, command: request.command, timeout_ms: request.timeoutMs }) };
  try {
    let result = await manager.start(request);
    for (let count = 0; result.status === 'running' && count < 100; count++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      result = await manager.poll(scope, request.invocationId, result.jobId);
    }
    assert.equal(result.status, 'succeeded');
    const receiptPath = join(directory, `${result.jobId}.json`);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    await writeFile(receiptPath, JSON.stringify({ ...receipt, status: 'running', chunks: [], exitCode: null, signal: null, truncated: false, finishedAt: null }));
    const restarted = new LocalCommandManager(directory); const actions: string[] = [];
    await withFetch(async (_url, init) => {
      const value = body(init); actions.push(value.action);
      assert.equal(value.action, 'start');
      return Response.json(await restarted.start({ ...request, command: value.command, timeoutMs: value.timeoutMs }));
    }, async () => {
      const output: string[] = [];
      const recovered = await dispatchLocalTool(recoveredCall, 'project', 'chat', new AbortController().signal, text => output.push(text));
      assert.equal(recovered.status, 'interrupted');
      assert.deepEqual(output, ['']);
      assert.deepEqual(actions, ['start']);
      assert.equal(await readFile(marker, 'utf8'), 'once');
      assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).status, 'interrupted');
    });
  } finally { manager.shutdown(); await rm(root, { recursive: true, force: true }); }
});
