// Builds the exportable markdown brief Kayden pastes into Claude or Codex to be grilled about Kiros.
// Pure: no DOM, no network. It only restates what is in the workshop items, the source catalog, the places list,
// the built-in discrepancy list (all cited) and the optional source-comparison data. It never invents lore.

import { DISCREPANCIES, SOURCE_PROMPTS } from './discrepancies.js';
import { AUTHORITY, comparisonLakes, comparisonFindings, fmtNumber } from './sources.js';

const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
// Inline user text: one line, and a leading markdown control character cannot start a heading or list.
const inline = s => oneLine(s).replace(/^([#>*+-]|\d+\.)/, '\\$1') || '(untitled)';
// Multi-line user text becomes a quote block, so nothing inside it can open a new section.
const quote = (s, indent = '  ') => String(s ?? '').trim() ? String(s).trim().split(/\r?\n/).map(l => `${indent}> ${l}`).join('\n') : '';

const deg = (v, pos, neg) => (typeof v === 'number' ? `${Math.abs(v).toFixed(2).replace(/\.?0+$/, '')}°${v >= 0 ? pos : neg}` : '?');
const alt = m => (typeof m !== 'number' ? '?' : m >= 10000 ? `${fmtNumber(m / 1000)} km` : `${fmtNumber(m)} m`);

export function describeView(v) {
  if (!v) return '';
  const parts = [`lat ${(+v.lat).toFixed(4)}`, `lon ${(+v.lon).toFixed(4)}`, `(${deg(v.lat, 'N', 'S')} ${deg(v.lon, 'E', 'W')})`, `alt ${alt(v.alt)}`];
  if (typeof v.heading === 'number') parts.push(`heading ${Math.round(v.heading)}°`);
  if (typeof v.pitch === 'number') parts.push(`pitch ${Math.round(v.pitch)}°`);
  if (v.mode) parts.push(`mode ${v.mode}`);
  return parts.join(', ');
}

export function describeRegion(r) {
  if (!r) return '';
  const p = x => x.toFixed(2);
  return `region x ${p(r.x)}–${p(r.x + r.w)}, y ${p(r.y)}–${p(r.y + r.h)} of the image`;
}

const tagText = it => (it.tags && it.tags.length ? ` [tags: ${it.tags.map(oneLine).join(', ')}]` : '');

function itemLine(it, { status = false, suffix = '' } = {}) {
  const head = `- ${status && it.status ? `[${it.status}] ` : ''}**${inline(it.title)}**${suffix}${tagText(it)}`;
  const body = quote(it.body);
  return body ? `${head}\n${body}` : head;
}

function anchorLabel(it, placeName, sourceTitle) {
  const a = it.anchor;
  if (!a) return '';
  if (a.type === 'place') return ` (place: ${placeName(a.id)})`;
  if (a.type === 'source') return ` (source: ${sourceTitle(a.id)}${a.region ? `, ${describeRegion(a.region)}` : ''})`;
  if (a.type === 'view') return ` (view: ${describeView(a.view)})`;
  return '';
}

// Picks the lake-area field that belongs to a given drawing, by its key name.
function lakeField(row, re) {
  const f = row.fields.find(([k, v]) => typeof v === 'number' && re.test(k) && /km|area/i.test(k));
  return f || null;
}

export function buildBrief(input = {}) {
  const { items, places, sources, comparison, generated } = input || {};
  const list = Array.isArray(items) ? items.filter(i => i && typeof i === 'object') : [];
  const placeList = Array.isArray(places) ? places : [];
  const sourceList = Array.isArray(sources) ? sources : [];
  const placeName = id => placeList.find(p => p.id === id)?.name || id;
  const sourceTitle = id => sourceList.find(s => s.id === id)?.title || id;
  const sourceFile = id => { const s = sourceList.find(x => x.id === id); return s ? s.path.split('/').pop() : id; };
  const date = (generated || new Date().toISOString()).slice(0, 10);
  const out = [];
  const push = (...l) => out.push(...l);

  push(`# Kiros workshop brief, ${date}`, '',
    'Paste this into Claude or Codex and ask it to grill me (Kayden) about my world, one question at a time.', '',
    '## Ground rules for the assistant', '',
    '- Kiros is my world. Only treat as canon what my sources below say; cite the source and section for every claim.',
    '- My workshop proposals are **not canon** until I say so. Accepted proposals are decisions I made in the workshop; they do not rewrite the sources.',
    '- Do not invent places, names, history, rivers, borders or settlements. If something is unknown, ask me.',
    '- Where sources disagree, show both sides and ask which wins; do not pick for me.', '');

  push('## Source-of-truth order', '', ...AUTHORITY.map(a => `${a.rank}. ${a.label}`),
    '', 'Source: SPEC.md, Purpose and rules. Older maps supply names and history; the newest Oct 10 outline is evidence for changed geometry but not automatically canon.', '');

  // ---- discrepancies ----
  push('## Known discrepancies between sources', '');
  for (const d of DISCREPANCIES) {
    push(`### ${d.title}`, '', d.summary);
    if (d.options.length) push('', ...d.options.map(o => `- ${o}`));
    push('', `Current 3D world: ${d.inWorld}`, `Sources: ${d.cites.map(c => `${sourceFile(c.source)} (${c.section})`).join('; ')}`, '');
  }

  const lakes = comparisonLakes(comparison);
  const findings = comparisonFindings(comparison);
  push('### Lake comparison: penup (September) vs kiros_earth_re (Oct 10)', '');
  if (lakes.length) {
    for (const l of lakes) push(`- **${inline(l.name)}**: ${l.fields.map(([k, v]) => `${k} ${fmtNumber(v)}`).join(', ')}`);
    push('', 'Source: public/data/source_comparison.json (pipeline/compare_sources.py), measured on the registered drawings.', '');
  } else {
    push('Lake areas on the Oct 10 outline are not yet measured here (source comparison data is not available). Visually, its lakes are much smaller than the penup loops.', '');
  }
  if (findings.length) push('Findings from the source comparison:', '', ...findings.map(f => `- ${inline(f)}`), '');

  // ---- workshop items ----
  const openQ = list.filter(i => i.kind === 'question' && i.status !== 'answered');
  const answeredQ = list.filter(i => i.kind === 'question' && i.status === 'answered');
  push('## Open questions (from my workshop)', '');
  if (openQ.length) for (const q of openQ) push(itemLine(q, { suffix: anchorLabel(q, placeName, sourceTitle) }));
  else push('No open questions yet.');
  push('');
  if (answeredQ.length) { push('## Answered questions', ''); for (const q of answeredQ) push(itemLine(q, { suffix: anchorLabel(q, placeName, sourceTitle) })); }
  push('');

  const props = list.filter(i => i.kind === 'proposal');
  push('## Proposals (my proposed decisions, not canon)', '');
  if (props.length) {
    for (const st of ['open', 'accepted', 'rejected']) {
      const group = props.filter(p => p.status === st);
      if (!group.length) continue;
      push(`### ${st === 'accepted' ? 'Accepted by me in the workshop (sources not yet changed)' : st === 'open' ? 'Open' : 'Rejected'}`, '');
      for (const p of group) push(itemLine(p, { status: true, suffix: anchorLabel(p, placeName, sourceTitle) }));
      push('');
    }
  } else push('No proposals yet.', '');

  const notes = list.filter(i => i.kind === 'note');
  push('## Notes', '');
  if (!notes.length) push('No notes yet.', '');
  const byPlace = new Map(), bySource = new Map(), loose = [];
  for (const n of notes) {
    if (n.anchor?.type === 'place') (byPlace.get(n.anchor.id) || byPlace.set(n.anchor.id, []).get(n.anchor.id)).push(n);
    else if (n.anchor?.type === 'source') (bySource.get(n.anchor.id) || bySource.set(n.anchor.id, []).get(n.anchor.id)).push(n);
    else loose.push(n);
  }
  for (const [id, group] of byPlace) {
    const p = placeList.find(x => x.id === id);
    push(`### Place: ${placeName(id)}${p?.status ? ` (${p.status})` : ''}`, '');
    if (p?.evidence) push(`Evidence: ${p.evidence}`, '');
    for (const n of group) push(itemLine(n));
    push('');
  }
  for (const [id, group] of bySource) {
    push(`### Source: ${sourceTitle(id)}`, '');
    for (const n of group) push(itemLine(n, { suffix: n.anchor.region ? ` (${describeRegion(n.anchor.region)})` : '' }));
    push('');
  }
  if (loose.length) { push('### Other notes', ''); for (const n of loose) push(itemLine(n, { suffix: anchorLabel(n, placeName, sourceTitle) })); push(''); }

  const ideas = list.filter(i => i.kind === 'idea');
  if (ideas.length) { push('## Ideas (not canon)', ''); for (const i of ideas) push(itemLine(i, { suffix: anchorLabel(i, placeName, sourceTitle) })); push(''); }

  const marks = list.filter(i => i.kind === 'bookmark');
  push('## Bookmarked views', '');
  if (marks.length) for (const b of marks) push(`- **${inline(b.title)}**: ${describeView(b.anchor?.view)}${b.body ? `\n${quote(b.body)}` : ''}`);
  else push('No bookmarks yet.');
  push('');

  // ---- prompts ----
  push('## Questions to grill me with', '', 'Each question comes from a conflict or gap in my own sources.', '');
  const prompts = [];
  const veir = lakes.find(l => /veir/i.test(l.name));
  const newF = veir && lakeField(veir, /earth_?re|oct|revis|new/i);
  const oldF = veir && lakeField(veir, /penup|master|sept|old|built/i);
  prompts.push({
    q: `The Drive description says Lake Veir is about the size of Lake Bonneville (roughly 51,000 km²) and is the ruler for every distance, but kiros_earth_re draws it ${newF ? `at ${fmtNumber(newF[1])} (${newF[0]})${oldF ? ` against ${fmtNumber(oldF[1])} for the penup loop (${oldF[0]})` : ''}` : 'much smaller than the penup loop (area not yet measured)'}. Which is canon, and if the lake shrinks, what becomes the ruler?`,
    source: 'Drive description, Major Lakes; kiros_earth_re.png; penup outline'
  });
  for (const l of lakes) {
    if (l === veir) continue;
    const n = lakeField(l, /earth_?re|oct|revis|new/i), o = lakeField(l, /penup|master|sept|old|built/i);
    if (n && o) prompts.push({ q: `${inline(l.name)} measures ${fmtNumber(o[1])} on the penup outline (${o[0]}) but ${fmtNumber(n[1])} on kiros_earth_re (${n[0]}). Which size is current?`, source: 'public/data/source_comparison.json' });
  }
  prompts.push(...SOURCE_PROMPTS);
  for (const p of placeList.filter(p => p.status === 'disputed')) {
    prompts.push({ q: `${inline(p.name)} is marked disputed: ${oneLine(p.evidence)} How should it be settled?`, source: `places list, ${p.id}` });
  }
  for (const q of openQ) {
    const a = q.anchor;
    const where = a?.type === 'place' ? `, place ${placeName(a.id)}` : a?.type === 'source' ? `, source ${sourceTitle(a.id)}` : '';
    prompts.push({ q: `My open workshop question: ${inline(q.title)}`, source: `my workshop${where}` });
  }
  prompts.forEach((p, i) => push(`${i + 1}. ${oneLine(p.q)} (Source: ${oneLine(p.source).replace(/[()]/g, '')})`));
  push('');

  // ---- catalog ----
  if (sourceList.length) {
    push('## Sources available in the workshop', '');
    for (const s of sourceList) push(`- **${s.title}** (${s.path.split('/').pop()}, ${s.date || 'undated'}): ${s.role}. ${s.authority}.`);
    push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
