# Oct 10 variant: terrain built from the Oct 10 outline

**What this is.** This is a second set of terrain layers, built from the owner's newest map revision,
`docs/drive-source/kiros_earth_re.png` (the "Oct 10 outline"). It lets the app switch between
**Terrain: September penup (current)** and **Oct 10 revision (variant)**. It is a what-if for comparison. It does
**not** decide that the Oct 10 drawing is canon. The September build is untouched (see "Proof" below).

## What was built

| | September (current) | Oct 10 variant |
|---|---|---|
| Coastline, land/water | penup master | **the same** (0 of 6,292,440 px differ) |
| Lakes | blue ink of the penup master | blue ink of kiros_earth_re |
| Mountain marks | penup marks (ink with land on all sides) | brown ink of kiros_earth_re |
| Biome zones (desert, wetland, snow hatch) | kiros_v5 | kiros_v5, the same registration, with one fix (below) |
| Placement, planet, climate, ocean, every height | config.json | the same numbers |

The inputs are on the master grid. `public/sources/derived/earth_re_lines_master.png` is earth_re's ink, registered
onto the penup grid by `pipeline/compare_sources.py` (homography, 0.83 px RMS). Its classes are coast `#5a5a5a`,
marks `#b8742a` and lakes `#2f6fff`. The coast ink is not used: its coastline is the same drawing as the penup one
(97–98% within 2 px), so land/water comes from the penup outline, exactly as in September.

The variant writes these outputs. They use the same names and encodings as September, and the app loads the first
four:

- `public/textures/oct10/kiros_region_color_8k.jpg`, `kiros_region_height16_4k.png`, `kiros_region_mask_4k.png`,
  `kiros_region_coast_4k.png`
- `public/textures/oct10/kiros_ocean_2k.png`, `kiros_color_8k.jpg`, `kiros_color_4k.jpg`, `kiros_height_4k.png`.
  These are the whole-globe files. The pipeline writes them too, but the app does not load them for the variant.
- `public/data/kiros_meta_oct10.json`. It has the same schema as `kiros_meta.json`. The window (`window_px`,
  `window_deg`), projection and texture sizes are identical. The `file` paths point at `textures/oct10/`. There is an
  extra `variant` key that says what the build is.
- `pipeline/build_oct10/`: intermediates (gitignored, regenerable).

### Rebuild

```
pip install -r pipeline/requirements.txt          # or use the project venv: pipeline/venv (gitignored)
python pipeline/run_all.py --variant oct10        # ~1 minute; September outputs are not touched
python pipeline/check_acceptance.py --variant oct10
```

`python pipeline/run_all.py` with no flag still builds September into the same files as before. Setting the
environment variable `KIROS_VARIANT=oct10` has the same effect as passing `--variant oct10`.

## How the flag works (pipeline changes)

- **`common.py`.** `KIROS_VARIANT=<name>` switches the paths:
  - config → `pipeline/config_<name>.json`
  - intermediates → `pipeline/build_<name>/`
  - textures → `public/textures/<name>/`
  - meta → `public/data/kiros_meta_<name>.json`
  - `TEX_URL` is written into the meta's `file` paths.

  Two helpers are new. `META` and `TEX_URL` are paths. `select_mask()` evaluates the `lakes.*.select` rules in the
  config ("x<600", "780<x<960 and y<480", ...). Before, terrain.py repeated those rules in code.
- **`run_all.py`.** Accepts `--variant <name>`. When the config has `variant.biome_reg_from`, the register step copies
  that file instead of re-running the ORB registration. The biome map registers onto the same outline grid either way,
  so the variant reuses `pipeline/build/biome_reg.png` and its zones line up exactly with September's.
- **`masks.py`.** When the config has a `variant` block, land/water is computed exactly as before, and the old lake
  beds stay land. After that, three things change:
  - Lakes come from the variant ink's closed blue loops. Each lake is the area inside the centre of its ink line, the
    same rule compare_sources.py measures with. A loop nested inside another loop would be an inner depression. The
    Oct 10 drawing has none.
  - Mountain glyphs are the variant's brown ink. It is limited to land, kept away from water and lake shores by the
    same margins as before, and strokes under 6 px are dropped.
  - It saves two extra arrays. `check_ink` is what the acceptance check compares edges against. `v5_lake_zone` is
    explained under "Biome fix" below.
