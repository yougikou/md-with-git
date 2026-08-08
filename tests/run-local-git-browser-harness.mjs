import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const address = process.argv[2] || 'http://[::1]:4173/local-git-browser-harness.html?service=http%3A%2F%2F127.0.0.1%3A4180';
const profileDirectory = mkdtempSync(join(tmpdir(), 'git-md-viewer-chrome-'));

try {
  const result = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--disable-gpu-compositing', '--use-angle=swiftshader',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profileDirectory}`,
    '--virtual-time-budget=12000', '--dump-dom', address,
  ], { encoding: 'utf8', timeout: 30000, windowsHide: true });

  if (result.error) throw result.error;
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);

  const match = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  if (!match) throw new Error('浏览器测试没有返回结果。');
  const report = JSON.parse(match[1].trim());
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exit(1);
} finally {
  rmSync(profileDirectory, { recursive: true, force: true });
}
