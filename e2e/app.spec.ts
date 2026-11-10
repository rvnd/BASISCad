import { readFileSync } from 'node:fs';
import { appUrl, expect, test } from './fixtures';
import * as THREE from 'three';
import { defaultPlacement } from '../src/app/design';
import { parsePieceGeometry } from '../src/three/loadPieceFile';
import { HANDLE_ARC_DEG, handlePoint, rotationHandleRadius } from '../src/three/rotationHandles';
import { createFramingCamera } from '../src/three/workplane';

async function startDesign(page: import('@playwright/test').Page, name = 'Test Design') {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Design name').fill(name);
  await dialog.getByRole('button', { name: 'Start Design' }).click();
  await expect(page.getByRole('button', { name: `Rename design ${name}` })).toBeVisible();
}

test('loads the workplane and the available shape library', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page);

  await expect(page.locator('.brand')).toHaveAttribute('aria-label', 'BASIScad');
  await expect(page.getByRole('region', { name: '3D workplane' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shapes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fit' })).toBeEnabled();

  const girder = page.getByRole('listitem').filter({ hasText: '1x6 Girder' });
  await expect(girder).toBeVisible();
  await expect(girder.getByRole('button', { name: 'Place' })).toBeEnabled();
});

test('places and removes a library piece', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page);

  const girder = page.getByRole('listitem').filter({ hasText: '1x6 Girder' });
  await girder.getByRole('button', { name: 'Place' }).click();

  const selection = page.getByRole('region', { name: 'Selection' });
  await expect(selection.getByText('1x6 Girder')).toBeVisible();
  const removeButton = selection.getByRole('button', { name: '🗑 Remove from design' });
  await expect(removeButton).toBeEnabled();
  await removeButton.click();
  await expect(
    selection.getByText('Nothing selected. Click a placed piece to select it.'),
  ).toBeVisible();
});

test('hole snapping can be toggled and Alt is documented as the free-move modifier', async ({
  page,
}) => {
  await page.goto(appUrl);
  await startDesign(page);
  const snapToggle = page.getByRole('checkbox', { name: 'Snap holes' });
  await expect(snapToggle).toBeChecked();
  await expect(page.getByText('Hold Alt while dragging to move freely.')).toBeVisible();
  await snapToggle.uncheck();
  await expect(snapToggle).not.toBeChecked();
  await snapToggle.check();
});

test('rotates a piece from the X handle and updates the live angle', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page);
  const girder = page.getByRole('listitem').filter({ hasText: '1x6 Girder' });
  await girder.getByRole('button', { name: 'Place' }).click();
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
  }

  const canvas = page.locator('.viewport canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error('The 3D viewport canvas is missing.');
  }

  const hoverNote = page.locator('.handle-hover-note');
  // Project the knob's known world position instead of sweeping thousands of
  // canvas pixels. Hover and drag still use real mouse input and browser raycasts.
  const bytes = readFileSync(new URL('../public/library/girder-1x6.stl', import.meta.url));
  const { geometry, sizeMm } = parsePieceGeometry(new Uint8Array(bytes).buffer, 'girder-1x6.stl', {
    assumeZUp: true,
  });
  geometry.computeBoundingSphere();
  const position = defaultPlacement(0, sizeMm);
  const centre = geometry.boundingBox!.getCenter(new THREE.Vector3());
  centre.add(new THREE.Vector3(position.x, position.y, position.z));
  const knob = handlePoint('x', HANDLE_ARC_DEG.x.start)
    .multiplyScalar(rotationHandleRadius(geometry.boundingSphere!.radius))
    .add(centre);
  const camera = createFramingCamera(bounds.width / bounds.height);
  camera.position.multiplyScalar(0.8 ** 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  knob.project(camera);
  geometry.dispose();
  const target = {
    x: bounds.x + ((knob.x + 1) / 2) * bounds.width,
    y: bounds.y + ((1 - knob.y) / 2) * bounds.height,
  };
  await page.mouse.move(target.x, target.y);
  await expect(hoverNote).toContainText('about X');
  await page.mouse.down();
  await page.mouse.move(target.x + 22, target.y - 28, { steps: 8 });
  await page.mouse.up();

  const angleBadge = page.locator('.angle-badge');
  await expect(angleBadge).toBeVisible();
  await expect(angleBadge).toContainText('X');
  await expect(angleBadge).not.toHaveText('X 0°');
});