- **`terrain.py`.** Three changes:
  - Lake selection uses the config rules.
  - Lake basin and depth-ramp widths are read from optional config keys (`basin_px`, `depth_ramp_px`). The defaults
    are the old hard-coded 35/25 (Veir), 20/12 (Sfere) and 45/15 (Dire).
  - A range box with no marks in it builds no relief. Before, an empty box would have crashed.

  The inner depression is applied only when one is drawn. Inside `v5_lake_zone`, v5 color is not read as wetland.
- **`render.py`, `export_web.py`.** Write to `TEX` / `META` from common, and put `TEX_URL` into the meta `file`
  paths. A variant meta also gets a `variant` key.
- **`check_acceptance.py`.** Accepts `--variant <name>`. For a variant it adds one check: land/water must be
  identical to September. It also uses `check_ink`: the penup coast ink without the old marks and old lake outlines,
  plus the variant's lake ink. It now says "no marks drawn in its box" when it skips an empty range.
- **`.gitignore`.** Adds `pipeline/build_*/`.

## Every config change (`pipeline/config_oct10.json`)

`config_oct10.json` is a copy of `config.json`. Each changed value has a `_variant` note next to it. Every change is
**variant, proposed**.

| Key | September | Oct 10 variant | Why |
|---|---|---|---|
| `variant` (new block) | – | ink file, lake/mark colors, `biome_reg_from` | where the variant's lakes and marks come from |
| `ranges.nw_fiira.box` | [100, 260, 180, 320] | **[100, 410, 180, 424]** | The Oct 10 NW Fiira line is one NW–SE zigzag in 7 strokes, from (162, 248) to (409, 430). With the September boxes, 3 of its strokes fell outside every box (no relief), and its SE end was lifted to Veir height (the check measured 3,940 m). The line is drawn apart from the Veir line, with a ~110 px gap at y ≈ 420, so here it is one range at the NW Fiira height. Alternative: keep the old boxes, and the SE end rises to Veir height. |
| `ranges.veir.box` | [290, 560, 250, 730] | **[370, 560, 425, 730]** | Holds exactly the Oct 10 Veir line: 8 strokes from (527, 432) SSW past the new lake to (391, 711). It holds none of the NW Fiira line. As in September, the 3 southern strokes also fall in the `fiira_s` box, and the Veir height wins there. |
| `ranges.north_isle`, `ranges.ne_isles` | marks | box kept, **no marks** | The Oct 10 drawing has no marks on the northern islands, so no relief is built (rule: mountains only where the outline has marks). |
| `lakes.veir.basin_px` / `depth_ramp_px` | (35 / 25, in code) | **15 / 10** | The valley is scaled to the smaller lake (basin by √area ratio, √0.17 ≈ 0.42). The ramp is set so the 300 m depth is reached at the lake's centre. With the old ramp the small lake only reached 210 m. |
| `lakes.sfere.basin_px` / `depth_ramp_px` | (20 / 12) | **5 / 3.5** | same reasoning; the lake is a tiny figure-8 |
| `lakes.dire.basin_px` / `depth_ramp_px` | (45 / 15) | **12 / 8** | same reasoning; the lake is a narrow sliver |
| `lakes.dire.inner_floor_m` | −600 used | **unused** | No inner loop is drawn in the Oct 10 drawing. |
| levels: Veir surface 1,552 m / depth 300 m / rim 1,650 m; Sfere 700 m / 200 m; Dire −30 m, bed −150 m | | **unchanged** | Each one is the same named lake. |
| lake `select` rules | x<600; 780<x<960 and y<480; x>1000 and y>600 | **unchanged** | The new centroids (443, 594), (890, 400) and (1070, 809) still satisfy them. |

Unchanged on purpose: placement (37.2°N, 0.076°/px), planet options, region base levels, every range peak, the Dragon
volcano cone, ocean, climate, moons and the web window.

### Biome fix (variant only)

