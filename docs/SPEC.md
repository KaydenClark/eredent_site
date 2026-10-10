
# Kiros World Build Spec
2026-10-09 · @Kayden Clark

## Purpose and rules
This spec is the source of truth for building Kiros as a realistic, explorable 3D world: environment only, no towns, labels or people. It is written so a builder (Fable) can make it without asking questions back.
**Source-of-truth order** (higher wins when two sources disagree):
1. Statements from Kayden in this spec
2. The penup outline drawing `penup_20260912_182533.jpg`: coastlines, lakes, mountain placement
3. The biome map `kiros_v5.png`: desert, wetland, forest and snow zones
4. The Google Doc "Kiros Map Description": terrain character, climate, water
5. The AI-painted color map: art direction only. Its coastlines, lake positions and biomes drift from the outline and must not be used for geometry.
**Labels used in this spec:**
- **Canon:** stated by Kayden or written in his source files.
- **Derived:** calculated from canon (for example, distances from the Lake Veir ruler).
- **Proposed:** a realism detail not yet confirmed. Fable treats proposed items as defaults that Kayden can override.
**The feel (canon):** Kiros before any people. A wild garden world with Pandora-scale forests and creatures, where dragons hunt the open ocean and use the land as nesting ground.

## The planet
Kiros is an Earth-like water world with a single cluster of broken continents running from the equator to about 75°N. The rest of the planet is open ocean (canon). The planet's size is the one big open decision, because two of Kayden's rulers disagree.
**The conflict:** if Lake Veir is the size of Lake Bonneville (about 51,000 km² at its highest stand) and the planet is Earth-sized, the land only reaches from 0° to about 19°N. That would make the whole cluster tropical, which breaks the canon taiga, snow and Ice Sea. To keep the land spanning 0° to 75°N, one ruler has to give:
| Option | Planet radius | Gravity* | Lake Veir | Land cluster, west to east | Larger / smaller moon radius vs planet |
| **A. Small world** (keeps the Bonneville ruler) | 1,693 km | 0.27 g | 51,000 km² (Bonneville) | about 2,950 km | 51% / 34% |
| **B. Earth-sized** (scales the land up) | 6,371 km | 1.00 g | about 722,000 km² (14× Bonneville, about 2× the Caspian Sea) | about 11,100 km | 14% / 9% |

*Assumes Earth-like rock density.
- **Option A** makes Kiros about Moon-sized. Low gravity helps Pandora-scale trees and flying dragons make sense. The horizon is about 2.4 km away for a standing person (4.7 km on Earth). The two moons would look huge, more like a triple system. A body this small cannot hold an atmosphere on its own, so the gods would have to keep it.
- **Option B** keeps Earth's gravity and horizon. Every distance in this spec scales up 3.76×. Lake Veir becomes an inland sea.
- The 3D preview has a toggle for both options. Coastlines, latitudes and heights are the same in each; absolute distances, gravity and moon size change.
**Placement on the globe (derived):** the drawn map is treated as a top-down view centered on 37.2°N (azimuthal equidistant projection, 0.076° of arc per outline pixel).
| Feature | Latitude | Notes |
| Fiira, south tip | 0° | Canon anchor |
| Northernmost islands | 75°N | **Proposed** value for "not quite into the poles" |
| Lake Veir | 46°N | The real Lake Bonneville sat at about 41°N |
| Sfere | 47°N |  |
| Ender, center | 25°N |  |
| Dire Lake | 15°N |  |
| Dragon Islands volcano | 12°N |  |
| Malos, south tip | 2°S | Conflicts with "nothing in the southern hemisphere". Keep it, or move the anchor north by 2°? |

**Moons (canon):** two moons. One is half the size of Earth's Moon (about 1,737 km across) and the other is a third (about 1,158 km across). Their distances, orbits, colors and phases are not set yet. Kayden's sentence about the moons was cut off mid-thought.
**Proposed until confirmed:** a 24-hour day, a 23° axial tilt and Earth-like seasons. These values set the snowlines and climate bands used below.

