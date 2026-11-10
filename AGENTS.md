# Repository Guidelines

## Project Structure & Module Organization

BASISCad is a browser-only construction app using React, TypeScript, Three.js, and Vite.

- `src/app/`: design data, persistence, undo history, library metadata, and specification constants.
- `src/components/`: React panels and viewport wrapper; `src/styles/index.css`: styling.
- `src/three/`: rendering, geometry, camera controls, rotation handles, and hole snapping.
- `src/**/*.test.ts`: unit tests; `e2e/app.spec.ts`: browser smoke tests.
- `public/library/`: 17 STL pieces and hole metadata. `scripts/generate-library-stls/` contains vendored sources and the Python generator.
- `.github/workflows/`: CI checks and GitHub Pages deployment.

Keep imperative Three.js code in `src/three/`; React mounts and disposes the viewport. Pass design state as plain data from the app layer. Keep frozen specification values in `src/app/constants.ts`.

## Build, Test, and Development Commands

Use Node.js 24 (`nvm use`) and `npm ci` to install locked dependencies.

- `npm run dev`: start Vite with hot reload.
- `npm run build`: typecheck and build into `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run typecheck`: check TypeScript projects.
- `npm run lint`: run oxlint.
- `npm run format` / `npm run format:write`: check / apply Prettier formatting.
- `npm test`: run Vitest unit tests.
- `npx playwright install chromium`: install the browser before first use.
- `npm run test:e2e`: run Chromium smoke tests; Playwright starts the development server automatically.

## Coding Style & Naming Conventions

Use two-space indentation, LF endings, and a final newline. Prettier uses single quotes, trailing commas, and a 100-character print width. Follow strict TypeScript, including `noUncheckedIndexedAccess`. Use PascalCase for component files and names, camelCase for functions and other modules, and uppercase names for specification constants.

## Testing Guidelines

Place Vitest tests beside modules as `<module>.test.ts`, using descriptive `describe` and `it` blocks. Cover geometry boundaries, rotation, snapping, and persistence behavior when changing them. Add Playwright cases in `e2e/*.spec.ts` for user flows. No numeric coverage threshold is configured. CI requires typechecking, linting, unit tests, and a production build; run browser tests locally for interaction changes.

## Commit & Pull Request Guidelines

History uses imperative subjects such as “Add hole snapping and alignment markers,” sometimes prefixed with `Milestone N:`. Follow that style and keep changes focused. In PRs, describe the behavior changed, link the relevant milestone issue, list verification commands, and include screenshots for visual changes. Complete milestone acceptance checks before advancing. Pushes to `main` deploy automatically; preserve the `/BASISCad/` base path in `vite.config.ts`.
