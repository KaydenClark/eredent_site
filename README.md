# Kiros, before the first people

An explorable 3D world of Kiros, the principal mapped region of Azlemzyk, built from the
[Kiros World Build Spec](docs/SPEC.md), plus a workshop for questioning the sources it was built from.
Environment only: no towns, labels or people in the world.

Live site (main branch only): https://kaydenclark.github.io/eredent_site/

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173/. The welcome card offers one-click starts (forest, beach, Veir summit, Lake Veir shore,
volcano, wetland, outer ocean, orbit). `?nowelcome` skips it.

`npm test` runs the node:test suites (navigation, workshop store, brief, markdown reader). `npm run build` writes
`dist/` for GitHub Pages; the workflow in `.github/workflows/deploy.yml` deploys `main` automatically.

## Two halves

**Immerse.** One camera from orbit to standing on the ground.
- *Survey* (M): the original descent camera. Drag moves the ground, wheel or pinch changes height, right-drag or
  Shift-drag turns and tilts.
- *Walk* (G): lands where the middle of the screen points. WASD, arrows turn, Shift runs, Space jumps (the small
  world has about a quarter of Earth's gravity). Wading into water slows you down.
- *Fly* (V): WASD along the view, Space/E up, C/Q down, Shift boost; faster the higher you are.
- Click the view to capture the mouse (Esc releases it), or drag to look. Wheel or `[` `]` set the speed. An on-screen
  pad covers touch screens. `L` cycles the light (sunrise, midday, golden hour, a two-moon night), `Home` resets,
  `H` shows help.
- Generated stand-ins, not canon: trees, understory, ground cover and rocks by zone (Pandora-scale canopy heights
  from the spec's proposed table), relief finer than about 1 km, dragon flights, ambient sound (off until enabled).

**Develop.** The workshop (`J`, or the button at the top right).
- *Sources*: every map, drawing, painting and text, zoomable, with role, frame, authority and the original file.
- *Compare*: the September penup master against the Oct 10 outline (`kiros_earth_re.png`), registered to the same
  grid: overlay, blink, swipe, lake table. "Drape on globe" lays either drawing's ink over the 3D terrain.
- *Places*: named places with evidence and status (canon, derived, disputed, older-map name); Go flies there.
- *Notebook*: notes, questions, proposals (kept visibly apart from canon), ideas and bookmarked views, saved in the
  browser, with JSON export and validated import.
- *Brief*: a markdown brief of open questions, proposals and source conflicts to paste into Claude or Codex.

The Survey panel also switches the planet size (small world or Earth-sized) and the terrain source (September penup
build, or the Oct 10 outline built as a variant when `public/textures/oct10/` exists).

## What is here

| Path | What it is |
| --- | --- |
| `index.html`, `src/` | The site. Vite + Three.js. `terrain.js`/`shaders.js` (precision-safe LOD sphere), `controls.js`/`nav.js` (camera rig, walk/fly physics), `vegetation.js`, `dragons.js`, `audio.js`, `workshop/` (the Develop half). |
| `pipeline/` | Python steps that turn the penup outline and biome map into elevation, water and biome layers, then into web textures. `config.json` holds every canon, derived and proposed number. `compare_sources.py` registers the Oct 10 outline and measures what changed. |
| `pipeline/source/` | The master drawings: `penup_20260912_182533.jpg` (coastlines, lakes in blue ink), the same drawing in black ink, and the biome map `kiros_v5.png`. |
| `docs/drive-source/` | The six files from the linked Drive folder, byte-for-byte (see `manifest.json`); `docs/kiros-drive-description-2026-10-10.md` is the Google Doc text. |
| `public/textures/`, `public/data/` | Built layers the site loads, the source overlays, and `source_comparison.json`. |
| `docs/SPEC.md`, `docs/acceptance.md` | The spec, and where each acceptance check stands. |
| `docs/source-comparison.md` | The September vs Oct 10 comparison, with numbers. |
| `docs/MORNING-HANDOFF.md` | Start here after the overnight build: route, evidence, caveats, questions. |

**Private sources stay local.** The workshop (and its thumbnails and Drive references) is only loaded by the dev
server; a production build leaves it out, strips the dev-only data from `dist/` (source previews and traced ink,
overlays, the comparison data, the Oct 10 variant), and `npm run build` ends with `scripts/check-dist.mjs`, which fails
if any of that or a Google Drive/Docs link reaches `dist/`. So the Pages workflow on `main` would publish only the
explorable world. Previews of the source maps (`public/sources/previews`, `thumbs`) are regenerated locally by
`python pipeline/compare_sources.py` and are not committed.

## Rebuild the layers

```bash
pip install -r pipeline/requirements.txt
python pipeline/run_all.py
```

`python pipeline/run_all.py --variant oct10` builds the Oct 10 outline as a separate terrain variant
(`docs/oct10-variant.md`); without the flag the September build is reproduced unchanged.

Steps: `masks` (land and water by nesting parity, lakes from blue ink, mountain marks) → `register` (biome map onto
the outline grid) → `project` (placement on the sphere) → `terrain` (heights, lakes, bathymetry, zones) → `render`
(color texture and globe textures) → `export_web` (regional textures and meta for the site).

## Spec milestones

1. Data layers: done, reproducible from `pipeline/`.
2. Orbital globe: done.
3. Seamless descent: done, now to standing height.
4. Ground level (walk and fly, instanced vegetation, shoreline and waves): working prototype; see `docs/acceptance.md`.
5. Life and sound: first pass (dragon silhouettes, synthesized ambience); no birds or megafauna models yet.
