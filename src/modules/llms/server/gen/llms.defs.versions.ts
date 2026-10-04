// GENERATED FILE - DO NOT EDIT
// Per-vendor model-defs versions, derived from the runtime semantics of the files claimed by
// ../llms.defs.manifest.ts - regenerate with: node tools/develop/gen-llms-defs/generate-llms-defs.mjs
// (next dev / next build regenerate it automatically; commit the result)

import type { ModelVendorId } from '../../vendors/vendors.registry';

export type LlmsDefsVersions = Readonly<Record<ModelVendorId | '_shared' | '_openaiCompat', string>>;

export const LLMS_DEFS_VERSIONS = {
  _openaiCompat: 'b338ff7c5529',
  _shared: 'f94406075e67',
  alibaba: '8918fb3ad94f',
  anthropic: '12677de212a1',
  azure: '01ff6c2980c8',
  bedrock: '8d539afbde9d',
  cerebras: 'b09224b22a4f',
  cohere: 'd9e83b2cd259',
  deepseek: 'bec850816133',
  googleai: 'a15b8fcf1dae',
  groq: 'c78689eaae15',
  lmstudio: '50191c62b0b9',
  localai: 'c1d7bae7ef9b',
  metaai: 'd1b99b153edc',
  mistral: 'a4bfb6dbcb00',
  modular: '191f6c15cb10',
  moonshot: '2303b88dc94b',
  nvidianim: 'f69f6ba063ac',
  ollama: 'b6461ce57418',
  openai: 'b7015453b60f',
  openrouter: 'ad542757ae12',
  perplexity: '14761c9c54d7',
  sakanaai: 'a4cfd6d77668',
  togetherai: '2a91f20c23c8',
  xai: '74a65b9c764f',
  zai: 'ea8f34f572cc',
} as const satisfies LlmsDefsVersions;
