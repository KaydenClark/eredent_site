// Behavior of the workshop store: persistence across reloads, strict validation, safe import/export and recovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, SCHEMA, VERSION, LIMITS } from '../src/workshop/store.js';

// localStorage-compatible in-memory storage. `failWrites` simulates a full quota.
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    failWrites: false,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) { if (this.failWrites) throw new Error('QuotaExceededError'); data.set(k, String(v)); },
    removeItem: k => { data.delete(k); }
  };
}

function clock(start = Date.parse('2026-10-10T08:00:00Z')) {
  let t = start;
  return () => new Date((t += 1000)).toISOString();
}

function counter() { let n = 0; return () => `t${++n}`; }

const KEY = 'kiros.workshop.v1';
const make = (storage = memoryStorage(), extra = {}) =>
  createStore({ storage, key: KEY, now: clock(), idgen: counter(), ...extra });

const VIEW = { lat: 46, lon: -28, alt: 420000, heading: 0, pitch: -40, mode: 'orbit' };

test('a note and a bookmark survive a reload (a new store on the same storage)', () => {
  const storage = memoryStorage();
  const a = make(storage);
  const note = a.add({ kind: 'note', title: 'Veir shore', body: 'Benches above the lake?', anchor: { type: 'place', id: 'veir' } });
  const mark = a.add({ kind: 'bookmark', title: 'Over Veir', anchor: { type: 'view', view: VIEW } });

  const b = make(storage); // simulates a page reload
  assert.equal(b.list().length, 2);
  assert.deepEqual(b.get(note.id), note);
  assert.deepEqual(b.get(mark.id).anchor.view, VIEW);
  assert.equal(b.getProblem(), null);
});

test('add fills id and timestamps; update changes fields and bumps updated, but never id or created', () => {
  const s = make();
  const n = s.add({ kind: 'note', title: 'x', body: 'first' });
  assert.ok(n.id && n.created && n.updated);
  assert.deepEqual(n.tags, []);
  const u = s.update(n.id, { body: 'second', tags: ['veir'] });
  assert.equal(u.body, 'second');
  assert.deepEqual(u.tags, ['veir']);
  assert.equal(u.created, n.created);
  assert.ok(u.updated > n.updated);
  assert.throws(() => s.update(n.id, { id: 'other' }), /id/);
  assert.throws(() => s.update(n.id, { created: '2020-01-01T00:00:00Z' }), /created/);
  assert.equal(s.get(n.id).body, 'second');
});

test('returned items are copies: mutating them does not change the store', () => {
  const s = make();
  const n = s.add({ kind: 'note', title: 'x', body: 'y', tags: ['a'] });
  n.title = 'hacked'; n.tags.push('b');
  s.list()[0].body = 'hacked';
  assert.equal(s.get(n.id).title, 'x');
  assert.deepEqual(s.get(n.id).tags, ['a']);
  assert.equal(s.get(n.id).body, 'y');
});

test('remove deletes, persists, and reports whether anything was removed', () => {
  const storage = memoryStorage();
  const s = make(storage);
  const n = s.add({ kind: 'idea', title: 'dragon nests', body: '' });
  assert.equal(s.remove(n.id), true);
  assert.equal(s.remove(n.id), false);
  assert.equal(make(storage).list().length, 0);
});

test('list filters by kind, place, source and status, newest first', () => {
  const s = make();
  s.add({ kind: 'note', title: 'a', anchor: { type: 'place', id: 'veir' } });
  s.add({ kind: 'note', title: 'b', anchor: { type: 'source', id: 'earth_re', region: { x: 0.1, y: 0.2, w: 0.3, h: 0.3 } } });
  s.add({ kind: 'question', title: 'c', anchor: { type: 'place', id: 'veir' } });
  s.add({ kind: 'proposal', title: 'd', status: 'accepted' });
  assert.deepEqual(s.list({ kind: 'note' }).map(i => i.title), ['b', 'a']);
  assert.deepEqual(s.list({ placeId: 'veir' }).map(i => i.title), ['c', 'a']);
  assert.deepEqual(s.list({ sourceId: 'earth_re' }).map(i => i.title), ['b']);
  assert.deepEqual(s.list({ status: 'accepted' }).map(i => i.title), ['d']);
  assert.deepEqual(s.list({ text: 'C' }).map(i => i.title), ['c']);
});

