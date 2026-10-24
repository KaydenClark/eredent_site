# Kiros browser playtest, 2026-10-10

Structured playtest of the local explorer, run 02:30–02:50 MDT (08:30–08:50 UTC) on 2026-10-10.

## Setup

| Item | Value |
| --- | --- |
| Machine / GPU | `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)`, vendor `Google Inc. (NVIDIA)` (from `WEBGL_debug_renderer_info`) |
| Browser | Claude desktop browser pane, Chrome 152.0.7977.130 (Windows 11), devicePixelRatio 1 |
| Viewport | 1280×800 emulated; screenshots come back at 800×500 |
| Server | Vite 6.4.4 on http://localhost:5182 (own instance, separate origin from Kayden's 5173, so his notebook was never touched) |
| Code | Branch `codex/kiros-exploration`. Started at `12f546b`, plus uncommitted edits to `src/main.js` and `src/vegetation.js`; finished on `68e7f36` plus uncommitted edits to `src/vegetation.js` and `src/workshop/*`. Other engineers were editing during the run (see Harness notes). |
| Frame stepping | `requestAnimationFrame` is throttled in the pane, so frames were advanced with `kiros.tick(n, 1/30)` before each reading or screenshot. HUD fps (26–35) reflects the throttled pane and is not a measurement. |

## Results

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | First-run welcome card, quick-start click | **Pass** | `01-welcome.jpg`. Clicking "Walk a primeval forest" closed the card and landed on foot (mode `walk`, HUD "Walking · 1.7 m above ground · 196 m elevation / Primeval mixed forest / 24.350°N 51.500°W"). `?nowelcome` suppresses the card. The Explore button reopens it. |
| 2 | Orbit view | **Pass** | `02-orbit.jpg`. 4,400 km above 32°N 4°W, 12 tiles. Inner seas are clearly paler than the outer ocean. |
| 3 | Descent with survey controls (wheel) | **Pass** | Real wheel events at screen centre. Wheel-down zooms out to a cap of 20,312 km. Wheel-up runs 20,312 km → 655 km → 21 km → 680 m (20 notches per step, 236 tiles at 680 m) with no popping visible in the stepped screenshots. |
| 4 | Scenic starts | **Pass (all load), several weak or wrong** | See the table below. |
| 5 | Walking with keyboard; run; jump | **Pass** | KeyboardEvents on `window` with `kiros.tick` between them. W for 2 s: 8.4 m. Shift+W for 1 s: 12.6 m. S for 1 s: 4.2 m. D for 1 s: 4.2 m. No drift after key release (0.000 m over 1 s). ArrowLeft for 1 s turns 90°. Space jump peaks at 2.95 m and lands after 89 frames (~3 s, low gravity). Keys are cleared afterwards (`rig.keys` empty). Typing in notebook fields did not trigger L or other shortcuts. |
| 6 | Fly mode | **Pass** | V switched to `fly`. Space for 3 s climbed 118.6 m. W for 2 s moved 78.4 m. Shift boost for 1 s moved 194 m. C for 1 s descended 36.6 m. `04-canopy-fly.jpg` (114 m above ground). |
| 7 | G from orbit lands at screen centre | **Pass** | Tilted orbit (pitch −77°, heading 25°). Screen centre ray hit 64.749°N 36.604°E. A real G keypress landed at 64.74905°N 36.60446°E, 0.000 km from the independently computed ray–sphere hit. Note: that point is open sea, so you end up "walking" on the water (problem 9). |
| 8 | Reset / Home | **Pass** | The Reset button and the Home key both fly back to 4,400 km over 32°N 4°W, pitch −90°, mode survey, from the forest floor in about 4 s. |
| 9 | Quality select Fast / Balanced / Fine | **Pass** | Via the real `<select>`, flying 114 m over the Ender forest. Pixel ratio 0.6 / 1 / 1.35; canvas 768×480 / 1280×800 / 1728×1080. Results in the Performance section. The terrain tile count (404) does not change with quality. |
| 10 | Planet size toggle while walking | **Pass** | In the Survey panel, Earth-sized: radius 6,371 km, HUD "Earth-sized", still 1.7 m above ground at the same lat/lon and still on the ground. W for 2 s walked about 8.4 m on Earth size. Back to Small world: radius 1,692.7 km, same spot, on the ground. |
| 11 | Terrain source toggle Sept / Oct 10 | **Pass** | The "Oct 10 outline" button: the HUD ground line changed to "Oct 10 outline variant + spec heights" and the walker stayed grounded. The note text appeared. `10-oct10-variant-orbit.jpg` shows Lake Veir replaced by small lakes. The source resets to Sept on reload (planet size persists). `goPlace('s-veir-oct10')` switches the source asynchronously (about 1–3 s). |
| 12 | Light select and L key | **Pass (framing issue)** | Real L presses cycle 06:35 (sunrise), 13:51 (midday), 19:52 (golden, `08b-golden-hour-veir.jpg`), 23:04 (two-moon night). The Light `<select>` applies the same hours, then resets to "—". The two-moon preset frames the larger moon under the top toolbar (`08a-two-moons-preset-framing.jpg`, problem 4). Both moons are visible after raising pitch to 44° (`08-two-moons.jpg`). |
| 13 | Workshop J: Sources gallery, open a source | **Pass** | J opens the panel on Sources: "All sources (22)", 28 buttons. Opened "Penup outline (master)": the full 1362×1155 image loads, and the Open original links (`/docs/drive-source/…`, `/pipeline/source/…`, `/maps/…`) return 200. Opened "Kiros Map Description (Google Doc, Oct 10 snapshot)": the text renders with a section index (`11b-workshop-doc-text.jpg`). Esc closes the workshop. |
| 14 | Compare tab drape buttons | **Pass** | `11-workshop-compare.jpg`. "Oct 10 ink (earth_re)" drapes orange Oct 10 mountain marks on the globe (`09-drape-oct10.jpg` vs `09a-no-drape-same-view.jpg`, same view without it). The drape buttons show no active state (problem 12). |
| 15 | Places Go | **Pass** | "Go: Dire Lake basin" flew to 15.4°N 32.9°E, 260 km, HUD "Lake". The workshop stays open over about 60% of the view (problem 11). |
| 16 | Notebook bookmark + note, reload, persist | **Pass** | Saved bookmark "playtest bookmark - Dire Lake (delete me)" and note "playtest note (delete me)" through the UI (`12-notebook.jpg`). After a full reload both were present in the list and in `localStorage['kiros.workshop.v1']`. The bookmark's Go restored 15.4°N 32.9°E, 260 km, pitch −55°. Both were deleted at the end with the UI Delete buttons, and the notebook is empty again. The notebook held nothing else (fresh origin), so nothing was exported. |
| 17 | Brief tab | **Pass** | 15,630-character markdown brief with ground rules, source order and discrepancies. It included the playtest note while it existed. Copy and Download .md buttons are present (not clicked). |
| 18 | Sound on/off, volume | **Pass** | Sound button: `ambience.on=true`, AudioContext `running`, label "Sound on", volume slider shown. Slider to 0.2: `ambience.volume=0.2`, stored as `kiros.audio.v1={"volume":0.2}`. Off: `on=false`, label "Sound off", slider hidden. The AudioContext stays `running` after Off (minor). |
| 19 | Help (H) | **Pass** | The H keydown opens the help dialog. |
| 20 | Console errors | **Pass (no app errors)** | `read_console_messages` with errors only, after each section: none from the app. The only entries were `WebSocket connection to 'ws://localhost:5182/' failed` (from my HMR-off server config) and one harness warning that the browser suppressed a native `confirm()`. |
| 21 | GPU cost at 3 views | **Measured** | See below. |

