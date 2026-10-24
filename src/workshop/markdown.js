// Small, safe markdown reader for the source texts. Parsing is pure (returns plain block objects); rendering builds
// DOM nodes with textContent only, so raw HTML in a source is shown as text and never interpreted.
// `lines` mode treats every non-empty line as its own paragraph (the Google Doc snapshot has no blank lines) and
// promotes short title-like lines to headings.

const LIST_RE = /^\s*([-*+•]|\d+[.)])\s+(.*)$/;

export function parseInline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*)\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: 'strong', v: m[2] });
    else if (m[3]) out.push({ t: 'code', v: m[4] });
    else if (m[5]) out.push(/^https?:\/\//i.test(m[7]) ? { t: 'link', v: m[6], href: m[7] } : { t: 'text', v: m[6] });
    else if (m[8]) out.push({ t: 'em', v: m[9] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

const looksLikeTitle = l => l.length <= 60 && /^[A-Z]/.test(l) && !/[.:;,!?)"”]$/.test(l) && !LIST_RE.test(l);

export function parseMarkdown(src, { mode = 'markdown' } = {}) {
  const lines = String(src ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
    .map(l => l.replace(/^﻿/, ''));
  const blocks = [];
  let para = null, list = null, table = null, code = null;
  const flush = () => {
    if (para) { blocks.push({ type: 'p', text: para.join(' ') }); para = null; }
    if (list) { blocks.push(list); list = null; }
    if (table) { blocks.push(table); table = null; }
  };
  for (const raw of lines) {
    if (code) {
      if (/^```/.test(raw)) { blocks.push(code); code = null; } else code.text += (code.text ? '\n' : '') + raw;
      continue;
    }
    const line = raw.trimEnd();
    if (/^```/.test(line)) { flush(); code = { type: 'code', text: '' }; continue; }
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flush(); blocks.push({ type: 'h', level: h[1].length, text: h[2].trim() }); continue; }
    if (/^\s*\|/.test(line)) {
      if (para || list) flush();
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; // separator row
      if (!table) table = { type: 'table', rows: [] };
      table.rows.push(cells);
      continue;
    }
    if (table) flush();
    const li = LIST_RE.exec(line);
    if (li) {
      if (para) flush();
      const ordered = /\d/.test(li[1]);
      if (!list || list.ordered !== ordered) { if (list) flush(); list = { type: 'list', ordered, items: [] }; }
      list.items.push(li[2]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    if (list) flush();
    if (mode === 'lines') {
      flush();
      blocks.push(looksLikeTitle(line.trim()) ? { type: 'h', level: 3, text: line.trim() } : { type: 'p', text: line.trim() });
      continue;
    }
    (para || (para = [])).push(line.trim());
  }
  if (code) blocks.push(code);
  flush();
  return blocks;
}

function inlineNodes(doc, text) {
  const frag = doc.createDocumentFragment();
  for (const tok of parseInline(text)) {
    let node;
    if (tok.t === 'text') node = doc.createTextNode(tok.v);
    else if (tok.t === 'link') {
      node = doc.createElement('a');
      node.href = tok.href; node.target = '_blank'; node.rel = 'noopener noreferrer'; node.textContent = tok.v;
    } else {
      node = doc.createElement(tok.t === 'strong' ? 'strong' : tok.t === 'em' ? 'em' : 'code');
      node.textContent = tok.v;
    }
    frag.appendChild(node);
  }
  return frag;
}

// Renders into `container`; returns the heading elements (for a table of contents).
export function renderMarkdown(container, src, opts = {}) {
  const doc = container.ownerDocument;
  const headings = [];
  container.textContent = '';
  for (const b of parseMarkdown(src, opts)) {
    let el;
    if (b.type === 'h') {
      el = doc.createElement(`h${Math.min(6, b.level + 1)}`);
      el.appendChild(inlineNodes(doc, b.text));
      headings.push(el);
    } else if (b.type === 'p') { el = doc.createElement('p'); el.appendChild(inlineNodes(doc, b.text)); }
    else if (b.type === 'code') { el = doc.createElement('pre'); el.textContent = b.text; }
    else if (b.type === 'list') {
      el = doc.createElement(b.ordered ? 'ol' : 'ul');
      for (const it of b.items) { const li = doc.createElement('li'); li.appendChild(inlineNodes(doc, it)); el.appendChild(li); }
    } else if (b.type === 'table') {
      el = doc.createElement('div'); el.className = 'ws-md-table';
      const t = doc.createElement('table');
      b.rows.forEach((row, i) => {
        const tr = doc.createElement('tr');
        for (const c of row) { const td = doc.createElement(i === 0 ? 'th' : 'td'); td.appendChild(inlineNodes(doc, c)); tr.appendChild(td); }
        t.appendChild(tr);
      });
      el.appendChild(t);
    }
    if (el) container.appendChild(el);
  }
  return headings;
}
