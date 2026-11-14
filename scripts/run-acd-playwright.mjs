import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// Reuse the socket implementation bundled with the installed Playwright runner.
const { ws: WebSocket, wsServer: WebSocketServer } = require(
  join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'),
);
if (!WebSocket || !WebSocketServer)
  throw new Error('This Playwright version lacks the local CDP socket implementation.');
let vite, session, sockets, proxy;
try {
  vite = await createViteServer({
    root,
    cacheDir: join(root, 'tmp/performance/acd-playwright-cache'),
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    logLevel: 'error',
  });
  await vite.listen();
  const port = vite.httpServer.address().port;
  const baseURL = `http://127.0.0.1:${port}/BASISCad/`;
  const opened = execFileSync(
    'acd',
    [
      'webdebug',
      'open',
      baseURL,
      ...(process.env.PLAYWRIGHT_ACD_HOST ? ['--host', process.env.PLAYWRIGHT_ACD_HOST] : []),
    ],
    { encoding: 'utf8' },
  );
  session = opened.match(/session_id: (\S+)/)?.[1];
  const debugPort = opened.match(/debug_port: (\d+)/)?.[1];
  if (!session || !debugPort)
    throw new Error('Agent Conductor did not return a browser session and port.');
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  const upstreamURL = new URL(version.webSocketDebuggerUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(upstreamURL.hostname))
    throw new Error('The task browser returned a non-loopback debugger endpoint.');
  proxy = createServer((request, response) => {
    if (new URL(request.url, 'http://127.0.0.1').pathname.replace(/\/+$/, '') !== '/json/version') {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        ...version,
        webSocketDebuggerUrl: `ws://127.0.0.1:${proxy.address().port}/browser`,
      }),
    );
  });
  sockets = new WebSocketServer({ server: proxy });
  sockets.on('connection', (client) => {
    const upstream = new WebSocket(upstreamURL.href);
    const queued = [];
    client.on('message', (data) => {
      const message = JSON.parse(data.toString());
      // Chrome exposes internal browser_ui/tab targets which hang this version of
      // Playwright's initialization. Root attachment needs page targets only.
      // Page sessions still attach their dedicated workers through the normal protocol.
      if (message.method === 'Target.setAutoAttach' && !message.sessionId)
        message.params.filter = [{ type: 'page', exclude: false }, { exclude: true }];
      const text = JSON.stringify(message);
      if (upstream.readyState === WebSocket.OPEN) upstream.send(text);
      else queued.push(text);
    });
    upstream.on('open', () => queued.forEach((text) => upstream.send(text)));
    upstream.on('message', (data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data.toString());
    });
    upstream.on('error', () => client.close());
    client.on('error', () => upstream.close());
    client.on('close', () => upstream.close());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  console.log(`Running Playwright in a fresh Agent Conductor browser at ${baseURL}`);
  const child = spawn(
    process.execPath,
    [
      join(root, 'node_modules/@playwright/test/cli.js'),
      'test',
      ...process.argv.slice(2),
      '--workers=1',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseURL,
        PLAYWRIGHT_CDP_URL: `http://127.0.0.1:${proxy.address().port}`,
      },
    },
  );
  const stop = () => child.kill('SIGINT');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  sockets?.clients.forEach((client) => client.terminate());
  sockets?.close();
  proxy?.close();
  if (session) {
    try {
      execFileSync('acd', ['webdebug', 'close', session], { stdio: 'pipe' });
    } catch (error) {
      console.error(`Could not close task browser ${session}: ${error.message}`);
    }
  }
  await vite?.close();
}
