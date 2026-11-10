import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
async function draft(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null'));
}
async function start(page: Page) {
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Blueprint Check');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
}
test('moves and hides name labels, shows dimensions, and saves label preferences with the design', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await start(page);
  const panel = page.getByRole('region', { name: 'Labels', exact: true });
  await expect(page.getByRole('button', { name: 'Expand Labels', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('.blueprint-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand Labels', exact: true }).click();
  await panel.getByRole('radio', { name: 'Piece Names', exact: true }).check();
  await expect(page.locator('.name-label')).toHaveCount(1);
  await expect(page.locator('.blueprint-lines > line')).toHaveCount(1);
  await panel.getByRole('checkbox', { name: 'Enable Move labels', exact: true }).check();
  const before = await draft(page),
    label = page.locator('.name-label'),
    box = (await label.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 85, box.y + box.height / 2 - 25, { steps: 8 });
  await page.mouse.up();
  const moved = await draft(page);
  expect(moved.placed[0].position).toEqual(before.placed[0].position);
  expect(moved.placed[0].rotation).toEqual(before.placed[0].rotation);
  expect(Math.abs(moved.placed[0].label.offset.x - 109)).toBeLessThan(1);
  expect(Math.abs(moved.placed[0].label.offset.y + 57)).toBeLessThan(1);
  const visibility = panel.getByRole('checkbox', { name: /Show label for 1x6 Girder/ });
  await visibility.uncheck();
  await expect(label).toHaveCount(0);
  await visibility.check();
  await expect(label).toHaveCount(1);
  expect((await draft(page)).placed[0].label.offset).toEqual(moved.placed[0].label.offset);
  await panel.getByRole('radio', { name: 'Measurements', exact: true }).check();
  await expect(page.locator('.dimension-label')).toHaveCount(3);
  await expect(page.locator('.dimension-line')).toHaveCount(3);
  for (const axis of ['X', 'Y', 'Z'])
    await expect(
      page.locator('.dimension-label').filter({ hasText: new RegExp(`^${axis} [0-9.]+ mm$`) }),
    ).toHaveCount(1);
  await testInfo.attach('dimension-labels', {
    body: await page.locator('.viewport-wrap').screenshot(),
    contentType: 'image/png',
  });
  await panel.getByRole('radio', { name: 'Piece Names', exact: true }).check();
  await page.getByRole('button', { name: 'Collapse Labels', exact: true }).click();
  await expect(label).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design' }).click();
  const saved = await draft(page);
  await page.reload();
  await page.getByRole('dialog').getByLabel('Design name').fill('Other');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Design' }).click();
  await page.getByRole('button', { name: 'Open Blueprint Check', exact: true }).click();
  await expect
    .poll(() => draft(page).then((d) => ({ placed: d.placed, labelMode: d.labelMode })))
    .toEqual({ placed: saved.placed, labelMode: 'names' });
  await expect(label).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Expand Labels' })).toBeVisible();
});
test('labels follow piece edits and reset restores positions and individual visibility', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Expand Labels' }).click();
  const panel = page.getByRole('region', { name: 'Labels', exact: true });
  await panel.getByRole('radio', { name: 'Piece Names', exact: true }).check();
  const label = page.locator('.name-label');
  await expect(label).toHaveCount(1);
  const before = (await label.boundingBox())!;
  const field = page.getByRole('region', { name: 'Move and rotate' }).getByLabel('X in mm');
  await field.fill('80');
  await field.press('Enter');
  await expect
    .poll(async () => Math.abs((await label.boundingBox())!.x - before.x))
    .toBeGreaterThan(30);
  await panel.getByRole('button', { name: 'About moving labels' }).click();
  await expect(
    panel.getByText('Drag a label to move it without moving its piece.', { exact: false }),
  ).toBeVisible();
  await panel.getByRole('checkbox', { name: /Show label for 1x6 Girder/ }).uncheck();
  await expect(label).toHaveCount(0);
  await panel.getByRole('button', { name: 'Reset labels', exact: true }).click();
  await expect(label).toHaveCount(1);
  expect((await draft(page)).placed[0].label).toBeUndefined();
  await panel.getByRole('radio', { name: 'Off', exact: true }).check();
  await expect(page.locator('.blueprint-label')).toHaveCount(0);
});
