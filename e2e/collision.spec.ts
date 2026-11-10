import { appUrl, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Collision test');
  await page.getByRole('button', { name: 'Start Design' }).click();
  const place = page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' });
  const panel = page.getByRole('region', { name: 'Move and rotate' });
  for (const z of [0, -35]) {
    await place.click();
    for (const [name, value] of [
      ['X in mm', '0'],
      ['Z in mm', String(z)],
    ] as const) {
      await panel.getByLabel(name).fill(value);
      await panel.getByLabel(name).press('Enter');
    }
  }
  await page.getByRole('checkbox', { name: 'Snap holes' }).uncheck();
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const canvas = page.locator('.viewport canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas missing');
  const scale = (2 * 1400 * 0.8 ** 6 * Math.tan(Math.PI / 8)) / bounds.height;
  const point = (z: number) => ({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2 + z / scale,
  });
  return { canvas, panel, point };
}

async function position(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed[1].position as {
        x: number;
        y: number;
        z: number;
      },
  );
}

test('drags a girder up, across, and down another in one undoable gesture', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const { canvas, point } = await setup(page);
  const start = point(-35);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    const top = point(0);
    await page.mouse.move(top.x, top.y, { steps: 20 });
    await expect.poll(async () => (await position(page)).y).toBeGreaterThan(3.174);
    await expect.poll(async () => Math.abs((await position(page)).z)).toBeLessThan(8);
    await testInfo.attach('on-top', { body: await canvas.screenshot(), contentType: 'image/png' });
    const far = point(40);
    await page.mouse.move(far.x, far.y, { steps: 20 });
    await expect.poll(async () => (await position(page)).z).toBeGreaterThan(25);
    await expect.poll(async () => (await position(page)).y).toBe(0);
  } finally {
    await page.mouse.up();
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => position(page)).toEqual({ x: 0, y: 0, z: -35 });
});

test('rejects overlapping typed moves and swept rotations, and restores the displayed value', async ({
  page,
}) => {
  const { panel } = await setup(page);
  await panel.getByLabel('Z in mm').fill('0');
  await panel.getByLabel('Z in mm').press('Enter');
  await expect.poll(async () => (await position(page)).z).toBe(-35);
  await expect(panel.getByLabel('Z in mm')).toHaveValue('-35');
  await page.getByRole('button', { name: 'Rotate Y 90 degrees', exact: true }).click();
  await expect(panel.getByLabel('Y angle in °')).toHaveValue('0');
  await panel.getByLabel('Y · height in mm').fill('-10');
  await panel.getByLabel('Y · height in mm').press('Enter');
  await expect(panel.getByLabel('Y · height in mm')).toHaveValue('0');
});
