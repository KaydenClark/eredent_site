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

### Shared local checkout and preview

On this Windows host, Claude and Codex use `E:/GPT_OS/Projects/eredent_site`.
Use the existing preview at `http://127.0.0.1:5173/`, or run `npm run dev` from
that folder if it is stopped. The server refuses an occupied port so a second
launch cannot silently create an extra preview. Coordinate concurrent edits;
temporary worktrees require an explicit request and cleanup after integration.

The October 11 consolidation retained all committed work from the retired
worktrees in the `integration` history. Unfinished moon/planet edits are preserved
on local branch `recovery/eredent-moon-unfinished-2026-10-11`; inspect that branch
before resuming them. They are preserved work, not an accepted merge into the site.
After saving current changes, that branch can be checked out in this same folder.
Exact file archives, including local-only assets, and verified Git bundles are
in `.local-recovery/2026-10-11-consolidation/`. Its `manifest.json` records archive
hashes and original checkout state; `unfinished-work.json` names the recovery
commit and files. Keep this directory private and out of Git.

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


## Forest and creatures

Two forests share the ground. Near the camera, `src/vegetation.js` builds the walkable forest on the CPU: giant trees
out to ~2.6–5 km, understory, ground cover and rocks, with trunks a walker collides with. Past that ring, and above
3.5 km where the near forest switches off, `src/forest.js` fills in on the GPU out to ~16 km: every tree is an
instance on a lat/lon grid of cells around the camera (`src/scatter.js`), whose integer index hashes to a stable
jitter, species and size, so nothing moves when the camera moves. Each instance samples the same height, mask and
coast layers and the same fractal detail (`GLSL_DETAIL` in `src/shaders.js`) as the terrain, so it stands on the drawn
ground. The far forest shrinks away inside the near forest's reach across the band where the near forest shrinks into
its edge, so the two cross-fade rather than double up.

`src/fauna.js` places the creatures the same way: dragons over the coasts and the open ocean (busiest at dawn and
dusk), bird flocks, grazing megafauna in the mid-latitude meadows, sea giants surfacing in the inner seas and
fireflies under the tropical and swamp canopy at night. `src/dragons.js` keeps its separate distant dragon flights.
`Forest`, `Creatures` and `Dragons` in the panel switch the layers off. Species, canopy heights and bands follow the
spec's "Biomes and vegetation" table; the numbers are proposed.

## Spec milestones

1. Data layers: done, reproducible from `pipeline/`.
2. Orbital globe: done.
3. Seamless descent: done, now to standing height.
4. Ground level (walk and fly, instanced vegetation, shoreline and waves): working prototype; see `docs/acceptance.md`.
5. Life and sound: first pass (dragons, bird flocks, grazers, sea giants, fireflies; synthesized ambience). Stand-in
   shapes, not designed creatures.
