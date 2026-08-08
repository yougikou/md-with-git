import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const vite = await createServer({ root: repositoryRoot, appType: 'custom', logLevel: 'error', server: { middlewareMode: true } });

try {
  const { LocalFolderProvider } = await vite.ssrLoadModule('/src/features/docs/providers/LocalFolderProvider.ts');
  const provider = new LocalFolderProvider([
    { path: 'README.md', file: new Blob(['# Local home']) },
    { path: 'guides/getting-started.md', file: new Blob(['# Local guide']) },
    { path: 'assets/local-flow.svg', file: new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }) },
  ]);
  const query = { owner: 'local', repository: 'folder' };
  const tree = await provider.getTree(query);
  assert.deepEqual(tree.map((entry) => entry.path).sort(), ['README.md', 'assets/local-flow.svg', 'guides/getting-started.md']);
  assert.equal(await provider.getFile({ ...query, path: 'guides/getting-started.md' }), '# Local guide');
  const assetUrl = await provider.getAssetUrl({ ...query, path: 'assets/local-flow.svg' });
  assert.match(assetUrl, /^blob:/);
  URL.revokeObjectURL(assetUrl);
  assert.deepEqual(await provider.getRefs(query), []);
  assert.deepEqual(await provider.getFileHistory({ ...query, path: 'README.md', limit: 10 }), []);
  process.stdout.write('Local folder provider regression passed.\n');
} finally {
  await vite.close();
}
