import { LOCAL_JSON_BYTE_LIMIT } from './workspace-archive';
import { WorkspaceError } from './workspace';

/** Count streamed bytes before retaining a chunk or materializing the entire body. */
export async function readBoundedBody(request: Request, limit: number, label = 'Request'): Promise<Uint8Array> {
  const tooLarge = () => new WorkspaceError(`${label} exceeds the ${limit / (1024 * 1024)} MB limit.`, 413);
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > limit) { await request.body?.cancel().catch(() => undefined); throw tooLarge(); }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel().catch(() => undefined); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readBoundedJSON(request: Request, limit = LOCAL_JSON_BYTE_LIMIT): Promise<any> {
  return JSON.parse(new TextDecoder().decode(await readBoundedBody(request, limit)));
}
