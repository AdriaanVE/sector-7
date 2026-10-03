// GENERATED FILE - DO NOT EDIT
// Per-vendor model-defs versions, derived from the runtime semantics of the files claimed by
// ../llms.defs.manifest.ts - regenerate with: node tools/develop/gen-llms-defs/generate-llms-defs.mjs
// (next dev / next build regenerate it automatically; commit the result)

import type { ModelVendorId } from '../../vendors/vendors.registry';

export type LlmsDefsVersions = Readonly<Record<ModelVendorId | '_shared' | '_openaiCompat', string>>;

export const LLMS_DEFS_VERSIONS = {
  _openaiCompat: 'ee6d3aed7ee5',
  _shared: 'f78c4f1a228b',
  alibaba: '8d81e9c09f05',
  anthropic: 'd9e400a1a0a7',
  azure: '589f75bead7d',
  bedrock: '8f7641f9a90d',
  cerebras: '329bbfd62564',
  cohere: 'e49a822f27e9',
  deepseek: 'b16d07509795',
  googleai: '665488a1a5ca',
  groq: '62a2e3b1a27e',
  lmstudio: '31c9212d9343',
  localai: '65a68a47888a',
  metaai: '4475ac21cb32',
  mistral: '91fe035dc5f1',
  modular: '347559916bd5',
  moonshot: '722489e68a5c',
  nvidianim: '9ed4ed3d83e6',
  ollama: '8adc3c3cbbe4',
  openai: 'd2fb08e5f1dd',
  openrouter: '5ae24604efe6',
  perplexity: '6eded0b3a8cd',
  sakanaai: '818786b6161f',
  togetherai: '60f3e02254a6',
  xai: '32b838ffc648',
  zai: 'f9f229f8552b',
} as const satisfies LlmsDefsVersions;
