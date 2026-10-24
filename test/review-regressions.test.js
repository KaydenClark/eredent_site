import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripDevOnlyButtons } from '../scripts/production-html.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('production welcome excludes the unavailable Oct 10 quick start', () => {
  const source = read('../index.html');
  assert.match(source, /data-go="s-veir-oct10"/); // Still offered by the dev server.
  const production = stripDevOnlyButtons(source);
  assert.doesNotMatch(production, /data-go="s-veir-oct10"/);
  for (const id of ['s-forest', 's-beach', 's-veir-peak', 's-veir-shore', 's-volcano', 's-wetland', 's-outer', 'orbit']) {
    assert.ok(production.includes(`data-go="${id}"`), `${id} remains available`);
  }
  assert.equal(stripDevOnlyButtons(production), production);
});
test('production drops the workshop and Oct 10 controls the public build cannot use', () => {
  const production = stripDevOnlyButtons(read('../index.html'));
  assert.doesNotMatch(production, /id="ts-oct10"/);
  assert.doesNotMatch(production, /id="w-workshop"/);
  assert.doesNotMatch(production, /are in the workshop/);
  assert.match(production, /id="ts-sept"/);
  assert.match(production, /id="w-help"/);
  assert.match(production, /<p class="lede">Twenty years of a world/);
});
test('the public Go to list leaves out places on the dev-only Oct 10 terrain', async () => {
  const { SCENIC, scenicFor } = await import('../src/places.js');
  assert.ok(scenicFor({ dev: true }).some(p => p.terrain === 'oct10'));
  const pub = scenicFor({ dev: false });
  assert.ok(pub.every(p => p.terrain !== 'oct10'));
  assert.equal(pub.length, SCENIC.length - 1);
});
test('foliage underside fade uses defined ascending smoothstep edges', () => {
  const source = read('../src/vegetation.js');
  assert.match(source, /1\.0 - smoothstep\(-0\.7, 0\.1, dot\(N, uUp\)\)/);
  assert.doesNotMatch(source, /smoothstep\(0\.1, -0\.7,/);
});
