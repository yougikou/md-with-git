import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages project sites are served below the repository name.
  base: command === 'build' ? '/md-with-git/' : '/',
  plugins: [react()],
  define: {
    __PWA_BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  server: { port: 4173 },
}));
