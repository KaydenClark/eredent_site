// Source catalog for the workshop: every original map, drawing and text Kayden has supplied, with where it lives,
// how much authority it has and what it actually shows. Identical files (same md5) are listed once, with their other
// copies in `altPaths`. Originals are served untouched by the Vite dev server from the project root.
//
// Authority follows docs/SPEC.md "Source-of-truth order": 1 Kayden's statements in the spec, 2 the penup outline
// (geometry), 3 kiros_v5 (biome zones), 4 the Google Doc (terrain character, climate, water), 5 AI-painted maps (art
// direction only). Files outside that list are reference or history and carry no rank.
// Descriptions only state what is visible in the file or written in the docs; nothing is inferred as lore.

const BASE = (() => {
  try { return (import.meta.env && import.meta.env.BASE_URL) || '/'; } catch { return '/'; }
})();

// Project-relative path -> URL the dev server serves (each segment URL-encoded, so spaces and commas are safe).
export function srcUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path)) return path;
  const clean = String(path).replace(/^\.?\//, '').replace(/^public\//, '');
  return BASE + clean.split('/').map(encodeURIComponent).join('/');
}

export const DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1rnmWenlpzFba6Ztg39HFw6NitafdCSIx';

export const AUTHORITY = [
  { rank: 1, label: "Kayden's statements in the spec" },
  { rank: 2, label: 'Penup outline: coastlines, lakes, mountain placement' },
  { rank: 3, label: 'kiros_v5 biome map: desert, wetland, forest and snow zones' },
  { rank: 4, label: 'Google Doc "Kiros Map Description": terrain character, climate, water' },
  { rank: 5, label: 'AI-painted color map: art direction only' }
];

