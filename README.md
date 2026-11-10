# BASISCad

A browser-only 3D construction kit for BASIS engineering classes — a
standalone rebuild of the ChatGPT Sites prototype at
`basiscad.derkasper.chatgpt.site`, owned by this repo and deployable
anywhere a static site can be hosted.

Students build structures from a fixed library of 17 reusable pieces
(girders, braces, plates), join them with #6-32 screws, and test their
designs under gravity, wind, weights, and a ping pong ball. No accounts,
no backend, no server code: designs save in the browser on the device
being used.

Live site: **https://rvnd.github.io/BASISCad/**

## The spec that does not change

From the prototype, frozen for the whole build (see
`src/app/constants.ts`, the single source of truth in code):

- Workplane: 1,000 × 1,000 mm, with a visible grid. Nothing goes below it.
- Library: 17 reusable pieces only — 9 girders, 5 braces, 3 plates.
  No generic basic shapes, no delete button in the library.
- Screws: #6-32 zinc-plated steel, screw + nut always as a pair. Length
  is automatic: 3/8 inch for 2 layers, 1/2 inch for 3 or 4 layers.
- Hole tolerance: holes within 2 mm count as aligned.
- Material assumption for tests: Bambu PLA Basic, 15% infill.
- Budget: $1 per hole in a piece.
- Branding: Roboto, **BASIS**cad (bold capitals joined directly to
  "cad"), black / white / red `#D03F43`, BASIS chevrons left of the name.

## Stack

- [Vite](https://vite.dev/) 8 — build tool and dev server
- [TypeScript](https://www.typescriptlang.org/) 7 (strict,
  `noUncheckedIndexedAccess`) — catches geometry mistakes at compile time
- [React](https://react.dev/) 19 — UI shell and panels
- [Three.js](https://threejs.org/) — 3D rendering (WebGL)
- [Vitest](https://vitest.dev/) — unit tests
- [oxlint](https://oxc.rs/) (the Vite template's linter) + Prettier

Later milestones add `manifold-3d` (geometry booleans) and Rapier
(physics), both as lazily-loaded WebAssembly — see the milestone plan.

## Run it

Requires Node.js 24 (`nvm use` reads `.nvmrc`).

```sh
npm install
npm run dev      # dev server with hot reload
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
npm test         # unit tests (Vitest)
npx playwright install chromium # first time only
npm run test:e2e # browser smoke tests (Playwright)
npm run typecheck
npm run lint
```

## Validate changes

Vitest covers application logic and Three.js geometry in `src/**/*.test.ts`.
Playwright runs Chromium smoke tests in `e2e/*.spec.ts`, starting Vite automatically.
Typechecking includes the browser tests and their configuration.

```sh
nvm use
npm ci
npm run test:e2e:install # first time, or after updating Playwright
npm run validate       # formatting, lint, unit tests, typecheck/build, browser tests
npm run test:watch     # unit tests while editing
```

To use installed Google Chrome, run `PLAYWRIGHT_CHANNEL=chrome npm run validate`.
Run browser tests from a terminal that permits browser processes to launch;
restricted agent environments may block both Chromium and Chrome. CI uses bundled Chromium on Linux.
For local tests in an agent sandbox, use an installed and paired
[browse](https://www.npmjs.com/package/@opencode/browse) extension in an open Chrome profile:

```sh
npm run test:e2e:local
npm run test:e2e:local -- --grep 'snaps within 2 mm'
```

This runs the same Playwright suite through the local browser relay, with one worker,
a temporary loopback origin, and a fresh tab for each test. It resets storage only for
that test origin. Background frame captures keep Chrome's animation frames progressing.
Relay tabs use Chrome's native viewport and pixel ratio to keep pointer coordinates
consistent during frame capture; browser tests calculate positions from the canvas bounds.
The launcher uses `~/.browse/bin/browse` when installed there; set `BROWSE_BIN` for another
installation. This mode needs no change to the agent's sandbox permissions.

Browser failures save screenshots and traces in `test-results/` and an HTML report in
`playwright-report/`; open the report with `npx playwright show-report`.
Vendored geometry inputs and generated output are excluded from formatting.

## Deploy

Every push to `main` deploys automatically via
`.github/workflows/deploy.yml` to GitHub Pages. The repo must be public
(GitHub Pages on the free plan) with Pages source set to "GitHub Actions"
in Settings → Pages. The app is served from the `/BASISCad/` base path
(`vite.config.ts`); keep the two in sync. Pull requests run the same
checks plus a build via `.github/workflows/ci.yml`, but do not deploy.

## Project structure

```
src/
  main.tsx            Entry point only — mounts <App />, imports styles.
  App.tsx             Shell composition only (Header + Viewport).
  app/
    constants.ts      Frozen spec values — the one place numbers live.
    designHistory.ts  Undo/redo history with grouped pointer edits.
    projects.ts       Local saved designs and recovery drafts.
    libraryHoles.ts   Validated bore centres and axes from the library.
    screws.ts         Screw-length rule (pure function, tested).
    *.test.ts         Vitest unit tests.
  components/
    Header.tsx        BASIScad header, design actions, undo/redo.
    ProjectDialog.tsx Name, open, manage, and recovery dialogs.
    Viewport.tsx      React wrapper: owns the canvas mount/unmount.
  three/
    workplane.ts      Pure Three.js: 1000×1000 mm grid, axes, camera.
    viewport.ts       Renderer / scene / controls / loop / dispose.
    orientedHoles.ts   Hole alignment and rings at any piece orientation.
    meshCollision.ts   Closed-mesh overlap checks, with cached spatial trees.
    designConstraints.ts Swept dragging, collision rules, and floor clamping.
  styles/
    index.css         Layout + header + viewport styles.
e2e/
  app.spec.ts         Playwright smoke tests for core user flows.
```

The split is deliberate, and it is what lets Milestones 1–19 grow
without rewrites:

- **React never touches Three.js objects.** `components/Viewport.tsx`
  calls `createViewport()` on mount and `dispose()` on unmount; all
  imperative 3D code lives in `src/three/`.
- **The scene is built from small pure functions** (`createWorkplane`,
  `createFramingCamera`) so later milestones can add pieces, selection,
  and snapping as new modules that attach to the scene.
- **App state lives above the shell, not in the viewport.** Design
  history and local persistence live in `src/app/` and flow into the
  viewport as plain data — the viewport stays a dumb canvas.
- **Spec numbers live in one file** (`src/app/constants.ts`) with tests,
  so a wrong constant fails CI instead of silently warping a design.

## Milestones

Milestones 0–8 are implemented. Milestone 6 uses the library's 3D bore
metadata for snapping at any orientation, including upright girders and
brace arms. It measures the actual wall around each hole, updates green
rings on every aligned hole, and supports the 2 mm tolerance, Snap holes
toggle, and Alt bypass. Imported flat meshes use through-hole detection.
Milestone 7 prevents solid overlap while allowing face contact and empty
bores. Dragged pieces slide, climb across obstacles, and descend; typed
moves and swept rotations obey the same floor and collision rules. New
pieces start at a free position.

Milestone 8 adds Connect: pick two hole markers, retry difficult placements,
join next to an existing screw, and swing a singly screwed piece to its next
connection. Existing assemblies stay fixed unless their movement is explicitly
allowed. Screw/nut pairs and their hole references survive save and undo.

The build follows the milestone plan in
[`docs/milestone-plan.md`](docs/milestone-plan.md)
(20 milestones, 0–19, browser-only, auth parked for later), tracked as
GitHub issues in this repo — Milestone 0 is issue #1. Build in number
order; do not start a milestone until the previous one's "Done when"
checks pass.
