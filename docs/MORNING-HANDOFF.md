# Morning handoff: Kiros exploration workbench

Overnight build, 2026-10-10. Branch `codex/kiros-exploration` (from `main` at 9058211). Nothing was pushed, merged or
deployed, and `main` is untouched.

## Start it

```bash
npm install
npm run dev
```

Then open http://localhost:5173/. If the overnight preview server is still running, that address already works.

## Best first route (about 15 minutes)

1. **Welcome card → "Walk a primeval forest".** You land on foot in northern Ender among 60–100 m trees.
   - Click the view to capture the mouse (Esc releases it).
   - Walk with WASD, run with Shift, jump with Space. You'll notice the low gravity of the small world.
   - Turn on **Sound** (top bar) for wind, leaves and birds.
2. **Press V** to fly. Climb with Space to a few hundred meters and look across the closed canopy, then press **G**
   to land back where the middle of the screen points.
3. **Explore → "Climb the Veir range".** You stand at a snowy edge above a valley. Press **L** a few times to cycle
   sunrise, midday, golden hour and a night with both moons up.
4. **Explore → "Over the outer ocean"**, low at dusk: dark, swelling, hostile water. Then **"Stand on an equatorial
   beach"** for the pale protected sea.
5. **Press J** to open the Workshop and go to **Compare**.
   - Click **Drape on globe: Oct 10 ink**, close the workshop and press **M** to rise.
   - The Oct 10 drawing's small Lake Veir sits about 440 km SSE of the built lake, on the range's southern arm.
6. **Survey panel → "Oct 10 outline".** The ground is rebuilt from the newest drawing as a what-if variant. Then try
   **Explore → "Oct 10 Lake Veir"** and walk its shore. Switch back with "September penup".
7. **Press B** anywhere to bookmark the view, and leave yourself questions in **Workshop → Notebook**.
   **Workshop → Brief** turns them, plus the source conflicts, into a paste-ready brief for Claude or Codex.

## What works now

**Immerse**
- One camera from orbit to standing height on either planet size:
  - *survey*: the original descent camera.
  - *walk*: continuous WASD, mouse look with pointer lock or drag, run, jump, wading, trunk and boulder collision.
  - *fly*: faster the higher you are.
- Speed control with the wheel or `[` `]`, an on-screen pad, Home to reset, H for help.
- Quick starts land you at a forest, a beach, a mountain edge, two Lake Veir shores, a volcano rim, a wetland, the
  Roan heights, the northern heights, the inner sea and the outer ocean.
- Deterministic, streamed vegetation by zone, following the spec's bands, treeline and snowline:
  - giant trees, understory, ferns and grass, rocks;
  - closed canopy from above, a far level of detail, and no trees in water, on snow or (big trees) in the desert.
- Water:
  - shoreline pulled down to the water level, foam and a strand;
  - turquoise protected shallows, dark outer ocean with swell geometry;
  - reflections that follow the real sky.
- Height fog standing in for aerial perspective below 30 km, mist at dawn and over the cold northern seas.
- Lighting:
  - lighting looks (sunrise, midday, golden hour, two-moon night);
  - correct moon phases (the old code had them inverted).
- Dragon silhouettes heading seaward at dawn and home at dusk.
- Synthesized ambience, off until enabled, with persistent volume.

**Develop (the Workshop, J)**
- *Sources:* every supplied file with role, frame, authority and the zoomable original:
  - the six Drive items, including the Doc text;
  - the older maps, the art references and the texts.
- *Compare:* the September penup master and the Oct 10 outline on the same registered grid:
  - overlay, blink and swipe;
  - a lake table;
  - drape either drawing's ink on the globe.
- *Places:* evidence and a status for each (canon, derived, disputed, older-map name).
- *Notebook:* notes, questions, proposals (visibly apart from canon), ideas and bookmarks, with JSON export and a
  validated import.
- *Brief:* a paste-ready brief of open questions, proposals and source conflicts.
- The HUD names the source behind the ground you stand on (September master, kiros_v5 zones, spec tables, or
  generated).

**Data**
- `python pipeline/compare_sources.py` registers the Oct 10 drawing onto the master grid (0.83 px RMS) and measures
  what changed (`docs/source-comparison.md`).