test('a bookmark requires a view anchor', () => {
  const s = make();
  assert.throws(() => s.add({ kind: 'bookmark', title: 'no view' }), /bookmark.*view/i);
  assert.throws(() => s.add({ kind: 'bookmark', title: 'place', anchor: { type: 'place', id: 'veir' } }), /bookmark.*view/i);
  const b = s.add({ kind: 'bookmark', title: 'ok', anchor: { type: 'view', view: VIEW } });
  assert.throws(() => s.update(b.id, { anchor: null }), /bookmark.*view/i);
  assert.equal(s.list().length, 1);
});

test('proposals stay distinct from canon: no canon kind, proposal status limited to open/accepted/rejected', () => {
  const s = make();
  assert.throws(() => s.add({ kind: 'canon', title: 'Lake Veir is small' }), /kind/);
  assert.throws(() => s.add({ kind: 'proposal', title: 'x', status: 'canon' }), /status/);
  assert.throws(() => s.add({ kind: 'note', title: 'x', canon: true }), /unknown field/i);
  const p = s.add({ kind: 'proposal', title: 'Shrink Lake Veir to the Oct 10 outline' });
  assert.equal(p.status, 'open', 'new proposals default to open');
  assert.throws(() => s.update(p.id, { kind: 'note' }), /kind/, 'a proposal cannot be relabelled into another kind');
  assert.throws(() => s.add({ kind: 'note', title: 'x', status: 'accepted' }), /status/);
  assert.equal(s.list().length, 1);
});

test('strict field validation: types, sizes, coordinates and finite numbers', () => {
  const s = make();
  const bad = [
    [{ kind: 'note', title: 5 }, /title/],
    [{ kind: 'note', title: 'x'.repeat(LIMITS.title + 1) }, /title/],
    [{ kind: 'note', title: 'x', body: 'y'.repeat(LIMITS.body + 1) }, /body/],
    [{ kind: 'note', title: 'x', tags: 'veir' }, /tags/],
    [{ kind: 'note', title: 'x', tags: [3] }, /tags/],
    [{ kind: 'bookmark', title: 'x', anchor: { type: 'view', view: { ...VIEW, lat: 91 } } }, /lat/],
    [{ kind: 'bookmark', title: 'x', anchor: { type: 'view', view: { ...VIEW, lon: -181 } } }, /lon/],
    [{ kind: 'bookmark', title: 'x', anchor: { type: 'view', view: { ...VIEW, alt: Infinity } } }, /alt/],
    [{ kind: 'bookmark', title: 'x', anchor: { type: 'view', view: { ...VIEW, heading: NaN } } }, /heading/],
    [{ kind: 'bookmark', title: 'x', anchor: { type: 'view', view: { ...VIEW, lat: '46' } } }, /lat/],
    [{ kind: 'note', title: 'x', anchor: { type: 'source', id: 'penup', region: { x: 0.5, y: 0, w: 0.9, h: 0.2 } } }, /region/],
    [{ kind: 'note', title: 'x', anchor: { type: 'planet', id: 'kiros' } }, /anchor/],
  ];
  for (const [item, re] of bad) assert.throws(() => s.add(item), re, JSON.stringify(item).slice(0, 80));
  assert.equal(s.list().length, 0);
});

test('export then import into a fresh store reproduces identical items', () => {
  const a = make();
  a.add({ kind: 'note', title: 'n', body: 'line 1\nline 2', tags: ['veir', 'lakes'], anchor: { type: 'place', id: 'veir' } });
  a.add({ kind: 'bookmark', title: 'b', anchor: { type: 'view', view: VIEW } });
  a.add({ kind: 'proposal', title: 'p', body: 'Use the Oct 10 lakes', status: 'rejected' });
  a.add({ kind: 'question', title: 'q', anchor: { type: 'source', id: 'earth_re', region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } } });
  const text = a.exportJSON();
  const parsed = JSON.parse(text);
  assert.equal(parsed.schema, SCHEMA);
  assert.equal(parsed.version, VERSION);

  const b = make();
  const r = b.importJSON(text, { mode: 'replace' });
  assert.deepEqual(r, { ok: true, added: 4, updated: 0, skipped: 0, errors: [] });
  const byId = list => Object.fromEntries(list.map(i => [i.id, i]));
  assert.deepEqual(byId(b.list()), byId(a.list()));
});