## Source files
All geometry comes from the penup outline. Every other layer is aligned to its pixel grid (1362 × 1155 px), which is the master grid for the build.
| File (Google Drive, Azlemzyk/Maps) | Role | How to use it |
| `penup_20260912_182533.jpg` | **Master.** Coastlines, islands, mountain marks, lakes in blue ink | Land and water by nesting (each drawn line crossed flips land and water). Blue loops are lakes. The inner loop in Dire Lake is its deep depression. |
| `ca093ac3-1b33-4003-87ab-232136e9d27b.png` | The same drawing in black ink | Cleaner lines for tracing. Identical geometry. |
| `kiros_v5.png` | Biome map: yellow = desert, purple = wetland, grey hatch = snow, green hatch = dense forest, green and teal outlines = forest zone edges | Align to the master with feature matching. A similarity transform fits it closely (scale about 1.10, small shift). |
| Google Doc "Kiros Map Description" | Terrain character, climate, water rules | The text rules in this spec come from it. |
| AI-painted color map | **Art direction only** | Do not use it for geometry or biomes. |

**Where the painted map drifts from canon:** Ender and northwest Fiira are painted as desert (canon: forest). Lake Veir, Sfere and Dire Lake are moved, and Sfere is on the wrong side of its range. Dire Lake's inner depression is missing. A snowy range is added across north Roan. The inner seas are dark (canon: pale and shallow). Rivers are added (canon: none mapped).
**Derived layers already built** (from the preview, on the master grid at 2×):
- Elevation in meters, 16-bit PNG storing meters + 6,000
- Color texture: biomes, hillshade and water depth
- Equirectangular globe textures (8K color, 4K height, clouds, roughness)
- `kiros_meta.json` with the projection values
Fable can start from these or rebuild them from the rules in this spec. Either way, the rules win over the files.

## Landmasses and elevation
Heights follow Kayden's own real-world comparisons. The tallest point on Kiros is about 4,400 m, in the Veir Mountains. Mountains sit exactly where the outline draws its mountain marks; nowhere else gets ranges.
| System | Where | Character (canon) | Real-world match | Height used | Status |
| Veir Mountains | Central Fiira, wrapping Lake Veir | Young, tall, rugged, continuous | Rocky Mountains (Mt Elbert, about 4,401 m) | Summits 4,400 m | Comparison canon, number derived |
| Lake Veir basin | Inside the Veir ring | High enclosed basin | Lake Bonneville | Surface 1,552 m, deepest point about 300 m down, basin floor 1,500 to 1,800 m | Derived |
| Northwest Fiira range | The diagonal marks in the northwest | Not described | None | Summits 2,600 m | Proposed |
| Fiira uplands | West and central Fiira | Uplands falling toward the broken east coast | None | 600 to 1,200 m | Proposed |
| Ender | Far-west landmass | Low to moderate, no major range | None | 0 to 600 m | Canon character, numbers proposed |
| Roan ranges | South-central Roan, around Sfere | Separate volcanic blocks, no marked volcano | California ranges (Shasta about 4,322 m, Lassen about 3,187 m) | Summits 3,600 m | Number proposed |
| Create | Below Roan, in the break zone | Forested lowland and moderate upland, scattered small ridges | None | Up to 1,400 m | Proposed |
| Malos Spine | East and southeast Malos | Oldest range: worn, rounded | Appalachians (Mt Mitchell, about 2,037 m) | Summits 2,000 m | Comparison canon |
| Malos east lowlands | East of the Spine | Flat, humid, near sea level | Florida, Louisiana | 0 to 30 m | Canon |
| Dire Lake basin | Interior Malos | Basin center below sea level, with an inner depression | Dead Sea and Caspian-type basins | Surface -30 m, inner depression floor -600 m | Numbers proposed |
| Dragon Islands | Spiral archipelago in the south | Volcanic, one dominant central volcano | Mt Etna (about 3,357 m) | Summit 3,300 m | Number proposed |
| Northern islands | Belt along the north edge | Cold, rocky, windswept ridges, snow on the highest | None | 1,800 to 2,400 m | Proposed |

Real-world heights are approximate.
**How each kind of ground should look:**
- **Veir:** sharp young ridges, glacial cirques, U-shaped valleys, talus aprons, permanent snow on the highest and northern summits (canon). Proposed: wave-cut shoreline benches on the slopes above Lake Veir, like the old Bonneville shorelines above Salt Lake City.
- **Roan:** blocky separate ranges with old lava flows and volcanic rock between them. No single dominant volcano (canon).
- **Malos Spine:** long parallel rounded ridges with deep soil and forest to the summits. Not a snow range (canon).
- **Dragon Islands:** one great cone at the center, with smaller volcanic remnants curving around it in the spiral. Black rock and ash soils.
- **Broken coasts (Create and west Malos):** drowned valleys, island mazes and narrow channels, where the old supercontinent seam flooded (canon).
- **Rivers:** none are mapped at world scale (canon). The terrain should drain naturally, but no named or major rivers are placed until Kayden draws them.