- `python pipeline/run_all.py --variant oct10` builds the Oct 10 terrain variant (`docs/oct10-variant.md`). The
  default build is unchanged, checked by md5.

## What the sources disagree on (for you to decide)

| Question | Evidence |
| --- | --- |
| Is the Oct 10 Lake Veir the new canon? | It is 0.17× the September area (about 7,860 vs 45,000 km² on the small world) and its centre moved about 440 km SSE. The Veir range is now one diagonal line instead of a ring around the lake. |
| Is Lake Veir still the Bonneville-sized ruler? | If it is, the Oct 10 lake would need a planet radius of about 4,300 km, which is neither of the two current options. |
| Sfere and Dire Lake | Oct 10 shrinks them to 0.06× and 0.08×. Dire's inner depression is gone. |
| Northern islands | Oct 10 draws no mountain marks there. The September build has 2,400 m ridges. |
| Planet size | Both the small world and Earth-sized are still toggles. Neither is chosen. |
| Malos tip at 2°S, northern limit at 68°N vs 75°N | Both unchanged from the existing findings in `docs/acceptance.md`. |

## Evidence

- **Tests:** `npm test` passes 43/43 (navigation, workshop store, brief, markdown reader).
  - The navigation and store tests were written first and failed before their modules existed.
  - The trunk-collision test failed before its fix.
- **Build:** `npm run build` passes (last run 02:28 MDT; this is re-run at the end of the night, see the status file).
- **GPU/CPU ground agreement:** the drawn surface matches the walker's ground within 0.01–0.23 m at 8 test points.
  Before the overnight fix it was off by up to 2.7 m.
- **Performance on the build machine** (RTX 5070, Chromium 152 in the Claude desktop browser pane), 60 synchronous
  frames per measurement, at 1024×768:
  - about 2.3 ms per frame walking in the forest;
  - about 2.6 ms per frame flying 370 m over it (5.4 M triangles, 52 k plant instances).
  - Not measured on any other hardware. The Quality select (Fast, Balanced, Fine) scales the tile budget, the
    vegetation radius and the resolution.
- **Playtest screenshots and checklist:** `docs/playtest/`.

## Caveats (honest limits)

- **Generated, not canon:** trees, rocks, ground cover, relief finer than the ~1 km data, dragons and sound. The
  shapes are generic stand-ins.
- **Not yet in the world:** shadows, rivers (out of scope), birds, sea life and megafauna models.
- **Lighting and weather:** the sky is single scattering plus a fog approximation. Weather is limited to dawn mist and
  cold-sea fog.
- **Oct 10 variant cliffs:** the variant places the new Lake Veir inside the old mountain belt. Its far shore is a
  near-vertical wall more than a kilometre high. That is the data, not a renderer bug. The basin widths for the
  smaller lakes are guesses (`docs/oct10-variant.md`).
- **Elevation readout includes generated relief:** high ridges have generated relief up to a few hundred meters (damped
  near summits), so the HUD elevation can read 4.3–4.5 km where the spec table says 4.4 km summits.
- **Source files are served from the dev server:** the workshop shows the originals from `docs/` and `maps/` through the
  dev server, so they are not in `npm run build`. Merging this branch to `main` would deploy everything committed
  under `public/` and `src/` to GitHub Pages, including derived overlays and small thumbnails of your maps. Decide that
  before merging.
- **Browser pane quirks:** in the Claude desktop browser pane the frame rate shown in the HUD is throttled (30 fps).
  In a normal browser window it runs at the display rate.

## Next useful questions to grill

1. Which Lake Veir is canon? If it is the Oct 10 one, does the Bonneville ruler still set the planet size?
2. Is the Veir range a ring around the lake or a single spine? Should the northwest line join it?
3. Should the northern islands keep mountains and snow?
4. Should the inner water be fresh? Does Lake Veir have an outlet (the Red Rock Pass question from the spec)?
5. What actually lives here? Name a few trees and creatures and they can replace the stand-ins.
6. Where do dragons nest: cliffs on the Dragon Islands, the northern isles, or the Veir crags?
