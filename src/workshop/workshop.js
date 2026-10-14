// The Workshop: the "Develop" half of Kiros. Browse and zoom every source, compare map versions, jump to places,
// and keep Kayden's own notes, questions, proposals, ideas and bookmarks (stored locally, exportable), plus a brief
// to paste into Claude or Codex. Nothing here edits a source file or draws into the 3D world.
//
// mountWorkshop(host)
//   host.getView()            -> { lat, lon, alt, heading, pitch, mode } of the current camera
//   host.flyTo(view)          fly the camera to such a view
//   host.places               the PLACES list from src/places.js
//   host.setOverlay(name, opacity)  optional: drape 'penup' | 'earth_re' ink on the globe, null to remove
//   host.onOpenChange(open)   optional: told when the panel opens or closes
// Returns { open(tab?), close(), toggle(), isOpen(), openSource(id, region?), store, destroy() }.
// Keyboard: J toggles the panel (when focus is not in a text field). Escape closes the viewer, then the panel.

import './workshop.css';
import { createStore, validateView, KINDS, STATUSES } from './store.js';
import { buildBrief, describeView, describeRegion } from './brief.js';
import { SOURCES, AUTHORITY, DRIVE_FOLDER, srcUrl, loadComparison, mergeComparison, derivedImages, DERIVED_GUESSES, comparisonLakes, comparisonFindings, frameLegend, fmtNumber } from './sources.js';
import { DISCREPANCIES } from './discrepancies.js';
import { createPanZoom } from './panzoom.js';
import { renderMarkdown } from './markdown.js';

const STORAGE_KEY = 'kiros.workshop.v1';
const TOGGLE_KEY = 'j';
const KIND_LABEL = { note: 'Note', question: 'Question', proposal: 'Proposal', idea: 'Idea', bookmark: 'Bookmark' };
const TABS = [['sources', 'Sources'], ['compare', 'Compare'], ['places', 'Places'], ['notebook', 'Notebook'], ['brief', 'Brief']];

const thumbFor = id => new URL(`./thumbs/${id}.jpg`, import.meta.url).href;

// ---------- tiny DOM helper (text only; never innerHTML) ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
// Element.append would print null/false as text, so optional children go through this.
const app = (el, ...kids) => el.append(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false));
const btn = (label, onclick, attrs = {}) => h('button', { type: 'button', class: 'ws-btn', onclick, ...attrs }, label);

