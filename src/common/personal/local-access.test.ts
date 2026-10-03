import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localAccessError } from './local-access';
const request = (extra: Record<string, string> = {}, method = 'GET', host = 'localhost:3004') => localAccessError(`http://${host}/api/local/workspace`, new Headers({ host, ...extra }), method);
test('local API accepts same origin, curl and IPv6 on arbitrary ports', () => {
  assert.equal(request({ origin: 'http://localhost:3004' }), null);
  assert.equal(request(), null);
  assert.equal(request({}, 'GET', '[::1]:8010'), null);
  assert.equal(request({ 'content-type': 'application/json' }, 'POST'), null);
  assert.equal(request({ 'x-ai-gui': '1' }, 'PUT'), null);
});
test('local API rejects rebinding, foreign/null origins, forwarded hosts and forms', () => {
  const rejectedHeaders: Record<string, string>[] = [{ origin: 'https://foreign.test' }, { origin: 'null' }, { origin: 'http://localhost:3004/path' }, { 'x-forwarded-host': 'attacker.test' }, { 'sec-fetch-site': 'cross-site' }];
  for (const extra of rejectedHeaders) assert.ok(request(extra));
  assert.ok(request({}, 'POST')); assert.ok(request({}, 'GET', 'localhost.attacker.test'));
});
