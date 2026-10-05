/** Compare returned content, ignoring receipt identity and timing, to detect stalled repetition. */
export function createToolProgressGuard() {
  let previous: string | undefined;
  let repeats = 0;
  return async (call: { name: string; args: string }, result: Record<string, unknown>) => {
    let args: unknown = call.args;
    try { args = JSON.parse(call.args); } catch { /* Invalid arguments are compared as text. */ }
    const content = Object.fromEntries(Object.entries(result).filter(([key]) => !['jobId', 'invocationId', 'startedAt', 'finishedAt', 'cursor'].includes(key)));
    const bytes = new TextEncoder().encode(JSON.stringify([call.name, canonical(args), canonical(content)]));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    repeats = previous === fingerprint ? repeats + 1 : 1;
    previous = fingerprint;
    return repeats >= 3;
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
