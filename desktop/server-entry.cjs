const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const token = process.env.SECTOR7_DESKTOP_TOKEN;
if (!token) throw new Error('Desktop server requires its launch token.');
delete process.env.ELECTRON_RUN_AS_NODE;
process.title = 'Sector 7 backend';

// Gate at the HTTP listener, including static documents, before Next or its edge sandbox runs.
const emit = http.Server.prototype.emit;
/** @type {(event: string, ...args: any[]) => boolean} */
http.Server.prototype.emit = function (event, ...args) {
  if (event === 'upgrade') { args[1].destroy(); return true; }
  if (event === 'request') {
    const [request, response] = args;
    const supplied = request.headers['x-sector7-token'];
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end('{"error":"Desktop authentication required."}');
      return true;
    }
  }
  return Reflect.apply(emit, this, [event, ...args]);
};
// Pipe ownership ends on UI crash. process.exit also runs local command cleanup hooks.
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
require(require('node:path').join(__dirname, 'server.js'));
