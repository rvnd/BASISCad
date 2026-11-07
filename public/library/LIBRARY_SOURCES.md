# Library STLs — sources

All 17 kit pieces have a bundled STL file in this folder, named after
the library piece id (`girder-1x4.stl`, `brace-l.stl`, `plate-2x2.stl`,
…). The Shapes panel lists all 17.

## Where the geometry comes from

These are **not** Lucas Kasper's original Tinkercad files — those were
never available as files (the Tinkercad collection linked in the
transcript opens empty for our account). They are also not re-modelled
from dimensions: the written spec states almost no dimensions beyond
the 1x4 Girder (50.95 × 12.70 × 3.175 mm).

Instead, the geometry was **recovered from the prototype's own public
guest API**: `GET /api/guest/library` lists the 17 pieces and
`GET /api/guest/library/<id>` returns each piece's triangle mesh plus
its snap-hole list — the same triangles the prototype renders in the
browser. The generator (`scripts/generate-library-stls/`, which vendors
the API responses under `source/` for offline regeneration) converts
each mesh to a binary STL and validates it: watertight,
winding-consistent, and the genus-derived hole count equal to the
prototype's hole count. The one normalisation is the 1x11 Girder,
whose source mesh lies along Y; it is rotated +90° about Z so its
length lies along X like every other girder.

## Orientation

The STLs are written **Z-up** (the 3D-printing convention: the part
lies flat in the XY plane, thickness along Z, bottom face on z = 0).
The app's loader rotates them flat into its Y-up frame
(`src/three/loadPieceFile.ts`, `assumeZUp: true`) — including the
braces, whose arms stand up in Z and must not be left on their side.
The Y-up sizes in `src/app/library.ts` are the sizes after that
rotation: x = length, y = thickness/height, z = width.

## Dimensions and holes

Hole diameter is **4.196 mm** (radius 2.098 mm) on every hole — the
prototype's value — which clears a #6-32 screw (3.505 mm across). One
H-Brace hole is 2.13 mm radius in the source; it is preserved as-is.
Hole pitch on the girders and panels is 12.7 mm. All flat pieces are
3.175 mm thick. Sizes below are in the source (Z-up) frame: x = length,
y = width, z = thickness — the same numbers, reordered, as the Y-up
sizes in `src/app/library.ts`.

| Piece       | Size (x × y × z, mm)  | Holes | Triangles |
| ----------- | --------------------- | ----- | --------- |
| 1x4 Girder  | 50.95 × 12.70 × 3.17  | 4     | 1030      |
| 1x5 Girder  | 63.65 × 12.70 × 3.17  | 5     | 1234      |
| 1x6 Girder  | 76.57 × 12.70 × 3.17  | 6     | 1648      |
| 1x7 Girder  | 89.27 × 12.70 × 3.17  | 7     | 1856      |
| 1x8 Girder  | 101.97 × 12.70 × 3.17 | 8     | 2056      |
| 1x9 Girder  | 114.67 × 12.70 × 3.17 | 9     | 2254      |
| 1x10 Girder | 127.37 × 12.70 × 3.17 | 10    | 2460      |
| 1x11 Girder | 140.07 × 12.70 × 3.17 | 11    | 2664      |
| 1x12 Girder | 152.77 × 12.70 × 3.17 | 12    | 2852      |
| 1x2 Brace   | 12.70 × 31.54 × 18.84 | 3     | 1002      |
| H-Brace     | 38.25 × 12.70 × 31.82 | 4     | 1484      |
| V-Brace     | 25.55 × 12.78 × 31.82 | 4     | 1154      |
| L-Brace     | 31.54 × 12.70 × 31.54 | 4     | 1030      |
| S-Brace     | 18.84 × 12.70 × 18.84 | 2     | 628       |
| Team Plate  | 50.95 × 12.70 × 3.17  | 2     | 4076      |
| 2x2 Panel   | 25.47 × 25.40 × 3.17  | 4     | 1368      |
| 2x3 Panel   | 25.47 × 38.10 × 3.17  | 6     | 1638      |

Girder lengths follow N × 12.7 + 0.15 mm. The brace and Team Plate
hole counts (previously unknown — the spec never states them) come
from the recovered geometry and are confirmed independently by the
mesh genus: a solid with N through-holes has genus N.

## holes.json

`holes.json` lists every hole (centre, axis, radius) per piece id, in
the app's Y-up frame — the source-frame values rotated -90° about X.
It is a sidecar for future milestones (hole snapping, screws); the app
does not read it yet.

## What used to be here

Three temporary CC0 stand-ins from
https://github.com/azdle/printables (an APU rack mount standing in for
the 1x6 Girder, a PC-board mount for the 2x2 Panel, an L-bracket for
the L-Brace) were bundled while the real pieces were unavailable.
They were deleted when the real STLs landed — nothing in the app
references them.