kiros_v5 paints the **old** lakes blue, and that blue also matches its wetland ("purple") color rule. In September
those pixels lay under the lakes, so they were masked out. In the variant they are dry land, and without a fix the old
Lake Veir bed and rings around old Sfere and Dire turned into wetland. masks.py marks the old lake zone (the penup
lakes filled and widened by 5 px), and terrain.py ignores v5 color there. The result: wetland outside that zone
matches September to within 64 of ~81,800 px (2x grid). Desert and snow-hatch zones are identical to September.

## Results

### Lakes (built masks; true sphere areas, small world R 1,692.7 km / Earth-sized R 6,371 km)

| Lake | September km² (small / Earth) | Oct 10 km² (small / Earth) | Ratio | Centroid (master px) | Built depth |
|---|---|---|---|---|---|
| Veir | 45,980 / 651,000 | **7,860 / 111,400** | 0.17 | (426, 396) → (443, 594), ~440 km SSE (small world) | surface 1,552 m, deepest 1,252 m (300 m) |
| Sfere | 12,830 / 181,700 | **760 / 10,700** | 0.06 | (871, 392) → (890, 400) | 700 m, deepest 500 m (200 m) |
| Dire | 79,770 / 1,130,000 | **5,920 / 83,900** | 0.07 | (1099, 780) → (1070, 810) | −30 m, bed −150 m, no inner depression |

These agree with `docs/source-comparison.md` (7,847 / 728 / 5,944 km² small world) to within 0.2–4%. The small
differences come from rounding of the line centre. In the region textures the lake surfaces decode flat at 1,552, 700
and −30 m. Lake pixels in the region mask drop from 123,023 to 12,057.

### Summits per system (`check_acceptance.py --variant oct10`)

| System | Configured peak | September | Oct 10 variant | Oct 10 strokes |
|---|---|---|---|---|
| Veir | 4,400 | 4,371 | **4,479** | 8 (5 own, 3 shared with fiira_s) |
| NW Fiira | 2,600 | 2,677 | **2,680** | 7 |
| North isle | 2,400 | 2,455 | **none (no marks)** | 0 |
| Roan | 3,600 | 3,662 | **3,679** | 7 (2 shared with the malos box) |
| NE isles | 1,800 | 1,852 | **none (no marks)** | 0 |
| Malos | 2,000 | 2,051 | **2,061** | 14 (2 shared with the roan box) |
| Dragon | 3,300 | 3,376 | **3,361** | 2 |
| Dragon volcano | 3,300 | 3,362 | **3,354** | (cone, canon) |
| Highest land | | 4,457 | 4,479 | |

All 36 Oct 10 mark strokes on land fall inside at least one box, so none is left without relief.

### Acceptance numbers, variant

- **PASS** land/water identical to the September build: 0 of 6,292,440 px differ.
- **FAIL (same as September)** coastlines within 2 px: 90.3% overall (September 89.5%), median 1.0 px.
  - The coast ink alone: 90.2%, identical to September's figure against the same edge. This is the known shortfall
    in `docs/acceptance.md` (ink thickness, strokes touching the coast). The variant does not change it.
  - The Oct 10 lake ink: **96.5%** within 2 px.
- **PASS** every range with marks is within 6% of its table height (see above). `fiira_s` is skipped as in September,
  because its strokes are shared with the Veir box.
- **PASS** no ranges away from marks: 270 px above 1,900 m lie more than 30 px from a mark (September 0; limit 500).
  All of them are on the flank of the canon Dragon volcano cone (around master px 382–400, 822–850). In September the
  ring of Dragon marks covered that flank; Oct 10 draws only 2 strokes there.
- **PASS** desert inside yellow zones (0 of 76,892 px outside); wetland inside purple zone (0 of 81,743 px outside);
  inner seas paler than outer ocean (99 vs 22).

### Looked at

Downscaled previews of the elevation, the biome classes, the source-grid color and the web region color and height
textures were rendered and inspected. They show:

- small lakes in the new places, and the old lake beds as ordinary upland or lowland;
- the NW Fiira line running NW–SE to near the old lake;
- the Veir line NNE–SSW past the new lake;
- Roan's new northern range plus the short line south of Sfere;
- the Malos spine along the east and south coast;
- 2 ridges plus the cone on Dragon isle;
- flat northern islands.