### Scenic starts (`kiros.goPlace`, about 15 s of ticks each)

| id | Lands at (HUD) | Verdict |
| --- | --- | --- |
| s-forest | Walk, 196 m, Primeval mixed forest, 24.350°N 51.500°W | Good (`03-forest-walk.jpg`). |
| s-veir-peak | Walk, 4.1 km, Snowfield, 34.174°N 21.933°W, sunrise | OK (`05-veir-summit.jpg`). The view is a soft grey rounded ridge with little snow in frame, and the HUD says "Snowfield". |
| s-veir-shore | Walk, 1.6 km, "Lake", 48.971°N 29.348°W | **Weak.** Facing 200°, the whole frame is flat grey water to the horizon. Turned 180°, there is a sheer, vertically streaked wall (`05b-veir-shore-cliff-wall.jpg`, problem 1). |
| s-veir-oct10 | Walk, 1.5 km, Lake (Oct 10 ink), 32.713°N 20.337°W | **Weak.** Same streaked wall along the shore (`05c-oct10-veir-shore-wall.jpg`). |
| s-beach | Walk, 2.8 m, "Outer shelf / outer ocean", 0.186°S 13.451°E | **Faces the wrong way.** The start view is empty pale sea (`06a-beach-start-view.jpg`); the beach and rainforest are behind you (`06-beach-turned-180.jpg`). The card says "inner sea" but the HUD says outer ocean. |
| s-volcano | Walk, 3.7 km, Primeval mixed forest, 8.643°N 23.030°W | **Wrong scene.** Dark, dense giant forest on the "rim of the central cone" with no view out (`06c-volcano-rim-in-forest.jpg`). |
| s-wetland | Walk, 13 m, Wetland swamp forest, 11.990°N 44.547°E | OK. Forest with grass and no visible standing water. |
| s-roan | Walk, 3.5 km, Snowfield, 38.062°N 24.831°E | OK. Snow patches and a hazy valley. |
| s-north | Walk, 3.7 km, Snowfield, 62.788°N 10.955°E | OK. Snowfield with sea beyond. |
| s-inner-sea | **Fly, 60 m above ground, Primeval mixed forest, 33.000°N 5.000°W** | **Wrong.** "Low over the protected inner sea" starts inside the tree crowns of a forested island strip (`06e-inner-sea-start-inside-canopy.jpg`). |
| s-outer | Fly, 40 m, Deep outer ocean, 20°N 70°W, dusk | Loads (`07-outer-ocean-dusk.jpg`), but the deep ocean reads as blotchy yellow-green (problem 6). |

