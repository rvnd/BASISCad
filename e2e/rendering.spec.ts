import { appUrl, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function frames(page: Page, count = 3) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (--count === 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}
async function waitForIdle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        let previous = -1,
          quiet = 0,
          remaining = 180;
        const tick = () => {
          const count = (window as unknown as { cadDraws: number }).cadDraws;
          quiet = count === previous ? quiet + 1 : 0;
          previous = count;
          if (quiet >= 5) resolve();
          else if (--remaining === 0) reject(new Error('The viewport did not stop drawing'));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}
async function draws(page: Page) {
  return page.evaluate(() => (window as unknown as { cadDraws: number }).cadDraws);
}

// Small antialiasing differences are allowed; the saved model must restore exactly.
async function changedPixels(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ([first, second]) => {
      const load = async (data: string) => createImageBitmap(await (await fetch(data)).blob());
      const [a, b] = await Promise.all([load(first!), load(second!)]);
      if (a.width !== b.width || a.height !== b.height) return 1;
      const canvas = new OffscreenCanvas(a.width, a.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(a, 0, 0);
      const pixels = context.getImageData(0, 0, a.width, a.height).data;
      context.drawImage(b, 0, 0);
      const restored = context.getImageData(0, 0, a.width, a.height).data;
      let changed = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          [0, 1, 2].some((channel) => Math.abs(pixels[i + channel]! - restored[i + channel]!) > 8)
        )
          changed++;
      }
      a.close();
      b.close();
      return changed / (pixels.length / 4);
    },
    [before, after].map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`),
  );
}
async function model(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed);
}

test('two-piece designs stop drawing while idle and redraw for camera, rotation, movement and undo', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const counter = window as unknown as { cadDraws: number };
    counter.cadDraws = 0;
    const proto = WebGL2RenderingContext.prototype;
    const arrays = proto.drawArrays,
      elements = proto.drawElements;
    proto.drawArrays = function (...args: Parameters<typeof arrays>) {
      counter.cadDraws++;
      return arrays.apply(this, args);
    };
    proto.drawElements = function (...args: Parameters<typeof elements>) {
      counter.cadDraws++;
      return elements.apply(this, args);
    };
  });
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Render Check');
  await page.getByRole('button', { name: 'Start Design' }).click();
  const place = page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' });
  await place.click();
  await place.click();
  await expect(page.locator('.library-status-ready')).toHaveCount(17);
  await waitForIdle(page);
  const idle = await draws(page);
  expect(idle).toBeGreaterThan(0);
  await frames(page, 5);
  expect(await draws(page)).toBe(idle);
  const capture = () =>
    page.locator('.viewport canvas').screenshot({
      style: '.move-rotate-panel, .angle-badge-wrap { visibility: hidden; }',
    });
  const baseline = await model(page);
  const initial = await capture();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => draws(page)).toBeGreaterThan(idle);
  await waitForIdle(page);
  const zoomed = await capture();
  expect(zoomed.equals(initial)).toBe(false);
  const beforeRotation = await draws(page);
  await page.getByLabel('X angle in °', { exact: true }).fill('45');
  await page.getByLabel('X angle in °', { exact: true }).press('Enter');
  await expect.poll(() => draws(page)).toBeGreaterThan(beforeRotation);
  expect((await capture()).equals(zoomed)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForIdle(page);
  const restored = await capture();
  await testInfo.attach('zoomed-scene', { body: zoomed, contentType: 'image/png' });
  await testInfo.attach('restored-scene', { body: restored, contentType: 'image/png' });
  expect(await model(page)).toEqual(baseline);
  expect(await changedPixels(page, zoomed, restored)).toBeLessThan(0.0005);
  await page.getByLabel('X in mm', { exact: true }).fill('80');
  await page.getByLabel('X in mm', { exact: true }).press('Enter');
  await waitForIdle(page);
  expect((await capture()).equals(zoomed)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForIdle(page);
  expect(await model(page)).toEqual(baseline);
  const movedBack = await capture();
  await testInfo.attach('restored-after-move', { body: movedBack, contentType: 'image/png' });
  expect(await changedPixels(page, zoomed, movedBack)).toBeLessThan(0.0005);
});
