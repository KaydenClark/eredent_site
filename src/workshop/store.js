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

function checkDate(errs, where, v) {
  if (typeof v !== 'string' || v.length > 40 || !Number.isFinite(Date.parse(v))) errs.push(`${where}: must be an ISO date`);
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
  const out = { id: it.id, kind: it.kind, title: it.title, body: it.body, created: it.created, updated: it.updated, tags: [...it.tags] };
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

export function createStore({ storage = null, key = 'kiros.workshop.v1', now = () => new Date().toISOString(), idgen = defaultId } = {}) {
  let items = [];
  let problem = null;
  const subs = new Set();

  // ---- load (never throws) ----
  let raw = null;
  try { raw = storage ? storage.getItem(key) : null; } catch (e) { problem = { message: `Browser storage could not be read (${e.message}). Working in memory only.`, backupKey: null }; }
  if (raw !== null && raw !== undefined) {
    let doc, errors;
    try { doc = JSON.parse(raw); } catch { errors = ['Saved workshop data is not valid JSON.']; }
    if (!errors) ({ items, errors } = validateDocument(doc));
    if (errors.length) {
      items = [];
      const backupKey = quarantine(raw);
      problem = {
        message: `Saved workshop data could not be loaded (${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '; …' : ''}). ` +
          (backupKey ? `The original text was kept in browser storage under "${backupKey}". Starting with an empty notebook.` : 'It could not be backed up.'),
        backupKey, errors
      };
    }
  }

  function quarantine(text) {
    const base = `${key}.corrupt`;
    try {
      let k = base, n = 1;
      while (true) {
        const existing = storage.getItem(k);
        if (existing === null || existing === undefined || existing === text) break;
        k = `${base}.${++n}`;
      }
      storage.setItem(k, text);
      return k;
    } catch { return null; }
  }

  const docOf = list => ({ schema: SCHEMA, version: VERSION, items: list });

  // Persist a candidate list; on failure keep the old one and throw.
  function commit(next) {
    if (storage) {
      try { storage.setItem(key, JSON.stringify(docOf(next))); }
      catch (e) { throw new Error(`Could not save the workshop (${e.message}). The change was not kept.`); }
    }
    items = next;
    const snapshot = list();
    for (const fn of subs) { try { fn(snapshot); } catch { /* a broken subscriber must not break saving */ } }
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
    if (next.updated <= cur.updated) next.updated = new Date(Date.parse(cur.updated) + 1).toISOString();
    const errs = validateItem(next);
    if (errs.length) throw new ValidationError(errs);
    const n = normalize(next);
    commit(items.map(i => (i.id === id ? n : i)));
    return clone(n);
  }

  function remove(id) {
    if (!items.some(i => i.id === id)) return false;
    commit(items.filter(i => i.id !== id));
    return true;
  }

  function exportJSON() {
    return JSON.stringify({ schema: SCHEMA, version: VERSION, exported: now(), items: list() }, null, 2);
  }

  function importJSON(text, { mode = 'merge' } = {}) {
    const fail = errors => ({ ok: false, added: 0, updated: 0, errors });
    if (mode !== 'merge' && mode !== 'replace') return fail([`Unknown import mode "${mode}" (use merge or replace).`]);
    if (typeof text !== 'string') return fail(['The import must be text.']);
    if (text.length > LIMITS.importChars) return fail([`The file is too large (${text.length} characters, limit ${LIMITS.importChars}).`]);
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return fail([`Not valid JSON: ${e.message}`]); }
    const { items: incoming, errors } = validateDocument(doc);
    if (errors.length) return fail(errors.length > 30 ? [...errors.slice(0, 30), `…and ${errors.length - 30} more problems`] : errors);

    let next, added = 0, updated = 0;
    if (mode === 'replace') {
      next = incoming; added = incoming.length;
    } else {
      const byId = new Map(items.map(i => [i.id, i]));
      for (const it of incoming) {
        if (byId.has(it.id)) { if (JSON.stringify(byId.get(it.id)) !== JSON.stringify(it)) updated++; }
        else added++;
        byId.set(it.id, it);
      }
      next = [...byId.values()];
      if (next.length > LIMITS.items) return fail([`Merging would exceed ${LIMITS.items} items.`]);
    }
    try { commit(next); } catch (e) { return fail([e.message]); }
    return { ok: true, added, updated, errors: [] };
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  return { list, get, add, update, remove, exportJSON, importJSON, subscribe, getProblem: () => (problem ? clone(problem) : null), key };
}
