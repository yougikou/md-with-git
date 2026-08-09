import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const peerDependencies = ['react', 'react-dom', 'react-router-dom'];

export default defineConfig({
  plugins: [react()],
  // Worker and other emitted assets are consumed from inside an npm package,
  // not from the host application's web root.
  base: './',
  // The standalone PWA's public shell is not part of the embeddable package.
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    lib: {
      entry: {
        index: 'src/library.ts',
        host: 'src/host.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: 'styles',
    },
    rollupOptions: {
      // React and React Router must always be supplied by the host.  Bundling
      // either would create an isolated context and break hooks in DocsViewer.
      external: peerDependencies,
    },
  },
});
