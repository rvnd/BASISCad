# Verification record — November 2026

## Completed work

- **Portable backups:** native Chromium cases export an actual file, restore
  joints, groups, labels and custom geometry, then save and reopen after refresh.
  Invalid files and cancellation preserve the active design. Local website use
  also verified OBJ import, placement, export of the actual backup Blob and exact
  restoration of the model and geometry.
- **Large designs:** browser cases cover 2, 20, 50 and 100 items, at least 100
  measured drag updates, idle rendering, exact undo and GPU buffer lifetime across
  five add/remove cycles. Shared outline tests verify surviving instances,
  invalidation and disposal after the last owner.
- **Classroom hardening:** the reference has all 17 stock types, 23 stock pieces,
  four screw/nut pairs, a group and a hinge. Native cases cover editing, emulated
  touch, refresh, storage-full export and stale imports. Both generated A4 pages
  were visually inspected: all material rows, $135 stock cost, separate hardware,
  evaluation space and page footers fit.
- **Editing polish:** native cases cover accessible list selection, keyboard
  steps, locks, exact undo, untouched precision and cancellation. Local trusted
  input also verified movement, 22.5° rotation, deletion and input protection.

## Local 100-item measurement

Chrome 157, Apple M4 Max via ANGLE Metal, visible 1280 × 900 viewport, pixel ratio

1. Four 100-event drags produced **310 measured updates**: median **17.3 ms**,
   p95 **23.2 ms**, with no observed editing tasks above 50 ms. Camera orbit produced
   105 frame intervals: median **16.7 ms**, p95 **17.3 ms**.

Latency is measured from trusted pointer input to the next animation-frame
callback after WebGL submission. This single hardware run meets the provisional
targets for that environment; it does not establish physical presentation times
or performance on other devices or pixel densities. Stock mesh creation in the
100-item Node workload improved from 207.29 ms to 38.46 ms on the same machine.

## Gates and limits

The suite contains 224 unit tests and 50 Chromium cases. CI checks formatting,
types, lint, units, build, browser behavior and the geometry benchmark before
deploying that run's artifact. JSON performance measurements and print proofs are
retained as CI artifacts. See [CI runs](https://github.com/rvnd/BASISCad/actions).

Local browser interaction works through Agent Conductor. Its reload/navigation
commands stalled, and direct Playwright attachment to that Chrome also stalled;
refresh and actual download checks use native CI. Physical tablet testing remains
deferred. Physics acceptance remains pending.