## Water
Kiros's water has two faces: pale, shallow, god-protected seas inside the cluster, and a deep, dark ocean outside it that covers the rest of the planet (canon). The edge between them is the most important line on the planet after the coastlines. It should be visible from orbit and felt at sea level.
| Water body | Depth | Look | Status |
| Inner seas: between and inside the continents, including the central sea between Fiira, Roan and Malos | 15 to 150 m | Pale jade and turquoise, sunlit, sandbars and visible bottom near shore, calm swell | Shallow and protected are canon; numbers proposed |
| Outer shelf: a narrow band off the outer coasts | 0 to 200 m | Quick fade from green-blue to dark | Proposed |
| Outer ocean: everything beyond the cluster, the whole rest of the planet | 4,000 to 5,500 m | Near-black navy, long heavy swells, no visible bottom | Deep and dangerous are canon; numbers proposed |
| Ice Sea: among the northern islands | Shallow to moderate | Cold grey-green, seasonal pack ice | Name from older maps; look proposed |

**Lakes:**
| Lake | Surface | Deepest point | Look | Status |
| Lake Veir | 1,552 m | About 300 m down | Clear, cold alpine blue, ringed by snow peaks | Size canon, levels derived from Bonneville |
| Sfere | 700 m | About 200 m down | Blue-green, volcanic rock shores | Proposed |
| Dire Lake | -30 m | Inner depression to -600 m | Wide lake with a black-blue deep at its center | Below sea level canon, numbers proposed |

