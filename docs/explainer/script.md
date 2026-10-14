# Explainer script, draft 1: "The lake that sized a world"

A one-minute narrated explainer of this repo in the style of `vox-explainer-one-prompt`
(github.com/per-simmons/vox-explainer-one-prompt). Ten beats of 10 to 17 words each.
**Status: waiting for the owner's approval.** That prompt stops here until the script is approved.

The story: a hand-drawn map has no scale, so one lake was made the ruler. That ruler then decides how big
the planet must be, and the newest drawing has moved the ruler. It ends on the open question, because the
planet size is not chosen (`docs/SPEC.md`, "Open questions").

| # | Narration (as spoken) | Words | Picture (one element carries into the next beat) | Number bar |
| --- | --- | --- | --- | --- |
| 1 | Before there were any people on Kiros, there was a drawing: coastlines and lakes in blue ink. | 17 | Bare paper. The real September penup drawing drops in as a torn cutout. The ink coastline **carries**. | none |
| 2 | Kayden wanted to stand inside it, from orbit all the way down to a lakeshore. | 15 | The coastline wraps onto a flat printed globe, then a dotted descent line runs from orbit to a pin on Lake Veir. The **pin** carries. | none |
| 3 | But a drawing has no scale. So one lake became the ruler for the whole world. | 16 | The pin turns into a ruler laid across Lake Veir. The **lake outline** carries. | none |
| 4 | Lake Veir is sized like Lake Bonneville, the ancient Utah lake: fifty-one thousand square kilometers. | 15 | Real public-domain photo of the Bonneville shorelines above Salt Lake City, torn cutout beside the lake outline. | "51,000 KM²" |
| 5 | Put that lake on an Earth-sized planet, and the land only reaches nineteen degrees north. | 15 | Drawn chart: a latitude band on a globe, filled 0° to 19°N in orange-red. The **latitude band** carries. | "19°N" |
| 6 | That's all tropics. But the canon has taiga, snowfields and an Ice Sea far to the north. | 17 | The band stretches up to 75°N while ink stamps of conifer, snow and sea ice land in the north. | none |
| 7 | One answer: shrink the planet to seventeen hundred kilometers across the middle, about our Moon. | 15 | Drawn: two discs side by side, Earth and the shrunken Kiros, with the Moon's outline on top of Kiros. The **small disc** carries. | "1,693 KM RADIUS" |
| 8 | Gravity falls to about a quarter of Earth's. Hundred-meter trees and flying dragons start making sense. | 16 | Real frame from the 3D site: the Ender forest floor among giant trunks. A dragon silhouette crosses. | "0.27 G" |
| 9 | A Python pipeline turns the ink into heights. Your browser builds the planet from them. | 15 | Mechanism, drawn on the verb: drawing, then grey heightmap, then a real orbit frame from the site, linked by a line that draws itself. The **orbit globe** carries. | none |
| 10 | Then a newer drawing moved Lake Veir four hundred kilometers south. Which ruler wins is still undecided. | 17 | Real frames: the September and Oct 10 drawings overlaid, the lake outline sliding south-southeast. Hold on the two outlines. | "440 KM" |

About 158 words, close to a minute at three words a second.

## Where each number comes from (two sources each)

| Number | Source 1 | Source 2 |
| --- | --- | --- |
| Lake Veir = Bonneville, 51,000 km² | `docs/SPEC.md` (scale table) | `pipeline/config.json` `lake_veir_km2: 51000`; Wikipedia, Lake Bonneville |
| Land only to about 19°N on an Earth-sized planet | `docs/SPEC.md` ("The conflict") | Derived check: holding Lake Veir at Bonneville size shrinks the land 3.76×, and 75° / 3.76 ≈ 20° |
| Radius 1,693 km, about the Moon (1,737 km) | `docs/SPEC.md` option A | `pipeline/config.json` `radius_km: 1692.7`, `src/settings.js` |
| Gravity 0.27 g | `docs/SPEC.md` option A | `pipeline/config.json` `gravity_g: 0.27`, `src/settings.js` |
| Trees around 100 m | `docs/SPEC.md` biome table (80 to 120 m, proposed) | `src/vegetation.js` canopy heights |
| Lake moved about 440 km SSE | `docs/source-comparison.md` (438 km toward 159°) | `docs/MORNING-HANDOFF.md` |

Note for the owner: the 100 m trees are a *proposed* height, and "Pandora-scale" is the canon. If that line is
too close to stating a proposal as fact, beat 8 can say "giant trees" instead.

## How Kiros changes the recipe

- **Footage study (step 1 to 2) is skipped.** The repo's `vox-style` guide already holds what that study learned. That
  avoids downloading Vox videos with Chrome cookies.
- **"Archival photos" are your own work.** Torn cutouts of your real drawings, and real frames rendered from the 3D
  site (`kiros-verify`). The only outside photo is a public-domain Bonneville shoreline.
- **Exact things are drawn in code:** charts, the globe band, the disc comparison, number bars. The video model only
  renders the seams between beats.
