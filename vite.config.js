import { defineConfig } from 'vite';

// Served from https://kaydenclark.github.io/eredent_site/ by GitHub Pages, so assets need the repo prefix.
// Locally (vite dev / vite preview) the base is "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/eredent_site/' : '/',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
  server: { port: 5173, strictPort: false }
}));
