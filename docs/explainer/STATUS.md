# Explainer build status (2026-10-10, paused at usage limit)

Free version, Vox printed-paper style, script approved by the owner.

## Done
- `explainer/beats.json`: the single source for narration and pictures, with the changes below applied.
- `explainer/capture.mjs`: real frame-stepped footage from the site (visible Chromium window, real GPU, survives dev-server
  reloads). Shots in `explainer/out/footage/`: orbit (150 frames), descent to Lake Veir (210), north (150), forest (150).
  Run: `node explainer/capture.mjs http://localhost:5173 [shot ...]`.
- `explainer/narrate.ps1`: free narration with the Windows voice Zira, to `explainer/out/voice/beat_NN.wav`.
  Drop your own recordings there to replace it.
- `explainer/timings.py`: faster-whisper word timings and number-bar cue times, to `explainer/out/timing.json`.
  All five bars found. Speech is about 63 s in total.

## Judgment changes to the approved script
1. Beat 7: "seventeen hundred kilometers across the middle" was wrong. 1,693 km is the radius, so it now says
   "...seventeen hundred kilometers in radius."
2. Beat 8: "hundred-meter trees" became "giant forests", because 80 to 120 m is a proposed height and Pandora-scale is the canon.
3. Beat 10: it now says "four hundred forty kilometers" to match the 440 KM bar, and "south" is dropped because the picture shows the direction.
4. Beat 4: no outside photo is downloaded. Your Lake Veir outline from the master drawing stands in for the Bonneville photo.
5. Beat 6: real footage of the northern islands instead of drawn stamps.
6. Beat 6: SSML adds a short pause so "Ice Sea" doesn't come out as "icy".
7. The footage-study step is skipped, so no Vox videos are downloaded.

## Questions for the owner
- Pronunciation: the voice says Kiros as "KEE-ross" and Veir as "Vera"/"Vair". What's right?
- The bars show exact figures (0.27 G, 1,693 KM) while the voice rounds ("a quarter", "seventeen hundred"). Keep it that way?

## Left to build
1. `explainer/render.py`: paper ground, torn cutouts, scenes for beats 1 to 10, the seams (peel, tear, slide, draw, stamp,
   flip, push), number bars on their cue times, one continuous camera pass, rendered as 1280×720 30 fps frames.
2. A procedural music bed at about 10% volume, fading out over the last 1.5 s.
3. FFmpeg assembly to `explainer/out/kiros_explainer.mp4`, plus an `.srt` caption file.
4. QA: burst contact sheets, a static-hold detector, a jump detector at the joins, and a table of the gaps between lines.
5. Add `explainer/out/` to `.gitignore` (it holds about 650 footage frames plus audio).

FFmpeg is at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-9.0.2-full_build\bin` (new shells have it on PATH).
