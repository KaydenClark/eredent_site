import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.js';

test('vite preview serves the production build under the same base GitHub Pages uses', () => {
  const build = config({ command: 'build', mode: 'production' });
  const preview = config({ command: 'serve', mode: 'production', isPreview: true });
  assert.equal(build.base, '/eredent_site/');
  assert.equal(preview.base, build.base);
});

test('the dev server stays at the root', () => {
  assert.equal(config({ command: 'serve', mode: 'development', isPreview: false }).base, '/');
});
