import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

export { expect };
export const appUrl = process.env.PLAYWRIGHT_BASE_URL || './';

// The extension uses existing Chrome tabs, so it cannot create incognito
// contexts. The local launcher assigns a fresh origin and runs one test at a
// time; resetting only that origin keeps saved-design tests independent.
export const test = process.env.PLAYWRIGHT_RELAY_URL
  ? base.extend({
      browser: [
        async ({ playwright }, runTest) => {
          const relayURL = new URL(process.env.PLAYWRIGHT_RELAY_URL!);
          if (!['localhost', '127.0.0.1', '[::1]'].includes(relayURL.hostname)) {
            throw new Error('Local browser tests require a loopback relay.');
          }
          const tokenFile = process.env.PLAYWRIGHT_RELAY_TOKEN_FILE;
          if (!tokenFile) throw new Error('The local browser relay token file is missing.');
          const headers = { Authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` };
          const response = await fetch(new URL('/json/version', relayURL), {
            headers,
          });
          if (!response.ok) throw new Error(`Browser relay returned HTTP ${response.status}.`);
          const version = (await response.json()) as { webSocketDebuggerUrl: string };
          const endpoint = new URL(version.webSocketDebuggerUrl);
          if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
            throw new Error('The local browser relay returned a non-loopback CDP endpoint.');
          }
          // Authenticate through headers so errors and reports never contain the token.
          endpoint.searchParams.delete('opencodeBrowserToken');
          endpoint.searchParams.set('session', process.env.PLAYWRIGHT_RELAY_SESSION || '');
          const browser = await playwright.chromium.connectOverCDP(endpoint.href, {
            headers,
            noDefaults: true,
          });
          try {
            await runTest(browser);
          } finally {
            // Closing a CDP connection disconnects this client from Chrome.
            await browser.close();
          }
        },
        { scope: 'worker' },
      ],
      context: async ({ browser }, runTest) => {
        const context = browser.contexts()[0];
        if (!context) throw new Error('The browser relay did not provide a context.');
        await runTest(context);
      },
      page: async ({ context, baseURL, viewport }, runTest) => {
        if (!baseURL) throw new Error('The local browser test URL is missing.');
        const page = await context.newPage();
        if (viewport) await page.setViewportSize(viewport);
        let renderTimer: ReturnType<typeof setInterval> | undefined;
        try {
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
          // Chrome throttles animation frames in background extension tabs.
          // Requesting a frame keeps Playwright's stability checks and the
          // Three.js render loop progressing without raising the user's window.
          let rendering = false;
          renderTimer = setInterval(() => {
            if (rendering) return;
            rendering = true;
            void cdp
              .send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: 1,
                captureBeyondViewport: false,
              })
              .catch(() => undefined)
              .finally(() => {
                rendering = false;
              });
          }, 200);
          await page.goto(baseURL);
          await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
          });
          await page.goto('about:blank');
          await runTest(page);
        } finally {
          clearInterval(renderTimer);
          await page.close();
        }
      },
    })
  : base;
