import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
import { hingeDesign } from './connectionSetup';

async function start(page: Page) {
  await page.goto(appUrl);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Design name').fill('Connection Test');
  await dialog.getByRole('button', { name: 'Start Design' }).click();
}

async function add(page: Page, x: number, y = 0, z = 0) {
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  const panel = page.getByRole('region', { name: 'Move and rotate' });
  // Move clear of defaults before setting the stack height.
  for (const [label, value] of [
    ['X in mm', x],
    ['Y · height in mm', y],
    ['Z in mm', z],
  ] as const) {
    await panel.getByLabel(label).fill(String(value));
    await panel.getByLabel(label).press('Enter');
  }
}

function marker(page: Page, piece: number, hole: number) {
  return page
    .locator('.hole-target')
    .and(page.getByRole('button', { name: new RegExp(`\\(piece ${piece}\\), hole ${hole}(;|$)`) }));
}

async function draft(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
  );
}

async function top(page: Page) {
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
}

test('connects picked holes, adds a paired screw with Yes, and undoes the whole action', async ({
  page,
}, testInfo) => {
  await start(page);
  await add(page, -80);
  await add(page, 80);
  await top(page);
  const before = await draft(page);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.hole-target')).toHaveCount(12);
  await marker(page, 1, 3).click();
  await expect(marker(page, 1, 3)).toHaveAttribute('aria-pressed', 'true');
  await marker(page, 2, 4).click();
  await expect(page.getByRole('dialog', { name: 'Add screw and nut?' })).toBeVisible();
  expect((await draft(page))[1]).toEqual(before[1]);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await draft(page)).filter((piece: { fastener?: unknown }) => piece.fastener).length,
    )
    .toBe(1);
  const joined = await draft(page);
  expect(joined[1].position.x).toBe(before[1].position.x);
  expect(joined[1].position.z).toBe(before[1].position.z);
  expect(joined[2].fastener).toMatchObject({
    lengthInches: 0.375,
    holes: [
      { pieceId: before[1].id, holeIndex: 3 },
      { pieceId: before[0].id, holeIndex: 2 },
    ],
  });
  await testInfo.attach('connected-screw-and-nut', {
    body: await page.locator('.viewport canvas').screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(joined);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.hole-target.occupied')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Pick connection holes')).toHaveCount(0);
});

test('adds a neighbouring screw without moving the existing assembly, and saves its connections', async ({
  page,
}) => {
  await start(page);
  await add(page, -80);
  await add(page, 80);
  await top(page);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await marker(page, 1, 3).click();
  await marker(page, 2, 3).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  const fixed = await draft(page);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.hole-target')).toHaveCount(6);
  // One shared marker contains both aligned bores; clicking it twice chooses the pair.
  await marker(page, 1, 4).click();
  await marker(page, 2, 4).click();
  await expect(page.getByRole('dialog', { name: 'Add screw and nut?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await draft(page)).filter((piece: { fastener?: unknown }) => piece.fastener).length,
    )
    .toBe(2);
  const paired = await draft(page);
  expect(paired[0]).toEqual(fixed[0]);
  expect(paired[1]).toEqual(fixed[1]);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design' }).click();
  await page.reload();
  await page.getByRole('dialog').getByLabel('Design name').fill('Other');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Design' }).click();
  await page.getByRole('button', { name: 'Open Connection Test', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(paired);
});

test('rejects an impossible pick, closes picking mode, and exposes the retry options', async ({
  page,
}) => {
  await start(page);
  await add(page, -80);
  await add(page, 80);
  await top(page);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await marker(page, 1, 1).click();
  await marker(page, 1, 2).click();
  await expect(page.getByRole('alert')).toContainText('No clear connection found');
  await expect(page.getByLabel('Pick connection holes')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connection options', exact: true }).click();
  for (const name of ['Try either side', 'Try more angles', 'Allow moving the connected assembly'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await page.getByRole('button', { name: 'Retry the same holes' }).click();
  await expect(page.getByRole('alert')).toContainText('No clear connection found');
  await page.getByRole('button', { name: 'Connection options', exact: true }).click();
  await page.getByRole('button', { name: 'Try best fit' }).click();
  await expect(page.getByRole('alert')).toContainText('No clear connection found');
});

test('connects a singly screwed arm by swinging it while the locked target assembly stays fixed', async ({
  page,
}, testInfo) => {
  const fixture = hingeDesign();
  await page.goto(appUrl);
  await page.evaluate(
    (placed) =>
      localStorage.setItem(
        'basiscad.recovery.v1',
        JSON.stringify({ id: 'hinge-design', name: 'Hinge Check', updatedAt: Date.now(), placed }),
      ),
    fixture,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Restore Design', exact: true }).click();
  const before = await draft(page);
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: '1x6 Girder' })
      .getByRole('button', { name: 'Place' }),
  ).toBeEnabled();
  await top(page);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.hole-target.occupied')).toHaveCount(2);
  await marker(page, 2, 5).click();
  await marker(page, 3, 5).click();
  await expect(page.getByRole('dialog', { name: 'Add screw and nut?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  const after = await draft(page);
  expect(
    Math.abs(after.find((piece: { id: string }) => piece.id === 'arm').rotation.y),
  ).toBeCloseTo(90);
  for (const piece of before)
    if (piece.id !== 'arm')
      expect(after.find((entry: { id: string }) => entry.id === piece.id)).toEqual(piece);
  expect(after.filter((piece: { fastener?: unknown }) => piece.fastener)).toHaveLength(3);
  await testInfo.attach('hinged-second-connection', {
    body: await page.locator('.viewport canvas').screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(before);
});
