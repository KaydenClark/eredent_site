---
name: kiros-pipeline
description: Rebuild and check the Kiros terrain layers from the source drawings - run the Python pipeline, build a variant, run the acceptance checks, and prove the default build did not change. Use when a source map, pipeline/config*.json or any pipeline/*.py step changes, or when someone asks whether the built world still matches the drawings.
---

# Kiros pipeline

The pipeline turns the drawings in `pipeline/source/` into elevation, water and biome layers, then into the
web textures under `public/textures/` and `public/data/`. Those outputs (16-bit elevation PNG, biome masks,
meta JSON) are the engine-agnostic asset. Any future engine port starts from them, so keep them correct.

## Run

Use the venv in `pipeline/venv` if present, otherwise `pip install -r pipeline/requirements.txt`.

```bash
python pipeline/run_all.py                    # September penup master (the default build)
python pipeline/run_all.py --variant oct10    # Oct 10 outline -> pipeline/build_oct10/, public/textures/oct10/
python pipeline/check_acceptance.py           # add --variant oct10 for the variant
python pipeline/compare_sources.py            # re-register the Oct 10 drawing and update docs/source-comparison.md
```

Steps run in order: masks, register, project, terrain, render, export_web. A variant reuses the September
biome registration (`biome_reg_from` in its config).

## Rules

- Every number lives in `pipeline/config.json` (or `config_oct10.json`), tagged canon, derived or proposed.
  Do not hard-code a height, a radius or a sea level in a step. Do not promote a proposed number to canon
  without the owner saying so.
- A variant must not touch the default outputs. After a variant build, or any change meant only for a
  variant, check md5 of `public/textures/*` and `public/data/kiros_meta.json` against the values from
  before the run and say so.
- No rivers. The spec puts them out of scope; acceptance check 5 depends on there being no river step.
- Acceptance checks: coast and lakes within 2 px of the outline, mountains only on marks at table
  heights (plus or minus 5%), desert only in yellow zones, wetland only in the purple zone, inner seas paler than
  the outer ocean from orbit. A FAIL is a finding to report, not something to tune away.
- Source drawings in `pipeline/source/`, `maps/` and `docs/drive-source/` are originals. Never overwrite
  them. Derived overlays go to `public/sources/`.

## After a rebuild

Reload the site and look at the changed region with the `kiros-verify` skill. Update `docs/acceptance.md`
if a check's status changed. Note that anything under `public/` deploys to GitHub Pages once `main` is pushed,
including thumbnails of the owner's maps.
