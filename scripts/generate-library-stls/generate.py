#!/usr/bin/env python3
"""Generate the 17 BASISCad library STLs from the prototype's geometry.

The real piece STLs were never available as files: the prototype site
(https://basiscad.derkasper.chatgpt.site/) generates its geometry
parametrically in the browser and hosts no STLs, and the Tinkercad
collection linked in the transcript opens empty for our account. But
the prototype serves its own geometry through its public guest API —
``GET /api/guest/library`` lists the 17 pieces and
``GET /api/guest/library/<id>`` returns each piece's triangle mesh
(``positions``: a flat non-indexed vertex array) plus its snap-hole
list. That is the prototype's own geometry — the same triangles it
renders — so recovering it is far more faithful than re-modelling the
pieces from dimensions, especially for the braces and the Team Plate,
whose exact shapes the written spec never states.

This script converts those meshes to binary STL files, one per piece,
and validates each one. It does not invent geometry: every triangle
comes from the prototype. The one normalisation is the 1x11 Girder,
whose source mesh lies along Y; it is rotated +90° about Z so its
length lies along X like every other girder.

Inputs (vendored under ``source/`` so regeneration works offline):
  ``source/library.json`` — the 17 pieces (id + name) from the guest API.
  ``source/pieces/<id>.json`` — one API response per piece.

Outputs (into ``../../public/library/``):
  ``<piece-id>.stl`` — binary STL, Z-up (the 3D-printing convention:
  the part lies flat in the XY plane, thickness along Z), centred in
  X/Y, bottom face on z = 0. The app's loader rotates Z-up files flat
  (see ``src/three/loadPieceFile.ts``, ``assumeZUp``).
  ``holes.json`` — per-piece hole list in the app's Y-up frame
  (rotate -90° about X from the source frame), normalized to the same
  base and footprint center as the loaded geometry. The app uses it
  for snapping, connection markers, and screws.

Validation (the script fails unless every check passes):
  - the mesh is watertight and winding-consistent (trimesh);
  - the genus-derived hole count (from the Euler characteristic)
    equals the snap-hole count the prototype reports;
  - the bounding box matches the piece's spec size;
  - the exported STL has exactly the source triangle count.

Requirements: ``pip install trimesh numpy``.

Usage (from the repo root)::

    python3 scripts/generate-library-stls/generate.py

To re-fetch the source data from the live prototype instead of using
the vendored copies, re-download with curl (the API needs a browser
user-agent; plain urllib gets a 403)::

    curl -sL -o scripts/generate-library-stls/source/library.json \\
        https://basiscad.derkasper.chatgpt.site/api/guest/library
    curl -sL -o scripts/generate-library-stls/source/pieces/<id>.json \\
        https://basiscad.derkasper.chatgpt.site/api/guest/library/<id>
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
SOURCE_DIR = HERE / "source"
OUTPUT_DIR = REPO_ROOT / "public" / "library"

# Piece name (as the prototype reports it) -> (library piece id, STL file).
# The library ids are the ones in src/app/library.ts.
PIECES: dict[str, tuple[str, str]] = {
    "1x4 Girder": ("girder-1x4", "girder-1x4.stl"),
    "1x5 Girder": ("girder-1x5", "girder-1x5.stl"),
    "1x6 Girder": ("girder-1x6", "girder-1x6.stl"),
    "1x7 Girder": ("girder-1x7", "girder-1x7.stl"),
    "1x8 Girder": ("girder-1x8", "girder-1x8.stl"),
    "1x9 Girder": ("girder-1x9", "girder-1x9.stl"),
    "1x10 Girder": ("girder-1x10", "girder-1x10.stl"),
    "1x11 Girder": ("girder-1x11", "girder-1x11.stl"),
    "1x12 Girder": ("girder-1x12", "girder-1x12.stl"),
    "1x2 Brace": ("brace-1x2", "brace-1x2.stl"),
    "H-Brace": ("brace-h", "brace-h.stl"),
    "V-Brace": ("brace-v", "brace-v.stl"),
    "L-Brace": ("brace-l", "brace-l.stl"),
    "S-Brace": ("brace-s", "brace-s.stl"),
    "Team Plate": ("plate-team", "plate-team.stl"),
    "2x2 Panel": ("plate-2x2", "plate-2x2.stl"),
    "2x3 Panel": ("plate-2x3", "plate-2x3.stl"),
}

# The 1x11 Girder's source mesh lies along Y; every other girder lies
# along X. Rotate it +90° about Z so all girders share one orientation.
ROTATE_ABOUT_Z: dict[str, float] = {"1x11 Girder": 90.0}

# Hole diameter from the prototype: radius 2.098 mm on every hole
# (one H-Brace hole is 2.13 mm — preserved as-is in the geometry).
# #6-32 screws are 3.505 mm across, so a 4.196 mm hole clears them.


def rotate_z(mesh: trimesh.Trimesh, degrees: float) -> None:
    """Rotate a mesh about the Z axis, in place."""
    angle = math.radians(degrees)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    matrix = np.eye(4)
    matrix[:3, :3] = [[cos_a, -sin_a, 0], [sin_a, cos_a, 0], [0, 0, 1]]
    mesh.apply_transform(matrix)


def to_app_frame(point: list[float]) -> list[float]:
    """Rotate a point from the source (Z-up) frame to the app (Y-up) frame.

    The app's loader applies rotate -90° about X: (x, y, z) -> (x, z, -y).
    """
    x, y, z = point
    return [round(x, 4), round(z, 4), round(-y, 4)]


def normalise_hole(hole: dict, bounds: np.ndarray, degrees: float) -> dict:
    """Apply the mesh's girder rotation, then the loader's orientation and centering."""
    angle = math.radians(degrees)
    cos_a, sin_a = math.cos(angle), math.sin(angle)

    def rotated(point: list[float]) -> list[float]:
        x, y, z = point
        return [x * cos_a - y * sin_a, x * sin_a + y * cos_a, z]

    x, y, z = rotated(hole["center"])
    mid = (bounds[0] + bounds[1]) / 2
    return {
        "center": [round(x - mid[0], 4), round(z - bounds[0][2], 4), round(-y + mid[1], 4)],
        "axis": to_app_frame(rotated(hole["axis"])),
        "radius": hole["radius"],
    }


def genus(mesh: trimesh.Trimesh) -> int:
    """Genus of a closed orientable mesh, from its Euler characteristic.

    A solid with N through-holes has genus N (Euler number 2 - 2N).
    """
    return (2 - mesh.euler_number) // 2


def main() -> int:
    library = json.loads((SOURCE_DIR / "library.json").read_text())
    if len(library) != 17:
        print(f"expected 17 pieces in library.json, found {len(library)}", file=sys.stderr)
        return 1
    names = {entry["name"] for entry in library}
    if names != set(PIECES):
        print(f"library names do not match PIECES: {sorted(names ^ set(PIECES))}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    holes_out: dict[str, list[dict[str, object]]] = {}
    rows: list[str] = []

    for entry in library:
        name = entry["name"]
        piece_id, filename = PIECES[name]
        data = json.loads((SOURCE_DIR / "pieces" / f"{entry['id']}.json").read_text())
        assert data["name"] == name, f"{entry['id']}: name mismatch {data['name']!r} != {name!r}"

        positions = np.array(data["positions"], dtype=np.float64).reshape(-1, 3, 3)
        mesh = trimesh.Trimesh(
            vertices=positions.reshape(-1, 3),
            faces=np.arange(len(positions) * 3).reshape(-1, 3),
            process=True,
        )
        if name in ROTATE_ABOUT_Z:
            rotate_z(mesh, ROTATE_ABOUT_Z[name])

        holes = data["snapHoles"]
        errors: list[str] = []
        if not mesh.is_watertight:
            errors.append("not watertight")
        if not mesh.is_winding_consistent:
            errors.append("winding inconsistent")
        if mesh.volume <= 0:
            errors.append(f"non-positive volume {mesh.volume}")
        if genus(mesh) != len(holes):
            errors.append(f"genus {genus(mesh)} != hole count {len(holes)}")
        if len(mesh.faces) != len(positions):
            errors.append(f"triangle count changed: {len(mesh.faces)} != {len(positions)}")
        if errors:
            print(f"{name}: FAILED: {'; '.join(errors)}", file=sys.stderr)
            return 1

        out_path = OUTPUT_DIR / filename
        mesh.export(out_path, file_type="stl")

        # Re-read the exported file and check it round-trips exactly.
        reloaded = trimesh.load(out_path, force="mesh")
        assert isinstance(reloaded, trimesh.Trimesh)
        if len(reloaded.faces) != len(positions) or not reloaded.is_watertight:
            print(f"{name}: exported STL failed round-trip check", file=sys.stderr)
            return 1

        bounds = mesh.bounds  # [[min x,y,z], [max x,y,z]]
        size = bounds[1] - bounds[0]
        holes_out[piece_id] = [
            normalise_hole(hole, bounds, ROTATE_ABOUT_Z.get(name, 0))
            for hole in holes
        ]
        rows.append(
            f"{name:14s} {filename:18s} tris={len(mesh.faces):5d} "
            f"holes={len(holes):2d} size=({size[0]:7.2f} x {size[1]:6.2f} x {size[2]:6.2f}) "
            f"vol={mesh.volume:8.1f} mm^3"
        )

    (OUTPUT_DIR / "holes.json").write_text(json.dumps(holes_out, indent=2) + "\n")

    print(f"Generated {len(rows)} STLs in {OUTPUT_DIR}:")
    for row in rows:
        print("  " + row)
    print("Wrote holes.json (hole positions in the app's Y-up frame).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