**Rules for the builder:**
- The gods keep monsters out of the inner seas (canon). Show this as calm, life-rich shallows: big but harmless creatures, giant seagrass and kelp meadows (proposed).
- Older lore says the inner water was turned fresh. The settled fact is only that it is protected and comparatively safe. Keep it salty until Kayden decides (open question).
- The outer ocean should read as hostile at every scale: darker water, bigger swells, and things moving under the surface.
- Lake Bonneville drained to the sea through Red Rock Pass (Kayden's reference maps). Whether Lake Veir has an outlet like that decides whether it is fresh or salty, and whether old shorelines ring its basin (open question).

## Biomes and vegetation
Forest covers almost every piece of land below the treeline, and it is Pandora-scale: trees and creatures at the size of Avatar's world (canon). Biomes are set by latitude, height and the zones drawn on the biome map.
| Biome | Where | Band | Canopy height | Look | Status |
| Giant tropical rainforest | South Ender, south Fiira coasts, Dragon Islands, south Malos | 0° to 18°N | 80 to 120 m, single trees over 150 m | Layered, hot, wet, misty. Buttress roots, hanging vines, rivers hidden under the canopy. | Biome canon, band and heights proposed |
| Primeval mixed forest | Most of Fiira, Create, south Roan, north Malos | 18° to 48°N | 60 to 100 m | Ancient conifer and broadleaf mix, like a never-logged Yellowstone at giant scale. Fallen-log mazes, deep moss. | Canon ("Yellowstone"), band proposed |
| Cold evergreen forest and taiga | North Roan, north Fiira, colder islands | 48° to 63°N, and high ground further south | 40 to 70 m | Dark, dense, evergreen. Bogs and lichen between the trees. | Canon, band proposed |
| Tundra and alpine | Northernmost islands; above the treeline everywhere | Above 63°N, or within 900 m of the snowline | Shrubs and grass | Rock, lichen, wind-flattened scrub | Proposed |
| Desert | South lobe of southwest Fiira; south rim of the main Dragon island | Yellow zones on the biome map | None | Sand seas, red rock ranges, dry washes | Canon zones |
| Wetland | Malos, east of the Spine, plus drowned coasts in the break zone | Purple zone on the biome map | 30 to 60 m swamp forest | Bayous, marsh, flooded forest, dark channels | Canon |
| Snow and ice | Northern peaks, the highest Veir summits, northern islands | Above the snowline | None | Permanent snowfields; small glaciers in Veir | Canon |

Canopy heights are proposed. For scale, the tallest real tree, a coast redwood, is about 116 m.
**Snowline (proposed):** about 5,000 m at the equator, 4,000 m at 30°N, 2,900 m at 45°N, 1,650 m at 60°N and 600 m at 75°N. It is 600 m lower where the biome map shows grey snow hatching. The treeline sits 900 m below the snowline.
**Variety rules:**
- No single flat green. Shift tone with height (darker, bluer montane forest), slope and moisture.
- Add natural clearings from fire, windthrow and megafauna grazing (proposed), especially in the mid-latitudes.
- Sharp edges where biomes meet water: forest runs right to rocky shores. Beaches mainly on the tropical inner seas.

## Feel and life
Being on Kiros should feel like Earth before humans evolved: untouched, enormous, beautiful and not safe (canon).
**Canon:**
- No towns, labels, roads, ruins, smoke, fields or boats. Nothing made by people.
- Life is everywhere, and creatures are Pandora-scale.
- Dragons hunt out over the open ocean. The land is mainly their nesting ground.
- Some creatures are more dangerous than dragons.
- The ocean is just water, deep enough to breed sea monsters.
**Proposed, to make it feel real:**
- **Signs of animals, not people:** game trails, wallows, browse lines on the forest edge, bones on beaches, nest cliffs on high crags and islands.
- **Dragons in the sky:** flights heading out to sea at dawn and back at dusk, small at distance so they read as wildlife.
- **Sound:** wind, water, insects and calls. No human sound at all.
- **Air:** humid, hazy depth over the forests, with mist in valleys at dawn. Crisp and clear over the snow ranges.
- **Night:** no light pollution. A dense star field and two moons, so moonlit nights are brighter and can cast double shadows when both are up.
- **Weather:** tropical thunderheads near the equator, storm belts in the mid-latitudes, fog over the cold northern seas.

## Build requirements for Fable
Build one explorable Kiros that runs in a web browser on a desktop GPU. It should zoom seamlessly from orbit down to standing on the ground, in a JavaScript stack (Three.js or WebGPU). The current preview is milestone 1's starting point.
**Milestones** (each about 2 to 3 hours of work):
1. **Data layers.** Rebuild the elevation, land and water, lake, biome and water-depth layers on the penup master grid from the rules in this spec. Add fractal detail down to about 50 m per sample. Keep planet size as a setting (option A or B) until Kayden picks one.
2. **Orbital globe.** Physically based atmosphere, ocean shading by depth (pale inner seas, dark outer ocean), clouds, day and night, and two moons sized to the chosen planet.
3. **Seamless descent.** Chunked level-of-detail sphere terrain that streams from orbit to 1 km altitude with no visible popping.
4. **Ground level.** Walk and fly cameras. Instanced Pandora-scale vegetation for each biome, shoreline and wave detail, sky with sun, moons and stars.
5. **Life and sound.** Dragons in flight, birds, distant megafauna, ambient sound by biome. Nothing made by people.
**Acceptance checks:**
- Coastlines and lakes match the penup outline within 2 pixels of the master grid when laid over it
- Mountains appear only where the outline has mountain marks, at the heights in the elevation table (±5%)
- Desert appears only in the yellow zones and wetland only in the purple zone of the biome map
- From orbit, the inner seas are clearly paler than the outer ocean
- No labels, towns, roads, ruins or any other human sign anywhere
- No named or major rivers until Kayden draws them; terrain still drains naturally
- Everything marked "Proposed" in this spec is a setting that can change without rebuilding
- 60 fps at orbit and 30 fps or better on the ground on a mid-range desktop GPU
**Not in scope:** gameplay, characters, towns and political borders.

## Open questions
The first one changes the most. Everything else can be set later without rebuilding.
- **Planet size:** option A (small world, Lake Veir = Bonneville) or option B (Earth-sized, land scaled up)?
- **Malos's south tip** sits about 2° south of the equator. Keep it, or shift everything 2° north?
- **Northern limit:** is 75°N right for "not quite into the poles"?
- **Moons:** distances, colors, and how they move. The sentence about them was cut off.
- **Inner seas:** salt water or fresh?
- **Lake Veir:** does it drain out through a pass like Bonneville's Red Rock Pass (fresh, with old shorelines), or is it a closed salt lake?
- **Dragon Islands volcano:** active or dormant?
- **Day length and axial tilt:** keep Earth's 24 hours and 23°?
- **Proposed heights:** are 2,600 m (northwest Fiira), 3,600 m (Roan), 3,300 m (Dragon volcano) and 1,800 to 2,400 m (northern islands) right?
- **Anything else in the sky?** Earlier notes describe Wurth drifting toward a black hole. Is it visible from Kiros?

## Sources
- Lake Bonneville, Wikipedia (https://en.wikipedia.org/wiki/Lake_Bonneville): 51,000 km² at the highstand, over 300 m deep, 1,552 m shoreline at Red Rock Pass
- Kayden's Google Drive, Azlemzyk/Maps and the "Kiros Map Description" doc
- Kayden's Bonneville reference images (shoreline levels and the Red Rock Pass outflow route)
