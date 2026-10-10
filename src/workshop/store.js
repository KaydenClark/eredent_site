// Workshop store: Kayden's own notes, questions, proposals, ideas and bookmarks, kept apart from the source canon.
// Pure module (no DOM). Storage is injected and only needs localStorage's getItem/setItem.
//
// File and storage format: { schema: 'kiros-workshop', version: 1, items: [...] }
// Item: { id, kind, title, body, created, updated, tags[], anchor?, status? }
//   kind    note | question | proposal | idea | bookmark
//   status  proposal: open | accepted | rejected ("accepted" = accepted by Kayden in the workshop, never a source edit)
//           question: open | answered
//   anchor  { type: 'place', id } | { type: 'source', id, region?: {x,y,w,h} normalized 0..1 }
//           | { type: 'view', view: { lat, lon, alt, heading, pitch, mode } }
// Bookmarks must carry a view anchor. There is deliberately no "canon" kind: canon lives in the source files.

export const SCHEMA = 'kiros-workshop';
export const VERSION = 1;
export const KINDS = ['note', 'question', 'proposal', 'idea', 'bookmark'];
export const STATUSES = { proposal: ['open', 'accepted', 'rejected'], question: ['open', 'answered'] };
export const LIMITS = { title: 200, body: 20000, tags: 50, tag: 60, id: 100, items: 5000, importChars: 8_000_000, mode: 24 };

const ITEM_KEYS = ['id', 'kind', 'title', 'body', 'created', 'updated', 'tags', 'anchor', 'status'];
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const ID_RE = /^[A-Za-z0-9_.:-]+$/;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Plain-data deep copy that keeps NaN/Infinity visible to validation (a JSON round trip would turn them into null).
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clone(v[k]);
    return o;
  }
  return v;
}

// Any object at any depth with a dangerous key is rejected outright (JSON.parse makes "__proto__" an own key).
function findForbiddenKey(v, path = '') {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { const r = findForbiddenKey(v[i], `${path}[${i}]`); if (r) return r; }
  } else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN.has(k)) return `${path ? path + '.' : ''}${k}`;
      const r = findForbiddenKey(v[k], `${path ? path + '.' : ''}${k}`);
      if (r) return r;
    }
  }
  return null;
}

function checkString(errs, where, v, max, { required = true } = {}) {
  if (v === undefined && !required) return;
  if (typeof v !== 'string') errs.push(`${where}: must be text`);
  else if (v.length > max) errs.push(`${where}: longer than ${max} characters (${v.length})`);
}

