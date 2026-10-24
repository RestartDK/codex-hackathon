import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const playwright = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const server = spawn(process.execPath, [vite, '--mode', 'test', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
});
const serverExit = once(server, 'exit');

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4173/');
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The E2E server did not become ready within 15 seconds.');
}

let exitCode = 1;
try {
  await waitForServer();
  const tests = spawn(process.execPath, [playwright, 'test', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, E2E_MANAGED_SERVER: '1' },
  });
  const [code] = await once(tests, 'exit');
  exitCode = typeof code === 'number' ? code : 1;
} finally {
  server.kill('SIGTERM');
  const stopped = await Promise.race([
    serverExit.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  if (!stopped) server.kill('SIGKILL');
}

process.exitCode = exitCode;