test('merge keeps existing items, adds new ones and takes a same-id item from the file when the file copy is newer; replace discards the rest', () => {
  // The file was written an hour after the target's items, so its copy of "shared" is the newer edit.
  const src = make(memoryStorage(), { idgen: () => 'shared', now: clock(Date.parse('2026-10-10T09:00:00Z')) });
  src.add({ kind: 'note', title: 'from file', body: 'imported' });
  const file = JSON.parse(src.exportJSON());
  file.items.push({ ...file.items[0], id: 'brand-new', title: 'another' });
  const text = JSON.stringify(file);

  const target = make(memoryStorage(), { idgen: (() => { const ids = ['shared', 'local']; return () => ids.shift(); })() });
  target.add({ kind: 'note', title: 'old version', body: 'local' }); // id 'shared'
  target.add({ kind: 'idea', title: 'mine only' });                   // id 'local'

  const merged = target.importJSON(text, { mode: 'merge' });
  assert.equal(merged.ok, true);
  assert.equal(merged.added, 1);
  assert.equal(merged.updated, 1);
  assert.equal(merged.skipped, 0);
  assert.equal(target.get('shared').title, 'from file');
  assert.equal(target.get('local').title, 'mine only');
  assert.equal(target.list().length, 3);

  const replaced = target.importJSON(text, { mode: 'replace' });
  assert.equal(replaced.ok, true);
  assert.equal(target.get('local'), null);
  assert.deepEqual(target.list().map(i => i.id).sort(), ['brand-new', 'shared']);
});

test('invalid imports are rejected with readable errors and leave existing data untouched', () => {
  const storage = memoryStorage();
  const s = make(storage);
  s.add({ kind: 'note', title: 'keep me' });
  const before = storage.getItem(KEY);
  const good = JSON.parse(s.exportJSON());
  const item = good.items[0];
  const cases = {
    'not JSON': 'this is not json {',
    'wrong schema': JSON.stringify({ ...good, schema: 'something-else' }),
    'wrong version': JSON.stringify({ ...good, version: 2 }),
    'items not array': JSON.stringify({ ...good, items: {} }),
    'unknown kind': JSON.stringify({ ...good, items: [{ ...item, id: 'z', kind: 'canon' }] }),
    'oversize body': JSON.stringify({ ...good, items: [{ ...item, id: 'z', body: 'x'.repeat(LIMITS.body + 1) }] }),
    'duplicate ids': JSON.stringify({ ...good, items: [{ ...item, id: 'z' }, { ...item, id: 'z' }] }),
    'one bad among good': JSON.stringify({ ...good, items: [{ ...item, id: 'ok1' }, { ...item, id: 'bad', title: null }] }),
    'proto pollution': `{"schema":"${SCHEMA}","version":${VERSION},"items":[{"id":"p","kind":"note","title":"t","body":"","created":"${item.created}","updated":"${item.updated}","tags":[],"__proto__":{"polluted":true}}]}`,
    'constructor key': JSON.stringify({ ...good, items: [{ ...item, id: 'c', anchor: { type: 'place', id: 'veir', constructor: { prototype: {} } } }] }),
    'nonfinite as string': JSON.stringify({ ...good, items: [{ ...item, id: 'v', kind: 'bookmark', anchor: { type: 'view', view: { ...VIEW, alt: '1e999' } } }] }),
    'top-level array': JSON.stringify([item]),
  };
  for (const [name, text] of Object.entries(cases)) {
    for (const mode of ['merge', 'replace']) {
      const r = s.importJSON(text, { mode });
      assert.equal(r.ok, false, `${name} (${mode}) should fail`);
      assert.equal(r.added, 0);
      assert.equal(r.updated, 0);
      assert.ok(r.errors.length > 0 && r.errors.every(e => typeof e === 'string' && e.length > 0), name);
      assert.equal(storage.getItem(KEY), before, `${name} (${mode}) changed storage`);
      assert.deepEqual(s.list().map(i => i.title), ['keep me']);
    }
  }
  assert.equal(({}).polluted, undefined, 'Object.prototype was polluted');
});

