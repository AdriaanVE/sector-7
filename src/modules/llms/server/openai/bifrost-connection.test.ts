import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));

test('separately configured Sol is discoverable alongside Opus without opening other providers', () => {
  const script = `
    const assert = require('node:assert/strict');
    const { appRouterEdge } = require('./src/server/trpc/trpc.router-edge.ts');
    const { openAIAccess } = require('./src/modules/llms/server/openai/openai.access.ts');
    let networkRequests = 0;
    globalThis.fetch = async () => { networkRequests++; throw new Error('Unexpected network request'); };
    const caller = appRouterEdge.createCaller({ hostName: 'localhost', reqSignal: new AbortController().signal });
    const forbidden = error => error.code === 'FORBIDDEN';
    (async () => {
      const capabilities = await caller.backend.listCapabilities();
      assert.equal(capabilities.hasLlmAnthropic, true);
      assert.equal(capabilities.hasLlmOpenAI, true);
      const access = { dialect: 'openai', oaiKey: '', oaiHost: '', oaiOrg: '' };
      const listing = await caller.llmOpenAI.listModels({ access });
      assert.deepEqual(listing.models.map(model => model.id), ['gpt-6.1-sol']);
      const request = openAIAccess(access, 'gpt-6.1-sol', '/v1/responses');
      assert.equal(request.url, 'https://gateway.example.test/openai/v1/responses');
      assert.equal(request.headers.Authorization, 'Bearer fixture-bifrost-key');
      assert.equal(request.headers['OpenAI-Organization'], undefined);
      assert.equal(request.headers['x-api-key'], undefined);
      for (const override of [
        { ...access, oaiKey: 'fixture-client' },
        { ...access, oaiHost: 'https://client.example.test' },
        { ...access, oaiOrg: 'fixture-org' },
        { ...access, clientSideFetch: true },
        { ...access, dialect: 'groq', oaiKey: 'fixture-client' },
      ]) await assert.rejects(caller.llmOpenAI.listModels({ access: override }), forbidden);
      await assert.rejects(caller.llmOpenAI.createImages({}), forbidden);
      await assert.rejects(caller.llmGemini.listModels({}), forbidden);
      assert.equal(networkRequests, 0);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: root,
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development',
      ANTHROPIC_API_HOST: 'https://gateway.example.test/anthropic', ANTHROPIC_API_KEY: 'fixture-bifrost-key',
      OPENAI_API_HOST: 'https://gateway.example.test/openai', OPENAI_API_KEY: 'fixture-bifrost-key',
    },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
});