export const SOURCES = [
  {
    id: 'penup', title: 'Penup outline (master)', kind: 'image',
    path: 'docs/drive-source/Kiros_map_source_sketch.jpg',
    altPaths: ['pipeline/source/penup_20260912_182533.jpg', 'maps/Kiros_map_source_sketch.jpg'],
    md5: 'c5f51bc6ad4f0cd0d8da1002aebe97dc', bytes: 612009, size: [1362, 1155],
    driveUrl: 'https://drive.google.com/file/d/1E6BQSih0Jr066i0Ag0u_1wQ8YJLd3vhf/view', driveName: 'Kiros_map_source_sketch.jpg',
    date: '2026-09-12', dateBasis: 'drawing date in the pipeline file name (penup_20260912_182533); Drive copy modified 2026-10-10',
    role: 'Geometry master', authority: 'Rank 2: coastlines, lakes and mountain placement', rank: 2, status: 'canon',
    frame: 'Master grid, 1362 × 1155 px, north up. Every built layer is aligned to it.',
    description: 'Grey outline of every coast and island, zigzag mountain marks, and blue ink loops for Lake Veir, Sfere and Dire Lake; Dire Lake has a second inner loop. This is what the current 3D terrain is built from.',
    cites: ['SPEC.md, Source files: "Master. Coastlines, islands, mountain marks, lakes in blue ink"', 'Drive description, Current Map Scope: "the most official map design and the source of truth for coastlines, lakes, and mountain placement"']
  },
  {
    id: 'penup_black', title: 'Penup outline, black ink', kind: 'image',
    path: 'maps/ca093ac3-1b33-4003-87ab-232136e9d27b.png',
    altPaths: ['pipeline/source/ca093ac3-1b33-4003-87ab-232136e9d27b.png'],
    md5: 'ae21588828c3d0605d6463ba5ab5b891', bytes: 1787533, size: [1362, 1155],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Tracing copy of the master', authority: 'Same geometry as rank 2', rank: 2, status: 'canon',
    frame: 'Master grid, 1362 × 1155 px.',
    description: 'The penup drawing rendered in black ink, used by the pipeline for cleaner line tracing.',
    cites: ['SPEC.md, Source files: "The same drawing in black ink. Cleaner lines for tracing. Identical geometry."']
  },
  {
    id: 'v5', title: 'kiros_v5 biome map', kind: 'image',
    path: 'maps/kiros_v5.png', altPaths: ['pipeline/source/kiros_v5.png'],
    md5: '961ee86a5582a776dfe64d91df479db1', bytes: 1515567, size: [1208, 954],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Biome zones', authority: 'Rank 3: desert, wetland, forest and snow zones', rank: 3, status: 'canon',
    frame: 'Own grid, 1208 × 954 px. Fitted to the master by a similarity transform (scale about 1.10, small shift).',
    description: 'The outline with hand-drawn zones: yellow desert loops in the far southwest and on the Dragon Islands, a purple wetland band along east Malos, grey snow hatching, green forest hatching and green/teal zone edges, and blue lakes.',
    cites: ['SPEC.md, Source files: "yellow = desert, purple = wetland, grey hatch = snow, green hatch = dense forest"']
  },
  {
    id: 'earth_re', title: 'kiros_earth_re: Oct 10 outline revision', kind: 'image',
    path: 'docs/drive-source/kiros_earth_re.png', altPaths: ['maps/kiros_earth_re.png'],
    md5: '7dc4c86b258d25f6159d4b1cd4728bf7', bytes: 1303034, size: [1208, 954],
    driveUrl: 'https://drive.google.com/file/d/1gqp0lrlKjFthe5YT_0KFQ1TITyYNToSm/view', driveName: 'kiros_earth_re.png',
    date: '2026-10-10', dateBasis: 'Drive modified 2026-10-10 06:41 UTC (newest file in the folder)',
    role: 'Newest outline revision (built only as a what-if terrain variant)', authority: 'Newest evidence for changed geometry; not automatically canon', rank: null, status: 'disputed',
    frame: 'Same pixel size as kiros_v5 (1208 × 954). Registration to the master: see Compare.',
    description: 'Hand-drawn outline with olive mountain strokes and much smaller blue lakes than the penup master; Dire Lake is drawn as a single small loop with no inner depression. The 3D terrain still uses the September penup lakes.',
    cites: ['KIROS-OVERNIGHT-BRIEF.md: "a hand-drawn outline with substantially smaller blue lakes than the existing penup-derived large lakes"', 'drive-source/manifest.json: modified 2026-10-10T06:41:32Z']
  },
  {
    id: 'saphaun_empty', title: 'saphaun_drawn_Empty: clean coastline base', kind: 'image',
    path: 'docs/drive-source/Copy of saphaun_drawn_Empty.jpg', altPaths: ['maps/saphaun_drawn_Empty.jpg'],
    md5: '92dee7a866a2634f15ced0ab2fff1c17', bytes: 1812179, size: [2416, 1908],
    driveUrl: 'https://drive.google.com/file/d/1BHuJmoRZwkOFvdQiAha-sJpJw-x2hTPR/view', driveName: 'Copy of saphaun_drawn_Empty.jpg',
    date: '2026-10-10', dateBasis: 'Drive modified 2026-10-10 06:32 UTC (copy); local original 2026-09-12',
    role: 'Clean coastline base', authority: 'Reference: coastline only', rank: null, status: 'reference',
    frame: '2416 × 1908 px, exactly twice the size of kiros_v5 and kiros_earth_re.',
    description: 'Coastlines and islands only: no mountains, lakes or zones. A blank base the marked-up versions are drawn on.',
    cites: ['Inspected file; manifest.json']
  },
  {
    id: 'saphaun_edit', title: 'saphaun_drawn_edit: outline with mountains and lakes', kind: 'image',
    path: 'maps/saphaun_drawn_edit.jpg', altPaths: [],
    md5: '1b2279e550a517af3c494befd9a3bfac', bytes: 779018, size: [2416, 1908],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Marked-up outline (reference)', authority: 'Reference', rank: null, status: 'reference',
    frame: 'Same 2416 × 1908 base as saphaun_drawn_Empty.',
    description: 'The clean base with brown zigzag mountain marks and blue lake loops (a long Lake Veir, a small Sfere, a large Dire Lake without an inner loop).',
    cites: ['Inspected file']
  },
  {
    id: 'saphaun_marked', title: 'saphaun_drawn_marked: marker zones photo', kind: 'image',
    path: 'maps/saphaun_drawn_marked.jpg', altPaths: [],
    md5: '30ffb40d5c643bf2e8b2b88c9f93a194', bytes: 2162364, size: [4000, 2252],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Zone sketch (photo)', authority: 'Reference', rank: null, status: 'reference',
    frame: 'Photo of a framed print at an angle, with glare. Not registered.',
    description: 'Marker zones drawn over the outline in teal, purple, pink and blue, with a hand-written color legend in the lower left (partly legible: Tropical, Swamp, Pine trees, Deep, Islands).',
    cites: ['Inspected file']
  },
  {
    id: 'map_a', title: 'Kiros_Map_A: older pencil map', kind: 'image',
    path: 'docs/drive-source/Kiros_Map_A.jpg', altPaths: ['maps/Kiros_Map_A.jpg'],
    md5: '291dc7de78d9aeefb09dc9c0e024d3a0', bytes: 1876065, size: [1708, 2336],
    driveUrl: 'https://drive.google.com/file/d/11KKzDP_fiVay3TF_BtRlT8_UaQbaYZtn/view', driveName: 'Kiros_Map_A.jpg',
    date: '2026-10-10', dateBasis: 'Drive modified 2026-10-10 06:25 UTC (upload date, not drawing date)',
    role: 'Older pencil map, rotated', authority: 'History: different coordinate frame', rank: null, status: 'older map',
    frame: 'Raw pixels 1708 × 2336 with north to the right of the page; an EXIF orientation tag (8) makes browsers show it turned 90° counter-clockwise (2336 × 1708, roughly north-up). Older geometry, not registered: do not mix its coordinates with the master.',
    description: 'Pencil drawing of the continents with shaded mountain hatching and heart-shaped and rounded lakes. Rotated against the current north-up outline; its coastlines are older geometry and are not registered.',
    cites: ['KIROS-OVERNIGHT-BRIEF.md: "rotated relative to the current north-up outline; do not mix coordinate frames"', 'source_comparison.json, map_a: north points to image right; 90° counter-clockwise to north-up']
  },
  {
    id: 'map_previous', title: 'Kiros_map_previous: labeled colored map', kind: 'image',
    path: 'docs/drive-source/Kiros_map_previous.jpg', altPaths: ['docs/kiros_map_previous_labeled.jpg', 'maps/20250930_231350.jpg'],
    md5: 'fbe948291c2f30557e528c354732c665', bytes: 4284924, size: [3184, 2444],
    driveUrl: 'https://drive.google.com/file/d/1RBPd7zV6I2lHtbRyb6qYP_3IjVYJQyxj/view', driveName: 'Kiros_map_previous.jpg',
    date: '2025-09-30', dateBasis: 'photo date in the file name 20250930_231350; Drive modified 2026-10-10',
    role: 'Names and history', authority: 'Older labels; coastlines differ from the outline', rank: null, status: 'older map',
    frame: 'Photo of a hand-colored sheet, roughly north up. Not registered.',
    description: 'Colored-pencil map with labels: Icla Islands, Ice Sea, Goblin Mountains, Jerr Islands, North Ocean, Snow Islands, Elf Sea, Thiefs Sea, Ender Sea, Dragon Sea, Orc Ocean, Rongle, Veir, Togum, Fiy, Glem, Ener, Ignas, Noc, Diron, Lake Dire, Oasis, Malos Spine and more. Rivers, a round white mark in western Fiira, and orange dry areas in the south.',
    cites: ['Drive description, Named Seas and Other Names Preserved by Older Maps']
  },
  {
    id: 'map_previous_pdf', title: 'Kiros Colored.pdf (2016 scan)', kind: 'pdf',
    path: 'maps/Kiros Colored.pdf', altPaths: [],
    md5: 'fba52a2a73028d0797c7fcfd893de099', bytes: 1718847, size: [5088, 6592],
    date: '2016-07-28', dateBasis: 'PDF creation date in its metadata (oldest dated file)',
    role: 'Oldest dated copy of the labeled map', authority: 'History', rank: null, status: 'older map',
    frame: 'One letter-size page; the map is turned 90° on the page.',
    description: 'A one-page scan that appears to be the same colored-pencil labeled map as Kiros_map_previous, rotated 90° on a portrait page. Opens in the browser\'s PDF viewer.',
    cites: ['PDF metadata CreationDate 2016-07-28; inspected embedded image']
  },
  {
    id: 'pencil_labeled_2025', title: 'Labeled pencil map with forests (photo)', kind: 'image',
    path: 'maps/20250930_231205.jpg', altPaths: [],
    md5: '6740c3d3eee03d7ac82fca463f3fd9e5', bytes: 4396991, size: [3284, 2444],
    date: '2025-09-30', dateBasis: 'photo date in the file name',
    role: 'Older labeled sketch', authority: 'History', rank: null, status: 'older map',
    frame: 'Photo of a notebook page, roughly north up. Not registered.',
    description: 'Ink and pencil map on notebook paper with blue lakes, dark-green hatched forest bands, mountain hatching, rivers and labels (Icala Islands, Jerr Islands, North Ocean, Snow Islands, Thiefs Sea, Ender Sea, Dragon Sea, Dragon Islands, Orc Ocean, Malos Spine, Veir Mountains). A curved line across the south is labeled equator.',
    cites: ['Inspected file']
  },
  {
    id: 'outline_2024', title: 'Outline scan, August 2024', kind: 'image',
    path: 'maps/20240812_184702.jpg', altPaths: [],
    md5: 'acc14127824f0a1e333e6a1db5581a9f', bytes: 1419823, size: [2344, 1926],
    date: '2024-08-12', dateBasis: 'date in the file name',
    role: 'Earlier coastline drawing', authority: 'History', rank: null, status: 'older map',
    frame: '2344 × 1926 scan on cream paper. Not registered.',
    description: 'Coastline-only outline on cream paper, with dotted island chains in the north and around the Dragon Islands. No mountains, lakes or labels.',
    cites: ['Inspected file']
  },
  {
    id: 'west_symbols', title: 'Map_West_Mountains_Trees', kind: 'image',
    path: 'maps/Map_West_Mountains_Trees.JPG', altPaths: [],
    md5: '38f92221a97a879d916bc0de6e8ef9cc', bytes: 352691, size: [1240, 1639],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Symbol sketch of the western lands', authority: 'Reference', rank: null, status: 'reference',
    frame: 'Portrait crop of the western lands. Not registered.',
    description: 'Outline of the western lands with black mountain symbols, round broadleaf trees, palm trees in the south, and blue wave symbols where a lake sits among the mountains.',
    cites: ['Inspected file']
  },
  {
    id: 'earth_scale', title: 'Kiros at Earth size (annotated painting)', kind: 'image',
    path: 'docs/kiros_earth_scale.png', altPaths: ['maps/Kiros_at_earth.png'],
    md5: 'bc45219de8142d5e372c1fbee4961ad1', bytes: 4231478, size: [2000, 1872],
    date: '2026-10-10', dateBasis: 'local file time',
    role: 'Painted derivative of the penup master (option B)', authority: 'Derived illustration, not a source of geometry', rank: null, status: 'derived',
    frame: 'Painted from the penup master with latitude lines (0°, 15°N, 45°N, 60°N, 75°N).',
    description: 'Painted map labeled "Kiros at Earth size": radius 6,371 km, 1.00 g, same drawing and latitudes, 11,100 km west to east, with land areas per continent and Lake Bonneville and the Caspian drawn at true area for scale. It shows the large September lakes. It is not the Oct 10 outline.',
    cites: ['Text printed on the image', 'KIROS-OVERNIGHT-BRIEF.md: "NOT the painted annotated docs/kiros_earth_scale.png image"']
  },
  {
    id: 'painted_close', title: 'Kiros_close (AI-painted)', kind: 'image',
    path: 'maps/Kiros_close.png', altPaths: [],
    md5: '993943f2784a0286cc0f633bc435cc1d', bytes: 3036058, size: [1411, 1115],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Art direction only', authority: 'Rank 5: not for geometry or biomes', rank: 5, status: 'art',
    frame: 'Painted, not registered.',
    description: 'AI-painted color map with dark inner seas, desert painted over Ender and west Fiira, and rivers. These match the drift the spec lists for the AI-painted map.',
    cites: ['SPEC.md, "Where the painted map drifts from canon"']
  },
  {
    id: 'painted_poor', title: 'Kiros_poor (AI-painted)', kind: 'image',
    path: 'maps/Kiros_poor.png', altPaths: [],
    md5: '6498797c428a4259d930224ed5406724', bytes: 3347194, size: [1410, 1115],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Art direction only', authority: 'Rank 5: not for geometry or biomes', rank: 5, status: 'art',
    frame: 'Painted, not registered.',
    description: 'Another AI-painted version with pale turquoise inner seas, desert on Ender and west Fiira, snowy northern islands and a ringed basin around Lake Veir.',
    cites: ['Inspected file; SPEC.md source-of-truth order item 5']
  },
  {
    id: 'painted_revised_oct10', title: 'Revised Earth-sized concept (AI-painted, Oct 10)', kind: 'image',
    path: 'maps/ChatGPT Image Oct 10, 2026, 12_47_49 AM.png', altPaths: [],
    md5: 'c4d7bd9fd7ed4b3e7af98e606a98107c', bytes: 3051069, size: [1411, 1114],
    date: '2026-10-10', dateBasis: 'date and time in the file name',
    role: 'Art direction only', authority: 'Rank 5: not for geometry or biomes', rank: 5, status: 'art',
    frame: 'Painted, not registered.',
    description: 'AI-painted map titled "Kiros — revised Earth-sized concept", captioned "Large continents • Smaller inland lakes • Revised mountain placement" and "Based on the revised sketch; lake areas not yet calibrated". Labels Fiira, Ender, Roan, Create, Malos, Lake Veir, Sfere, Dire Lake, Veir Mountains, Malos Spine and the seas.',
    cites: ['Text printed on the image']
  },
  {
    id: 'gpt_illustrated', title: 'Kiros1_GPT (AI-illustrated labeled map)', kind: 'image',
    path: 'maps/Kiros1_GPT.png', altPaths: [],
    md5: '003f0d45a068142215afd575f952855a', bytes: 2870150, size: [1448, 1086],
    date: '2026-09-12', dateBasis: 'local file time',
    role: 'Art direction only', authority: 'Rank 5; its labels follow the older labeled map', rank: 5, status: 'art',
    frame: 'Painted, not registered.',
    description: 'AI-illustrated fantasy map with the older labels (Icla Islands, Ice Sea, Goblin Mountains, Elf Sea, Thief Sea, Rongle, Veir, Togum, Mysreal, Tolkien, Glem, Noc, Dire, Lake Dire, Diron, Oasis, Bose), a castle drawing at Rongle and a scale bar in miles. The castle is not part of the environment.',
    cites: ['Inspected file; SPEC.md "No towns, labels, roads, ruins"']
  },
  // ---- text sources ----
  {
    id: 'drive_doc', title: 'Kiros Map Description (Google Doc, Oct 10 snapshot)', kind: 'text',
    path: 'docs/kiros-drive-description-2026-10-10.md', altPaths: [], textFormat: 'lines',
    driveUrl: 'https://docs.google.com/document/d/1WrmwPA1HWUuvJRBltkJReMyFJsPyyOLIvRlRqP2neQ8/edit', driveName: 'Kiros Map Description',
    date: '2026-10-10', dateBasis: 'Drive modified 2026-10-10 05:54 UTC; snapshot fetched 2026-10-10',
    role: 'Current description text', authority: 'Rank 4: terrain character, climate, water', rank: 4, status: 'canon',
    frame: 'Text.',
    description: 'Kayden\'s current written description: world overview, planet size conflict (small world vs Earth-sized), working latitudes, landmasses, lakes, seas, biomes, mountains, settlement placement notes and older names.',
    cites: ['manifest.json']
  },
  {
    id: 'spec', title: 'Kiros World Build Spec', kind: 'text',
    path: 'docs/SPEC.md', altPaths: [],
    date: '2026-10-09', dateBasis: 'date in the document',
    role: 'Build spec and source-of-truth order', authority: "Rank 1 for Kayden's own statements; marks canon, derived and proposed", rank: 1, status: 'canon',
    frame: 'Text.',
    description: 'Planet options A and B, placement latitudes, heights, water, biomes, build milestones and the open questions list.',
    cites: ['SPEC.md']
  },
  {
    id: 'description_old', title: 'Kiros Map Description (older copy)', kind: 'text',
    path: 'docs/kiros-map-description.md', altPaths: [],
    date: '2026-10-09', dateBasis: 'earlier copy in the repository',
    role: 'Older version of the Google Doc', authority: 'Superseded by the Oct 10 snapshot', rank: null, status: 'older text',
    frame: 'Text.',
    description: 'Earlier copy of the description. It calls Kiros "the principal mapped region of Azlemzyk" and compares Lake Veir to Bonneville only "in concept"; the Oct 10 text makes the cluster the only land and Lake Veir about Bonneville-sized.',
    cites: ['Compare with the Oct 10 snapshot']
  },
  {
    id: 'acceptance', title: 'Build acceptance findings', kind: 'text',
    path: 'docs/acceptance.md', altPaths: [],
    date: '2026-10-09', dateBasis: 'pipeline build numbers dated in the document',
    role: 'Build evidence (not lore)', authority: 'Measurements of the current build', rank: null, status: 'derived',
    frame: 'Text.',
    description: 'How the current terrain meets the spec checks, and findings for Kayden: the northern limit lands at 68°N with the spec placement, atmosphere and moon assumptions.',
    cites: ['acceptance.md']
  }
];

