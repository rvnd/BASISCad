# Local browser validation

Run `npm run test:e2e:acd` on the local Agent Conductor browser host. To choose
the established host explicitly, use
`PLAYWRIGHT_ACD_HOST=anarayanan-mac npm run test:e2e:acd`.

The launcher creates a Vite server with its own cache, opens a fresh owned Chrome
profile, and runs Playwright serially in isolated contexts. It closes its browser
and server afterward. Existing tabs, saved projects and the regular dev server
are preserved.

Chrome exposes internal `browser_ui`/`tab` targets that stalled this Playwright
version during connection. The local loopback adapter restricts root attachment
to page targets; page sessions retain normal dedicated-worker attachment. It
does not use the browse extension or its pairing credentials.

The socket adapter uses Playwright’s bundled socket implementation, so check it
when upgrading Playwright. The normal `npm run test:e2e` remains the native CI
command. The existing `npm run test:e2e:local` extension workflow also remains
available.

Examples:

```sh
npm run test:e2e:acd -- e2e/gravity.spec.ts
npm run test:e2e:acd
```
