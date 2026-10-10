# Kiros overnight exploration workbench

## Assignment and owner's intent

Kayden authorizes Claude to implement this now and work autonomously through the night.
Target: an impressive, runnable local exploration experience by 07:00 America/Denver on
2026-10-10. That is a working target chosen from "by morning", not an owner-confirmed exact deadline.

Owner's latest words: "Like I want this whole drive turned into the coolest way I could ever
think to explore my current imagination so I can start grilling it and creating my world.
This is 20yrs of build up". Previously: "Project goal, let's have Claude turn this into
something I can explore by morning. I don't care if we have to use Godot or a website or unity."
Then: "Claude's tokens reset in 4hrs 27min" and "we need to speend most of them".
Reported reset is approximately 05:40 MDT, 2026-10-10. Treat this as approximate owner evidence,
not a verified quota endpoint. Use the available allowance aggressively for useful implementation,
visual refinement, and validation; do not spend tokens on padding, invented lore, or needless rewrites.
Work until the runnable acceptance target is strong or the actual limit intervenes. Save a runnable
checkpoint and precise continuation instructions before any rate-limit exit.

Scope: all six files actually returned from the linked Drive folder, plus directly relevant
existing Kiros/Azlemzyk project lore. The linked folder is the source collection; this assignment
does not authorize scanning the owner's entire unrelated Google account.

## Read first

- Nearest controls, plus E:/GPT_OS/AGENTS.md -> RUNBOOK.md -> LEXICON.md routing.
- This assigned brief, docs/SPEC.md, docs/kiros-drive-description-2026-10-10.md, README.md,
  docs/acceptance.md, and docs/drive-source/manifest.json.
- Actual source: src/, index.html, pipeline/config.json, public/data/kiros_meta.json.
- All five source images in docs/drive-source/. Open and inspect them rather than assuming roles from names.

This project is an independent room without a workbench/manifest.json. Do not select unrelated
Tower_OS tasks or migrate the project's harness as a prerequisite. This is explicit project work.

## Starting point and source reconciliation

Existing Vite + Three.js world: spherical LOD terrain, atmosphere, clouds, two moons,
day/night, map-derived elevation/biomes, orbit-to-low-altitude descent and survey presets.
README and acceptance.md report milestones 1-3 complete, 4-5 missing; verify runtime yourself.
Build baseline actually passed on 2026-10-10 with npm run build; no current visual runtime was verified.
Camera currently clamps to minAlt = 60 m. Keyboard movement is per keydown, rather than
continuous ground locomotion. CPU/GPU terrain displacement consistency needs investigation before
standing-height camera collision. Read src/heightfield.js, shaders.js, terrain.js and controls.js together.

IMPORTANT: newest Drive asset kiros_earth_re.png is a hand-drawn outline with substantially smaller
blue lakes than the existing penup-derived large lakes. It is NOT the painted annotated
docs/kiros_earth_scale.png image. Preserve both and implement source comparison, determine map
registration, and document differences. Do not quietly present stale lake sizes as current canon.
The historical Kiros_Map_A.jpg image is rotated relative to the current north-up outline;
do not mix coordinate frames. The owner has not explicitly settled the planet-size question:
retain both existing options and explain the discrepancy unobtrusively in the workshop.
Latest map is evidence for changed geometry, not automatic authority for every label or biome.
Original outline, older maps, current description, and existing spec must remain inspectable.
Preserve originals byte-for-byte. Do not fabricate settlements, political borders, rivers or geography.

Source files downloaded by Codex from authenticated Drive:
- docs/drive-source/kiros_earth_re.png
- docs/drive-source/Copy of saphaun_drawn_Empty.jpg
- docs/drive-source/Kiros_Map_A.jpg
- docs/drive-source/Kiros_map_source_sketch.jpg
- docs/drive-source/Kiros_map_previous.jpg
- docs/kiros-drive-description-2026-10-10.md (text snapshot of native Google Doc)
All source IDs/URLs/modification dates are in the manifest. No credentials or signed URLs are needed.
Existing maps/ and pipeline/source/ contain additional directly relevant reference art.
E:/GPT_OS/Projects/Azlemzyk contains related world-building material. Read only useful lore for
this assignment; avoid raw campaign exports or bulk imports. No external publication is authorized.

## Product direction

Build a world-building workbench with two closely connected experiences:

1. Immerse: an evocative environment you can actually move through, orbit, descend into,
   walk and fly. Vast primeval forests, snow peaks, wetlands, volcanic islands, pale protected
   seas and dark open ocean should have distinct character. Good composition, light, scale,
   vegetation and navigation matter more than maximal feature count.
2. Develop: inspect the original maps and lore, compare versions, jump to their locations,
   save places, ask questions about the geography, and capture decisions and new ideas.
   Trace visible world features back to source evidence. Make uncertainty useful for world-building.

