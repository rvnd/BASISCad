import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
import { serializeBackup } from '../src/app/projectBackup';

const original = [
  {
    id: 'precise',
    libraryId: 'girder-1x4',
    position: { x: 80.123456789, y: 3.175, z: 100 },
    rotation: { x: 0, y: 37.5, z: 0 },
  },
  {
    id: 'other',
    libraryId: 'girder-1x7',
    position: { x: -160, y: 0, z: -100 },
    rotation: { x: 0, y: 0, z: 0 },
  },
];
async function placed(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed);
}
async function open(page: Page) {
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Open Backup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open backup', exact: true });
  await dialog.getByLabel('Backup file').setInputFiles({
    name: 'precision.basiscad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      serializeBackup({ id: 'precision', name: 'Precision', updatedAt: 0, placed: original }),
    ),
  });
  await dialog.getByRole('button', { name: 'Open backup', exact: true }).click();
  await expect(page.locator('.library-status-ready')).toHaveCount(17);
  const list = page.getByRole('list', { name: 'Design pieces', exact: true });
  await list.getByRole('button', { name: '1. 1x4 Girder', exact: true }).press('Enter');
  return list;
}

test('numeric fields preserve untouched precision, cancel with Escape and commit one undoable edit', async ({
  page,
}) => {
  await open(page);
  const x = page.getByLabel('X in mm', { exact: true }),
    y = page.getByLabel('Y in mm', { exact: true });
  await expect(y).toHaveValue('3.175');
  await x.focus();
  await x.press('Tab');
  await page.getByLabel('Y in °', { exact: true }).focus();
  await page.getByLabel('Y in °', { exact: true }).press('Tab');
  expect(await placed(page)).toEqual(original);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await x.fill('999');
  await x.press('Escape');
  await expect(x).toHaveValue('80.123457');
  expect(await placed(page)).toEqual(original);
  await y.fill('NaN');
  await y.press('Enter');
  await expect(y).toHaveValue('3.175');
  await y.fill('4.7625');
  await y.press('Enter');
  await expect.poll(async () => (await placed(page))[0].position.y).toBe(4.7625);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await placed(page)).toEqual(original);
  await page.getByLabel('Y in °', { exact: true }).fill('45.2');
  await page.getByLabel('Y in °', { exact: true }).press('Enter');
  await expect.poll(async () => (await placed(page))[0].rotation.y).toBe(45);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await placed(page)).toEqual(original);
});

test('keyboard selection and workplane arrows move, rotate, undo, respect locks and protect input editing', async ({
  page,
}) => {
  const list = await open(page),
    workplane = page.getByRole('region', { name: '3D workplane', exact: true });
  const first = list.getByRole('button', { name: /^1\. 1x4 Girder/ }),
    second = list.getByRole('button', { name: /^2\. 1x7 Girder/ });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await workplane.focus();
  await workplane.press('ArrowRight');
  await expect
    .poll(async () => (await placed(page))[0].position.x)
    .toBe(original[0]!.position.x + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await placed(page)).toEqual(original);
  await workplane.focus();
  await workplane.press('Shift+ArrowDown');
  await expect.poll(async () => (await placed(page))[0].position.z).toBe(110);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  await workplane.focus();
  await workplane.press('Shift+ArrowRight');
  await expect.poll(async () => (await placed(page))[0].rotation.y).toBe(60);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await placed(page)).toEqual(original);
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  const locked = await placed(page);
  await workplane.focus();
  await workplane.press('ArrowRight');
  expect(await placed(page)).toEqual(locked);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const unlocked = await placed(page);
  await second.click({ modifiers: ['Shift'] });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await workplane.focus();
  await workplane.press('ArrowRight');
  await expect
    .poll(async () => (await placed(page)).map((p: { position: { x: number } }) => p.position.x))
    .toEqual(unlocked.map((p: { position: { x: number } }) => p.position.x + 1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await placed(page)).toEqual(unlocked);
  await first.click();
  const x = page.getByLabel('X in mm', { exact: true });
  await x.fill('123');
  await x.press('Backspace');
  await x.press('Escape');
  expect(await placed(page)).toEqual(unlocked);
  await workplane.focus();
  await workplane.press('Delete');
  await expect.poll(async () => (await placed(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await placed(page)).toEqual(unlocked);
  await first.click();
  await workplane.focus();
  await workplane.press('Escape');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await workplane.press('Delete');
  expect(await placed(page)).toEqual(unlocked);
});