const isEditable = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeStorage() {
  try { const s = globalThis.localStorage; const k = '__kiros_ws_probe__'; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}

// Great-circle distance in degrees, for "near <place>" bookmark titles.
function arcDeg(a, b) {
  const r = Math.PI / 180;
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lon - b.lon) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

export function mountWorkshop(host = {}) {
  const places = Array.isArray(host.places) ? host.places : [];
  const placeById = id => places.find(p => p.id === id) || null;
  const storage = safeStorage();
  const store = createStore({ storage, key: STORAGE_KEY });
  let sources = SOURCES.map(s => ({ ...s }));
  let comparison = null;
  let derived = { all: [] };
  const sourceById = id => sources.find(s => s.id === id) || null;
  const cleanups = [];
  let open = false;
  let activeTab = 'sources';
  let lastFocus = null;

  // ---------- shell ----------
  const toggle = h('button', { type: 'button', class: 'ws-toggle', 'aria-expanded': 'false', 'aria-controls': 'ws-panel', title: 'Workshop: sources, notes and questions (J)' },
    'Workshop', h('kbd', { 'aria-hidden': 'true' }, 'J'));
  const live = h('div', { class: 'ws-sr', 'aria-live': 'polite', role: 'status' });
  const tabButtons = {};
  const panels = {};
  const tablist = h('div', { class: 'ws-tabs', role: 'tablist', 'aria-label': 'Workshop sections' });
  for (const [id, label] of TABS) {
    tabButtons[id] = h('button', { type: 'button', role: 'tab', id: `ws-tab-${id}`, 'aria-controls': `ws-pane-${id}`, 'aria-selected': 'false', tabindex: '-1', class: 'ws-tab', onclick: () => selectTab(id) }, label);
    tablist.appendChild(tabButtons[id]);
    panels[id] = h('section', { class: 'ws-pane', role: 'tabpanel', id: `ws-pane-${id}`, 'aria-labelledby': `ws-tab-${id}`, hidden: true, tabindex: '-1' });
  }
  tablist.addEventListener('keydown', e => {
    const ids = TABS.map(t => t[0]);
    const i = ids.indexOf(activeTab);
    const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : null;
    if (next) { e.preventDefault(); selectTab(next); tabButtons[next].focus(); }
  });
  const closeBtn = btn('Close', () => setOpen(false), { class: 'ws-btn ws-close', 'aria-label': 'Close workshop (Escape)' });
  const panel = h('aside', { id: 'ws-panel', class: 'ws', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Workshop', hidden: true },
    h('header', { class: 'ws-head' },
      h('div', { class: 'ws-title' }, h('h2', {}, 'Workshop'), h('p', {}, 'Sources, comparisons and your own notes. Nothing here changes the sources.')),
      closeBtn),
    tablist,
    h('div', { class: 'ws-body' }, Object.values(panels)),
    live);
  app(document.body, toggle, panel);

  const say = msg => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };

  // Keys typed inside the panel never reach the 3D controls (they listen on window).
  const panelKeys = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (viewer.isOpen()) viewer.close(); else setOpen(false);
    } else if (e.key.toLowerCase() === TOGGLE_KEY && !isEditable(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); setOpen(false);
    }
    e.stopPropagation();
  };
  panel.addEventListener('keydown', panelKeys);
  panel.addEventListener('keyup', e => e.stopPropagation());
  panel.addEventListener('keypress', e => e.stopPropagation());

  const globalKeys = e => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() !== TOGGLE_KEY || isEditable(e.target) || panel.contains(e.target)) return;
    e.preventDefault();
    setOpen(!open);
  };
  addEventListener('keydown', globalKeys);
  cleanups.push(() => removeEventListener('keydown', globalKeys));
  toggle.addEventListener('click', () => setOpen(!open));

  function setOpen(v) {
    if (v === open) return;
    open = v;
    panel.hidden = !v;
    toggle.setAttribute('aria-expanded', String(v));
    document.documentElement.classList.toggle('ws-open', v);
    if (v) {
      lastFocus = document.activeElement;
      selectTab(activeTab, { focus: true });
    } else {
      viewer.close({ silent: true });
      compare.stopBlink();
      const back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : toggle;
      back.focus?.({ preventScroll: true });
    }
    try { host.onOpenChange?.(v); } catch (err) { console.warn('workshop onOpenChange failed', err); }
  }

  const rendered = {};
  function selectTab(id, { focus = false } = {}) {
    activeTab = id;
    for (const [tid] of TABS) {
      const on = tid === id;
      tabButtons[tid].setAttribute('aria-selected', String(on));
      tabButtons[tid].tabIndex = on ? 0 : -1;
      panels[tid].hidden = !on;
    }
    if (id !== 'compare') compare.stopBlink();
    if (id !== 'sources' && viewer.isOpen()) viewer.close({ silent: true });
    if (!rendered[id] || id === 'brief' || id === 'places') { renderTab(id); rendered[id] = true; }
    if (focus) tabButtons[id].focus();
  }

  function renderTab(id) {
    if (id === 'sources') renderSources();
    else if (id === 'compare') compare.render();
    else if (id === 'places') renderPlaces();
    else if (id === 'notebook') renderNotebook();
    else if (id === 'brief') renderBrief();
  }

  // Another tab saved the notebook: take its changes in (open edit forms are kept by renderNotebookList).
  const onStorage = e => { if (e.key === STORAGE_KEY || e.key === null) store.reload(); };
  addEventListener('storage', onStorage);
  cleanups.push(() => removeEventListener('storage', onStorage));

  store.subscribe(() => {
    if (rendered.notebook) renderNotebookList();
    if (rendered.places && activeTab === 'places') renderPlaces();
    if (rendered.brief && activeTab === 'brief') renderBrief();
    viewer.refreshNotes();
  });

  // ---------- shared bits ----------
  const statusClass = st => `ws-badge ws-badge--${String(st || '').toLowerCase().replace(/[^a-z]+/g, '-')}`;
  const badge = st => (st ? h('span', { class: statusClass(st) }, st) : null);

  function anchorText(a) {
    if (!a) return '';
    if (a.type === 'place') return `Place: ${placeById(a.id)?.name || a.id}`;
    if (a.type === 'source') return `Source: ${sourceById(a.id)?.title || a.id}${a.region ? ` (${describeRegion(a.region)})` : ''}`;
    if (a.type === 'view') return `View: ${describeView(a.view)}`;
    return '';
  }

  function goToView(view) {
    if (!view || typeof host.flyTo !== 'function') { say('The 3D view is not available.'); return; }
    try { host.flyTo(view); say('Flying there.'); } catch (err) { say(`Could not fly there: ${err.message}`); }
  }

  // A compact add-item form, used from sources, places and the notebook.
  function itemForm({ kinds = ['note', 'question', 'proposal', 'idea'], kind = 'note', title = '', body = '', anchor = null, regionToggle = null, onDone, submitLabel = 'Save' }) {
    const uid = Math.random().toString(36).slice(2, 8);
    const kindSel = h('select', { id: `ws-k-${uid}` }, kinds.map(k => h('option', { value: k, selected: k === kind }, KIND_LABEL[k])));
    const titleIn = h('input', { id: `ws-t-${uid}`, type: 'text', maxlength: 200, value: title, required: true, placeholder: 'Short title' });
    const bodyIn = h('textarea', { id: `ws-b-${uid}`, rows: 4, maxlength: 20000, placeholder: 'Details, evidence, what you want to decide…' });
    bodyIn.value = body;
    const tagsIn = h('input', { id: `ws-g-${uid}`, type: 'text', placeholder: 'tags, comma separated' });
    const err = h('p', { class: 'ws-error', role: 'alert' });
    const propNote = h('p', { class: 'ws-hint ws-hint--proposal', hidden: kind !== 'proposal' }, 'Proposal: a decision you are considering. It stays marked "not canon" and never edits a source.');
    kindSel.addEventListener('change', () => { propNote.hidden = kindSel.value !== 'proposal'; });
    const form = h('form', { class: 'ws-form', novalidate: true },
      h('div', { class: 'ws-form-row' },
        h('label', { for: kindSel.id }, 'Kind'), kindSel,
        h('label', { for: titleIn.id }, 'Title'), titleIn),
      propNote,
      h('label', { for: bodyIn.id, class: 'ws-sr' }, 'Body'), bodyIn,
      h('label', { for: tagsIn.id, class: 'ws-sr' }, 'Tags'), tagsIn,
      regionToggle,
      err,
      h('div', { class: 'ws-actions' },
        h('button', { type: 'submit', class: 'ws-btn ws-btn--primary' }, submitLabel),
        btn('Cancel', () => onDone?.(null))));
    form.addEventListener('submit', e => {
      e.preventDefault();
      err.textContent = '';
      const t = titleIn.value.trim();
      if (!t) { err.textContent = 'Give it a short title.'; titleIn.focus(); return; }
      const a = typeof anchor === 'function' ? anchor() : anchor;
      try {
        const it = store.add({ kind: kindSel.value, title: t, body: bodyIn.value, tags: tagsIn.value.split(',').map(s => s.trim()).filter(Boolean), ...(a ? { anchor: a } : {}) });
        say(`${KIND_LABEL[it.kind]} saved.`);
        onDone?.(it);
      } catch (ex) { err.textContent = ex.errors ? ex.errors.join(' · ') : ex.message; }
    });
    setTimeout(() => titleIn.focus(), 0);
    return form;
  }

  // ---------- Sources tab ----------
  let sourceFilter = 'all';
  function renderSources() {
    const pane = panels.sources;
    pane.textContent = '';
    const filters = [['all', 'All'], ['image', 'Maps and drawings'], ['text', 'Texts'], ['canon', 'Canon'], ['older', 'Older maps'], ['art', 'Painted / art']];
    const bar = h('div', { class: 'ws-filterbar', role: 'group', 'aria-label': 'Filter sources' },
      filters.map(([id, label]) => btn(label, () => { sourceFilter = id; renderSources(); }, { 'aria-pressed': String(sourceFilter === id), class: 'ws-chip' })));
    const match = s => sourceFilter === 'all' || (sourceFilter === 'image' && (s.kind === 'image' || s.kind === 'pdf')) || (sourceFilter === 'text' && s.kind === 'text') ||
      (sourceFilter === 'canon' && s.status === 'canon') || (sourceFilter === 'older' && /older/.test(s.status)) || (sourceFilter === 'art' && s.status === 'art');
    const grid = h('ul', { class: 'ws-grid' });
    for (const s of sources.filter(match)) {
      const notes = store.list({ sourceId: s.id }).length;
      const thumbSrc = s.thumb || (s.kind === 'text' ? null : thumbFor(s.id));
      const art = thumbSrc
        ? h('img', { src: thumbSrc, alt: '', loading: 'lazy', decoding: 'async', onerror: e => { if (e.target.dataset.fallback) return; e.target.dataset.fallback = '1'; e.target.src = srcUrl(s.path); } })
        : h('div', { class: 'ws-textthumb', 'aria-hidden': 'true' }, h('span', {}, s.kind === 'pdf' ? 'PDF' : 'TEXT'), h('em', {}, s.path.split('/').pop()));
      grid.appendChild(h('li', {},
        h('button', { type: 'button', class: 'ws-card', onclick: () => openSource(s.id), 'aria-label': `Open ${s.title}` },
          h('div', { class: 'ws-card-art' }, art, s.kind === 'pdf' ? h('span', { class: 'ws-card-flag' }, 'PDF') : null),
          h('div', { class: 'ws-card-meta' },
            h('strong', {}, s.title),
            h('span', { class: 'ws-card-role' }, s.role),
            h('span', { class: 'ws-card-line' }, badge(s.status), h('time', { datetime: s.date }, s.date), notes ? h('span', { class: 'ws-count', title: 'Your items on this source' }, `${notes} note${notes > 1 ? 's' : ''}`) : null)))));
    }
    const auth = h('details', { class: 'ws-details' }, h('summary', {}, 'Source-of-truth order (SPEC.md)'),
      h('ol', { class: 'ws-auth' }, AUTHORITY.map(a => h('li', {}, a.label))),
      h('p', { class: 'ws-hint' }, 'Older maps supply names and history. The Oct 10 outline is evidence for changed geometry, not automatic authority. ',
        h('a', { href: DRIVE_FOLDER, target: '_blank', rel: 'noopener noreferrer' }, 'Drive folder')));
    app(pane, 
      h('div', { class: 'ws-pane-head' }, h('h3', {}, `All sources (${sources.length})`), h('p', { class: 'ws-hint' }, 'Identical copies are listed once; their other paths are in each viewer. Click to zoom, read and annotate.')),
      auth, bar, grid);
  }

  // ---------- viewer (images, PDF, text) ----------
  const viewer = (() => {
    let cur = null, pz = null, regionBox = null;
    const el = h('div', { class: 'ws-viewer', hidden: true, role: 'region', 'aria-label': 'Source viewer' });
    panel.querySelector('.ws-body').appendChild(el);

    function close({ silent = false } = {}) {
      if (!cur) return;
      el.hidden = true; el.textContent = ''; pz?.destroy(); pz = null; cur = null;
      if (!silent && open) { selectTab('sources'); panels.sources.focus(); }
    }

    function meta(s) {
      const dl = h('dl', { class: 'ws-meta' });
      const row = (k, v) => { if (v) app(dl, h('dt', {}, k), h('dd', {}, v)); };
      row('Role', s.role); row('Authority', s.authority); row('Date', `${s.date} (${s.dateBasis})`);
      row('Frame', s.frame);
      const cf = s.comparison;
      if (cf && typeof cf.frame === 'string') row('Registration', `${cf.frame}${frameLegend(comparison, cf.frame) ? `: ${frameLegend(comparison, cf.frame)}` : ''}`);
      if (cf && typeof cf.description === 'string') row('Comparison notes', cf.description);
      row('File', h('a', { href: srcUrl(s.path), target: '_blank', rel: 'noopener noreferrer' }, s.path));
      if (s.altPaths.length) row('Same file at', h('span', {}, s.altPaths.map((p, i) => [i ? ', ' : '', h('a', { href: srcUrl(p), target: '_blank', rel: 'noopener noreferrer' }, p)])));
      if (s.size) row('Pixels', `${s.size[0]} × ${s.size[1]}`);
      if (s.bytes) row('Size', `${(s.bytes / 1048576).toFixed(2)} MB`);
      if (s.md5) row('md5', h('code', {}, s.md5));
      if (s.driveUrl) row('Drive', h('a', { href: s.driveUrl, target: '_blank', rel: 'noopener noreferrer' }, s.driveName || 'Open in Drive'));
      return dl;
    }

    const notesBox = h('div', { class: 'ws-viewer-notes' });
    function refreshNotes() {
      if (!cur) return;
      notesBox.textContent = '';
      const items = store.list({ sourceId: cur.id });
      app(notesBox, h('h4', {}, `Your items on this source (${items.length})`));
      if (!items.length) app(notesBox, h('p', { class: 'ws-hint' }, 'None yet.'));
      for (const it of items) {
        app(notesBox, h('div', { class: `ws-mini ws-mini--${it.kind}` },
          h('span', { class: 'ws-kind' }, it.kind === 'proposal' ? 'Proposal, not canon' : KIND_LABEL[it.kind]),
          h('strong', {}, it.title),
          it.body ? h('p', {}, it.body.length > 280 ? it.body.slice(0, 280) + '…' : it.body) : null,
          it.anchor.region && pz ? btn('Show region', () => showRegion(it.anchor.region), { class: 'ws-btn ws-btn--small' }) : null));
      }
    }

    function showRegion(r) {
      if (!pz) return;
      pz.zoomToRegion(r);
      if (regionBox) Object.assign(regionBox.style, { display: 'block', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
    }

    function openImage(s, region) {
      const isPdf = s.kind === 'pdf';
      const content = h('div', { class: 'ws-pz-content' });
      const stage = h('div', { class: 'ws-stage', tabindex: '0', 'aria-label': `${s.title}. Scroll or pinch to zoom, drag to pan, + and - zoom, 0 fits, 1 is 100%.` }, content);
      const status = h('span', { class: 'ws-zoom', 'aria-hidden': 'true' });
      pz = createPanZoom(stage, content, { onChange: st => { status.textContent = `${Math.round(st.s * 100)}%${st.rot ? ` · ${st.rot}°` : ''}`; } });
      regionBox = h('div', { class: 'ws-region', style: { display: 'none' } });
      const src = isPdf ? (s.preview || thumbFor(s.id)) : srcUrl(s.path);
      const img = h('img', { alt: s.title, draggable: 'false', decoding: 'async' });
      img.addEventListener('load', () => { pz.setSize(img.naturalWidth, img.naturalHeight); loading.remove(); if (region) showRegion(region); });
      img.addEventListener('error', () => { loading.textContent = `Could not load ${s.path}. Is the dev server running from the project root?`; });
      img.src = src;
      app(content, img, regionBox);
      const loading = h('p', { class: 'ws-loading' }, 'Loading original…');
      app(stage, loading);

      const anchorRegion = h('input', { type: 'checkbox', id: 'ws-anchor-region', checked: true });
      const regionToggle = h('label', { class: 'ws-check', for: 'ws-anchor-region' }, anchorRegion, ' Attach the visible region of the image');
      const formSlot = h('div');
      const addBtn = btn('Add note on this source', () => {
        formSlot.textContent = '';
        app(formSlot, itemForm({
          anchor: () => {
            const r = anchorRegion.checked && !isPdf ? pz.visibleRegion() : null;
            const full = r && r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.998 && r.h >= 0.998;
            return { type: 'source', id: s.id, ...(r && !full ? { region: r } : {}) };
          },
          regionToggle: isPdf ? null : regionToggle,
          onDone: () => { formSlot.textContent = ''; addBtn.focus(); }
        }));
      }, { class: 'ws-btn ws-btn--primary' });

      app(el, 
        h('div', { class: 'ws-viewer-bar' },
          btn('← All sources', () => close(), { class: 'ws-btn ws-back' }),
          h('h3', {}, s.title, ' ', badge(s.status)),
          h('div', { class: 'ws-tools', role: 'group', 'aria-label': 'Zoom' },
            btn('Fit', () => pz.fit(), { title: 'Fit (0)' }), btn('100%', () => pz.actual(), { title: 'Actual pixels (1)' }),
            btn('−', () => pz.zoomOut(), { 'aria-label': 'Zoom out' }), btn('+', () => pz.zoomIn(), { 'aria-label': 'Zoom in' }),
            btn('Rotate', () => pz.rotate(90), { title: 'Rotate 90° clockwise (view only; regions attach only when unrotated)' }),
            status,
            h('a', { class: 'ws-btn', href: srcUrl(s.path), target: '_blank', rel: 'noopener noreferrer' }, isPdf ? 'Open PDF' : 'Open original'))),
        h('div', { class: 'ws-viewer-main' }, stage,
          h('div', { class: 'ws-viewer-side' },
            isPdf ? h('p', { class: 'ws-hint' }, 'Preview of the scanned page inside the PDF; open the PDF for the original.') : null,
            s.id === 'map_a' ? h('p', { class: 'ws-hint ws-hint--warn' }, 'Drawn on a page turned sideways: in the raw pixels north is to the right. The file carries an EXIF orientation tag, so the browser already shows it turned roughly north-up. Older geometry: never registered to the globe. Regions on it refer to the image as shown here.') : null,
            h('p', {}, s.description),
            s.cites?.length ? h('ul', { class: 'ws-cites' }, s.cites.map(c => h('li', {}, c))) : null,
            meta(s), addBtn, formSlot, notesBox)));
      setTimeout(() => stage.focus(), 0);
    }

    async function openText(s) {
      const body = h('article', { class: 'ws-reader', tabindex: '0', 'aria-label': s.title });
      const toc = h('nav', { class: 'ws-toc', 'aria-label': 'Sections' });
      const formSlot = h('div');
      const addBtn = btn('Add note on this text', () => {
        const sel = String(globalThis.getSelection?.() || '').trim();
        formSlot.textContent = '';
        app(formSlot, itemForm({ anchor: { type: 'source', id: s.id }, body: sel && body.contains(globalThis.getSelection().anchorNode) ? sel.split('\n').map(l => `> ${l}`).join('\n') + '\n\n' : '', onDone: () => { formSlot.textContent = ''; addBtn.focus(); } }));
      }, { class: 'ws-btn ws-btn--primary', title: 'Select text in the reader first to quote it' });
      app(el, 
        h('div', { class: 'ws-viewer-bar' },
          btn('← All sources', () => close(), { class: 'ws-btn ws-back' }),
          h('h3', {}, s.title, ' ', badge(s.status)),
          h('div', { class: 'ws-tools' }, h('a', { class: 'ws-btn', href: srcUrl(s.path), target: '_blank', rel: 'noopener noreferrer' }, 'Open file'),
            s.driveUrl ? h('a', { class: 'ws-btn', href: s.driveUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open in Drive') : null)),
        h('div', { class: 'ws-viewer-main ws-viewer-main--text' },
          h('div', { class: 'ws-reader-wrap' }, toc, body),
          h('div', { class: 'ws-viewer-side' }, h('p', {}, s.description), meta(s), addBtn, h('p', { class: 'ws-hint' }, 'Tip: select a passage first to quote it in the note.'), formSlot, notesBox)));
      app(body, h('p', { class: 'ws-loading' }, 'Loading…'));
      try {
        const r = await fetch(srcUrl(s.path), { cache: 'no-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (cur !== s) return;
        if (/^\s*<!doctype html/i.test(text)) throw new Error('the dev server returned a web page instead of the file');
        const heads = renderMarkdown(body, text, { mode: s.textFormat === 'lines' ? 'lines' : 'markdown' });
        heads.forEach((hd, i) => {
          hd.id = `ws-h-${i}`;
          app(toc, btn(hd.textContent, () => hd.scrollIntoView({ block: 'start', behavior: 'smooth' }), { class: `ws-toc-item ws-toc-${hd.tagName.toLowerCase()}` }));
        });
        if (!heads.length) toc.remove();
      } catch (err) {
        body.textContent = '';
        app(body, h('p', { class: 'ws-error' }, `Could not load ${s.path} (${err.message}).`), h('a', { href: srcUrl(s.path), target: '_blank', rel: 'noopener noreferrer' }, 'Try opening the file directly'));
      }
      setTimeout(() => body.focus(), 0);
    }

    function openSrc(id, region) {
      const s = sourceById(id);
      if (!s) { say(`Unknown source ${id}`); return; }
      if (!open) setOpen(true);
      if (activeTab !== 'sources') selectTab('sources');
      close({ silent: true });
      cur = s;
      el.hidden = false;
      if (s.kind === 'text') openText(s); else openImage(s, region);
      refreshNotes();
      say(`Opened ${s.title}.`);
    }

    return { open: openSrc, close, isOpen: () => !!cur, refreshNotes };
  })();
  const openSource = (id, region) => viewer.open(id, region);

  // ---------- Compare tab ----------
  const compare = (() => {
    let blinkTimer = null;
    let layers = null; // { penup, earth_re, v5 } URLs, resolved lazily
    let drapeOpacity = 0.8;

    function stopBlink() { if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; } }

    async function probe(url) {
      try {
        const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        return r.ok && /^image\//.test(r.headers.get('content-type') || '') ? url : null;
      } catch { return null; }
    }

    async function resolveLayers() {
      if (layers) return layers;
      const pick = async (key) => derived[key] || probe(srcUrl(DERIVED_GUESSES[key]));
      const [penup, earth_re, v5, mapA] = await Promise.all([pick('penupLines'), pick('earthReLines'), pick('v5OnMaster'), pick('mapANorthUp')]);
      layers = { penup, earth_re, v5, mapA };
      return layers;
    }

    function drapeControls() {
      const op = h('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: String(drapeOpacity), id: 'ws-drape-op' });
      const out = h('output', { for: 'ws-drape-op' }, `${Math.round(drapeOpacity * 100)}%`);
      op.addEventListener('input', () => { drapeOpacity = Number(op.value); out.textContent = `${Math.round(drapeOpacity * 100)}%`; });
      const call = (name) => {
        if (typeof host.setOverlay !== 'function') { say('The 3D view has no ink overlay yet.'); return; }
        try { host.setOverlay(name, name ? drapeOpacity : 0); say(name ? `Draped ${name === 'earth_re' ? 'the Oct 10 outline' : 'the penup outline'} on the globe.` : 'Removed the drape.'); }
        catch (err) { say(`Could not drape: ${err.message}`); }
      };
      return h('div', { class: 'ws-drape', role: 'group', 'aria-label': 'Drape ink on the globe' },
        h('span', { class: 'ws-label' }, 'Drape on globe'),
        btn('Oct 10 ink (earth_re)', () => call('earth_re')), btn('Penup ink', () => call('penup')), btn('Remove', () => call(null)),
        h('label', { for: 'ws-drape-op', class: 'ws-label' }, 'Opacity'), op, out);
    }

    function lakesTable() {
      const lakes = comparisonLakes(comparison);
      const findings = comparisonFindings(comparison);
      const wrap = h('div', { class: 'ws-lakes' }, h('h4', {}, 'Lake differences'));
      if (!lakes.length) {
        app(wrap, h('p', { class: 'ws-hint' }, 'Not measured yet: public/data/source_comparison.json is not available (it is produced by pipeline/compare_sources.py). Visually, the Oct 10 lakes are much smaller than the penup loops, and Dire Lake has no inner loop.'));
      } else {
        const cols = [...new Set(lakes.flatMap(l => l.fields.map(f => f[0])))];
        app(wrap, h('div', { class: 'ws-md-table' }, h('table', {},
          h('tr', {}, h('th', { scope: 'col' }, 'Lake'), cols.map(c => h('th', { scope: 'col' }, c.replace(/_/g, ' ')))),
          lakes.map(l => h('tr', {}, h('th', { scope: 'row' }, l.name), cols.map(c => { const f = l.fields.find(x => x[0] === c); return h('td', {}, f ? fmtNumber(f[1]) : '–'); }))))),
        h('p', { class: 'ws-hint' }, 'From public/data/source_comparison.json.'));
      }
      if (findings.length) app(wrap, h('ul', { class: 'ws-cites' }, findings.map(f => h('li', {}, f))));
      return wrap;
    }

    function registered(L) {
      const sec = h('section', { class: 'ws-cmp' }, h('h3', {}, 'Penup (September) vs Oct 10 outline, registered'));
      if (!L.penup || !L.earth_re) {
        app(sec, h('p', { class: 'ws-hint ws-hint--warn' }, 'The registered line images have not been generated yet (public/sources/derived/*_lines_master.png from pipeline/compare_sources.py). Until then, compare the originals side by side below: they are not registered.'));
        return sec;
      }
      const base = h('img', { src: L.penup, alt: 'Penup outline lines on the master grid', draggable: 'false' });
      const top = h('img', { src: L.earth_re, alt: 'Oct 10 outline lines registered to the master grid', draggable: 'false', class: 'ws-cmp-top' });
      const v5 = L.v5 ? h('img', { src: L.v5, alt: 'kiros_v5 on the master grid', draggable: 'false', class: 'ws-cmp-v5', hidden: true }) : null;
      const divider = h('div', { class: 'ws-swipe-line', hidden: true });
      const content = h('div', { class: 'ws-pz-content' }, base, v5, top, divider);
      const stage = h('div', { class: 'ws-stage ws-stage--cmp', tabindex: '0', 'aria-label': 'Registered comparison. Scroll to zoom, drag to pan.' }, content);
      const pz = createPanZoom(stage, content);
      base.addEventListener('load', () => pz.setSize(base.naturalWidth, base.naturalHeight));
      for (const im of [top, v5].filter(Boolean)) im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';

      let mode = 'overlay';
      const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.6', id: 'ws-cmp-op' });
      const swipe = h('input', { type: 'range', min: '0', max: '100', step: '0.5', value: '50', id: 'ws-cmp-sw' });
      // Both layers are ink on transparent ground, so swipe and blink hide the base where the top is shown.
      const apply = () => {
        top.style.opacity = mode === 'overlay' ? opacity.value : mode === 'swipe' ? '1' : top.style.opacity;
        top.style.clipPath = mode === 'swipe' ? `inset(0 0 0 ${swipe.value}%)` : 'none';
        base.style.clipPath = mode === 'swipe' ? `inset(0 ${100 - Number(swipe.value)}% 0 0)` : 'none';
        if (mode !== 'blink') base.style.opacity = '1';
        top.classList.toggle('ws-tint', mode === 'overlay' && tint.checked);
        divider.hidden = mode !== 'swipe';
        divider.style.left = `${swipe.value}%`;
        opacity.disabled = mode !== 'overlay'; swipe.disabled = mode !== 'swipe';
      };
      opacity.addEventListener('input', apply); swipe.addEventListener('input', apply);
      const modeBtns = {};
      const setMode = m => {
        mode = m; stopBlink();
        for (const k in modeBtns) modeBtns[k].setAttribute('aria-pressed', String(k === m));
        if (m === 'blink') {
          top.style.clipPath = 'none'; divider.hidden = true; let on = true; top.style.opacity = '1';
          base.style.opacity = '0';
          blinkTimer = setInterval(() => { on = !on; top.style.opacity = on ? '1' : '0'; base.style.opacity = on ? '0' : '1'; blinkLabel.textContent = on ? 'Showing: Oct 10' : 'Showing: penup'; }, 800);
        }
        blinkLabel.hidden = m !== 'blink';
        apply();
      };
      const blinkLabel = h('span', { class: 'ws-label', 'aria-live': 'off', hidden: true }, 'Showing: Oct 10');
      for (const [k, label] of [['overlay', 'Overlay'], ['blink', 'Blink'], ['swipe', 'Swipe']]) modeBtns[k] = btn(label, () => setMode(k), { class: 'ws-chip', 'aria-pressed': String(k === mode) });
      const tint = h('input', { type: 'checkbox', id: 'ws-cmp-tint', checked: true });
      tint.addEventListener('change', () => apply());
      const v5Toggle = v5 ? h('label', { class: 'ws-check' }, h('input', { type: 'checkbox', onchange: e => { v5.hidden = !e.target.checked; } }), ' kiros_v5 zones underneath') : null;
      app(sec, 
        h('p', { class: 'ws-hint' }, 'Both drawings on the master grid. Base: penup lines (current terrain). Top: Oct 10 kiros_earth_re lines. Swipe shows penup on the left of the line and Oct 10 on the right.'),
        h('div', { class: 'ws-cmp-controls' },
          h('div', { role: 'group', 'aria-label': 'Comparison mode', class: 'ws-filterbar' }, Object.values(modeBtns)),
          h('label', { for: 'ws-cmp-op', class: 'ws-label' }, 'Oct 10 opacity'), opacity,
          h('label', { class: 'ws-check', for: tint.id }, tint, ' Tint Oct 10 red (overlay)'),
          h('label', { for: 'ws-cmp-sw', class: 'ws-label' }, 'Swipe'), swipe, blinkLabel, v5Toggle,
          btn('Fit', () => pz.fit())),
        stage);
      apply();
      return sec;
    }

    function sideBySide(L) {
      const imgs = sources.filter(s => s.kind !== 'text');
      const mk = (id, def) => h('select', { id }, imgs.map(s => h('option', { value: s.id, selected: s.id === def }, s.title)));
      const selA = mk('ws-sbs-a', 'penup'), selB = mk('ws-sbs-b', 'earth_re');
      const link = h('input', { type: 'checkbox', id: 'ws-sbs-link', checked: true });
      const pane = s => {
        const content = h('div', { class: 'ws-pz-content' });
        const stage = h('div', { class: 'ws-stage ws-stage--half', tabindex: '0', 'aria-label': `${s.title}: scroll to zoom, drag to pan` }, content);
        const pz = createPanZoom(stage, content);
        const useNorthUp = s.id === 'map_a' && L.mapA;
        const img = h('img', { alt: s.title, draggable: 'false', decoding: 'async' });
        img.addEventListener('load', () => pz.setSize(img.naturalWidth, img.naturalHeight));
        img.src = useNorthUp ? L.mapA : s.kind === 'pdf' ? (s.preview || thumbFor(s.id)) : srcUrl(s.path);
        app(content, img);
        const fig = h('figure', { class: 'ws-sbs-fig' }, stage,
          h('figcaption', {}, h('strong', {}, s.title), ' ', badge(s.status), ' ', h('span', { class: 'ws-hint' }, s.frame),
            s.id === 'map_a' ? h('span', { class: 'ws-hint ws-hint--warn' }, useNorthUp ? ' Shown from the derived north-up image; the original page is drawn sideways.' : ' The page is drawn sideways; the browser turns it using the EXIF orientation tag in the file.') : null));
        return { fig, pz, stage };
      };
      const out = h('div', { class: 'ws-sbs' });
      const draw = () => {
        out.textContent = '';
        const a = pane(sourceById(selA.value)), b = pane(sourceById(selB.value));
        // Linked zoom: mirror relative view (scale vs fit, center) from the pane being moved.
        let syncing = false;
        const mirror = (from, to) => () => {
          if (!link.checked || syncing) return;
          syncing = true;
          const f = from.pz.state(), t = to.pz.state();
          const rf = from.stage.getBoundingClientRect(), rt = to.stage.getBoundingClientRect();
          const cx = (rf.width / 2 - f.x) / (f.s * f.w), cy = (rf.height / 2 - f.y) / (f.s * f.h);
          const fitF = Math.min(rf.width / f.w, rf.height / f.h), fitT = Math.min(rt.width / t.w, rt.height / t.h);
          const s = (f.s / fitF) * fitT;
          to.pz.setState({ s, x: rt.width / 2 - cx * s * t.w, y: rt.height / 2 - cy * s * t.h });
          syncing = false;
        };
        for (const [p, q] of [[a, b], [b, a]]) for (const ev of ['wheel', 'pointermove', 'keydown', 'dblclick']) p.stage.addEventListener(ev, () => requestAnimationFrame(mirror(p, q)));
        app(out, a.fig, b.fig);
      };
      selA.addEventListener('change', draw); selB.addEventListener('change', draw);
      draw();
      return h('section', { class: 'ws-cmp' },
        h('h3', {}, 'Any two sources, side by side'),
        h('p', { class: 'ws-hint ws-hint--warn' }, 'Not registered: visual comparison only. Different drawings use different frames and scales.'),
        h('div', { class: 'ws-cmp-controls' },
          h('label', { for: selA.id, class: 'ws-label' }, 'Left'), selA,
          h('label', { for: selB.id, class: 'ws-label' }, 'Right'), selB,
          h('label', { class: 'ws-check', for: link.id }, link, ' Link zoom')),
        out);
    }

    async function render() {
      const pane = panels.compare;
      pane.textContent = '';
      app(pane, h('p', { class: 'ws-loading' }, 'Looking for comparison data…'));
      const L = await resolveLayers();
      pane.textContent = '';
      app(pane, 
        h('div', { class: 'ws-pane-head' }, h('h3', {}, 'Compare versions'),
          h('p', { class: 'ws-hint' }, 'The 3D terrain is built from the September penup outline. The Oct 10 drawing (kiros_earth_re) is newer and has much smaller lakes; it is built only as a what-if variant (Survey panel: "Oct 10 outline"), not as canon.')),
        drapeControls(), registered(L), lakesTable(), sideBySide(L));
    }

    return { render, stopBlink, invalidate: () => { layers = null; } };
  })();

  // ---------- Places tab ----------
  function discrepancyPanel({ openByDefault = true } = {}) {
    return h('details', { class: 'ws-details ws-disc', open: openByDefault },
      h('summary', {}, `Open questions in the sources (${DISCREPANCIES.length})`),
      h('ul', { class: 'ws-disc-list' }, DISCREPANCIES.map(d => h('li', { class: 'ws-disc-item' },
        h('h4', {}, d.title),
        h('p', {}, d.summary),
        d.options.length ? h('ul', { class: 'ws-options' }, d.options.map(o => h('li', {}, o))) : null,
        h('p', { class: 'ws-inworld' }, h('span', { class: 'ws-label' }, 'In the 3D world: '), d.inWorld),
        h('p', { class: 'ws-cite-line' }, h('span', { class: 'ws-label' }, 'Sources: '),
          d.cites.map((c, i) => [i ? ' · ' : '', sourceById(c.source)
            ? h('button', { type: 'button', class: 'ws-link', onclick: () => openSource(c.source) }, `${sourceById(c.source).title}`)
            : c.source, ` (${c.section})`])),
        h('div', { class: 'ws-actions' },
          d.places.filter(placeById).map(pid => btn(`Go: ${placeById(pid).name}`, () => goToView(placeById(pid).view), { class: 'ws-btn ws-btn--small' })),
          btn('Ask as a question', () => {
            try {
              store.add({ kind: 'question', title: d.title.slice(0, 200), body: `${d.summary}\n\nSources: ${d.cites.map(c => `${c.source} (${c.section})`).join('; ')}`, tags: ['source-conflict', d.id], ...(d.places[0] && placeById(d.places[0]) ? { anchor: { type: 'place', id: d.places[0] } } : {}) });
              say('Added to your notebook as an open question.');
            } catch (ex) { say(ex.message); }
          }, { class: 'ws-btn ws-btn--small' }))))));
  }

  // Each place's add-note slot outlives re-renders (any store change re-renders this tab), so a half-written note stays.
  const placeSlots = new Map();
  function renderPlaces() {
    const pane = panels.places;
    const scroll = pane.scrollTop;
    pane.textContent = '';
    app(pane, h('div', { class: 'ws-pane-head' }, h('h3', {}, 'Places'), h('p', { class: 'ws-hint' }, 'Named in the sources; nothing is drawn into the world. "Go" flies the camera there.')),
      discrepancyPanel());
    const list = h('ul', { class: 'ws-places' });
    for (const p of places) {
      const items = store.list({ placeId: p.id });
      let slot = placeSlots.get(p.id);
      if (!slot) { slot = h('div'); placeSlots.set(p.id, slot); }
      const notesList = h('ul', { class: 'ws-place-notes', hidden: true }, items.map(it => h('li', { class: `ws-mini ws-mini--${it.kind}` },
        h('span', { class: 'ws-kind' }, it.kind === 'proposal' ? `Proposal, not canon (${it.status})` : KIND_LABEL[it.kind]), h('strong', {}, it.title), it.body ? h('p', {}, it.body) : null)));
      const showBtn = items.length ? btn(`${items.length} item${items.length > 1 ? 's' : ''}`, e => { notesList.hidden = !notesList.hidden; e.currentTarget.setAttribute('aria-expanded', String(!notesList.hidden)); }, { class: 'ws-btn ws-btn--small', 'aria-expanded': 'false' }) : h('span', { class: 'ws-hint' }, 'no notes');
      const addBtn = btn('Add note', () => {
        slot.textContent = '';
        app(slot, itemForm({ anchor: { type: 'place', id: p.id }, onDone: () => { slot.textContent = ''; } }));
      }, { class: 'ws-btn ws-btn--small' });
      app(list, h('li', { class: 'ws-place' },
        h('div', { class: 'ws-place-head' },
          h('strong', {}, p.name), h('span', { class: 'ws-kindtag' }, p.kind), badge(p.status),
          h('span', { class: 'ws-spacer' }),
          btn('Go', () => goToView(p.view), { class: 'ws-btn ws-btn--primary ws-btn--small', 'aria-label': `Go to ${p.name}` })),
        h('p', { class: 'ws-evidence' }, p.evidence),
        h('div', { class: 'ws-actions' }, showBtn, addBtn),
        notesList, slot));
    }
    if (!places.length) app(list, h('li', { class: 'ws-hint' }, 'No places were given to the workshop.'));
    app(pane, list);
    pane.scrollTop = scroll;
  }

  // ---------- Notebook tab ----------
  let nbFilter = 'all', nbText = '';
  let nbList = null;
  // These outlive re-renders of the pane so that unsaved text in the new-item form or an open edit form is never
  // thrown away by a search keystroke, a save elsewhere, another tab's write or late-loading comparison data.
  const nbForm = h('div');
  const nbProblem = h('div');
  const editors = new Map(); // item id -> { li, baseUpdated, notice } for cards with an open edit form
  function renderNotebook() {
    const pane = panels.notebook;
    pane.textContent = '';
    const filterBar = h('div', { class: 'ws-filterbar', role: 'group', 'aria-label': 'Filter by kind' },
      [['all', 'All'], ...KINDS.map(k => [k, `${KIND_LABEL[k]}s`])].map(([k, label]) =>
        btn(label, e => { nbFilter = k; for (const b of filterBar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); renderNotebookList(); }, { class: 'ws-chip', 'aria-pressed': String(nbFilter === k) })));
    const search = h('input', { type: 'search', id: 'ws-nb-search', placeholder: 'Search your notebook', value: nbText });
    search.addEventListener('input', () => { nbText = search.value; renderNotebookList(); });

    const markBtn = btn('Bookmark this view', () => {
      nbForm.textContent = '';
      let view;
      try { view = host.getView?.(); } catch (err) { say(`Could not read the camera: ${err.message}`); return; }
      const errs = validateView(view);
      if (errs.length) { app(nbForm, h('p', { class: 'ws-error', role: 'alert' }, `The 3D view did not give a usable position (${errs.join('; ')}).`)); return; }
      const clean = { lat: view.lat, lon: view.lon, alt: view.alt, heading: view.heading ?? 0, pitch: view.pitch ?? null, mode: view.mode || 'orbit' };
      const near = places.filter(p => p.view).map(p => [p, arcDeg(clean, p.view)]).sort((a, b) => a[1] - b[1])[0];
      const suggested = near && near[1] < 12 ? `Near ${near[0].name}` : `View at ${clean.lat.toFixed(1)}°, ${clean.lon.toFixed(1)}°`;
      const titleIn = h('input', { type: 'text', id: 'ws-bm-title', value: suggested, maxlength: 200 });
      const bodyIn = h('textarea', { id: 'ws-bm-body', rows: 2, placeholder: 'Why this view matters (optional)' });
      const f = h('form', { class: 'ws-form' },
        h('p', { class: 'ws-hint' }, describeView(clean)),
        h('label', { for: titleIn.id }, 'Title'), titleIn, h('label', { for: bodyIn.id, class: 'ws-sr' }, 'Note'), bodyIn,
        h('div', { class: 'ws-actions' }, h('button', { type: 'submit', class: 'ws-btn ws-btn--primary' }, 'Save bookmark'), btn('Cancel', () => { nbForm.textContent = ''; })));
      f.addEventListener('submit', e => {
        e.preventDefault();
        try { store.add({ kind: 'bookmark', title: titleIn.value.trim() || suggested, body: bodyIn.value, anchor: { type: 'view', view: clean } }); nbForm.textContent = ''; say('Bookmark saved.'); }
        catch (ex) { say(ex.errors ? ex.errors.join('; ') : ex.message); }
      });
      app(nbForm, f);
      setTimeout(() => titleIn.select(), 0);
    }, { class: 'ws-btn ws-btn--primary' });

    const newBtn = btn('New item', () => { nbForm.textContent = ''; app(nbForm, itemForm({ onDone: () => { nbForm.textContent = ''; } })); });

    const exportBtn = btn('Export JSON', () => {
      download(`kiros-workshop-${localDate()}.json`, store.exportJSON(), 'application/json');
      say(`Exported ${store.list().length} items.`);
    });
    const importResult = h('div', { class: 'ws-import-result', 'aria-live': 'polite' });
    const modeMerge = h('input', { type: 'radio', name: 'ws-import-mode', value: 'merge', id: 'ws-im-merge', checked: true });
    const modeReplace = h('input', { type: 'radio', name: 'ws-import-mode', value: 'replace', id: 'ws-im-replace' });
    const file = h('input', { type: 'file', accept: '.json,application/json', id: 'ws-import-file', class: 'ws-file' });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      importResult.textContent = '';
      if (f.size > 8_000_000) { app(importResult, h('p', { class: 'ws-error' }, 'That file is too large to be a workshop export.')); return; }
      const mode = modeReplace.checked ? 'replace' : 'merge';
      const count = store.list().length;
      if (mode === 'replace' && count && !confirm(`Replace all ${count} items in your notebook with the contents of ${f.name}? Export first if you want a backup.`)) return;
      const r = store.importJSON(await f.text(), { mode });
      if (r.ok) app(importResult, h('p', { class: 'ws-ok' }, `Imported ${f.name}: ${r.added} added, ${r.updated} updated (${mode})` +
        (r.skipped ? `; ${r.skipped} kept as they are because your copy is as new or newer than the file's.` : '.')));
      else app(importResult, h('p', { class: 'ws-error' }, `Import failed. Nothing was changed. Problems in ${f.name}:`), h('ul', { class: 'ws-errlist' }, r.errors.map(e => h('li', {}, e))));
    });

    nbList = h('ul', { class: 'ws-items' });
    app(pane, 
      h('div', { class: 'ws-pane-head' }, h('h3', {}, 'Notebook'), h('p', { class: 'ws-hint' }, `Saved in this browser (${storage ? 'local storage' : 'memory only: storage is blocked, export to keep your work'}). Export a backup now and then.`)),
      nbProblem,
      h('div', { class: 'ws-actions' }, markBtn, newBtn),
      nbForm,
      h('div', { class: 'ws-io' },
        exportBtn,
        h('label', { for: file.id, class: 'ws-btn' }, 'Import JSON…'), file,
        h('span', { class: 'ws-radio', role: 'radiogroup', 'aria-label': 'Import mode' },
          h('label', { for: modeMerge.id }, modeMerge, ' merge'), h('label', { for: modeReplace.id }, modeReplace, ' replace'))),
      importResult,
      filterBar, h('label', { for: search.id, class: 'ws-sr' }, 'Search'), search,
      nbList);
    renderNotebookList();
  }

  function renderProblem() {
    nbProblem.textContent = '';
    const problem = store.getProblem();
    if (!problem) return;
    app(nbProblem, h('p', { class: 'ws-hint ws-hint--warn', role: 'alert' }, problem.message));
    if (problem.readOnly) {
      app(nbProblem, h('div', { class: 'ws-actions' },
        btn('Download the unreadable data', () => {
          download(`kiros-workshop-unreadable-${localDate()}.txt`, store.getUnreadableText() || '', 'text/plain');
          say('Downloaded the unreadable data.');
        }, { class: 'ws-btn ws-btn--primary' }),
        btn('Start a fresh notebook…', () => {
          if (!confirm('Start a fresh notebook? The unreadable data in browser storage will be overwritten by your next save. Download it first if you may need it.')) return;
          store.discardUnreadable(); say('Started a fresh notebook.');
        }, { class: 'ws-btn ws-btn--danger' })));
    }
  }

  function renderNotebookList() {
    if (!nbList) return;
    renderProblem();
    const all = store.list();
    const shown = new Set(store.list({ ...(nbFilter !== 'all' ? { kind: nbFilter } : {}), ...(nbText ? { text: nbText } : {}) }).map(i => i.id));
    // Moving an open form out of and back into the list would drop focus and the caret: put them back afterwards.
    const active = document.activeElement;
    const keep = active && nbList.contains(active) ? { el: active, start: active.selectionStart, end: active.selectionEnd, top: active.scrollTop } : null;
    const paneScroll = panels.notebook.scrollTop;
    nbList.textContent = '';
    let count = 0;
    for (const it of all) {
      const ed = editors.get(it.id);
      if (ed) {
        // Keep the open form as it is (with whatever has been typed), even when the filter would hide the item.
        ed.notice.textContent = it.updated !== ed.baseUpdated ? 'This item was changed elsewhere (another tab or an import) since you opened it. Saving replaces that version with this text.' : '';
        app(nbList, ed.li); count++;
      } else if (shown.has(it.id)) { app(nbList, itemCard(it)); count++; }
    }
    // Forms for items deleted elsewhere stay too, so their text can still be saved as a new item.
    for (const [id, ed] of editors) {
      if (all.some(i => i.id === id)) continue;
      ed.notice.textContent = 'This item was deleted elsewhere. Saving keeps your text as a new item.';
      app(nbList, ed.li); count++;
    }
    if (!count) app(nbList, h('li', { class: 'ws-hint' }, all.length ? 'Nothing matches.' : 'Nothing yet. Bookmark a view, or add a note from a source or place.'));
    panels.notebook.scrollTop = paneScroll;
    if (keep && nbList.contains(keep.el) && document.activeElement !== keep.el) {
      keep.el.focus({ preventScroll: true });
      try { if (typeof keep.start === 'number') keep.el.setSelectionRange(keep.start, keep.end); } catch { /* not a text field */ }
      keep.el.scrollTop = keep.top;
    }
  }

  function itemCard(it) {
    const li = h('li', { class: `ws-item ws-item--${it.kind}` });
    const a = it.anchor;
    const go = a?.type === 'view' ? btn('Go', () => goToView(a.view), { class: 'ws-btn ws-btn--small ws-btn--primary' })
      : a?.type === 'place' && placeById(a.id) ? btn('Go', () => goToView(placeById(a.id).view), { class: 'ws-btn ws-btn--small ws-btn--primary' })
        : a?.type === 'source' ? btn('Open source', () => openSource(a.id, a.region), { class: 'ws-btn ws-btn--small' }) : null;
    const del = btn('Delete', () => {
      if (!confirm(`Delete ${KIND_LABEL[it.kind].toLowerCase()} "${it.title}"? This cannot be undone (unless you exported a backup).`)) return;
      store.remove(it.id); say('Deleted.');
    }, { class: 'ws-btn ws-btn--small ws-btn--danger' });
    const view = () => {
      li.textContent = '';
      delete li.dataset.editing;
      if (editors.get(it.id)?.li === li) editors.delete(it.id);
      app(li,
        h('div', { class: 'ws-item-head' },
          h('span', { class: 'ws-kind' }, it.kind === 'proposal' ? 'Proposal, not canon' : KIND_LABEL[it.kind]),
          STATUSES[it.kind] ? h('span', { class: statusClass(it.status) }, it.kind === 'proposal' && it.status === 'accepted' ? 'accepted in workshop' : it.status) : null,
          h('strong', {}, it.title)),
        it.body ? h('p', { class: 'ws-item-body' }, it.body) : null,
        a ? h('p', { class: 'ws-anchor' }, anchorText(a)) : null,
        it.tags.length ? h('p', { class: 'ws-tags' }, it.tags.map(t => h('span', {}, t))) : null,
        h('div', { class: 'ws-actions' }, go, btn('Edit', edit, { class: 'ws-btn ws-btn--small' }), del,
          h('span', { class: 'ws-time', title: `created ${it.created}` }, `updated ${it.updated.slice(0, 16).replace('T', ' ')}`)));
    };
    const edit = () => {
      li.textContent = '';
      li.dataset.editing = it.id;
      const uid = it.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
      const t = h('input', { type: 'text', id: `ws-e-t-${uid}`, value: it.title, maxlength: 200 });
      const b = h('textarea', { id: `ws-e-b-${uid}`, rows: 5, maxlength: 20000 }); b.value = it.body;
      const g = h('input', { type: 'text', id: `ws-e-g-${uid}`, value: it.tags.join(', ') });
      const st = STATUSES[it.kind] ? h('select', { id: `ws-e-s-${uid}` }, STATUSES[it.kind].map(s => h('option', { value: s, selected: s === it.status }, s))) : null;
      const err = h('p', { class: 'ws-error', role: 'alert' });
      const notice = h('p', { class: 'ws-hint ws-hint--warn', 'aria-live': 'polite' });
      const f = h('form', { class: 'ws-form' },
        h('label', { for: t.id }, `${KIND_LABEL[it.kind]} title`), t,
        h('label', { for: b.id }, 'Body'), b,
        h('label', { for: g.id }, 'Tags'), g,
        st ? [h('label', { for: st.id }, it.kind === 'proposal' ? 'Status (accepted = accepted by you in the workshop; sources are not edited)' : 'Status'), st] : null,
        notice, err,
        h('div', { class: 'ws-actions' }, h('button', { type: 'submit', class: 'ws-btn ws-btn--primary' }, 'Save'), btn('Cancel', () => { editors.delete(it.id); renderNotebookList(); })));
      f.addEventListener('submit', e => {
        e.preventDefault();
        err.textContent = '';
        const fields = { title: t.value.trim() || it.title, body: b.value, tags: g.value.split(',').map(s => s.trim()).filter(Boolean), ...(st ? { status: st.value } : {}) };
        // Close the form first so the re-render after saving shows the saved card; reopen it if saving fails.
        editors.delete(it.id);
        try {
          if (store.get(it.id)) store.update(it.id, fields);
          else store.add({ kind: it.kind, ...fields, ...(it.anchor ? { anchor: it.anchor } : {}) }); // deleted elsewhere meanwhile
          say('Saved.');
        } catch (ex) {
          editors.set(it.id, entry);
          err.textContent = ex.errors ? ex.errors.join(' · ') : ex.message;
        }
      });
      const entry = { li, baseUpdated: it.updated, notice };
      editors.set(it.id, entry);
      app(li, f);
      setTimeout(() => t.focus(), 0);
    };
    view();
    return li;
  }

  // ---------- Brief tab ----------
  function renderBrief() {
    const pane = panels.brief;
    pane.textContent = '';
    const md = buildBrief({ items: store.list(), places, sources, comparison });
    const ta = h('textarea', { class: 'ws-brief', id: 'ws-brief-text', readonly: true, rows: 24, spellcheck: 'false' });
    ta.value = md;
    const copy = btn('Copy', async () => {
      try { await navigator.clipboard.writeText(md); say('Brief copied to the clipboard.'); }
      catch { ta.focus(); ta.select(); const ok = document.execCommand?.('copy'); say(ok ? 'Brief copied.' : 'Select the text and copy it with Ctrl+C.'); }
    }, { class: 'ws-btn ws-btn--primary' });
    app(pane, 
      h('div', { class: 'ws-pane-head' }, h('h3', {}, 'Brief for Claude or Codex'),
        h('p', { class: 'ws-hint' }, 'Your open questions, proposals, notes and bookmarks, the known source conflicts, and source-grounded questions. Paste it into a chat and ask to be grilled.')),
      h('div', { class: 'ws-actions' }, copy, btn('Download .md', () => { download(`kiros-brief-${localDate()}.md`, md, 'text/markdown'); say('Brief downloaded.'); }),
        h('span', { class: 'ws-hint' }, `${md.length.toLocaleString('en-US')} characters`)),
      h('label', { for: ta.id, class: 'ws-sr' }, 'Generated brief (read only)'), ta,
      discrepancyPanel({ openByDefault: false }));
  }

  // ---------- comparison data (optional) ----------
  loadComparison().then(c => {
    if (!c) return;
    comparison = c;
    sources = mergeComparison(SOURCES, c);
    derived = derivedImages(c);
    compare.invalidate();
    for (const id of Object.keys(rendered)) rendered[id] = false;
    if (open) renderTab(activeTab);
  });

  const problem = store.getProblem();
  if (problem) console.warn('[workshop]', problem.message);

  return {
    open: tab => { if (tab && panels[tab]) activeTab = tab; if (open) selectTab(activeTab, { focus: true }); else setOpen(true); },
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    openSource,
    store,
    destroy() { setOpen(false); for (const f of cleanups) f(); toggle.remove(); panel.remove(); }
  };
}
