import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const vite = await createServer({ root: repositoryRoot, appType: 'custom', logLevel: 'error', server: { middlewareMode: true } });

try {
  const { LocalFolderProvider, LocalFolderPermissionError } = await vite.ssrLoadModule('/src/features/docs/providers/LocalFolderProvider.ts');
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
  const nextAssetUrl = await provider.getAssetUrl({ ...query, path: 'assets/local-flow.svg' });
  assert.match(assetUrl, /^blob:/);
  assert.match(nextAssetUrl, /^blob:/);
  assert.notEqual(assetUrl, nextAssetUrl, '组件释放 Blob URL 后，Provider 不应复用已失效的缓存地址');
  URL.revokeObjectURL(assetUrl);
  URL.revokeObjectURL(nextAssetUrl);
  assert.deepEqual(await provider.getRefs(query), []);
  assert.deepEqual(await provider.getFileHistory({ ...query, path: 'README.md', limit: 10 }), []);

  let permission = 'prompt';
  let permissionRequests = 0;
  const protectedHandle = {
    getFile: async () => {
      if (permission !== 'granted') {
        const error = new Error('blocked');
        error.name = 'NotAllowedError';
        throw error;
      }
      return new Blob(['# Restored access']);
    },
    queryPermission: async () => permission,
    requestPermission: async () => {
      permissionRequests += 1;
      permission = 'granted';
      return permission;
    },
  };
  const restoredProvider = new LocalFolderProvider([{ path: 'restored.md', handle: protectedHandle }]);
  await assert.rejects(restoredProvider.getTree(query), LocalFolderPermissionError);
  await restoredProvider.requestReadPermission();
  assert.equal(permissionRequests, 1);
  assert.equal(await restoredProvider.getFile({ ...query, path: 'restored.md' }), '# Restored access');
  process.stdout.write('Local folder provider regression passed.\n');
} finally {
  await vite.close();
}