function checkNumber(errs, where, v, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${where}: must be a finite number`);
  else if (v < min || v > max) errs.push(`${where}: ${v} is outside ${min}..${max}`);
}

// Times are ISO 8601 UTC, the form Date#toISOString writes. Milliseconds may be left out in a hand-written file;
// stored items always carry the canonical form so that string sorting and comparisons by `updated` are correct.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
function isoDate(v) {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const canonical = new Date(t).toISOString();
  return canonical.slice(0, 19) === v.slice(0, 19) ? canonical : null; // rejects rolled-over dates such as Feb 30
}
const timeOf = v => Date.parse(v);

function checkDate(errs, where, v) {
  if (!isoDate(v)) errs.push(`${where}: must be an ISO 8601 UTC time like 2026-10-10T08:00:00.000Z`);
}

function checkOnlyKeys(errs, where, o, allowed) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errs.push(`${where}: unknown field "${k}"`);
}

export function validateView(view, where = 'view') {
  const errs = [];
  if (!isObj(view)) return [`${where}: must be an object`];
  checkOnlyKeys(errs, where, view, ['lat', 'lon', 'alt', 'heading', 'pitch', 'mode']);
  checkNumber(errs, `${where}.lat`, view.lat, -90, 90);
  checkNumber(errs, `${where}.lon`, view.lon, -180, 180);
  checkNumber(errs, `${where}.alt`, view.alt, -20000, 1e9);
  if (view.heading !== undefined && view.heading !== null) checkNumber(errs, `${where}.heading`, view.heading, -720, 720);
  if (view.pitch !== undefined && view.pitch !== null) checkNumber(errs, `${where}.pitch`, view.pitch, -90, 90);
  if (view.mode !== undefined && view.mode !== null) {
    if (typeof view.mode !== 'string' || !/^[a-z][a-z0-9-]*$/.test(view.mode) || view.mode.length > LIMITS.mode) errs.push(`${where}.mode: must be a short lowercase word`);
  }
  return errs;
}

function validateAnchor(errs, where, a) {
  if (!isObj(a)) { errs.push(`${where}: must be an object or null`); return; }
  if (a.type === 'place') {
    checkOnlyKeys(errs, where, a, ['type', 'id']);
    checkId(errs, `${where}.id`, a.id);
  } else if (a.type === 'source') {
    checkOnlyKeys(errs, where, a, ['type', 'id', 'region']);
    checkId(errs, `${where}.id`, a.id);
    if (a.region !== undefined && a.region !== null) {
      const r = a.region, w = `${where}.region`;
      if (!isObj(r)) { errs.push(`${w}: must be an object`); return; }
      checkOnlyKeys(errs, w, r, ['x', 'y', 'w', 'h']);
      const n0 = errs.length;
      checkNumber(errs, `${w}.x`, r.x, 0, 1); checkNumber(errs, `${w}.y`, r.y, 0, 1);
      checkNumber(errs, `${w}.w`, r.w, 0, 1); checkNumber(errs, `${w}.h`, r.h, 0, 1);
      if (errs.length === n0 && (r.w <= 0 || r.h <= 0 || r.x + r.w > 1.000001 || r.y + r.h > 1.000001)) errs.push(`${w}: must be a non-empty box inside the image (0..1)`);
    }
  } else if (a.type === 'view') {
    checkOnlyKeys(errs, where, a, ['type', 'view']);
    errs.push(...validateView(a.view, `${where}.view`));
  } else {
    errs.push(`${where}.type: must be "place", "source" or "view"`);
  }
}

function checkId(errs, where, v) {
  if (typeof v !== 'string' || !v.length || v.length > LIMITS.id || !ID_RE.test(v)) errs.push(`${where}: must be a short id (letters, digits, - _ . :)`);
}

// Validates a complete stored item. Returns a list of readable errors (empty = valid).
export function validateItem(item, where = 'item') {
  const errs = [];
  if (!isObj(item)) return [`${where}: must be an object`];
  const bad = findForbiddenKey(item);
  if (bad) return [`${where}: forbidden key "${bad}"`];
  checkOnlyKeys(errs, where, item, ITEM_KEYS);
  checkId(errs, `${where}.id`, item.id);
  if (!KINDS.includes(item.kind)) errs.push(`${where}.kind: "${String(item.kind).slice(0, 40)}" is not one of ${KINDS.join(', ')}`);
  checkString(errs, `${where}.title`, item.title, LIMITS.title);
  checkString(errs, `${where}.body`, item.body, LIMITS.body);
  checkDate(errs, `${where}.created`, item.created);
  checkDate(errs, `${where}.updated`, item.updated);
  if (!Array.isArray(item.tags)) errs.push(`${where}.tags: must be a list of text`);
  else {
    if (item.tags.length > LIMITS.tags) errs.push(`${where}.tags: more than ${LIMITS.tags} tags`);
    item.tags.forEach((t, i) => checkString(errs, `${where}.tags[${i}]`, t, LIMITS.tag));
  }
  if (item.anchor !== undefined && item.anchor !== null) validateAnchor(errs, `${where}.anchor`, item.anchor);
  const allowed = STATUSES[item.kind];
  if (allowed) {
    if (!allowed.includes(item.status)) errs.push(`${where}.status: must be one of ${allowed.join(', ')} for a ${item.kind}`);
  } else if (item.status !== undefined) {
    errs.push(`${where}.status: a ${item.kind} has no status`);
  }
  if (item.kind === 'bookmark' && !(isObj(item.anchor) && item.anchor.type === 'view')) errs.push(`${where}: a bookmark needs a view anchor`);
  return errs;
}

// Validates a whole file/storage document. Returns { items, errors }.
export function validateDocument(doc) {
  if (!isObj(doc)) return { items: [], errors: ['The file must be a JSON object with schema, version and items.'] };
  const bad = findForbiddenKey(doc);
  if (bad) return { items: [], errors: [`Forbidden key "${bad}" in the file.`] };
  const errors = [];
  if (doc.schema !== SCHEMA) errors.push(`schema: expected "${SCHEMA}", found ${JSON.stringify(doc.schema)?.slice(0, 60)}`);
  if (doc.version !== VERSION) errors.push(`version: expected ${VERSION}, found ${JSON.stringify(doc.version)?.slice(0, 20)}`);
  checkOnlyKeys(errors, 'file', doc, ['schema', 'version', 'items', 'exported']);
  if (doc.exported !== undefined) checkDate(errors, 'exported', doc.exported);
  if (!Array.isArray(doc.items)) { errors.push('items: must be a list'); return { items: [], errors }; }
  if (doc.items.length > LIMITS.items) errors.push(`items: more than ${LIMITS.items} items`);
  const seen = new Set();
  doc.items.forEach((it, i) => {
    errors.push(...validateItem(it, `items[${i}]`));
    if (isObj(it) && typeof it.id === 'string') {
      if (seen.has(it.id)) errors.push(`items[${i}].id: duplicate id "${it.id.slice(0, 40)}"`);
      seen.add(it.id);
    }
  });
  return { items: errors.length ? [] : doc.items.map(normalize), errors };
}

// Canonical field order and only known fields, so stored and exported items compare equal.
function normalize(it) {
  const out = { id: it.id, kind: it.kind, title: it.title, body: it.body, created: isoDate(it.created), updated: isoDate(it.updated), tags: [...it.tags] };
  if (it.anchor) out.anchor = clone(it.anchor);
  if (it.status !== undefined) out.status = it.status;
  return out;
}

function defaultId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class ValidationError extends Error {
  constructor(errors) { super(errors.join('; ')); this.name = 'ValidationError'; this.errors = errors; }
}


// Parses stored or imported text. Returns { items, errors }.
function parseDocument(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return { items: [], errors: ['Saved workshop data is not valid JSON.'] }; }
  return validateDocument(doc);
}

const summarize = errors => `${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '; …' : ''}`;
const sameItem = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Several tabs may share one storage key. Every save re-reads storage first: if another tab wrote since this store
// last read or wrote, the two lists are merged (newer `updated` wins; deletes on either side are respected) before
// saving, so neither tab's work is lost. reload() adopts another tab's writes (call it on the window "storage" event).
// If stored data cannot be read and cannot be backed up either, the store goes read-only rather than overwrite the
// only copy: getProblem().readOnly is true, getUnreadableText() returns the original, discardUnreadable() lifts it.
export function createStore({ storage = null, key = 'kiros.workshop.v1', now = () => new Date().toISOString(), idgen = defaultId } = {}) {
  let items = [];
  let problem = null;
  let readOnly = false;
  let unreadable = null;     // original text kept in memory when it could be neither loaded nor backed up
  let lastRaw = null;        // the storage text this store last read or wrote
  let base = [];             // the items that text held: the common ancestor for merging with other tabs
  const deleted = new Map(); // id -> time (ms) this store deleted it, so a stale copy elsewhere cannot bring it back
  const subs = new Set();

  // ---- load (never throws) ----
  let raw = null;
  if (storage) {
    try { raw = storage.getItem(key); } catch (e) {
      // What is stored could not be seen, so it must never be written over: work in memory only.
      storage = null;
      problem = { message: `Browser storage could not be read (${e.message}). Working in memory only: nothing is saved, so export to keep your work.`, backupKey: null };
    }
  }
  if (raw !== null && raw !== undefined) {
    lastRaw = raw;
    const { items: loaded, errors } = parseDocument(raw);
    if (!errors.length) {
      items = loaded; base = loaded;
    } else {
      const backupKey = quarantine(raw);
      if (backupKey) {
        problem = {
          message: `Saved workshop data could not be loaded (${summarize(errors)}). The original text was kept in browser storage under "${backupKey}". Starting with an empty notebook.`,
          backupKey, errors
        };
      } else {
        readOnly = true; unreadable = raw;
        problem = {
          message: `Saved workshop data could not be loaded (${summarize(errors)}), and it could not be backed up (browser storage may be full). ` +
            'The notebook is read-only so that the only copy is not overwritten. Download the unreadable data first; then you can start a fresh notebook.',
          backupKey: null, readOnly: true, errors
        };
      }
    }
  }

  function quarantine(text) {
    const qbase = `${key}.corrupt`;
    try {
      let k = qbase, n = 1;
      while (true) {
        const existing = storage.getItem(k);
        if (existing === null || existing === undefined || existing === text) break;
        k = `${qbase}.${++n}`;
      }
      storage.setItem(k, text);
      return k;
    } catch { return null; }
  }

  const docOf = list => ({ schema: SCHEMA, version: VERSION, items: list });
  const readOnlyMessage = () => 'The workshop is read-only: saved data could not be loaded or backed up, so nothing is saved until it is downloaded and discarded.';

  function notify() {
    const snapshot = list();
    for (const fn of subs) { try { fn(snapshot); } catch { /* a broken subscriber must not break saving */ } }
  }

  // Three-way merge of this store's candidate list with what another tab saved, using `base` as the common ancestor.
  function mergeWithStored(ours, theirs) {
    const baseById = new Map(base.map(i => [i.id, i]));
    const theirsById = new Map(theirs.map(i => [i.id, i]));
    const ourIds = new Set(ours.map(i => i.id));
    const out = [];
    for (const o of ours) {
      const t = theirsById.get(o.id);
      if (t) { out.push(timeOf(t.updated) > timeOf(o.updated) ? t : o); continue; }
      const b = baseById.get(o.id);
      if (b && sameItem(b, o)) continue; // deleted in another tab and not changed here since
      out.push(o);
    }
    for (const t of theirs) {
      if (ourIds.has(t.id)) continue;
      const gone = deleted.get(t.id);
      if (gone !== undefined && !(timeOf(t.updated) > gone)) continue; // deleted here; that copy is no newer than the delete
      out.push(t);
    }
    return out;
  }

  function storedText() {
    try { return storage.getItem(key); } catch (e) { throw new Error(`Could not save the workshop (${e.message}). The change was not kept.`); }
  }
  const changedElsewhere = cur => cur !== null && cur !== undefined && cur !== lastRaw;

  // Persist a candidate list; on failure keep the old one and throw.
  function commit(next, { sync = true } = {}) {
    if (readOnly) throw new Error(readOnlyMessage());
    if (storage) {
      const cur = storedText();
      if (sync && changedElsewhere(cur)) {
        const theirs = parseDocument(cur);
        if (theirs.errors.length) {
          // Something wrote data this page cannot read: keep a copy before saving over it.
          const backupKey = quarantine(cur);
          if (!backupKey) throw new Error('Could not save the workshop: the saved data was changed elsewhere into a form this page cannot read, and it could not be backed up. The change was not kept.');
          problem = { message: `Saved workshop data was changed elsewhere and could not be read (${summarize(theirs.errors)}). It was kept under "${backupKey}".`, backupKey, errors: theirs.errors };
        } else {
          next = mergeWithStored(next, theirs.items);
        }
        if (next.length > LIMITS.items) throw new Error(`Could not save the workshop: together with changes from another tab it would exceed ${LIMITS.items} items. The change was not kept.`);
      }
      const text = JSON.stringify(docOf(next));
      try { storage.setItem(key, text); }
      catch (e) { throw new Error(`Could not save the workshop (${e.message}). The change was not kept.`); }
      lastRaw = text; base = next;
    }
    items = next;
    for (const it of next) deleted.delete(it.id);
    notify();
  }

  // Adopt what another tab saved. Returns true when the stored data had changed and was taken in.
  function reload() {
    if (!storage) return false;
    let cur;
    try { cur = storage.getItem(key); } catch { return false; }
    if (!changedElsewhere(cur)) return false; // unchanged, or cleared elsewhere: the next save writes this list back
    const theirs = parseDocument(cur);
    if (theirs.errors.length) return false;   // the next save backs it up before writing
    if (readOnly) { items = theirs.items; readOnly = false; unreadable = null; problem = null; }
    else items = mergeWithStored(items, theirs.items);
    lastRaw = cur; base = theirs.items;
    notify();
    return true;
  }

  function discardUnreadable() {
    if (!readOnly) return false;
    readOnly = false; unreadable = null; problem = null;
    notify();
    return true;
  }

  function list(filter = {}) {
    let out = items;
    if (filter.kind) out = out.filter(i => i.kind === filter.kind);
    if (filter.status) out = out.filter(i => i.status === filter.status);
    if (filter.anchorType) out = out.filter(i => i.anchor?.type === filter.anchorType);
    if (filter.placeId) out = out.filter(i => i.anchor?.type === 'place' && i.anchor.id === filter.placeId);
    if (filter.sourceId) out = out.filter(i => i.anchor?.type === 'source' && i.anchor.id === filter.sourceId);
    if (filter.text) {
      const q = String(filter.text).toLowerCase();
      out = out.filter(i => (i.title + '\n' + i.body + '\n' + i.tags.join(' ')).toLowerCase().includes(q));
    }
    return out.map(clone).sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  }

  function get(id) { const it = items.find(i => i.id === id); return it ? clone(it) : null; }

  function add(input) {
    if (readOnly) throw new Error(readOnlyMessage());
    if (!isObj(input)) throw new ValidationError(['item: must be an object']);
    const bad = findForbiddenKey(input);
    if (bad) throw new ValidationError([`item: forbidden key "${bad}"`]);
    const t = now();
    const item = {
      title: '', body: '', tags: [], ...clone(input),
      id: input.id ?? idgen(), created: t, updated: t
    };
    if (STATUSES[item.kind] && item.status === undefined) item.status = 'open';
    if (item.anchor === null) delete item.anchor;
    const errs = validateItem(item);
    if (!errs.length && items.some(i => i.id === item.id)) errs.push(`item.id: "${item.id}" already exists`);
    if (errs.length) throw new ValidationError(errs);
    const n = normalize(item);
    commit([...items, n]);
    return clone(n);
  }

  function update(id, patch) {
    if (readOnly) throw new Error(readOnlyMessage());
    const cur = items.find(i => i.id === id);
    if (!cur) throw new Error(`No workshop item with id "${id}"`);
    if (!isObj(patch)) throw new ValidationError(['patch: must be an object']);
    const bad = findForbiddenKey(patch);
    if (bad) throw new ValidationError([`patch: forbidden key "${bad}"`]);
    if (own(patch, 'id') && patch.id !== cur.id) throw new ValidationError(['patch.id: the id cannot change']);
    if (own(patch, 'created') && patch.created !== cur.created) throw new ValidationError(['patch.created: the creation time cannot change']);
    if (own(patch, 'kind') && patch.kind !== cur.kind) throw new ValidationError([`patch.kind: a ${cur.kind} cannot become a ${patch.kind}; make a new item instead`]);
    const next = { ...clone(cur), ...clone(patch), id: cur.id, created: cur.created, updated: now() };
    if (next.anchor === null) delete next.anchor;
    if (timeOf(next.updated) <= timeOf(cur.updated)) next.updated = new Date(timeOf(cur.updated) + 1).toISOString();
    const errs = validateItem(next);
    if (errs.length) throw new ValidationError(errs);
    const n = normalize(next);
    commit(items.map(i => (i.id === id ? n : i)));
    return clone(n);
  }

  function remove(id) {
    if (readOnly) throw new Error(readOnlyMessage());
    if (!items.some(i => i.id === id)) return false;
    const prev = deleted.get(id);
    const at = timeOf(now());
    deleted.set(id, Number.isFinite(at) ? at : Date.now());
    try { commit(items.filter(i => i.id !== id)); }
    catch (e) { if (prev === undefined) deleted.delete(id); else deleted.set(id, prev); throw e; }
    return true;
  }

  function exportJSON() {
    return JSON.stringify({ schema: SCHEMA, version: VERSION, exported: now(), items: list() }, null, 2);
  }

  // merge: new ids are added; for an id already here the copy with the newer `updated` is kept (the other is counted
  // as skipped), and an item can never change kind. replace: the file becomes the notebook.
  function importJSON(text, { mode = 'merge' } = {}) {
    const fail = errors => ({ ok: false, added: 0, updated: 0, skipped: 0, errors });
    if (mode !== 'merge' && mode !== 'replace') return fail([`Unknown import mode "${mode}" (use merge or replace).`]);
    if (readOnly) return fail([readOnlyMessage()]);
    if (typeof text !== 'string') return fail(['The import must be text.']);
    if (text.length > LIMITS.importChars) return fail([`The file is too large (${text.length} characters, limit ${LIMITS.importChars}).`]);
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return fail([`Not valid JSON: ${e.message}`]); }
    const { items: incoming, errors } = validateDocument(doc);
    const capped = list => (list.length > 30 ? [...list.slice(0, 30), `…and ${list.length - 30} more problems`] : list);
    if (errors.length) return fail(capped(errors));

    let next, added = 0, updated = 0, skipped = 0, sync = true;
    if (mode === 'replace') {
      // Replacing is confirmed against what this tab shows; never let it silently wipe another tab's newer work.
      if (storage) {
        let cur;
        try { cur = storedText(); } catch (e) { return fail([e.message]); }
        if (changedElsewhere(cur)) {
          reload();
          return fail(['Your notebook was changed in another tab since this one last loaded it. It has been reloaded here; check it, then import again.']);
        }
      }
      next = incoming; added = incoming.length; sync = false;
    } else {
      const byId = new Map(items.map(i => [i.id, i]));
      const kindErrors = [];
      incoming.forEach((it, i) => {
        const cur = byId.get(it.id);
        if (!cur) { added++; byId.set(it.id, it); return; }
        if (cur.kind !== it.kind) {
          kindErrors.push(`items[${i}] (id "${it.id.slice(0, 40)}"): your notebook has this as a ${cur.kind} and the file has it as a ${it.kind}; a ${cur.kind} cannot become a ${it.kind}.`);
          return;
        }
        if (sameItem(cur, it)) return;
        if (timeOf(it.updated) > timeOf(cur.updated)) { updated++; byId.set(it.id, it); }
        else skipped++; // your copy is as new or newer: keep it
      });
      if (kindErrors.length) return fail(capped(kindErrors));
      next = [...byId.values()];
      if (next.length > LIMITS.items) return fail([`Merging would exceed ${LIMITS.items} items.`]);
    }
    try { commit(next, { sync }); } catch (e) { return fail([e.message]); }
    return { ok: true, added, updated, skipped, errors: [] };
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  return {
    list, get, add, update, remove, exportJSON, importJSON, subscribe, reload, discardUnreadable,
    getProblem: () => (problem ? clone(problem) : null),
    getUnreadableText: () => unreadable,
    isReadOnly: () => readOnly,
    key
  };
}
