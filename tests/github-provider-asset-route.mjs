import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const contentsUrl = 'https://api.github.com/repos/acme/docs/contents/guide/plugin.md?ref=main';
const downloadUrl = 'https://raw.githubusercontent.com/acme/docs/main/guide/plugin.md';
const vite = await createServer({ root: repositoryRoot, appType: 'custom', logLevel: 'error', server: { middlewareMode: true } });

try {
  const { GitHubProvider } = await vite.ssrLoadModule('/src/features/docs/providers/GitHubProvider.ts');
  const originalFetch = globalThis.fetch;
  const requests = [];
  let contentsRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, accept: headers.get('accept') });
    if (url === contentsUrl) {
      contentsRequests += 1;
      if (contentsRequests === 1) return new Response(JSON.stringify({ type: 'file', path: 'guide/plugin.md', download_url: downloadUrl }), { status: 200 });
      return new Response(JSON.stringify({ type: 'file', path: 'guide/plugin.md', content: 'IyBQbHVnaW4gQVBJ', encoding: 'base64' }), { status: 200 });
    }
    if (url === downloadUrl) return new Response('# Plugin API', { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const provider = new GitHubProvider();
    const input = { owner: 'acme', repository: 'docs', path: 'guide/plugin.md', ref: 'main' };
    const assetUrl = await provider.getAssetUrl(input);
    assert.match(assetUrl, /^blob:/);
    URL.revokeObjectURL(assetUrl);
    assert.equal(await provider.getFile(input), '# Plugin API');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: contentsUrl, accept: 'application/vnd.github+json' },
    { url: downloadUrl, accept: 'application/octet-stream' },
    { url: contentsUrl, accept: 'application/vnd.github+json' },
  ]);
  process.stdout.write('GitHub asset route regression passed.\n');
} finally {
  await vite.close();
}
