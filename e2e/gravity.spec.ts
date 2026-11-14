import { appUrl, expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { serializeBackup } from '../src/app/projectBackup';
import type { PlacedPiece } from '../src/app/design';
import { loadFixtureLibrary, performanceDesign } from '../scripts/designFixtures';

const falling: readonly PlacedPiece[] = [
  {
    id: 'a',
    libraryId: 'girder-1x4',
    position: { x: -300, y: 300, z: 150 },
    rotation: { x: 0, y: 37.5, z: 0 },
    label: { hidden: false, offset: { x: 12, y: 14 } },
  },
  {
    id: 'b',
    libraryId: 'girder-1x7',
    position: { x: 100, y: 200, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  },
];
async function model(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!));
}
async function open(page: Page, placed: readonly PlacedPiece[] = falling) {
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Open Backup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open backup', exact: true });
  await dialog.getByLabel('Backup file').setInputFiles({
    name: 'gravity.basiscad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      serializeBackup({ id: 'gravity', name: 'Gravity Check', updatedAt: 0, placed }),
    ),
  });
  await dialog.getByRole('button', { name: 'Open backup', exact: true }).click();
  await expect(page.locator('.library-status-ready')).toHaveCount(17);
  await page.getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gravity', exact: true }).click();
  return page.getByRole('region', { name: 'Gravity test', exact: true });
}
async function frames(page: Page, count = 15) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = () => {
          if (--count) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}
async function image(page: Page) {
  const box = await page.locator('.viewport canvas').boundingBox();
  if (!box) throw Error('Missing canvas');
  // Exclude the control overlay and the viewport's keyboard focus outline.
  return page.screenshot({
    clip: { x: box.x + 4, y: box.y + 4, width: box.width - 324, height: box.height - 8 },
  });
}
async function difference(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([first, second]) => {
      const load = async (data: string) => createImageBitmap(await (await fetch(data)).blob());
      const a = await load(first!),
        b = await load(second!);
      const canvas = new OffscreenCanvas(a.width, a.height),
        ctx = canvas.getContext('2d')!;
      ctx.drawImage(a, 0, 0);
      const before = ctx.getImageData(0, 0, a.width, a.height).data;
      ctx.drawImage(b, 0, 0);
      const after = ctx.getImageData(0, 0, a.width, a.height).data;
      let changed = 0;
      for (let i = 0; i < before.length; i += 4)
        if ([0, 1, 2].some((c) => Math.abs(before[i + c]! - after[i + c]!) > 8)) changed++;
      a.close();
      b.close();
      return changed / (before.length / 4);
    },
    [a, b].map((v) => `data:image/png;base64,${v.toString('base64')}`),
  );
}

test('gravity presets, falling, pause and reset preserve the exact design and original scene', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const panel = await open(page),
    original = await model(page);
  const tests = await page.getByRole('button', { name: 'Tests', exact: true }).boundingBox(),
    group = await page.getByRole('button', { name: 'Group', exact: true }).boundingBox();
  expect(tests?.width).toBe(group?.width);
  expect(tests?.height).toBe(group?.height);
  const slider = panel.getByRole('slider', { name: 'Gravity strength', exact: true });
  for (const [name, value] of [
    ['Moon', '1.62'],
    ['Mars', '3.71'],
    ['Earth', '9.81'],
  ]) {
    await panel.getByRole('button', { name: name!, exact: true }).click();
    await expect(slider).toHaveValue(value!);
  }
  await slider.fill('0');
  await frames(page);
  const before = await image(page);
  await panel.getByRole('button', { name: 'Start gravity', exact: true }).click();
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(panel.getByRole('status', { name: 'Simulation status' })).toContainText('Paused');
  for (const button of await page.getByRole('button', { name: 'Place', exact: true }).all())
    await expect(button).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('region', { name: '3D workplane', exact: true }).press('ArrowRight');
  const still = await image(page);
  await frames(page, 20);
  expect(await difference(page, still, await image(page))).toBe(0);
  expect((await model(page)).placed).toEqual(original.placed);
  await panel.getByRole('button', { name: 'Earth', exact: true }).click();
  await panel.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (await panel.getByRole('status', { name: 'Simulation status' }).textContent())!
          .split('·')[1]!
          .trim()
          .split(' ')[0],
      ),
    )
    .toBeGreaterThan(0.5);
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await frames(page);
  expect(await difference(page, still, await image(page))).toBeGreaterThan(0.0001);
  await info.attach('gravity-falling', { body: await image(page), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design', exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('basiscad.saved-designs.v1')!)[0].placed,
    ),
  ).toEqual(original.placed);
  await panel.getByRole('button', { name: 'Reset design', exact: true }).click();
  await frames(page);
  expect(await model(page)).toEqual(original);
  expect(await difference(page, before, await image(page))).toBeLessThan(0.001);
  await expect(page.getByRole('button', { name: 'Place', exact: true }).first()).toBeEnabled();
  await panel.getByRole('button', { name: 'Close gravity test', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('invalid imported geometry cannot replace or damage a gravity project', async ({ page }) => {
  const panel = await open(page);
  await page.locator('#import-pieces-file').setInputFiles({
    name: 'gravity-flat.obj',
    mimeType: 'text/plain',
    buffer: Buffer.from('v 0 0 0\nv 10 0 0\nv 0 0 10\nf 1 2 3\n'),
  });
  await page
    .locator('.library-entry')
    .filter({ hasText: 'gravity-flat' })
    .getByRole('button', { name: 'Place', exact: true })
    .click();
  const before = await model(page);
  await panel.getByRole('button', { name: 'Start gravity', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText(/closed|three-dimensional/);
  expect(await model(page)).toEqual(before);
  await panel.getByRole('button', { name: 'Reset design', exact: true }).click();
  await page.getByRole('button', { name: '🗑 Remove from design', exact: true }).click();
  await panel.getByRole('button', { name: 'Start gravity', exact: true }).click();
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Reset design', exact: true }).click();
});

test('the 100-item reference runs in one worker and releases it on reset and project changes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const state = window as unknown as { gravityWorkers: number };
    state.gravityWorkers = 0;
    const Native = Worker;
    window.Worker = class extends Native {
      private stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.gravityWorkers++;
      }
      override terminate() {
        if (!this.stopped) {
          this.stopped = true;
          state.gravityWorkers--;
        }
        super.terminate();
      }
    };
  });
  const library = loadFixtureLibrary(),
    placed = performanceDesign(100, library);
  const panel = await open(page, placed),
    original = await model(page);
  for (let i = 0; i < 3; i++) {
    await panel.getByRole('button', { name: 'Start gravity', exact: true }).click();
    await expect(panel.getByText(/93 physical bodies · 1 hinge/)).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { gravityWorkers: number }).gravityWorkers),
    ).toBe(1);
    await panel.getByRole('button', { name: 'Reset design', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { gravityWorkers: number }).gravityWorkers),
    ).toBe(0);
    expect(await model(page)).toEqual(original);
  }
  await panel.getByRole('button', { name: 'Start gravity', exact: true }).click();
  await expect(panel.getByText(/93 physical bodies/)).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Design', exact: true }).click();
  expect(
    await page.evaluate(() => (window as unknown as { gravityWorkers: number }).gravityWorkers),
  ).toBe(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  expect((await model(page)).placed).toEqual(original.placed);
});
