const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseAuthority(host: string | null): URL | null {
  if (!host || /[\s,/@#?\\]/.test(host)) return null;
  try {
    const url = new URL(`http://${host}`);
    return url.host.toLowerCase() === host.toLowerCase() ? url : null;
  } catch { return null; }
}

/** Return a reason to reject, or null for a local same-origin API request. */
export function localAccessError(url: string, headers: Headers, method: string): string | null {
  const authority = parseAuthority(headers.get('host'));
  if (!authority || !LOOPBACK_HOSTS.has(authority.hostname)) return 'Local API requires a loopback Host.';
  const forwardedHost = headers.get('x-forwarded-host');
  if (forwardedHost && forwardedHost.toLowerCase() !== authority.host.toLowerCase()) return 'Conflicting forwarded Host.';
  if (headers.get('sec-fetch-site') === 'cross-site') return 'Cross-site requests are not allowed.';
  const origin = headers.get('origin');
  if (origin !== null) {
    try {
      const parsed = new URL(origin);
      const request = new URL(url);
      if (origin !== parsed.origin || parsed.host.toLowerCase() !== authority.host.toLowerCase()
        || parsed.protocol !== request.protocol) return 'Origin must match this local app.';
    } catch { return 'Invalid Origin.'; }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
    && headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    && headers.get('x-ai-gui') !== '1') return 'Mutations require JSON or the local app header.';
  return null;
}
