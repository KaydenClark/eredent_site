import { defineConfig } from 'vite';
import { stripDevOnlyButtons } from './scripts/production-html.mjs';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Dev-only material: Kayden's source maps (previews, traced ink, registered overlays), the comparison data and the
// Oct 10 terrain variant. The dev server serves them from public/; the production build (GitHub Pages) drops them,
// and scripts/check-dist.mjs fails if any slip through.
export const DEV_ONLY = ['sources', 'textures/oct10', 'data/source_comparison.json', 'data/kiros_meta_oct10.json'];
const DEV_ONLY_PATTERNS = [/^textures[\/]overlay_.*\.png$/];

function stripDevOnly() {
  let outDir = 'dist';
  return {
    name: 'kiros-strip-dev-only', apply: 'build',
    transformIndexHtml: stripDevOnlyButtons,
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      for (const p of DEV_ONLY) { const f = join(outDir, p); if (existsSync(f)) rmSync(f, { recursive: true, force: true }); }
      const tex = join(outDir, 'textures');
      if (existsSync(tex)) for (const f of readdirSync(tex)) if (DEV_ONLY_PATTERNS.some(r => r.test('textures/' + f))) rmSync(join(tex, f));
    }
  };
}

// Served from https://kaydenclark.github.io/eredent_site/ by GitHub Pages, so assets need the repo prefix.
// vite preview serves that same build, so it keeps the prefix; only the dev server uses "/".
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/eredent_site/' : '/',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
  // Refuse a duplicate preview instead of silently opening another port.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [stripDevOnly()]
}));
