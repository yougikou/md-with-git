import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = process.env.GIT_PATH || 'git';

async function runGit(directory, argumentsList) {
  await execFileAsync(git, argumentsList, { cwd: directory, windowsHide: true });
}

export async function createLocalGitFixture() {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), 'git-md-viewer-local-git-'));
  await cp(resolve(repositoryRoot, 'tests/fixtures/local-documents'), resolve(fixtureRoot, 'docs'), { recursive: true });
  await runGit(fixtureRoot, ['init', '--initial-branch=main']);
  await runGit(fixtureRoot, ['add', 'docs']);
  await runGit(fixtureRoot, ['-c', 'user.name=Git MD Viewer Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'docs: add local Git fixture']);

  const guidePath = resolve(fixtureRoot, 'docs/guides/getting-started.md');
  await writeFile(guidePath, `${await readFile(guidePath, 'utf8')}\n## Git history check\n\n这段内容只存在于第二个 Commit，用于验证历史版本和 Diff。\n`, 'utf8');
  await writeFile(resolve(fixtureRoot, 'docs/CHANGELOG.md'), '# Local Git Fixture Changelog\n\n- 2.0.0: added history and diff coverage.\n', 'utf8');
  await runGit(fixtureRoot, ['add', 'docs']);
  await runGit(fixtureRoot, ['-c', 'user.name=Git MD Viewer Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'docs: add history fixture']);
  return fixtureRoot;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify({ repositoryRoot: await createLocalGitFixture(), scope: 'docs' })}\n`);
}
