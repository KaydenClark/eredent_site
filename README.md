# Kiros, before the first people

An explorable 3D world of Kiros, the principal mapped region of Azlemzyk, built from the
[Kiros World Build Spec](docs/SPEC.md). Environment only: no towns, labels or people.

Live site: https://kaydenclark.github.io/eredent_site/

## What is here

| Path | What it is |
| --- | --- |
| `index.html`, `src/` | The site. Vite + Three.js. One camera from orbit down to a few hundred meters above the ground. `scatter.js` places everything that lives on the ground or in the air; `vegetation.js` is the forest, `fauna.js` the creatures. |
| `pipeline/` | The Python steps that turn the penup outline and biome map into elevation, water and biome layers, then into the web textures. `config.json` holds every canon, derived and proposed number. |
| `pipeline/source/` | The master drawings: `penup_20260912_182533.jpg` (coastlines, lakes in blue ink), the same drawing in black ink, and the biome map `kiros_v5.png`. |
| `public/textures/`, `public/data/` | Built layers the site loads: regional 16-bit height, mask (water depth, protected sea, biome), color, clouds, the two moons, and `kiros_meta.json` with the projection and encodings. |
| `docs/SPEC.md` | The spec, copied from the shared doc. The rules there win over the files. |
| `docs/kiros-map-description.md` | The map description the spec draws on. |
| `docs/acceptance.md` | The spec's acceptance checks and how each one is met or still open. |
| `docs/kiros_map_previous_labeled.jpg` | The older hand-drawn labeled map, for names and history only. |

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173/. `npm run build` writes `dist/` for GitHub Pages; the workflow in
`.github/workflows/deploy.yml` deploys `main` automatically.

## Rebuild the layers

```bash
pip install -r pipeline/requirements.txt
python pipeline/run_all.py
```

Steps: `masks` (land and water by nesting parity, lakes from blue ink, mountain marks) → `register` (biome map onto
the outline grid) → `project` (placement on the sphere) → `terrain` (heights, lakes, bathymetry, zones) → `render`
(color texture and globe textures) → `export_web` (regional textures and meta for the site). Change a value in
`pipeline/config.json` and run again; nothing in the site needs to change.

## Forest and creatures

Every tree and creature is an instance on a lat/lon grid of cells around the camera, placed and animated in the
vertex shader (`src/scatter.js`). A cell's integer index hashes to a stable jitter, species, size and animation phase,
so nothing moves when the camera moves; the grid only ends at its edges, which fade. Each instance samples the height,
mask and coast layers for its own cell, adds the terrain's fractal detail, and decides what it is from latitude band,
height below the treeline, the biome map, the shore and the clearing and meadow fields. Species, canopy heights and
bands follow the spec's "Biomes and vegetation" table; the proposed numbers live at the top of `src/vegetation.js`
and `src/fauna.js`. `Forest` and `Creatures` in the panel switch the layers off.

## Controls

Drag to move the ground under the pointer. Scroll or pinch to descend and climb. Right-drag, shift-drag or two fingers
to turn and tilt. Keys: arrows or WASD move, `+`/`-` climb and descend, `Q`/`E` turn, `R`/`F` tilt. The camera looks
straight down from orbit and tilts toward the horizon on its own as it gets close to the ground.

## Spec milestones

1. Data layers: done, reproducible from `pipeline/`. Fractal detail below the data resolution is added on the GPU.
2. Orbital globe: atmosphere (single scattering), depth-shaded ocean, clouds, day and night, two moons to scale.
3. Seamless descent: one chunked level-of-detail sphere from orbit to a few hundred meters, no separate views.
4. Ground level: instanced Pandora-scale forest for every biome (tropical emergents and canopy giants, palms on the
   inner-sea shores, primeval conifers and broadleafs, taiga, swamp forest, tundra scrub), placed on the GPU from the
   same height, biome and coast layers as the terrain, with meadows in the mid-latitude forest. Walk and fly cameras,
   shoreline and wave detail: not started.
5. Life: dragons over the coasts and the open ocean (busiest at dawn and dusk), bird flocks, grazing megafauna in the
   meadows, sea giants surfacing in the inner seas, fireflies under the tropical canopy at night. Sound: not started.

The planet-size toggle (small world or Earth-sized) and every "Proposed" value in the spec are runtime or
`config.json` settings; see `src/settings.js` and `pipeline/config.json`.
