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
test('foliage underside fade uses defined ascending smoothstep edges', () => {
  const source = read('../src/vegetation.js');
  assert.match(source, /1\.0 - smoothstep\(-0\.7, 0\.1, dot\(N, uUp\)\)/);
  assert.doesNotMatch(source, /smoothstep\(0\.1, -0\.7,/);
});