export const sourceById = id => SOURCES.find(s => s.id === id) || null;

// ---------- runtime merge with public/data/source_comparison.json (optional; produced by pipeline/compare_sources.py) ----------

const URL_FIELDS = ['thumb', 'thumbnail', 'preview', 'display', 'north_up', 'rotated', 'registered', 'on_master', 'lines'];

function webPath(p) {
  if (typeof p !== 'string' || !p) return null;
  if (/^(https?:)?\/\//.test(p) || p.startsWith('data:')) return null; // only same-origin local files
  return srcUrl(p.replace(/\\/g, '/'));
}

const base = p => String(p || '').replace(/\\/g, '/').split('/').pop().toLowerCase();

function comparisonEntries(comparison) {
  const files = comparison && comparison.files;
  if (Array.isArray(files)) return files.filter(f => f && typeof f === 'object');
  if (files && typeof files === 'object') return Object.entries(files).map(([k, v]) => (v && typeof v === 'object' ? { id: k, ...v } : null)).filter(Boolean);
  return [];
}

// Attach preview/thumb URLs (and any extra derived image URLs) from the comparison data to catalog entries.
export function mergeComparison(sources, comparison) {
  const entries = comparisonEntries(comparison);
  return sources.map(s => {
    const names = new Set([s.path, ...s.altPaths].map(base));
    const hit = entries.find(e => e.id === s.id || (e.md5 && e.md5 === s.md5) ||
      ['path', 'original', 'source', 'file', 'name', 'src'].some(k => typeof e[k] === 'string' && names.has(base(e[k]))));
    if (!hit) return { ...s };
    const extra = {};
    for (const k of URL_FIELDS) { const u = webPath(hit[k]); if (u) extra[k] = u; }
    if (extra.thumbnail && !extra.thumb) extra.thumb = extra.thumbnail;
    return { ...s, comparison: hit, ...extra };
  });
}

// Every string value in the comparison JSON that looks like a derived image path, found anywhere in the tree.
export function derivedImages(comparison) {
  const found = new Set();
  const walk = (v, depth) => {
    if (depth > 8 || v == null) return;
    if (typeof v === 'string') { if (/derived\/[^"]+\.(png|jpe?g|webp)$/i.test(v.replace(/\\/g, '/'))) found.add(v.replace(/\\/g, '/')); return; }
    if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
    if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  walk(comparison, 0);
  const list = [...found];
  const pick = re => { const p = list.find(x => re.test(base(x))); return p ? webPath(p) : null; };
  return {
    all: list.map(p => ({ path: p, url: webPath(p), name: base(p) })),
    earthReLines: pick(/earth_?re.*lines.*master/),
    penupLines: pick(/(penup|master|sept).*lines.*master/) || pick(/^master_lines/),
    v5OnMaster: pick(/v5.*on.*master/),
    mapANorthUp: pick(/map_?a.*(north|rot)/)
  };
}

// Fallback guesses for the derived files when the JSON is missing or does not list them.
export const DERIVED_GUESSES = {
  earthReLines: 'public/sources/derived/earth_re_lines_master.png',
  penupLines: 'public/sources/derived/penup_lines_master.png',
  v5OnMaster: 'public/sources/derived/v5_on_master.png',
  mapANorthUp: 'public/sources/derived/map_a_north_up.png'
};

export async function loadComparison(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const r = await fetchImpl(srcUrl('data/source_comparison.json'), { cache: 'no-cache' });
    if (!r.ok) return null;
    const type = r.headers?.get?.('content-type') || '';
    if (type && !/json/.test(type)) return null; // dev server answers unknown paths with index.html
    const j = await r.json();
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}

const LAKE_NAMES = { veir: 'Lake Veir', sfere: 'Sfere', dire: 'Dire Lake' };
const lakeName = n => LAKE_NAMES[String(n).toLowerCase()] || String(n);

// Lake rows from the comparison data: [{ name, fields: [[label, value], ...] }].
// Understands the pipeline/compare_sources.py shape ({ penup: [...], earth_re: [...], comparison: [...] }) and,
// as a fallback, a plain list or name-keyed object of rows.
export function comparisonLakes(comparison) {
  let lakes = comparison && (comparison.lakes || comparison.lake_differences || comparison.lake_areas);
  if (!lakes || typeof lakes !== 'object') return [];
  if (!Array.isArray(lakes) && Array.isArray(lakes.penup) && Array.isArray(lakes.earth_re)) {
    const by = (list, name) => (Array.isArray(list) ? list.find(r => r && String(r.name ?? r.lake) === name) : null);
    const names = [...new Set([...lakes.penup, ...lakes.earth_re].map(r => r && String(r.name)).filter(Boolean))];
    const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return names.map(n => {
      const p = by(lakes.penup, n) || {}, e = by(lakes.earth_re, n) || {}, c = by(lakes.comparison, n) || {};
      const fields = [
        ['penup km² (small world)', num(p.area_km2_small_world)],
        ['earth_re km² (small world)', num(e.area_km2_small_world)],
        ['penup km² (Earth-sized)', num(p.area_km2_earth_sized)],
        ['earth_re km² (Earth-sized)', num(e.area_km2_earth_sized)],
        ['earth_re / penup area', num(c.area_ratio_earth_re_over_penup)],
        ['center moved km (small world)', num(c.centroid_shift_km_small_world)],
        ['center moved km (Earth-sized)', num(c.centroid_shift_km_earth_sized)]
      ].filter(f => f[1] !== null);
      if (typeof c.penup_inner_depression === 'boolean' || typeof c.earth_re_inner_depression === 'boolean') {
        fields.push(['inner depression (penup / earth_re)', `${c.penup_inner_depression ? 'yes' : 'no'} / ${c.earth_re_inner_depression ? 'yes' : 'no'}`]);
      }
      return { name: lakeName(n), fields };
    });
  }
  if (!Array.isArray(lakes)) lakes = Object.entries(lakes).map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { name: k, ...v } : null)).filter(Boolean);
  return lakes.filter(l => l && typeof l === 'object' && !Array.isArray(l)).map(l => {
    const name = lakeName(l.name ?? l.lake ?? l.id ?? 'lake');
    const fields = [];
    const flat = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj)) {
        if (['name', 'lake', 'id'].includes(k) && !prefix) continue;
        const label = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'number' && Number.isFinite(v)) fields.push([label, v]);
        else if (typeof v === 'string' && v.length < 200) fields.push([label, v]);
        else if (typeof v === 'boolean') fields.push([label, v ? 'yes' : 'no']);
        else if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) flat(v, label);
      }
    };
    flat(l, '');
    return { name, fields };
  });
}