No seams or holes were found. One step predates the variant: where v5's southern Malos wetland meets the spine, the
wetland rule flattens the ground to a few metres, which leaves a sharp step on the spine's southern flank. September
has the same step, and more of it: 6,255 px above 500 m border the wetland there, against 1,607 in the variant.

## Proof that September is unchanged

1. **Files.** The md5 of all 33 September files was taken before any work:
   - every file in `public/textures/` and `public/data/` that existed then;
   - every file in `pipeline/build/`.

   After all the variant builds, all 33 still match (`md5sum -c`: 33 OK). Region file md5s:
   - `kiros_region_color_8k.jpg` 5f95a33a82e351a6e975ef3bd25d06dc
   - `kiros_region_height16_4k.png` c2df3998426de303f3ca96f96d1148df
   - `kiros_region_mask_4k.png` 7c5e5e27a42a1e08a2da383b7bac842a
   - `kiros_region_coast_4k.png` 9a23e4f43ccb6d6ab03cc8d37db7eeef
   - `kiros_meta.json` 17e46d05aedf4e7176499aff39adaf91
2. **Code.** The pipeline was copied twice into a scratch folder: once unmodified (git HEAD) and once modified.
   Both ran `run_all.py` with no flag in the same environment, and all 21 outputs are **byte-identical** between the
   two (public textures, meta and every build file). The flag is a no-op for the default build.
3. **Determinism.** The variant built in the scratch copy is byte-identical to the one in the repo (all 9 files).
4. **Environment.** The September files were not rebuilt in place. With this machine's library versions
   (OpenCV 5.0.0 in `pipeline/venv`, NumPy 2.3.3), a fresh September build differs from the committed one in
   float-rounding noise only:
   - 27 of 30.4 M height16 values differ by 1 m;
   - 69 color-4k values differ by ≤2;
   - region color 8K, mask, coast and the meta are byte-identical.

   The committed files were built with a different OpenCV. A default rebuild here would therefore rewrite two files
   with near-identical content.

## Uncertain / caveats

- **Not canon.** This is a comparison build. Whether the Oct 10 drawing replaces the September lakes and marks is the
  owner's call.
- **The Bonneville ruler changed.** The small world's size (R 1,692.7 km, 2.245 km per master px) was derived from
  Lake Veir = Lake Bonneville (51,000 km²).
  - The Oct 10 Lake Veir measures only ~7,860 km² on that small world, or 111,000 km² on the Earth-sized world.
  - If the Oct 10 Veir were to be Bonneville-sized, the planet would have to be ~2.55× larger in radius (≈4,300 km).
    That is a third option between the two current ones.
  - This variant keeps the September scale and the spec's lake levels (Veir 1,552 m / ~300 m, Sfere 700 m,
    Dire −30 m), because they are the same named lakes. Treat the levels and the scale as open questions for this
    drawing.
- **Basin and depth widths** for the small lakes are scaled guesses (`basin_px`, `depth_ramp_px` above), not canon.
  The tiny Sfere is ~7 × 7 master px, and its measured area is uncertain by about ±20%.
- **Range assignment.**
  - The two box changes are a judgement about which system each Oct 10 line belongs to. The NW line could instead be
    read as a western arm of the Veir range.
  - The southern Veir strokes and two Roan strokes south-east of Sfere still sit in two boxes, as in September.
  - The heights are September's table values. The Oct 10 drawing gives no heights.
- **Biome zones were drawn for the old layout.**
  - kiros_v5's grey snow hatch still lowers the snowline around the *old* Veir ring and the northern islands, where
    Oct 10 has no marks.
  - Its green and purple zones follow the old lakes and marks.
  - The old-lake wetland fix above is the only adjustment.
- **The old lake beds** take their landmass's base level plus noise (Fiira ~900 m upland for old Veir, Malos lowland
  for old Dire). Nothing in the Oct 10 drawing says what is there.
- **Dragon isle** keeps the canon central cone. Oct 10 draws only 2 strokes there, so the cone's flank is the only
  high ground away from marks.
