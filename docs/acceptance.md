# Acceptance checks

The checks from the spec's "Build requirements" section, and where each one stands. The measurable ones are run by
`python pipeline/check_acceptance.py` after the pipeline (numbers below are from the 2026-10-09 build).

| Check | Status | Evidence |
| --- | --- | --- |
| Coastlines and lakes match the penup outline within 2 px of the master grid | **Partly met** | 89.5% of drawn coast and lake pixels lie within 2 px of the built land/water edge, median 1.0 px. The rest are drawn lines that are not coastlines (the marks inside Lake Veir, Dire Lake's inner depression loop, mountain strokes that touch the coast) plus the thickness of the ink itself. Lakes follow the blue penup ink, which the spec names as master, pulled in to the line's center. |
| Mountains only where the outline has marks, at the table heights (±5%) | **Met** | Veir 4,365 m, NW Fiira 2,677 m, northern island 2,455 m, Roan 3,662 m, NE islands 1,852 m, Malos 2,051 m, Dragon 3,376 m, Dragon volcano 3,362 m. No land above 1,900 m more than 30 px from a mountain mark. The small southern Fiira ridges share their strokes with the Veir box and are not checked separately. |
| Desert only in the yellow zones, wetland only in the purple zone | **Met** | 0 desert pixels outside the yellow zones; 0 wetland pixels outside the purple zone. |
| From orbit, the inner seas are clearly paler than the outer ocean | **Met** | Mean brightness of the protected seas is 100 vs 22 for the deep ocean on the color texture, and the orbital view shows it. |
| No labels, towns, roads, ruins or any other human sign | **Met** | Nothing is drawn but terrain, water, clouds, moons, stars and the sun. The survey panel names natural features only. |
| No named or major rivers until Kayden draws them; terrain still drains naturally | **Met** | The pipeline has no river step. Height fields rise from the coast inland, so slopes drain. |
| Everything marked "Proposed" is a setting that can change without rebuilding | **Met for view settings, rebuild for terrain numbers** | View settings (planet size, atmosphere, moons, day length, tilt, detail) are in `src/settings.js` and the panel. Heights, lake levels, zone rules and climate bands are in `pipeline/config.json`; changing those needs `python pipeline/run_all.py` (about one minute) but no code changes. |
| 60 fps at orbit and 30 fps or better on the ground on a mid-range desktop GPU | **Met on the build machine** | 100 fps (display-limited) at orbit and at 1.8 km above the Veir rim with 1,400 tiles, in Chromium on the development PC. Not yet measured on other hardware. |

## Milestones

| Milestone | Status |
| --- | --- |
| 1. Data layers on the penup master grid, fractal detail to about 50 m, planet size as a setting | Done. Layers rebuild from `pipeline/`; detail below the data resolution is added on the GPU (wavelengths 4 km, 850 m, 210 m, 53 m on the small world), faded by distance. Planet size is a toggle. |
| 2. Orbital globe: atmosphere, ocean by depth, clouds, day and night, two moons to scale | Done. Single-scattering atmosphere, sun by time of day and season, ocean colored and shaded by depth and protection, cloud deck, moons sized to the chosen planet with phases. |
| 3. Seamless descent to 1 km with no visible popping | Done to a few hundred meters. One chunked level-of-detail sphere (cube-sphere quadtree, 32×32 cells per tile, skirts) from orbit to the ground; splits are screen-size driven and the finest tiles go nearest the camera. |
| 4. Ground level: walk and fly cameras, instanced vegetation, shoreline and waves | Not started. The data resolution (about 1.1 km per sample) means the ground still reads as painted terrain, not trees. |
| 5. Life and sound | Not started. |

## Findings for Kayden

- **Northern limit.** With the spec's own placement (center 37.2°N, 0.076° per pixel) the northernmost island lands at
  68°N, not 75°N. The two anchors (Fiira's tip on the equator, the top island at 75°N) cannot both be met with this
  projection; `pipeline/solve_anchors.py` shows the best compromise puts the center at 43°N and the tip at 0.8°N. The
  build keeps the spec's placement because it matches every other latitude in the spec's table.
- **Atmosphere on the small world.** A 0.27 g planet would hold a much taller air column. The view uses a modest
  1.25× scale height and a slightly denser air (proposed); the "Air" slider changes density.
- **Moons.** Orbit radii of 24 and 41 planet radii, periods of 9.5 and 21 days, small inclinations: all proposed so
  the sky has something to show. On the small world the larger moon spans about 2.4°, five times our Moon.
