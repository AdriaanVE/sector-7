/** @param {string} url @param {string} origin */
export function isAppUrl(url, origin) {
  try { const parsed = new URL(url); return parsed.origin === origin && !parsed.username && !parsed.password; }
  catch { return false; }
}

/** @param {string} url */
export function externalUrl(url) {
  try { const parsed = new URL(url); return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null; }
  catch { return null; }
}

/** @param {import('electron').Session} session @param {string} origin @param {string} token */
export function protectSession(session, origin, token) {
  session.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'X-Sector7-Token': token } });
  });
  session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    if (!contents || !isAppUrl(contents.getURL(), origin) || requestingOrigin !== origin || details.isMainFrame === false) return false;
    return permission === 'clipboard-sanitized-write' || permission === 'fullscreen'
      || (permission === 'media' && details.mediaType === 'audio');
  });
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const local = isAppUrl(contents.getURL(), origin) && details.isMainFrame && isAppUrl(details.requestingUrl, origin);
    const allowed = permission === 'clipboard-sanitized-write' || permission === 'fullscreen'
      || (permission === 'media' && 'mediaTypes' in details && !!details.mediaTypes?.length && details.mediaTypes.every(type => type === 'audio'));
    callback(local && allowed);
  });
}