Default recommendation is to continue the existing web stack, which already builds locally.
The owner permits Godot or Unity if a demonstrated blocker makes switching necessary; do not
burn the night recreating existing terrain infrastructure without evidence that it helps.

## Ordered build queue

Deliver a coherent usable slice first; keep it runnable as you expand:

1. Ground exploration: continuous WASD, mouse look, walk/fly switch, speed control, terrain-safe
   standing height, pointer-lock escape, help/reset, and accessible usable fallback controls.
   Keep orbit navigation and quick scenic starts. Planet-size changes must stay safe.
2. Ground presence: deterministic instanced vegetation and simple layered foliage per actual biome,
   natural scale, rocks/ground detail, haze and readable shoreline transitions. Avoid spawning
   vegetation in lakes/ocean/desert/snow. Solve precision/clipping/terrain mismatch at low altitude.
   Stream or bound the nearby area, dispose unused GPU resources, and cap quality.
3. Workshop/source view: browsable zoomable gallery of ALL source files, source links, version
   comparison including latest changed lakes, locations and short evidence-backed descriptions.
   No labels baked into the physical world. Place names in navigation/workshop are fine.
4. Persistent local authoring: bookmarked viewpoints, notes/questions/proposed decisions attached
   to places or sources, edit/delete/export/import with schema validation. Preserve state between
   reloads and provide a download backup. Keep proposals distinct from source canon.
   No AI API credentials or paid backend required; provide source-grounded question prompts and
   an exportable brief for Kayden to grill with Claude or Codex.
5. Refine immersion: scenic destinations spanning Veir, Ender, Malos wetland, Dragon Islands,
   northern islands, protected sea and outer ocean; deliberate sunrise/night/two-moon looks;
   water motion and environmental sound with explicit user audio enable and volume/mute.
6. If useful allowance remains: distant dragon silhouettes/ambient wildlife consistent with
   canon, weather, additional biome polish, and fixes found by real exploration.
   Do not make a shallow checklist of placeholders to claim all features done.
7. Finish with measured performance, source/canon checks, input/error recovery, and a polished
   first-run journey. Reserve time for an actual browser demonstration and usable morning handoff.

If seamless global ground detail proves expensive, use well-integrated detailed regional visits
connected to the globe, and explain the limit honestly. Do not claim seamless standing exploration
unless it actually works. This is a prototype for interrogation and ongoing world creation,
not a final simulation of twenty years of lore.

## Acceptance and evidence

- One documented startup command and local URL. Keep a local server running for morning if possible.
- Owner can reach a forest, a shore and a mountain quickly; walk/fly/escape/reset are demonstrated.
- Every supplied source is accessible from the workshop, including the current Google Doc text.
- A note and bookmark survive reload. Export/import round-trip works; invalid data fails safely.
- World representation and source map discrepancies are explicit, with no invented canon.
- No towns, people, human buildings or roads in the environment. Named major rivers remain out of scope.
- Reproduce a meaningful failing test BEFORE changed navigation/state behavior, then make it pass.
  Do not add vacuous tests that restate implementation. Use node:test or the existing tooling where sensible.
  If a GPU-only behavior needs manual testing, record a concrete reproduction and before/after evidence.
- npm run build must pass. Run relevant tests and any data-layer acceptance checks if those layers change.
- Actual browser playtest: loading, orbit, descending, presets, walking, flying, quality changes,
  planet-size toggles, source viewer, note persistence, audio mute, and error recovery.
  Record screenshots and console errors. Measure observed fps; do not generalize to untested hardware.
- Update README.md, docs/acceptance.md and write docs/MORNING-HANDOFF.md with URL/start command,
  best first exploration route, completed behavior, evidence, caveats, and next useful questions.
- Keep a concise ongoing checkpoint in docs/OVERNIGHT-STATUS.md, especially before rate limits.
  Save source edits frequently. A claimed passing build must identify when it was run.

## Boundaries and collaboration

Work in E:/GPT_OS/Projects/eredent_site. Preserve existing dirty docs/kiros_earth_scale.png
and maps/. Codex added this brief, Drive snapshot, downloaded source files and manifest.
Initial Git branch is main, commit 90582115e815c9d222bfcfe71f21a21ff94940ab. Do not commit on main.
If committing, create a codex/kiros-exploration branch after checking controls/current state;
never reset or overwrite unrelated work. Local prototype delivery is sufficient.
Do not push, deploy, merge, publish private lore, buy assets, change permissions, or install
unrequested engines globally. Do not bypass approval controls. Choose reversible local work.
You may use existing tools and safe project-local dependencies as needed.

Suggested skills: tdd for behavior; game-studio:three-webgl-game and game-playtest for relevant
runtime/testing guidance; diagnosing-bugs for reproducible failures; frontend-testing-debugging
for browser verification. Read each relevant skill before applying it.
Do not let any suggested skill enlarge scope or require an unneeded rebuild.
Start implementing now, and keep iterating on observed shortcomings rather than ending at a plan.

