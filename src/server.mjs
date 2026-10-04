import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecoveryEngine } from './engine.mjs';
import { createMcpHandler } from './mcp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['public/favicon.svg', 'image/svg+xml']],
]);

/** A loopback-only development server. No outbound network or paid provider SDK. */
export function createServer({ engine = new RecoveryEngine(), onError = console.error } = {}) {
  const mcpHandler = createMcpHandler(engine);
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    try {
      const host = req.headers.host;
      if (typeof host !== 'string' || !/^(localhost|127\.0\.0\.1|\[::1\])(?::[1-9]\d{0,4})?$/i.test(host)) {
        send(403, { error: { code: 'HOST_REJECTED', message: 'This demo accepts loopback hosts only.' } }); return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/mcp') { await mcpHandler(req, res); return; }
      if (req.method === 'GET' && files.has(url.pathname)) {
        const [path, type] = files.get(url.pathname);
        res.writeHead(200, { 'Content-Type': type });
        res.end(readFileSync(resolve(root, path)));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        send(200, { ok: true, mode: 'simulation', model: 'deterministic', externalCalls: false });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        send(200, engine.getState());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/evidence') {
        res.setHeader('Content-Disposition', 'attachment; filename="nightjar-simulated-evidence.json"');
        send(200, { disclosure: 'Synthetic scenario and simulated suppliers. No live booking, Alexa integration, or AI model call.', exportedAt: new Date().toISOString(), state: engine.getState() });
        return;
      }
      if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) {
        send(404, { error: { code: 'NOT_FOUND', message: 'This route does not exist.' } });
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) {
        send(403, { error: { code: 'ORIGIN_REJECTED', message: 'Only this local demo may change its state.' } });
        return;
      }
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        send(415, { error: { code: 'JSON_REQUIRED', message: 'Send application/json.' } });
        return;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 16384) {
          send(413, { error: { code: 'BODY_TOO_LARGE', message: 'Request exceeds 16 KB.' } });
          return;
        }
      }
      let input;
      try { input = JSON.parse(body || '{}'); }
      catch { send(400, { error: { code: 'INVALID_JSON', message: 'Request must contain valid JSON.' } }); return; }
      if (!input || Array.isArray(input) || typeof input !== 'object') {
        send(400, { error: { code: 'INVALID_INPUT', message: 'Request must be an object.' } }); return;
      }
      const routes = {
        '/api/plan': () => engine.plan(input),
        '/api/approve': () => engine.approve(input),
        '/api/execute': () => engine.execute(input),
        '/api/inject': () => engine.inject(input),
        '/api/reset': () => engine.reset(),
      };
      if (!routes[url.pathname]) { send(404, { error: { code: 'NOT_FOUND', message: 'This action does not exist.' } }); return; }
      send(200, routes[url.pathname]());
    } catch (error) {
      const status = error.statusCode ?? 500;
      if (status === 500) onError(error);
      send(status, { error: { code: error.code ?? 'INTERNAL_ERROR', message: status === 500 ? 'The demo hit a problem. Your saved state is still on disk.' : error.message } });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const stateFile = process.env.NIGHTJAR_STATE_FILE ?? resolve(root, '.runtime/state.json');
  mkdirSync(dirname(stateFile), { recursive: true });
  const server = createServer({ engine: new RecoveryEngine({ filePath: stateFile }) });
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Nightjar simulation: http://127.0.0.1:${boundPort}\nState: ${stateFile}\nNo external API calls. All suppliers are simulated.`);
  });
}
