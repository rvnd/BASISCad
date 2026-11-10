# Milestone plan

Source: the repository’s GitHub milestone issues. Complete each milestone’s acceptance checks with unit tests and browser interaction before advancing.

Milestones 0–8 are complete. Local validation: `npm run test:e2e:local`.

## Milestone 6 — Hole snapping with green rings

[Source issue](https://github.com/rvnd/BASISCad/issues/7)

Goal: holes line up without fiddly dragging.

Steps:

- [x] When a dragged piece brings one of its holes near a hole on another piece, snap the pieces so the holes align exactly.
- [x] Show a green ring on every aligned hole — including holes on pieces that are not selected — and update the rings live as pieces move.
- [x] Add a Snap holes on/off toggle, and let holding Alt move a piece freely with snapping paused.
- [x] Use the final tolerance from the spec: holes within 2 mm of aligning count as aligned.

Done when: sliding a girder near another snaps the holes together, green rings appear on all aligned holes at once, and Alt-drag moves the piece past them without snapping.

Verification: 146 unit tests, 15 local Chrome browser tests, typecheck, lint, formatting, and production build passed. Direct website check confirmed six green rings on upright girders after a snapping drag. Library metadata is checked against all 17 actual STL bores.

## Milestone 7 — Pieces cannot occupy the same space

[Source issue](https://github.com/rvnd/BASISCad/issues/8)

Goal: pieces behave like physical pieces — they touch, slide, and stack, but never overlap or sink.

Steps:

- [x] Block a drag that would push a piece inside another piece. Faces may touch; volumes may not overlap.
- [x] Let a dragged piece slide along the contour of the piece it meets.
- [x] Make a piece dragged against another climb the near wall, travel across the top, and come down the far wall to the workplane if the drag continues.
- [x] Block any rotation that would make a piece overlap another piece.
- [x] Clamp every move and rotation so no part of a piece goes below the workplane.

Done when: you cannot push one girder through another, you can drag a piece up and over a placed piece in one motion, and no rotation can bury a piece under the workplane.

Verification: 157 unit tests, static checks, and production build passed. All 17 application browser cases were verified: 16 passed in the full run, then the updated Center Project regression passed separately. The long drag uses a 60-second CI budget and fewer input events; the swept checks still cover the intervening travel. A further browser regression checks pointer coordinates during frame capture. Relay tabs retain Chrome’s native pixel ratio to prevent doubled input coordinates. Direct website checks confirmed climbing, crossing, descending to height zero, and resting on the actual 3.175 mm girder thickness; the side view was inspected. Numerical collision tolerance: 0.00001 mm. No new runtime dependency is required.

## Milestone 8 — Connect: pick two holes to join two pieces

[Source issue](https://github.com/rvnd/BASISCad/issues/9)

Goal: the easiest possible way to join pieces — pick a hole, pick another hole, done. This feature needed the most fixes in the prototype, so build it in this order and test each step.

Steps:

- [x] Add a Connect control at the top of the screen. First click picks a hole on the piece to move; second click picks the hole it should join.
- [x] Show a marker for every hole while Connect is active — including holes that already hold a screw and holes on locked pieces — and spread overlapping markers apart so each one can be picked. Hovering a marker names its piece and hole number.
- [x] Keep the markers small, with thin outlines, so neighbouring holes stay separately clickable.
- [x] Show one marker per group of already-aligned holes, not one per piece, so a stack does not become a pile of markers.
- [x] On the second click, move only the piece that is not already attached to anything. An existing assembly stays where it is. A piece that is grouped but not screwed down still counts as unattached and can move on its own.
- [x] Place the first-picked piece in front of the second, from the current camera view.
- [x] Try more than one angle and orientation when the first attempt does not line the holes up, and try the next clear layer when a neighbouring piece blocks the first position.
- [x] Add Connection options for hard cases: Try either side, Try more angles, Allow moving the connected assembly, Retry the same holes, and Try best fit, which turns on all of them.
- [x] Keep collisions and the workplane floor in force throughout — an impossible overlap is still refused, with no instruction text box left on screen.
- [x] Make the whole connection a single undo step.

Done when: you can connect any two holes you pick — including a hole next to an existing screw, and a second connection on a piece that is already screwed to a third piece by swinging it around that screw — without moving the assembly it is joining.

Verification: 182 unit tests, all 22 local Chrome browser tests, formatting, lint, typecheck, and production build passed. Browser flows cover a paired screw with one-step undo/redo, adjacent screws and saved connections, failed picks and retries, and a 90° hinge connection onto a locked assembly without moving its existing pieces or fasteners. Geometry tests cover upright and mixed orientations, blocked layers, floor rejection, and rigid movement of an assembly only when explicitly enabled. Direct website use confirmed camera-side placement, visible head/nut clearance, and rejection of an unpaired hole. Milestone 9 still adds automatic alignment prompts and the dedicated fastener picker.

## Milestone 9 — Screws and nuts, automatic

[Source issue](https://github.com/rvnd/BASISCad/issues/11)

Goal: when holes line up, fastening them takes one "Yes" and nothing else.

Steps:

- [ ] When holes align, ask only "Add screw and nut?" with Yes and Not now. Never ask the user to choose a screw length.
- [ ] Choose the length automatically from the number of layers in the stack: 3/8 inch for 2 layers, 1/2 inch for 3 or 4 layers.
- [ ] Always add the nut with the screw. Screw and nut are one unit when moved, saved, printed, or deleted, and the nut is clearly visible.
- [ ] Add the second way in: a Screw + Nut icon above the trash can. Tapping it, then tapping a hole, adds the fastener there. Show a large clickable "+" marker over each empty aligned hole so the target is not a tiny 3D hole.
- [ ] Let a screw be added in a hole directly beside a hole that already has one, and keep doing so for several neighbouring holes.
- [ ] Adjust the stacked pieces automatically for screw and nut clearance while keeping the holes aligned, and if clearance still fails, let the user's Yes override the clearance check and place the screw anyway.
- [ ] Prevent a second screw in a hole that already has one.
- [ ] Let the user remove a fastener like any other piece: click the screw head or nut to highlight it, then click the trash can. The pieces stay in place.
- [ ] Store each screw's connection — which holes, on which pieces — as part of the design, so later milestones can rely on it.

Spec: #6-32 zinc-plated steel screw and nut, always as a pair.

Done when: two stacked girders take a 3/8 inch screw with one Yes, three stacked pieces take a 1/2 inch screw with no extra question, screws can sit in adjacent holes, and deleting a screw leaves both pieces exactly where they were.

## Milestone 10 — Group, lock, and hinge at a screw

[Source issue](https://github.com/rvnd/BASISCad/issues/12)

Goal: assemblies move as one, stay put when locked, and swing where they are meant to swing.

Steps:

- [ ] Add small Group, Ungroup, and Lock/Unlock icons at the top of the screen, the same size as each other, enabled only when the selection makes them usable.
- [ ] Grouped pieces move together. A selected group can be rotated with the rings, the +/- controls, or a typed angle, turning all its pieces and screws together around the group's centre.
- [ ] Locked pieces cannot be moved or rotated until unlocked.
- [ ] After a piece is joined by a single screw, add Swing / Hinge at that screw: select the piece, drag it or type an exact angle, and it rotates around the screw while the screw and the other piece stay fixed.
- [ ] Two screws between the same two pieces stop the swinging — the joint is fixed.
- [ ] Remove any older Selected Piece and In This Design panels once these top icons exist; they duplicate the same job.

Done when: a two-girder cross can be grouped and rotated as one, locked so it will not move, then unlocked, and a singly-screwed piece swings around its screw to a typed angle while a doubly-screwed one does not move.

## Milestone 11 — Blueprint labels

[Source issue](https://github.com/rvnd/BASISCad/issues/13)

Goal: a design can be read like a blueprint, with names or measurements on the pieces.

Steps:

- [ ] Add a Labels section, starting collapsed so it leaves room for the shapes panel. Collapsing it hides the controls, not the labels already on the design.
- [ ] Offer three modes: Off, Piece Names, and Measurements.
- [ ] Piece Names shows each piece's library name as plain text joined to the piece by a thin leader line.
- [ ] Measurements shows each piece's X, Y, and Z size in millimetres as dimension lines with extension lines and arrowheads.
- [ ] Add Enable Move labels: labels can be dragged to a clearer spot without moving the piece, each label can be shown or hidden individually, positions are saved with the design, and there is a way to reset them. Put a small "i" icon beside it that explains exactly that.
- [ ] Labels follow their pieces when pieces move, and labels appear in printouts (Milestone 12).

Done when: switching to Piece Names labels every piece with a leader line, switching to Measurements shows dimension lines in millimetres, and a dragged label stays where it was left after saving and reopening.

## Milestone 12 — Print: design page and budget page

[Source issue](https://github.com/rvnd/BASISCad/issues/14)

Goal: printing produces the two classroom pages from the prototype, and nothing else.

Steps:

- [ ] Print Design first asks which view to print: Top, Front, Side, or 3D.
- [ ] Page 1 is the design only, with the design name, date, view, and overall size. The chevrons and BASIScad name sit at the top left.
- [ ] Page 2 is the budget, with the same chevrons and name at the top left, in three parts: Materials Needed, Materials Cost, and a blank Evaluation section for the student or teacher to write in.
- [ ] Fill Materials Needed and Materials Cost automatically from the design: quantity of each piece used, its hole count, and its cost at $1 per hole, with totals for pieces and cost.
- [ ] Pieces print with their black outlines, and labels print in the mode chosen in Milestone 11.
- [ ] Check the real print preview for both pages before calling this done — the prototype's two-page output was never visually verified.

Done when: a design using two 1x4 girders and one 1x6 girder prints a design page with name, date, view, and size, and a budget page totalling 3 pieces and $14.

## Milestone 13 — First-use guide and header tidy-up

[Source issue](https://github.com/rvnd/BASISCad/issues/15)

Goal: a new student can learn the basics in the app, and the screen carries no leftover clutter.

Steps:

- [ ] Add a short first-use guide that walks through adding, moving, rotating, connecting, screwing, and saving a piece, shown on first use and available again from Help.
- [ ] Make Help actually open that guide, and make Settings open a real panel or remove the button. Both were dead buttons in the prototype — whichever you keep must work.
- [ ] Remove the "Recovered: Untitled Design" text and any "Drag a piece to move…" hint box from the header.
- [ ] Add a comment tool only if the class needs it, and if you add it, make sure Cancel and Escape fully leave comment mode. In the prototype the mode stuck in the header after cancelling.
- [ ] Walk the whole header at the end: every button either works or is gone.

Done when: a first-time user can follow the guide to build and save a two-piece design unaided, and clicking every header button in turn does something visible.

## Milestone 14 — Tablet two-hand controls

Physical tablet verification is deferred at the user’s request. Implement and verify touch emulation; retain the hardware check as deferred.

[Source issue](https://github.com/rvnd/BASISCad/issues/16)

Goal: on a tablet, one hand chooses the axis and the other hand drags.

Steps:

- [ ] Detect a tablet and show the tablet controls only there. Computer controls stay exactly as they are.
- [ ] Add Move X, Move Y, Move Z and Rotate X, Rotate Y, Rotate Z buttons at the bottom left of the screen.
- [ ] Holding one of those buttons with the left hand while dragging on the workplane with the right hand moves or rotates the selected piece on that axis only, including a full 180° rotation.
- [ ] Keep Undo and Redo reachable in tablet mode.
- [ ] Test on a real tablet, not only a simulated touch screen — the prototype was never tested on physical hardware.

Done when: on a tablet, holding Rotate Z and dragging turns a piece 180°, and the same screen on a computer shows none of the tablet buttons.

## Milestone 15 — Test menu and gravity

[Source issue](https://github.com/rvnd/BASISCad/issues/17)

Goal: a structure can be tested under gravity and falls the way a real one would — apart, not straight down as one block.

Steps:

- [ ] Add a Test icon at the top of the screen, exactly the same size as the Group, Ungroup, and Lock icons beside it, opening a dropdown of tests.
- [ ] Build the physics on a rigid-body engine (Rapier, running in the browser as WebAssembly, is the planned choice), with one body per piece and collisions that stop pieces passing through each other.
- [ ] Add Gravity as the first test, with a slider for gravity strength and named presets so the amount means something: Moon, Mars, and Earth.
- [ ] Unsupported pieces must tip, tumble, slide, and separate. A structure with nothing under it does not sink straight down intact, and the test must not shake like an earthquake.
- [ ] Treat firmly tightened screwed joints, using the connections stored in Milestone 9, as one rigid assembly that moves together. A screw must never be left behind or drift out of its holes during a test.
- [ ] A single-screw joint may still hinge under load; grouping alone, without a screw, holds nothing together.
- [ ] Use the frozen material assumption — Bambu PLA Basic at 15% infill with firmly tightened #6-32 screws — for piece weights.
- [ ] During and after a test, let the user orbit and zoom to inspect the result, and add Pause to inspect, Resume, and Reset design, where Reset restores the design exactly as it was before the test.
- [ ] Say plainly in the test panel what the test does not do: it shows falling and support, and does not predict bending or breaking. Breaking loads are not calibrated — the published filament strength figures are for 100% infill test pieces, not 15% infill parts.

Done when: an unsupported tower falls apart into separate pieces, a screwed cross stays together and keeps its screws in their holes, and Reset returns both to their pre-test positions.

## Milestone 16 — Test: high winds

[Source issue](https://github.com/rvnd/BASISCad/issues/18)

Goal: wind from a chosen direction at a chosen speed pushes on a design.

Steps:

- [ ] Add High Winds to the Test dropdown, reusing the pause, inspect, orbit, and reset behaviour from Milestone 15.
- [ ] Let the user set wind speed from 0 to 150 mph and choose a wind direction, and adjust both while the test is running.
- [ ] Show an arrow on screen for the wind direction, and apply the wind when the user clicks Apply wind.
- [ ] Keep the camera on the design if it is blown across the workplane. In the prototype an 80 mph test blew the design off screen and only Reset brought it back — follow it or frame it, do not lose it.
- [ ] Once a piece is knocked over, it settles. Wind must not keep building turning force that leaves fallen pieces twirling.
- [ ] Label the wind loads as approximate in the panel.

Done when: a tower stands in a light wind, topples in a strong one from the chosen direction, stays in view the whole time, and its pieces come to rest instead of spinning.

## Milestone 17 — Test: weights

[Source issue](https://github.com/rvnd/BASISCad/issues/19)

Goal: a load can be placed where the student chooses, in set amounts.

Steps:

- [ ] Add Weights to the Test dropdown, reusing pause, inspect, and reset.
- [ ] Let the user click a surface location on the design to choose where the weight sits.
- [ ] Let the user change the amount in 100 g increments, then click Apply weights.
- [ ] Allow more than one load location in the same test, and show a downward arrow at each one.
- [ ] Keep the same honesty note as gravity: this applies a load and shows support and tipping; it does not simulate bending or breaking.

Done when: 500 g placed on a bridge's centre and 300 g on one end both appear as arrows, the design reacts to them, and Reset removes them.

## Milestone 18 — Test: ping pong ball

[Source issue](https://github.com/rvnd/BASISCad/issues/20)

Goal: drop a ping pong ball on a design and watch where it actually goes.

Steps:

- [ ] Add Ping Pong Ball to the Test dropdown, reusing pause, inspect, and reset.
- [ ] Let the user pick a location and a release height, then click Release ball.
- [ ] The ball falls, bounces, and rolls against the pieces using the same collision rules as the other tests, and leaves a red trail showing its path.
- [ ] Keep the trail believable for the chosen height — a ball released from 50 mm should not arc far above 50 mm.
- [ ] After placing the ball, let the user adjust it before releasing again: X, Y, and Z fields, +/- 1 mm buttons, and a Move ball option to pick a new location.

Done when: a ball released above a ramp rolls down it leaving a red trail, and nudging its start 10 mm sideways and releasing again produces a visibly different path.

## Milestone 19 — Hardening: fix the prototype's known weak spots

[Source issue](https://github.com/rvnd/BASISCad/issues/21)

Goal: the standalone version is steadier than the prototype it replaces, and ready to hand to a class.

Steps:

- [ ] Work through the prototype's known faults one by one and confirm each is gone: dead Settings and Help buttons, a camera-views dropdown that would not open, a Manage Projects delete that did nothing, a comment mode that would not cancel, a wind test that lost the design off screen, and an autosave restore that lost the design's name.
- [ ] Confirm there is still no resize or scale control, by design — pieces keep their real printed size, as in the prototype. If a class asks for resizing, that is a new milestone, not a quiet addition.
- [ ] Build one reference design that uses most of the library — several girders, braces, a plate, at least four screws, a group, and a hinge — and run every test on it: gravity, wind, weights, and ping pong ball.
- [ ] Print that reference design and check both printed pages against Milestone 12.
- [ ] Test the whole flow on a computer and on a tablet, including a refresh in the middle of building.
- [ ] Check performance with a large design on the 1,000 × 1,000 mm workplane. If the page slows down, fix it here rather than letting students hit it — the prototype needed a reload once it got sluggish.
- [ ] Write a one-page note in the repo listing what the tests can and cannot tell a student, using the wording from Milestones 15 to 18.

Done when: the reference design builds, saves, reopens, prints, and passes all four tests on both a computer and a tablet, with no dead button anywhere in the app.
