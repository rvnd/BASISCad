# Classroom readiness

## Reference project

Download [Classroom Reference](../public/examples/classroom.basiscad.json), then
choose **Open Backup**. It includes all 17 stock types, 23 stock pieces, four
screw/nut pairs, a connected group and a single-screw hinge. Pieces retain their
printed dimensions. There is no resize control.

Choose **Menu → Save Design** to keep a device copy; refresh and reopen it.
Choose **Export Backup** for a portable copy, especially on shared classroom
computers. A downloaded backup includes imported meshes; browser storage and
undo history are not a portable archive. Keep backups outside the browser.

Choose **Print Design → Top → Preview**. The report has two A4 pages: the
design, then materials and evaluation space. The reference budget is **$135.00**
for 23 stock pieces at $1 per hole; four screw/nut pairs are listed separately
and have no configured price. Check print preview before printing.

Regenerate the example with `npm run reference:generate` after deliberate library
changes. The generator rejects invalid placements.

## What the current checks establish

Geometry and browser tests check placement, collision boundaries, hole alignment,
rigid connected motion, 22.5° editing steps, undo, persistence, file validation and
print layout. Browser workload tests exercise 2, 20, 50 and 100 items and check
that repeated add/remove cycles release their WebGL buffers. Timings depend on
the computer and browser.

These checks describe the digital model. They do not establish load capacity,
material strength, friction, screw tightness or construction safety. Gravity,
wind, weights and ping pong ball simulation are pending; the app currently
provides no result for those physics milestones.

## Devices and recovery

Desktop and emulated touch interactions are tested. Physical tablet testing is
deferred. On a shared device, export before changing browser profiles or clearing
browser data. If storage is full, the app reports the failed save; exporting the
live design remains available. Invalid mesh and backup files leave the open
design intact. Pending imports are discarded when a different project opens.
