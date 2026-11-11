# Quality and performance policy

## Code and correctness

Keep design documents as plain data and rendering in `src/three/`. Separate file
validation, serialization, and geometry reconstruction from React event handlers.
Refactor the areas a change touches. Preserve printed dimensions, connection
references, and saved poses, including older arbitrary rotation angles.

## Tests and verification

Test observable behavior and invariants: geometry boundaries, collision contact,
rigid transforms, valid connections, persistence, and exact undo restoration.
Use real library meshes where geometry matters. Add a regression case for each
reproduced defect. Coverage reports can identify gaps; prioritize data loss and
silent corruption rather than a numeric coverage quota.

Run focused tests while implementing a change. At each completed workstream run
formatting, typechecking, linting, unit tests, production build, and the full
Chromium suite. Exercise new interactions through the local website. Retain
failure traces and classify application, assertion, and browser transport faults.
Each rerun must test a specific explanation. Compare saved data exactly; mask
unrelated controls and justify tolerances when comparing rendered images.

Publish the production artifact only after checks for the same commit pass.

## Performance

Use repeatable 2-, 20-, 50-, and 100-piece workloads, including mixed library
geometry, screws, groups, and hinges. Measure cold loading and warmed edits
separately. Record browser frame times, input-to-visible-update latency, long
tasks, and memory across repeated edits. Geometry benchmarks diagnose CPU costs;
relay command duration is not application latency. Profile separately from timing.

Provisional desktop targets are camera movement near 60 fps, p95 edit updates
within 100 ms, no recurring main-thread tasks above 50 ms during ordinary
interaction, and stable memory after repeated add/remove cycles. Record browser,
hardware, pixel ratio, workload, sample count, and measurement method. Use enough
samples for percentiles and repeat suspected regressions on the same machine.
Shared CI hardware checks correctness; timing limits require controlled hardware.

## Current workstreams and acceptance

1. Portable backups: a fresh browser restores poses, connections, groups, hinges,
   labels, and imported geometry. Invalid or unsupported files preserve the open
   design. Saved imported designs survive refresh.
2. Large designs: measure the workloads above, fix measured bottlenecks, and
   repeat correctness and responsiveness checks.
3. Classroom hardening: a mixed reference project with at least four screws, a
   group, and a hinge builds, saves, reopens, backs up, and prints two pages.
   Exercise desktop and emulated touch; physical tablet testing remains deferred.
4. Editing polish: improve keyboard navigation, numeric editing, and selection
   feedback, with clear cancellation and one undo step per completed action.

Record verification and limitations for each workstream before advancing. Physics
acceptance remains pending until the physics milestones are implemented.
