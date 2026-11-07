# Generate the library STLs

Regenerates the 17 BASISCad piece STLs in `public/library/` from the
prototype's own geometry. See `generate.py` for the full story
(sources, provenance, validation); the short version:

- The real piece STLs were never available as files, so the geometry
  was recovered from the prototype's public guest API
  (`/api/guest/library`), which serves each piece's triangle mesh
  plus its hole list. Every triangle in the STLs comes from there —
  nothing is re-modelled or guessed.
- The script converts the meshes to binary STL (Z-up, the
  3D-printing convention), validates each one (watertight, winding,
  genus-derived hole count equals the prototype's hole count,
  bounding box matches the spec), and writes
  `public/library/holes.json` with the hole positions in the app's
  Y-up frame for future milestones.

## Run

From the repo root:

```sh
pip install trimesh numpy
python3 scripts/generate-library-stls/generate.py
```

The source API responses are vendored under `source/` so
regeneration works offline. To re-fetch them from the live
prototype, see the instructions in `generate.py`.
