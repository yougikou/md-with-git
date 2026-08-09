import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages project sites are served below the repository name.
  base: command === 'build' ? '/md-with-git/' : '/',
  plugins: [react()],
  define: {
    __PWA_BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  // Mermaid dynamically reaches a few CommonJS-only packages. Pre-bundling
  // them in dev keeps the browser from evaluating their CJS entry directly.
  optimizeDeps: {
    include: ['mermaid', 'style-to-js', 'style-to-object', 'debug', 'ms'],
  },
  server: { port: 4173 },
}));
