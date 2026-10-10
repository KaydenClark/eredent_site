// The source reader must show raw HTML as text and only link to http(s) URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline } from '../src/workshop/markdown.js';

test('raw HTML stays plain text and javascript: links are not links', () => {
  const toks = parseInline('<img src=x onerror=alert(1)> [click](javascript:alert(1)) [doc](https://docs.google.com/x)');
  assert.ok(toks.filter(t => t.t === 'link').every(t => /^https:/.test(t.href)));
  assert.equal(toks.filter(t => t.t === 'link').length, 1);
  assert.ok(toks.some(t => t.t === 'text' && t.v.includes('<img src=x onerror=alert(1)>')));
});

test('markdown blocks: headings, wrapped paragraphs, lists and tables', () => {
  const b = parseMarkdown('# Title\n\nline one\nline two\n\n- a\n- b\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.deepEqual(b.map(x => x.type), ['h', 'p', 'list', 'table']);
  assert.equal(b[1].text, 'line one line two');
  assert.deepEqual(b[3].rows, [['A', 'B'], ['1', '2']]);
});

test('lines mode (Google Doc snapshot): each line is a paragraph and short title lines become headings', () => {
  const b = parseMarkdown('﻿World Overview\nKiros is an Earth-like world.\nPlanet, Scale, and Sky\n* Lake Veir lies within the Veir mountain country.', { mode: 'lines' });
  assert.deepEqual(b.map(x => [x.type, x.text ?? x.items?.length]), [['h', 'World Overview'], ['p', 'Kiros is an Earth-like world.'], ['h', 'Planet, Scale, and Sky'], ['list', 1]]);
});
