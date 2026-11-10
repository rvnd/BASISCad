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
async function draws(page: Page) {
  return page.evaluate(() => (window as unknown as { cadDraws: number }).cadDraws);
}

test('two-piece designs stop drawing while idle and redraw for camera, rotation, movement and undo', async ({
  page,
}) => {
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
  await frames(page);
  const idle = await draws(page);
  expect(idle).toBeGreaterThan(0);
  await frames(page, 5);
  expect(await draws(page)).toBe(idle);
  const initial = await page.locator('.viewport canvas').screenshot();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => draws(page)).toBeGreaterThan(idle);
  const zoomed = await page.locator('.viewport canvas').screenshot();
  expect(zoomed.equals(initial)).toBe(false);
  const beforeRotation = await draws(page);
  await page.getByLabel('X angle in °', { exact: true }).fill('45');
  await page.getByLabel('X angle in °', { exact: true }).press('Enter');
  await expect.poll(() => draws(page)).toBeGreaterThan(beforeRotation);
  expect((await page.locator('.viewport canvas').screenshot()).equals(zoomed)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await frames(page);
  expect((await page.locator('.viewport canvas').screenshot()).equals(zoomed)).toBe(true);
  await page.getByLabel('X in mm', { exact: true }).fill('80');
  await page.getByLabel('X in mm', { exact: true }).press('Enter');
  await frames(page);
  expect((await page.locator('.viewport canvas').screenshot()).equals(zoomed)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await frames(page);
  expect((await page.locator('.viewport canvas').screenshot()).equals(zoomed)).toBe(true);
});
