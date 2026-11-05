# Library sources — temporary stand-in STLs

These three files are **temporary stand-ins** for the real BASISCad
piece STLs, which are still to come from the friend / Tinkercad
exports. Each one stands in for one spec piece in the library so
Milestones 2 and 3 can be demonstrated end to end. When a real piece
STL arrives, it replaces the stand-in for that piece and this file is
updated; nothing else in the app depends on the stand-in geometry.

All three files come from the same source and share the same licence:

- **Source repository:** https://github.com/azdle/printables
- **Licence:** CC0 1.0 Universal (public-domain dedication) — the
  repo's README states the author "dedicated all these works to the
  public domain using the CC0 dedication, you may do anything you wish
  with them", with a note that some models may depend on third-party
  code not under CC0. The three files below are generated from the
  OpenSCAD sources in the same folders of that repo, by the same
  author; no third-party code is involved in them.
- **Sizes below are the actual imported sizes, in millimetres, as
  measured from the files** (bounding box, after the Z-up → Y-up
  orientation the loader applies so the part lies flat). Original
  sizes are preserved — nothing was rescaled.

## Stand-ins in use

### 1x6 Girder — `apu-rack-mount.stl`

- **File:** `apu-rack-mount.stl` (663,754 bytes, 4,036 triangles)
- **Source:** https://github.com/azdle/printables/blob/master/rack-mount-stuff/apu-rack-mount.stl
- **Licence:** CC0 1.0 (see above)
- **What it is:** a rack-mount bracket for a PCEngines APU2 enclosure
  — a flat perforated bar.
- **Imported size:** 178.00 × 8.00 × 51.40 mm (length × thickness × width)
- **Through-holes, verified by mesh genus:** 5
- **Note:** much longer and wider than a real 1x6 girder (about
  76 × 12.70 × 3.175 mm by the 1x4's proportions). The spec hole
  count (6) is what the panel and budget use; the stand-in's own
  geometry has 5 holes.

### 2x2 Panel — `pc-board-mount.stl`

- **File:** `pc-board-mount.stl` (1,034,599 bytes, 6,144 triangles)
- **Source:** https://github.com/azdle/printables/blob/master/unsorted/pc-board-mount.stl
- **Licence:** CC0 1.0 (see above)
- **What it is:** a flat mount for a PC board — a flat plate with
  mounting holes.
- **Imported size:** 48.00 × 5.00 × 91.00 mm (length × thickness × width)
- **Through-holes, verified by mesh genus:** 9
- **Note:** the spec hole count (4) is what the panel and budget use;
  the stand-in's own geometry has 9 holes.

### L-Brace — `l-bracket.stl`

- **File:** `l-bracket.stl` (38,544 bytes, 260 triangles)
- **Source:** https://github.com/azdle/printables/blob/master/l-bracket/l-bracket.stl
- **Licence:** CC0 1.0 (see above)
- **What it is:** a small L-bracket for holding two things
  perpendicular — an L-shaped brace.
- **Imported size:** 22.00 × 16.00 × 32.00 mm
- **Through-holes, verified by mesh genus:** 1 (the mesh has 3
  non-manifold edges, so it is slightly imperfect; it loads and
  renders, and it is temporary)
- **Note:** the L-Brace hole count is not established in the spec, so
  the panel shows "holes: ?" for it, as for every other brace.

## Pieces hidden from the Shapes panel

Only pieces with a model file are listed in the Shapes panel (see
`hasModelFile` in `src/app/library.ts`): the three stand-ins above,
plus anything imported in the session. The other **14 spec pieces**
(1x4, 1x5, 1x7, 1x8, 1x9, 1x10, 1x11, 1x12 Girders; 1x2, H-, V-,
S-Braces; Team Plate, 2x3 Panel) have no STL yet, so they do not
appear in the UI at all — no greyed-out rows, no "STL needed"
entries. Their spec data (names, colours, known hole counts) is
unchanged in the library, so a piece reappears in the panel as soon
as its STL is supplied — no other change needed.

## Not used

Two other files were downloaded and measured during the search and
rejected — recorded here so nobody re-does the search:

- `perforated_plate.stl` from https://github.com/Danfoa/invite-robotics
  (MIT licence): a Gazebo/ROS mesh in **metres** (1.2 × 0.0128 × 0.6),
  with **no through-holes** (genus 0). Unusable at the app's 1 unit =
  1 mm scale without rescaling, which the plan forbids.
- `structure.stl` from the same repo (MIT): a 20 MB whole-lab
  structure, not a piece.
- Thingiverse and Printables model pages could not be downloaded from
  this machine (Thingiverse returns 403; printables.com returns empty
  replies), so only GitHub-hosted files with clear licences were used.
