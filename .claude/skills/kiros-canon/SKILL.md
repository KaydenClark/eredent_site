---
name: kiros-canon
description: Find, cite and respect Kiros and Azlemzyk canon - where each kind of truth lives (spec, drawings, Obsidian vault, Gods doc), how to tell canon from a proposal, and which questions are still open. Use before naming, placing, sizing or describing anything in the world, before writing lore, and when two sources disagree.
---

# Kiros canon

Kiros is the owner's map for a book and a future game. Getting the world wrong costs more than getting
the code wrong, so check here before you invent.

## Where truth lives

| Kind | Owner | Notes |
| --- | --- | --- |
| World numbers, zones, scale | `docs/SPEC.md` and `pipeline/config.json` | Each config number is tagged canon, derived or proposed. |
| Geography (coasts, lakes, mountain marks) | `pipeline/source/penup_20260912_182533.jpg` (September master) | The Oct 10 outline (`maps/kiros_earth_re.png`) is a variant until the owner chooses. |
| Biome zones | `pipeline/source/kiros_v5.png` | |
| What changed between drawings | `docs/source-comparison.md`, `docs/oct10-variant.md` | |
| Place names and status | `src/places.js` and Workshop > Places | Each place is canon, derived, disputed or an older-map name. |
| Gods and mythology | Google Doc "Gods of Azlemzyk" (owner's source of truth), then the Obsidian vault | Vault: `E:\GPT_OS\Projects\Azlemzyk\Azlemzyk Obsidian Vault` (`1.World Building/1.Gods/`, `2.Campaign/3.Story/`). |
| Owner's notes and questions | Workshop > Notebook (browser storage), exported as JSON | Proposals there are kept visibly apart from canon. |

Note: the global `obsidian-vault` skill points at a different vault (`/mnt/d/Obsidian Vault/AI Research/`).
For Azlemzyk, use the path above.

## Rules

- Cite the source for any world fact you state ("SPEC table 3", "September master", "Gods doc").
- Anything you make up is a proposal. Label it as one in the UI, docs and notes. Never write it into the
  spec, config canon or the vault as if it were settled.
- Generated stand-ins (trees, rocks, fine relief, dragons, sound) are not canon. The HUD says so; keep it that
  way.
- When sources disagree, do not pick. Put the conflict in front of the owner with the evidence (the
  Workshop Brief format works) and keep both options switchable.
- Spell names as the owning source does. The owner's correction beats any doc: it is "Rask", not "Rasc"
  (corrected 2026-10-10).
- God colors are owner canon (2026-10-10): Arkum rainbow, Vitram white, Mora black, Rask red, Verum yellow,
  Iris blue, Raea green, Decius purple, Linel and Vita colorless, Arkane rainbow stars on a black sky,
  Arkinel dark stars on an oily sky. Only these gods have colors; the rest carry their parents' colors.
  The eight dragon colors are the hues; each god's color sits inside one dragon's hue ("the gods control the
  emotions, the dragons took over the hue"), but dragons are not kin to the gods and never share an exact shade.
  Tiacus (cyan) matches no god.

## Open questions (as of 2026-10-10)

- Which Lake Veir is canon: September (about 45,000 km2) or Oct 10 (about 7,860 km2, 440 km SSE)? Does the
  Bonneville ruler still set the planet size?
- Veir range: a ring around the lake or one spine? Do the northern islands keep mountains?
- Planet framing: Earth-sized Kiros with two moons, or Moon-sized Kiros as the single moon of the planet
  Wurth (never call Kiros the big one). Do not edit the spec's moon canon until the owner picks.
- Malos tip at 2°S; northern limit 68°N vs 75°N (`docs/acceptance.md`).
- Fresh inner water? A Lake Veir outlet? What lives here, and where do dragons nest?
- Pantheon loose threads: Kedd's parents, Mora's ending, Ulat vs Plaic, eight dragons named as seven.

Update this list when the owner settles one, and move the answer into its owning file.