test('error messages point at the offending item and field', () => {
  const s = make();
  const good = JSON.parse(s.exportJSON());
  const text = JSON.stringify({ ...good, items: [
    { id: 'a', kind: 'note', title: 'fine', body: '', created: '2026-10-10T08:00:00.000Z', updated: '2026-10-10T08:00:00.000Z', tags: [] },
    { id: 'b', kind: 'bookmark', title: 'bad', body: '', created: '2026-10-10T08:00:00.000Z', updated: '2026-10-10T08:00:00.000Z', tags: [],
      anchor: { type: 'view', view: { ...VIEW, lat: 120 } } }] });
  const r = s.importJSON(text);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('items[1]') && e.includes('lat')), r.errors.join('; '));
});

test('corrupt data in storage does not crash load: it is quarantined under a backup key and the store starts empty', () => {
  for (const raw of ['{not json', JSON.stringify({ schema: 'kiros-workshop', version: 1, items: [{ id: 'x', kind: 'spell' }] }), '"just a string"']) {
    const storage = memoryStorage({ [KEY]: raw });
    const s = make(storage);
    assert.deepEqual(s.list(), []);
    const p = s.getProblem();
    assert.ok(p && p.message.length > 0, 'problem reported');
    assert.equal(storage.getItem(p.backupKey), raw, 'raw data kept under the backup key');
    assert.notEqual(p.backupKey, KEY);
    // The store still works and the backup survives later saves.
    s.add({ kind: 'note', title: 'fresh start' });
    assert.equal(make(storage).list().length, 1);
    assert.equal(storage.getItem(p.backupKey), raw);
  }
});

test('a second, different corruption does not overwrite the first backup', () => {
  const storage = memoryStorage({ [KEY]: 'first bad' });
  const p1 = make(storage).getProblem();
  storage.setItem(KEY, 'second bad');
  const p2 = make(storage).getProblem();
  assert.notEqual(p1.backupKey, p2.backupKey);
  assert.equal(storage.getItem(p1.backupKey), 'first bad');
  assert.equal(storage.getItem(p2.backupKey), 'second bad');
});

test('a failed save (quota) rolls the change back and throws, leaving memory and storage consistent', () => {
  const storage = memoryStorage();
  const s = make(storage);
  s.add({ kind: 'note', title: 'saved' });
  storage.failWrites = true;
  assert.throws(() => s.add({ kind: 'note', title: 'lost' }), /save/i);
  assert.deepEqual(s.list().map(i => i.title), ['saved']);
  storage.failWrites = false;
  assert.deepEqual(make(storage).list().map(i => i.title), ['saved']);
});

test('subscribers hear every change and can unsubscribe', () => {
  const s = make();
  const seen = [];
  const off = s.subscribe(items => seen.push(items.length));
  const n = s.add({ kind: 'note', title: 'a' });
  s.update(n.id, { title: 'b' });
  s.importJSON(s.exportJSON(), { mode: 'replace' });
  s.remove(n.id);
  off();
  s.add({ kind: 'note', title: 'c' });
  assert.deepEqual(seen, [1, 1, 1, 0]);
});

test('works without any storage (e.g. localStorage blocked): in-memory only', () => {
  const s = createStore({ storage: null, now: clock(), idgen: counter() });
  s.add({ kind: 'note', title: 'temp' });
  assert.equal(s.list().length, 1);
});

// ---------- regression tests for data-loss bugs ----------

const docText = items => JSON.stringify({ schema: SCHEMA, version: VERSION, items });
const rawItem = (over = {}) => ({ id: 'x', kind: 'note', title: 'x', body: '', created: '2026-10-10T08:00:00.000Z', updated: '2026-10-10T08:00:00.000Z', tags: [], ...over });

