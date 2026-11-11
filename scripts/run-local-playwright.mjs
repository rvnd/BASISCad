import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const installedBrowse = join(homedir(), '.browse/bin/browse');
const browse = process.env.BROWSE_BIN || (existsSync(installedBrowse) ? installedBrowse : 'browse');
const session = `basiscad-test-${randomUUID()}`;
const tokenCandidates = process.env.OPENCODE_BROWSER_HOME
  ? [join(process.env.OPENCODE_BROWSER_HOME, 'relay-token')]
  : [
      join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'browse/relay-token'),
      join(homedir(), '.local/share/opencode-browser/relay-token'),
    ];
const tokenFile = tokenCandidates.find(existsSync);

function browseCommand(args) {
  return execFileSync(browse, args, { cwd: root, encoding: 'utf8' });
}

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const port = server.address().port;
  await new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
  return port;
}

let createdSession = false;
try {
  const status = JSON.parse(browseCommand(['status', '--json']));
  if (!status.extension?.connected) {
    throw new Error(
      status.extension?.nextStep ||
        'Open the Chrome profile with the paired browse extension, then retry.',
    );
  }
  if (!tokenFile) throw new Error('The installed browse relay token file is missing.');
  const baseURL = `http://127.0.0.1:${await freePort()}/BASISCad/`;
  browseCommand(['session', 'new', session, '--allow-origin', new URL(baseURL).origin]);
  createdSession = true;
  console.log(`Running Playwright in local Chrome at ${baseURL}`);
  const child = spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/@playwright/test/cli.js'),
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
        PLAYWRIGHT_RELAY_URL: status.endpoint,
        PLAYWRIGHT_RELAY_SESSION: session,
        PLAYWRIGHT_RELAY_TOKEN_FILE: tokenFile,
      },
    },
  );
  const stop = () => child.kill('SIGINT');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.exitCode = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => accept(code ?? 1));
  });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (createdSession) browseCommand(['session', 'delete', session]);
}
