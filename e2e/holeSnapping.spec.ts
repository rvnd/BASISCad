import { appUrl, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function prepareStack(page: Page, upright = false) {
  await page.goto(appUrl);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Design name').fill('Snapping Test');
  await dialog.getByRole('button', { name: 'Start Design' }).click();
  const place = page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' });
  const panel = page.getByRole('region', { name: 'Move and rotate' });
  for (const height of [0, 3.175]) {
    await place.click();
    if (upright) {
      await panel.getByLabel('X angle in °').fill('90');
      await panel.getByLabel('X angle in °').press('Enter');
    }
    for (const [label, value] of [
      ['X in mm', '0'],
      ['Z in mm', height === 0 ? '0' : '20'],
      ['Y · height in mm', String(upright ? 0 : height)],
    ] as const) {
      await panel.getByLabel(label).fill(value);
      await panel.getByLabel(label).press('Enter');
    }
  }
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  const zoomSteps = 6;
  for (let i = 0; i < zoomSteps; i += 1) {
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  }
  const canvas = page.locator('.viewport canvas');
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error('Workplane canvas is missing');
  // Top view is 1400 mm above the origin, with a 45 degree vertical FOV;
  // each zoom step multiplies that distance by 0.8. Use CSS pixels so this
  // works with the runner's viewport size and device pixel ratio.
  const mmPerPixel = (2 * 1400 * 0.8 ** zoomSteps * Math.tan(Math.PI / 8)) / bounds.height;
  const screenPoint = (x: number, z: number) => ({
    x: bounds.x + bounds.width / 2 + x / mmPerPixel,
    y: bounds.y + bounds.height / 2 + z / mmPerPixel,
  });
  return { canvas, screenPoint };
}

test('snaps upright girders and keeps their horizontal-hole rings live', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const { canvas, screenPoint } = await prepareStack(page, true);
  const start = screenPoint(0, 21.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    const outside = screenPoint(4, 6);
    await page.mouse.move(outside.x, outside.y, { steps: 8 });
    await expect(page.getByLabel('Aligned holes', { exact: true })).toHaveText('0 aligned holes');
    const end = screenPoint(1, 6);
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await expect.poll(async () => Math.abs((await movingPosition(page)).x)).toBeLessThan(0.001);
    await expect(canvas).toHaveCSS('cursor', 'copy');
    await expect(page.getByLabel('Aligned holes', { exact: true })).toHaveText('6 aligned holes');
  } finally {
    await page.mouse.up();
  }
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Front', exact: true }).click();
  for (let i = 0; i < 6; i += 1)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await testInfo.attach('upright-green-rings', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => movingPosition(page)).toEqual({ x: 0, z: 20 });
});

async function movingPosition(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null');
    const moving = draft?.placed[1];
    if (!moving) throw new Error('Moving piece is missing from the recovery draft');
    return { x: moving.position.x, z: moving.position.z };
  });
}

for (const scenario of [
  { name: 'snaps within 2 mm', alt: false, enabled: true, outside: false, snapped: true },
  {
    name: 'Alt bypasses snapping within 2 mm',
    alt: true,
    enabled: true,
    outside: false,
    snapped: false,
  },
  {
    name: 'disabled toggle bypasses snapping',
    alt: false,
    enabled: false,
    outside: false,
    snapped: false,
  },
  { name: 'does not snap outside 2 mm', alt: false, enabled: true, outside: true, snapped: false },
]) {
  test(scenario.name, async ({ page }, testInfo) => {
    const { canvas, screenPoint } = await prepareStack(page);
    await page.getByRole('checkbox', { name: 'Snap holes' }).setChecked(scenario.enabled);
    const start = screenPoint(0, 20);
    const end = scenario.outside ? screenPoint(0, 4) : screenPoint(1, 1);
    if (scenario.alt) await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    try {
      await page.mouse.move(end.x, end.y, { steps: 8 });
      const distance = async () => {
        const position = await movingPosition(page);
        return Math.hypot(position.x, position.z);
      };
      if (scenario.snapped) {
        await expect.poll(distance).toBeLessThan(0.001);
      } else {
        await expect.poll(distance).toBeGreaterThan(scenario.outside ? 2 : 0.3);
        if (!scenario.outside) {
          await expect.poll(distance).toBeLessThan(2);
        }
      }
      await expect(canvas).toHaveCSS('cursor', scenario.snapped ? 'copy' : 'grabbing');
      await testInfo.attach('during-drag', {
        body: await canvas.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await page.mouse.up();
      if (scenario.alt) await page.keyboard.up('Alt');
    }
    if (scenario.snapped) await page.getByRole('button', { name: 'Not now', exact: true }).click();
    // All pointer updates in this drag must be one undoable edit.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => movingPosition(page)).toEqual({ x: 0, z: 20 });
  });
}