test('undo and redo restore a placed piece with buttons and keyboard shortcuts', async ({
  page,
}) => {
  await page.goto(appUrl);
  await startDesign(page, 'History Test');
  const girder = page.getByRole('listitem').filter({ hasText: '1x6 Girder' });
  await girder.getByRole('button', { name: 'Place' }).click();

  const selection = page.getByRole('region', { name: 'Selection' });
  await expect(selection.getByText('1x6 Girder')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    selection.getByText('Nothing selected. Click a placed piece to select it.'),
  ).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(selection.getByText('1x6 Girder')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(
    selection.getByText('Nothing selected. Click a placed piece to select it.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(selection.getByText('1x6 Girder')).toBeVisible();
});

test('saves and reopens a named design on this device', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page, 'Saved Bridge');
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Save Design' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved on this device');

  await page.reload();
  await page.getByRole('button', { name: 'Open saved design' }).click();
  await page.getByRole('button', { name: 'Open Saved Bridge' }).click();
  await expect(page.getByRole('button', { name: 'Rename design Saved Bridge' })).toBeVisible();
});

test('offers recovery after refresh and preserves the design name', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page, 'Recovered Tower');
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('basiscad.recovery.v1')))
    .not.toBeNull();

  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('Recovered Tower');
  await page.getByRole('button', { name: 'Restore Design' }).click();
  await expect(page.getByRole('button', { name: 'Rename design Recovered Tower' })).toBeVisible();
  const recovered = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null'),
  );
  expect(recovered.name).toBe('Recovered Tower');
  expect(recovered.placed).toHaveLength(1);
});

test('asks before deleting a saved copy and keeps the open design', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page, 'Keep Open');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Save Design' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Manage Projects' }).click();
  await page.getByRole('button', { name: 'Delete Keep Open' }).click();
  await expect(page.getByRole('alert')).toContainText('Delete this saved copy?');
  await page.getByRole('button', { name: 'Confirm delete Keep Open' }).click();
  await expect(page.getByText('No saved projects to manage.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename design Keep Open' })).toBeVisible();
});

test('canceling New keeps the open design and its name can be changed', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page, 'Current Design');
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'New Design' }).click();
  const newDialog = page.getByRole('dialog');
  await newDialog.getByLabel('Design name').fill('Canceled Design');
  await newDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Rename design Current Design' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Selection' }).getByText('1x6 Girder'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Rename design Current Design' }).click();
  const renameDialog = page.getByRole('dialog');
  await renameDialog.getByLabel('Design name').fill('Renamed Design');
  await renameDialog.getByRole('button', { name: 'Save Name' }).click();
  await expect(page.getByRole('button', { name: 'Rename design Renamed Design' })).toBeVisible();
});

test('centres the whole project as one undoable edit', async ({ page }) => {
  await page.goto(appUrl);
  await startDesign(page, 'Center Test');
  const girder = page.getByRole('listitem').filter({ hasText: '1x6 Girder' });
  await girder.getByRole('button', { name: 'Place' }).click();
  await girder.getByRole('button', { name: 'Place' }).click();
  const poses = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed as Array<{
          position: { x: number; y: number; z: number };
        }>,
    );
  const before = await poses();
  // A long girder's default must move to a free spot before centring.
  expect(
    Math.abs(before[1]!.position.x - before[0]!.position.x) > 76 ||
      Math.abs(before[1]!.position.z - before[0]!.position.z) > 12.69,
  ).toBe(true);
  await page.getByRole('button', { name: 'Center Project' }).click();
  await expect
    .poll(async () => {
      const pieces = await poses();
      return (
        Math.abs(pieces[0]!.position.x + pieces[1]!.position.x) +
        Math.abs(pieces[0]!.position.z + pieces[1]!.position.z)
      );
    })
    .toBeLessThan(0.001);
  const after = await poses();
  for (const axis of ['x', 'y', 'z'] as const)
    expect(after[1]!.position[axis] - after[0]!.position[axis]).toBeCloseTo(
      before[1]!.position[axis] - before[0]!.position[axis],
    );
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(poses).toEqual(before);
});
