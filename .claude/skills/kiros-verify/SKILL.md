---
name: kiros-verify
description: Verify a visible change to the Kiros site in the browser pane - start the dev server, put the camera somewhere exact, render frames by hand, screenshot, and measure frame cost. Use after any edit to src/ shaders, terrain, vegetation, water, sky, controls or UI, and when asked whether something "looks right" or "runs fast enough".
---

# Kiros verify

The site exposes `window.kiros` (the `ctx` object in `src/main.js`). Verify through it, not by
clicking around and waiting.

## The trap

The Claude desktop browser pane is often hidden between tool calls. While it is hidden,
`requestAnimationFrame` never fires: flights do not progress, the HUD and fps go stale, and
`renderer.info.render.frame` stops. It looks like a GPU hang. It is not. Also, the big scatter shaders
take several seconds to compile on first render. The pane also caps the HUD fps at 30, so never quote
that fps as performance.

A hidden pane can also leave the canvas at 0x0, so terrain streams only a handful of tiles and any timing is
meaningless. Take a screenshot first (that brings the pane up), then check
`[kiros.renderer.domElement.width, kiros.renderer.domElement.height]` is non-zero before measuring.

So: drive frames yourself with `kiros.tick(n)` and screenshot right after.

## Steps

1. `preview_start {name: "kiros-dev"}` (from `.claude/launch.json`). The port is assigned (`autoPort`;
   Vite reads `PORT`), so other sessions can run their own server. Use the port the result reports, and open
   `http://localhost:<port>/?nowelcome` to skip the welcome card.
2. Wait for load: `!!window.kiros?.terrain` in `javascript_tool`.
3. Put the camera somewhere:
   - a named place: `await kiros.goPlace('s-forest'); kiros.tick(400)`. Ids are in `src/places.js`
     (`orbit`, `veir`, `ender`, `outer`, `north`, `s-forest`, `s-veir-peak`, `s-beach`, `s-volcano`,
     `s-wetland`, `s-veir-oct10`, ...). Walk starts finish their flight and then switch mode, so tick
     enough frames (300 to 600).
   - exact survey pose: `Object.assign(kiros.rig.t, {lat, lon, alt, heading, pitch}); Object.assign(kiros.rig.c, kiros.rig.t); kiros.rig.flight = null; kiros.tick(60)`.
   - a lighting look: `kiros.applyLook('sunrise' | 'noon' | 'golden' | 'moons'); kiros.tick(5)`.
   - the Oct 10 variant: `await kiros.setTerrainSource('oct10')` (back with `'sept'`).
4. Tick a few more frames (streaming tiles and plant cells fill over frames), then
   `computer {action: "screenshot"}`. `kiros.tick` returns `rig.view`; check that lat, lon, alt and mode
   are what you meant before trusting the picture.
5. Check `read_console_messages {onlyErrors: true}`. Shader compile errors show up there.

## Measuring cost

Do not use the HUD fps or `gl.finish()`. Render a few frames to warm up, then time a batch and force a
real GPU sync with `readPixels`:

```js
const r = kiros.renderer, gl = r.getContext(), px = new Uint8Array(4);
kiros.tick(10);
const t0 = performance.now(); kiros.tick(60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
({ msPerFrame: (performance.now() - t0) / 60, tris: r.info.render.triangles, calls: r.info.render.calls, tiles: kiros.terrain.count })
```

Report ms per frame with the resolution, the Quality setting and the place, and say it was measured on
this machine only (RTX 5070 at the time of the overnight build). Baselines at 1024x768: about 2.3 ms walking
in the Ender forest and 2.6 ms flying 370 m over it (`docs/MORNING-HANDOFF.md`); 3.2 ms at `s-forest`
with 375 tiles and 4.2 M triangles in a 2026-10-10 re-check. Tile counts in the single digits mean the canvas
was not sized. Measure again.

## Before you call a bug

- Plants "missing near the camera" can just be sparse presence in the few cells in view. Disable presence
  before suspecting the grid.
- Ground and walker heights disagree? The GPU path uses CPU Taylor terms near the camera for layer uv.
  Compare `kiros.heightfield` ground against the drawn surface at a few points before blaming noise.
- High ridges read 4.3 to 4.5 km because generated relief is added on top of the 4.4 km table. That is
  expected.

## Proof

Share a screenshot for visual changes, and the numbers object for performance. Add lasting playtest
shots to `docs/playtest/` only if the change is one the owner should see later.
