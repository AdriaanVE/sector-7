import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

export const defaults = {
  port: 47100,
  preventSleep: true,
  bifrost: {
    baseUrl: 'https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/anthropic',
    openaiBaseUrl: 'https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/openai',
    keychainAccount: 'adriaan.van.erps',
    keychainService: 'telenet-bifrost-dev-virtual-key',
  },
};

/** @param {unknown} value @param {NodeJS.ProcessEnv} [env] */
export function validateConfig(value, env = process.env) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('config.json must contain an object.');
  const config = /** @type {Record<string, any>} */ (value);
  for (const key of Object.keys(config)) if (!['port', 'preventSleep', 'dataDir', 'bifrost'].includes(key)) throw new Error(`Unknown config field: ${key}. Credentials belong in Keychain.`);
  const bifrost = config.bifrost ?? {};
  if (typeof bifrost !== 'object' || Array.isArray(bifrost)) throw new Error('bifrost must be an object.');
  for (const key of Object.keys(bifrost)) if (!['baseUrl', 'openaiBaseUrl', 'keychainAccount', 'keychainService'].includes(key)) throw new Error(`Unknown bifrost field: ${key}. Credentials belong in Keychain.`);
  const port = Number(env.SECTOR7_DESKTOP_PORT ?? config.port ?? defaults.port);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Desktop port must be an integer from 1024 to 65535.');
  const dataDir = env.AI_GUI_DATA_DIR ?? config.dataDir;
  if (dataDir !== undefined && (typeof dataDir !== 'string' || !isAbsolute(dataDir))) throw new Error('dataDir must be an absolute path.');
  const baseUrl = env.BIFROST_ANTHROPIC_BASE_URL ?? bifrost.baseUrl ?? defaults.bifrost.baseUrl;
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Bifrost URL must be HTTP(S), without credentials, query or fragment.');
  const openaiUrl = new URL(env.BIFROST_OPENAI_BASE_URL ?? bifrost.openaiBaseUrl ?? defaults.bifrost.openaiBaseUrl);
  if (!['http:', 'https:'].includes(openaiUrl.protocol) || openaiUrl.username || openaiUrl.password || openaiUrl.search || openaiUrl.hash) throw new Error('Bifrost OpenAI URL must be HTTP(S), without credentials, query or fragment.');
  const keychainAccount = env.BIFROST_KEYCHAIN_ACCOUNT ?? bifrost.keychainAccount ?? defaults.bifrost.keychainAccount;
  const keychainService = env.BIFROST_KEYCHAIN_SERVICE ?? bifrost.keychainService ?? defaults.bifrost.keychainService;
  for (const field of [keychainAccount, keychainService]) if (typeof field !== 'string' || !field || field.includes('\0')) throw new Error('Keychain account and service must be nonempty strings.');
  const preventSleep = config.preventSleep ?? defaults.preventSleep;
  if (typeof preventSleep !== 'boolean') throw new Error('preventSleep must be true or false.');
  return { port, dataDir, preventSleep, bifrost: { baseUrl: url.href.replace(/\/$/, ''), openaiBaseUrl: openaiUrl.href.replace(/\/$/, ''), keychainAccount, keychainService } };
}

/** @param {string} directory */
export async function loadConfig(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'config.json');
  let source;
  try { source = await readFile(path, 'utf8'); }
  catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
    source = JSON.stringify(defaults, null, 2) + '\n';
    await writeFile(path, source, { flag: 'wx', mode: 0o600 });
  }
  return validateConfig(JSON.parse(source));
}