Named places, all survey views: veir (420 km, Lake), veir-ground (1.8 km, Alpine rock), sfere (300 km, Lake), dire (260 km, Lake), dragon (60 km), create (300 km, inner sea), ender (3 km, forest), inner-sea (180 km; the sub-point is forest on the island strip), outer (1.2 km, deep ocean), north (500 km, rocky shore). **malos-wet ("Malos east wetlands") is centred on 12.2°N 45.35°E, which the HUD calls "Outer shelf", 0 m** (ocean, not wetland).

## Performance

60 synchronous `renderer.render(scene, camera)` calls, then one `gl.readPixels` sync, Balanced quality unless stated, 1280×800. Measured twice; the figures agree within 0.1 ms.

| View | ms/frame | Triangles | Draw calls | Terrain tiles | Vegetation (chunks / instances) |
| --- | --- | --- | --- | --- | --- |
| Orbit, 4,400 km | 0.54 | 63,968 | 5 | 12 | 0 / 0 |
| Flying 151 m over Ender forest | 2.96–3.05 | 5,114,542 | 56 | 407 | 384 / 39,000 |
| Walking, forest floor (s-forest) | 3.87–3.97 | 5,287,282 | 59 | 421 | 381 / 41,041 |

Same canopy view, earlier code (before the vegetation.js edits landed):

| Quality | Pixel ratio | ms/frame | Triangles | Vegetation (chunks / instances) |
| --- | --- | --- | --- | --- |
| Fast | 0.6 | 1.46 | 2,456,521 | 160 / 13,946 |
| Balanced | 1.0 | 2.75–2.80 | 4,333,384 | 391 / 39,025 |
| Fine | 1.35 | 4.51 | 6,443,046 | 628 / 69,359 |

Earlier code, walking in the forest: 3.50–3.61 ms, 4.61 M triangles, 43 calls. Orbit on the earlier code: 0.46 ms, with 35 vegetation chunks / 419 instances still alive at orbit (0 after the reload). All figures are GPU+CPU submit cost on an RTX 5070; they say nothing about other hardware.

## Problems, ranked

1. **Lake shores are vertical walls with stretched texture.** At s-veir-shore, turn 180° (heading 20°). A sheer wall of vertically smeared texture rises right behind the beach (`05b`). `world.groundAt` along that heading reads 1576.7 m at 200 m and 1615.5 m at 300 m: a 39 m step over 100 m horizontal. The Oct 10 variant shore shows the same banding along the whole lake edge (`05c`). Reproduce: `kiros.goPlace('s-veir-shore')`, then ArrowLeft for 2 s.
2. **Three scenic starts show the wrong thing.**
   - s-inner-sea flies at 60 m above ground inside forest canopy on an island at 33°N 5°W. The sea is not visible (`06e`).
   - s-volcano puts you in dark giant forest at 3.7 km with no rim or crater view (`06c`).
   - s-beach faces open sea, with the beach behind you. The HUD names the water "Outer shelf / outer ocean" while the card says "inner sea" (`06a` vs `06`).