test('merge import never reverts a newer local edit: the older file copy is skipped and counted', () => {
  const storage = memoryStorage();
  const s = make(storage, { idgen: () => 'n1' });
  s.add({ kind: 'note', title: 'draft', body: 'v1' });
  const backup = s.exportJSON();          // the file holds v1
  s.update('n1', { body: 'v2, written after the backup' });
  const r = s.importJSON(backup, { mode: 'merge' });
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.updated, 0);
  assert.equal(r.skipped, 1);
  assert.equal(s.get('n1').body, 'v2, written after the backup');
  assert.equal(make(storage).get('n1').body, 'v2, written after the backup');
});

test('merge import refuses to change an item\'s kind and names the item; nothing is changed', () => {
  const storage = memoryStorage();
  const s = make(storage, { idgen: () => 'p1' });
  s.add({ kind: 'proposal', title: 'Shrink Lake Veir' });
  const before = storage.getItem(KEY);
  const file = docText([rawItem({ id: 'p1', kind: 'idea', title: 'relabelled', updated: '2030-01-01T00:00:00.000Z' })]);
  const r = s.importJSON(file, { mode: 'merge' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('p1') && /proposal/.test(e) && /idea/.test(e)), r.errors.join('; '));
  assert.equal(s.get('p1').kind, 'proposal');
  assert.equal(storage.getItem(KEY), before);
});

test('dates must be ISO 8601 UTC like the store writes; other Date.parse-able text is rejected', () => {
  const s = make();
  for (const bad of ['Sat, 01 Jan 2050 00:00:00 GMT', '2026-10-10', '2026-10-10 08:00:00Z', '2026-02-30T00:00:00.000Z', '2026-10-10T08:00:00+02:00x', 'January 5, 2026']) {
    const r = s.importJSON(docText([rawItem({ updated: bad })]));
    assert.equal(r.ok, false, `"${bad}" should be rejected`);
    assert.ok(r.errors.some(e => e.includes('updated')), r.errors.join('; '));
  }
  assert.throws(() => make(memoryStorage(), { now: () => 'Sat, 01 Jan 2050 00:00:00 GMT' }).add({ kind: 'note', title: 'x' }), /created|updated/);
  assert.equal(s.list().length, 0);
});

test('ISO dates without milliseconds are accepted but stored in the canonical form so newest-first sorting holds', () => {
  const s = make();
  const r = s.importJSON(docText([
    rawItem({ id: 'whole', title: 'whole second', updated: '2026-10-10T08:00:00Z' }),
    rawItem({ id: 'later', title: 'half a second later', updated: '2026-10-10T08:00:00.500Z' })
  ]));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(s.get('whole').updated, '2026-10-10T08:00:00.000Z');
  assert.deepEqual(s.list().map(i => i.id), ['later', 'whole']);
});

test('two tabs (two stores on one storage) do not overwrite each other\'s new items', () => {
  const storage = memoryStorage();
  const a = make(storage, { idgen: () => 'from-a' });
  const b = make(storage, { idgen: () => 'from-b' });
  a.add({ kind: 'note', title: 'written in tab A' });
  b.add({ kind: 'note', title: 'written in tab B' });   // B has never seen A's note
  assert.deepEqual(make(storage).list().map(i => i.id).sort(), ['from-a', 'from-b']);
  assert.deepEqual(b.list().map(i => i.id).sort(), ['from-a', 'from-b'], 'B now holds the merged list too');
});

test('an edit made in another tab is not reverted by this tab\'s next save, and its delete is not undone', () => {
  const storage = memoryStorage({ [KEY]: docText([rawItem({ id: 'keep', body: 'v1' }), rawItem({ id: 'gone', title: 'gone' })]) });
  const a = make(storage, { idgen: () => 'new-a', now: clock(Date.parse('2026-10-10T10:00:00Z')) });
  const b = make(storage, { now: clock(Date.parse('2026-10-10T09:00:00Z')) });
  b.update('keep', { body: 'v2 from tab B' });
  b.remove('gone');
  a.add({ kind: 'idea', title: 'tab A, unaware of B' });
  const after = make(storage);
  assert.equal(after.get('keep').body, 'v2 from tab B');
  assert.equal(after.get('gone'), null, 'the delete in tab B must not be undone by tab A');
  assert.ok(after.get('new-a'));
});

