import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const repositoryUrl = 'https://api.github.com/repos/acme/docs';
const branchesUrl = `${repositoryUrl}/branches?per_page=100`;
const branchesPageTwoUrl = `${branchesUrl}&page=2`;
const tagsUrl = `${repositoryUrl}/tags?per_page=100`;
const treeUrl = `${repositoryUrl}/git/trees/main?recursive=1`;
const vite = await createServer({ root: repositoryRoot, appType: 'custom', logLevel: 'error', server: { middlewareMode: true } });

try {
  const { GitHubProvider } = await vite.ssrLoadModule('/src/features/docs/providers/GitHubProvider.ts');
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === repositoryUrl) return Response.json({ default_branch: 'main' });
    if (url === branchesUrl) return new Response(JSON.stringify([{ name: 'main', commit: { sha: 'main-sha' } }]), { headers: { Link: `<${branchesPageTwoUrl}>; rel="next"` } });
    if (url === branchesPageTwoUrl) return Response.json([{ name: 'feature', commit: { sha: 'feature-sha' } }]);
    if (url === tagsUrl) return Response.json([{ name: 'v1.0.0', commit: { sha: 'tag-sha' } }]);
    if (url === treeUrl) return Response.json({ tree: [{ path: 'docs/README.md', type: 'blob', sha: 'file-sha', size: 20 }] });
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const provider = new GitHubProvider();
    const source = { owner: 'acme', repository: 'docs', ref: 'main', rootPath: 'docs' };
    const refs = await provider.getRefs(source);
    assert.deepEqual(refs.map((ref) => ref.name), ['main', 'feature', 'v1.0.0']);
    assert.equal(refs[0].isDefault, true);
    assert.equal((await provider.getRefs(source)).length, 3);
    assert.deepEqual(await provider.getTree(source), [{ path: 'docs/README.md', type: 'file', sha: 'file-sha', size: 20 }]);
    assert.equal((await provider.getTree(source)).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests.sort(), [repositoryUrl, branchesUrl, branchesPageTwoUrl, tagsUrl, treeUrl].sort());
  process.stdout.write('GitHub provider metadata cache regression passed.\n');
} finally {
  await vite.close();
}