3. **Lake Veir shore starts face featureless water.** Both Lake Veir shore starts (Sept and Oct 10) face open lake to the horizon, with no shore, mountains or vegetation in frame.
4. **The two-moon night preset hides the larger moon under the top toolbar.** After L×4 or Light → "Two-moon night", the larger moon projects to NDC (0.31, 0.91), about y = 35 px, behind the mode bar (`08a`). Only the small moon is visible. At pitch 44° both are in frame (`08`).
5. **The HUD and title are unreadable over bright scenes.** The bottom-right HUD text and the top-left subtitle/source line have no backing and vanish over sky, water, snow and foliage. See `04`, `05`, `06a`, `07`, and `05b` (worst).
6. **The deep outer ocean at dusk reads as yellow-green blotches,** not dark water (`07`, s-outer at 20°N 70°W, 40 m).
7. **The on-screen touch pad shows on desktop and overlaps the HUD.** `src/ui.js:47` sets `pad.hidden = mode === 'survey'` with no `pointer: coarse` check. On this desktop (`maxTouchPoints` 0, `pointer: fine`) the pad is visible in walk and fly. Its rect (y 548–688) overlaps the HUD (top 680.5) by about 7 px, covering the HUD's first line. The README says the pad is for touch screens.
8. **Map coordinates for some places are off their feature.** `malos-wet` is centred on ocean ("Outer shelf", 0 m). `inner-sea` and `s-inner-sea` are centred on the forested island strip at 33°N 5°W rather than open sea.
9. **G over open water lands you "walking" on the sea surface** (64.75°N 36.60°E, "0.6 m above ground · 0.0 m elevation", protected inner sea). It works as specified, but switching to fly or a nearest-shore landing may be friendlier.
10. **Stale copy about Oct 10.** The Compare tab says Oct 10 "is not yet built into the terrain", and the Sources card for kiros_earth_re says "not yet built into the terrain". The Oct 10 terrain variant now exists (Survey panel toggle, s-veir-oct10).
11. **Places "Go" leaves the workshop open over about 60% of the screen,** so the destination is mostly hidden until you press Esc.
12. **Small UI rough edges.**
    - Drape buttons show no pressed state.
    - Bookmark text shows raw floats ("lat 15.399999999999999, lon 32.899999999999864").
    - Notebook timestamps are UTC without saying so ("updated 2026-10-10 08:44" at 02:44 MDT).
    - The orbit HUD reports "trees generated" and a ground zone for the sub-point from 4,400 km.
    - The AudioContext keeps running after Sound off.
    - The terrain source is not remembered across reloads, while planet size is.
13. **Wetland start shows no standing water,** so it is hard to read as a swamp (s-wetland).

## Harness notes (not app bugs)

- Two unrequested full page reloads hit mid-run, because other engineers edited `vite.config.js` and `src/`, which restarted Vite. From 02:41 I served 5182 with a scratchpad config that wraps the repo config with `hmr: false` and watching off. The repo config is untouched; the config is at `<scratchpad>/vite.pt.config.mjs`.
- The browser suppresses native `confirm()` (it returns false), so the first UI Delete click did nothing. The page's `window.confirm` was stubbed to accept only prompts containing "playtest", and the real Delete buttons were then clicked.
- A Python `http.server` bound to 127.0.0.1:5182 (serving `scratchpad/veg/distA`) was also running. It was not started by this playtest and was left alone. My Vite server was stopped at the end.
- Not tested: pointer-lock capture and release (browser-native, needs a human), touch pad, notebook export/import, real-time fps.


## Follow-up fixes (builder, 02:55–03:00 MDT)

Every problem above was addressed on the branch after this run (commits 07f3fbe, e15a7fb, d2edf8c); not re-played end
to end by this playtester:

| Problem | Fix |
| --- | --- |
| 1 Lake shores as vertical walls | Root cause: the shoreline pull-down used the lowest of the four surrounding texels, which jumps at every texel edge (a 41 m step 250 m from the Veir shore). Replaced with a continuous water-level field (3×3 minimum per texel, sampled bilinearly) on CPU and GPU; relief eases in from the shore; steep ground gets 3D rock texture instead of vertical streaks. The bank now rises 1,557 → 1,574 m over 600 m. GPU/CPU ground re-measured: ≤ 0.23 m at 8 points. |
| 2 Wrong scenic starts | Inner sea: low flight over open protected water (20°N 5.5°W, 250 m). Volcano: the Dragon Islands cone above 1,200 m is now a volcanic zone (spec: "black rock and ash soils"), no forest, dark ash. Beach: starts on the sand looking along the shore; card text says southern Malos. |
| 3 Lake shores facing empty water | Shore starts look along the shore (water and land both in view). |
| 4 Two-moon framing | The camera keeps the higher moon below the top edge. |
| 5 HUD/title unreadable | HUD on a translucent backing; title has a shadow. |
| 6 Outer ocean yellow-green | The start looks away from the sunset glare (heading 40°). |
| 7 Touch pad on desktop | Shown only on touch screens; P toggles it. |
| 8 Malos wetlands centred on ocean | Moved inside the purple zone (11.99°N 44.55°E). |
| Workshop texts, Places Go, raw coordinates | Texts mention the Oct 10 variant; Go closes the workshop on narrow screens; bookmark coordinates rounded. |
| AudioContext running after Off | Suspends after the fade. |
