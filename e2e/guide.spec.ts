import { appUrl, expect, test } from './fixtures';

test('a first-time user follows the guide to build, join and save two pieces, then reopens Help', async ({
  page,
}, testInfo) => {
  test.setTimeout(process.env.PLAYWRIGHT_RELAY_URL ? 90_000 : 60_000);
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Guide Build');
  await page.getByRole('button', { name: 'Start Design' }).click();
  const guide = page.getByRole('region', { name: 'First-use guide' });
  await expect(guide.getByRole('heading', { name: 'Add two pieces' })).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole('listitem')
      .filter({ hasText: '1x6 Girder' })
      .getByRole('button', { name: 'Place' })
      .click();
  }
  const panel = page.getByRole('region', { name: 'Move and rotate' });
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Move a piece' })).toBeVisible();
  await panel.getByLabel('X in mm').fill('80');
  await panel.getByLabel('X in mm').press('Enter');
  await expect(panel.getByLabel('X in mm')).toHaveValue('80');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await panel.getByRole('button', { name: 'Rotate', exact: true }).click();
  await panel.getByLabel('Y angle in °').fill('90');
  await panel.getByLabel('Y angle in °').press('Enter');
  await expect(panel.getByLabel('Y angle in °')).toHaveValue('90');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.hole-target')).toHaveCount(12);
  const marker = (piece: number) =>
    page
      .locator('.hole-target')
      .and(page.getByRole('button', { name: new RegExp(`\\(piece ${piece}\\), hole 3(;|$)`) }));
  await marker(1).click();
  await marker(2).click();
  await expect(page.getByRole('dialog', { name: 'Add screw and nut?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Add a screw and nut' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Save your design' })).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design', exact: true }).click();
  await expect(page.locator('.header-status')).toHaveText('Saved on this device');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('basiscad.saved-designs.v1') ?? '[]'),
  );
  expect(saved[0].name).toBe('Guide Build');
  expect(saved[0].placed.filter((piece: { fastener?: unknown }) => !piece.fastener)).toHaveLength(
    2,
  );
  expect(saved[0].placed.filter((piece: { fastener?: unknown }) => piece.fastener)).toHaveLength(1);
  await testInfo.attach('guided-two-piece-build', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await guide.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await page.getByRole('dialog').getByLabel('Design name').fill('Other');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Add two pieces' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Add two pieces' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);
  await expect(page.locator('.header')).not.toContainText('Milestone');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Design', exact: true }).click();
  await page.getByRole('button', { name: 'Open Guide Build', exact: true }).click();
  await expect(guide).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
      ),
    )
    .toEqual(saved[0].placed);
});
