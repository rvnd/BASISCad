# Interaction performance

Run `npm run benchmark -- current` with Node.js 24. It bundles the same geometry
code used by the website, loads the real STL library, and reports the median of
five runs after warming each operation. JSON reports and Chrome-compatible CPU
profiles go into the ignored `tmp/performance/` directory. Add `--profile` for a
separate profiling run; ordinary timing runs have no profiler attached.

## Large designs

Run `npm run benchmark -- large --large` for 2, 20, 50, and 100 items. The mixed
fixtures include actual stock geometry, four screw/nut units, a rigid group, and
a hinge. Fixtures are checked for floor crossings, overlap, and workplane bounds.
Reports include the first operation, median and maximum of seven warmed samples,
Node version, CPU model, and library loading time. Seven samples establish a
comparison; browser percentiles use the longer interaction sequence below.

On Apple M4 Max with Node 24.22.2, sharing reference-counted outlines reduced
100-item scene mesh creation from **207.29 ms to 38.46 ms** (median). At 50 items,
it changed from 100.80 ms to 37.81 ms. Deleting one instance preserves surviving
outlines; the last owner disposes the shared buffer. Attribute changes invalidate
the cache. Collision behavior and stock dimensions are unchanged.

`e2e/performance.spec.ts` exercises all four sizes through the website. It reports
trusted pointer input to the next animation-frame callback after WebGL submission,
and frame intervals during camera orbit. These are observable browser boundaries,
not a measurement of physical display presentation. The test also checks idle
drawing, exact undo, and live GPU buffers after five add/remove cycles. CI retains
JSON measurements as artifacts. Shared CI software rendering and the local relay
must be identified in reports; neither establishes controlled desktop FPS targets.

## November 2026 measurements

These are geometry timings on the same machine, without browser automation or
relay transport time. They are a comparison, not a frame-rate guarantee.

| Operation                                           |      Before |     After |
| --------------------------------------------------- | ----------: | --------: |
| 2,000 translated bounds at one tilted orientation   |    99.03 ms |   0.46 ms |
| 200 mm drag across an obstacle in a 20-piece design | 1,053.46 ms | 313.49 ms |
| 90° Z rotation of a screwed group                   |   525.93 ms |   4.25 ms |

## Changes

- Cache exact rotated vertex bounds across translations. Keep a bounded cache,
  invalidate changed attributes, and return independent boxes to callers.
- Reject disjoint or touching bounds before querying triangles. Split the
  triangle tree by surface area, prune source branches, and stop edge queries at
  the segment end. Bores and concave geometry remain part of collision checks.
- Check a rigid assembly's internal contacts once per operation. Its members
  share one transform; every intermediate pose still checks the floor and
  external obstacles. Invalid starting assemblies are rejected.
- Redraw the viewport when the scene, camera, or handles change. An idle design
  makes no WebGL draw calls. Camera damping continues normally.
- Reuse hole markers when only selection changes and avoid repeated geometry
  measurements and movement-membership searches.

## Verification

Unit tests compare bounds with actual vertices for all 17 pieces, exercise cache
invalidation, and check shallow contact, internal overlap, and blocked sweeps.
The browser rendering test uses two pieces: it checks idle draw calls, changed
camera images, moves, rotations, and restored scene images after Undo. Undo must
restore the exact saved model; image comparisons exclude control overlays and
allow small antialiasing differences. Existing browser
flows cover collisions, snapping, connections, hinges, labels, and tablet input.