test('an item deleted here is not resurrected by another writer\'s stale copy, but a later edit of it is kept', () => {
  const storage = memoryStorage({ [KEY]: docText([rawItem({ id: 'old' }), rawItem({ id: 'edited-later' })]) });
  const a = make(storage, { idgen: () => 'z', now: clock(Date.parse('2026-10-10T12:00:00Z')) });
  a.remove('old');
  a.remove('edited-later');
  // Another writer (e.g. a tab running an older build) puts back its whole stale list plus its own new item.
  storage.setItem(KEY, docText([rawItem({ id: 'old' }), rawItem({ id: 'edited-later', body: 'edited after the delete', updated: '2026-10-10T13:00:00.000Z' }), rawItem({ id: 'theirs' })]));
  a.add({ kind: 'note', title: 'mine' });
  const ids = make(storage).list().map(i => i.id).sort();
  assert.deepEqual(ids, ['edited-later', 'theirs', 'z']);
});

test('reload() picks up another tab\'s writes and notifies subscribers; it is a no-op when nothing changed', () => {
  const storage = memoryStorage();
  const a = make(storage, { idgen: () => 'a1' });
  const b = make(storage, { idgen: () => 'b1' });
  const seen = [];
  a.subscribe(items => seen.push(items.map(i => i.id)));
  assert.equal(a.reload(), false);
  b.add({ kind: 'note', title: 'from B' });
  assert.equal(a.reload(), true);
  assert.deepEqual(a.list().map(i => i.id), ['b1']);
  assert.deepEqual(seen, [['b1']]);
});

test('replace import refuses to run over changes made in another tab that this tab has not seen', () => {
  const storage = memoryStorage();
  const a = make(storage, { idgen: () => 'a1' });
  const b = make(storage, { idgen: () => 'b1' });
  const file = make().exportJSON();
  b.add({ kind: 'note', title: 'B wrote this after A last looked' });
  const r = a.importJSON(file, { mode: 'replace' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /another tab/i.test(e)), r.errors.join('; '));
  assert.deepEqual(make(storage).list().map(i => i.id), ['b1']);
  assert.deepEqual(a.list().map(i => i.id), ['b1'], 'A reloaded so the user sees what would be replaced');
});

test('if unreadable data cannot be backed up, the store is read-only and never overwrites the only copy', () => {
  const raw = '{"schema":"kiros-workshop","version":1,"items":[{"id":"x","kind":"spell"}]';
  const storage = memoryStorage({ [KEY]: raw });
  storage.failWrites = true;                  // quota full: the backup cannot be written
  const s = make(storage);
  storage.failWrites = false;                 // even once space frees up, nothing may clobber the original
  const p = s.getProblem();
  assert.equal(p.readOnly, true);
  assert.equal(p.backupKey, null);
  assert.match(p.message, /read-only/i);
  assert.equal(s.getUnreadableText(), raw, 'the UI can offer the raw text for download');
  assert.throws(() => s.add({ kind: 'note', title: 'would clobber' }), /read-only/i);
  assert.equal(s.importJSON(make().exportJSON(), { mode: 'replace' }).ok, false);
  assert.equal(storage.getItem(KEY), raw);
  assert.deepEqual(s.list(), []);
  // Only an explicit decision (after downloading) lets the notebook start over.
  s.discardUnreadable();
  s.add({ kind: 'note', title: 'fresh start' });
  assert.deepEqual(make(storage).list().map(i => i.title), ['fresh start']);
});

test('if storage cannot be read at all, the store works in memory and never writes over what it could not read', () => {
  let writes = 0;
  const storage = { getItem() { throw new Error('SecurityError'); }, setItem() { writes++; } };
  const s = make(storage);
  assert.match(s.getProblem().message, /memory only/i);
  s.add({ kind: 'note', title: 'temp' });
  assert.equal(s.list().length, 1);
  assert.equal(writes, 0);
});