const pct = v => `${Math.round(v * 1000) / 10}%`;

// Short, cited findings from the comparison data: explicit lists if present, plus readouts of known measurements.
export function comparisonFindings(comparison) {
  if (!comparison || typeof comparison !== 'object') return [];
  const out = [];
  const raw = comparison.discrepancies || comparison.findings || comparison.differences || comparison.notes;
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const t = typeof x === 'string' ? x : x && typeof x === 'object' ? [x.title || x.name || x.id, x.detail || x.summary || x.text || x.description].filter(Boolean).join(': ') : '';
      if (typeof t === 'string' && t.trim()) out.push(t.slice(0, 600));
    }
  }
  const ca = comparison.coastline_agreement;
  if (ca && typeof ca.earth_re_coast_within_2px_of_penup_coast === 'number') {
    out.push(`Coastlines barely changed: ${pct(ca.earth_re_coast_within_2px_of_penup_coast)} of the Oct 10 coast lies within 2 px of the penup coast${typeof ca.penup_coast_within_2px_of_earth_re_coast === 'number' ? ` (${pct(ca.penup_coast_within_2px_of_earth_re_coast)} the other way)` : ''}. The lakes and mountain marks are what changed.`);
  }
  const mm = comparison.mountain_marks;
  if (mm && mm.penup && mm.earth_re && typeof mm.penup.total_strokes === 'number' && typeof mm.earth_re.total_strokes === 'number') {
    out.push(`Mountain marks: ${mm.penup.total_strokes} strokes (about ${fmtNumber(mm.penup.total_length_km_small_world)} km on the small world) on the penup outline vs ${mm.earth_re.total_strokes} strokes (about ${fmtNumber(mm.earth_re.total_length_km_small_world)} km) on the Oct 10 outline.`);
  }
  const ring = mm && mm.veir_ring_test && mm.veir_ring_test.around_penup_veir_centroid_r120px;
  if (ring && ring.penup && ring.earth_re) {
    out.push(`Around Lake Veir the penup outline has mountain marks in ${ring.penup.sectors_with_marks} of ${ring.penup.of} directions (a ring); the Oct 10 outline in ${ring.earth_re.sectors_with_marks} of ${ring.earth_re.of}${Array.isArray(ring.earth_re.directions) ? ` (${ring.earth_re.directions.join(', ')})` : ''}.`);
  }
  const lakes = comparison.lakes;
  if (lakes && Array.isArray(lakes.comparison)) {
    for (const c of lakes.comparison) {
      if (c && c.penup_inner_depression === true && c.earth_re_inner_depression === false) out.push(`${lakeName(c.lake ?? c.name)}: the penup inner depression loop is absent on the Oct 10 outline.`);
    }
  }
  const ma = comparison.map_a;
  if (ma && typeof ma.rotation_to_north_up === 'string') out.push(`Kiros_Map_A: north points to the ${ma.north_points_to || 'side'}; turning it ${ma.rotation_to_north_up} puts it north-up. Its coastlines are older and not registered.`);
  const prev = comparison.kiros_map_previous;
  if (prev && prev.registrable === false && typeof prev.note === 'string') out.push(`Kiros_map_previous: ${prev.note}`);
  return out.map(s => s.slice(0, 600));
}

// Frame legend text for a comparison frame code, if the comparison data defines it.
export function frameLegend(comparison, code) {
  const legend = comparison && comparison.frame_legend;
  return legend && typeof legend[code] === 'string' ? legend[code] : null;
}

export const fmtNumber = v => (typeof v === 'number' ? (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100)) : String(v));
