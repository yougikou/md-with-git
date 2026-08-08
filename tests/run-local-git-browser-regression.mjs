import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalGitFixture } from './create-local-git-fixture.mjs';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testsDirectory, '..');
const node = process.execPath;
const appPort = Number(process.env.LOCAL_GIT_APP_PORT || '4173');
const fixturePort = Number(process.env.LOCAL_GIT_FIXTURE_PORT || '4180');

async function waitFor(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`测试服务未能启动：${url}`);
}

function start(command, argumentsList) {
  return spawn(command, argumentsList, { cwd: repositoryRoot, stdio: 'pipe', windowsHide: true });
}

async function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill();
  if (child.exitCode === null) await once(child, 'exit');
}

const fixtureRoot = await createLocalGitFixture();
const app = start(node, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort']);
const fixtureServer = start(node, [resolve(testsDirectory, 'local-git-browser-server.mjs'), fixtureRoot, 'docs', String(fixturePort)]);

try {
  await Promise.all([
    waitFor(`http://127.0.0.1:${appPort}/local-git-browser-harness.html`),
    waitFor(`http://127.0.0.1:${fixturePort}/index`),
  ]);
  const address = `http://127.0.0.1:${appPort}/local-git-browser-harness.html?service=${encodeURIComponent(`http://127.0.0.1:${fixturePort}`)}&history=1`;
  const result = spawnSync(node, [resolve(testsDirectory, 'run-local-git-browser-harness.mjs'), address], { cwd: repositoryRoot, encoding: 'utf8', timeout: 45_000, windowsHide: true });
  process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout || `本地 Git 浏览器回归失败（退出码 ${result.status}）。`);
  process.stdout.write(result.stdout);
} finally {
  await Promise.all([stop(app), stop(fixtureServer)]);
}
