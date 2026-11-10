import * as THREE from 'three';
import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
import { createGroup } from '../src/app/groups';
import { jointDesign, jointLibrary } from './connectionSetup';
import type { PlacedPiece } from '../src/app/design';
import { createFramingCamera } from '../src/three/workplane';
import { getCameraView } from '../src/three/cameraViews';
import { pieceMatrix } from '../src/three/pieceTransforms';
import { geometryLookup } from '../src/three/designConstraints';
import { designHoles, worldHole } from '../src/three/connectionHoles';

async function draft(page: Page): Promise<readonly PlacedPiece[]> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
  );
}
async function restore(page: Page, placed: readonly PlacedPiece[]) {
  await page.goto(appUrl);
  await page.evaluate(
    (placed) =>
      localStorage.setItem(
        'basiscad.recovery.v1',
        JSON.stringify({ id: 'assembly', name: 'Assembly Check', updatedAt: Date.now(), placed }),
      ),
    placed,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Restore Design', exact: true }).click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: '1x6 Girder' })
      .getByRole('button', { name: 'Place' }),
  ).toBeEnabled();
  await page.getByRole('checkbox', { name: 'Snap holes' }).uncheck();
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
}
async function point(page: Page, x: number, z: number, y = 16.35) {
  const bounds = (await page.locator('.viewport canvas').boundingBox())!;
  const camera = createFramingCamera(bounds.width / bounds.height);
  camera.position.set(...getCameraView('top')!.position).multiplyScalar(0.8 ** 6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: bounds.x + ((p.x + 1) * bounds.width) / 2,
    y: bounds.y + ((1 - p.y) * bounds.height) / 2,
  };
}
async function clickPiece(page: Page, x: number, z: number, shift = false) {
  const p = await point(page, x, z);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
}
async function type(page: Page, label: string, value: number) {
  const field = page.getByRole('region', { name: 'Move and rotate' }).getByLabel(label);
  await field.fill(String(value));
  await field.press('Enter');
}
function rigid(before: readonly PlacedPiece[], after: readonly PlacedPiece[]) {
  const geometry = geometryLookup(jointLibrary());
  const transform = pieceMatrix(after[0]!, geometry(after[0]!)!).multiply(
    pieceMatrix(before[0]!, geometry(before[0]!)!).invert(),
  );
  for (let i = 0; i < after.length; i++) {
    const expected = transform
      .clone()
      .multiply(pieceMatrix(before[i]!, geometry(before[i]!)!)).elements;
    pieceMatrix(after[i]!, geometry(after[i]!)!).elements.forEach((v, j) =>
      expect(v).toBeCloseTo(expected[j]!, 4),
    );
  }
}

test('groups a screwed cross, rotates and moves it rigidly, locks it, and ungroups it', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await restore(page, jointDesign(false, true));
  await clickPiece(page, 20, 4);
  await clickPiece(page, -2, -24, true);
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  const grouped = await draft(page);
  expect(grouped.every((piece) => piece.groupId === grouped[0]!.groupId)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Group · 3 items' })).toBeVisible();
  await type(page, 'Y angle in °', 90);
  const turned = await draft(page);
  rigid(grouped, turned);
  expect(turned[0]!.groupRotation?.y).toBe(90);
  await page.getByRole('button', { name: 'Rotate Y by plus 22.5 degrees', exact: true }).click();
  expect((await draft(page))[0]!.groupRotation?.y).toBe(112.5);
  await page.getByRole('button', { name: 'Rotate Y by minus 22.5 degrees', exact: true }).click();
  await type(page, 'X in mm', 40);
  const moved = await draft(page);
  rigid(turned, moved);
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  // Dragging the selected group itself uses the same common centre as its rings.
  const click = await point(
    page,
    moved[0]!.position.x + 4,
    moved[0]!.position.z - 20,
    moved[0]!.position.y + 3.175,
  );
  await page.mouse.move(click.x, click.y);
  await page.mouse.down();
  await page.mouse.move(click.x + 45, click.y, { steps: 8 });
  await page.mouse.up();
  const dragged = await draft(page);
  rigid(moved, dragged);
  expect(dragged[0]!.groupRotation?.y).toBe(112.5);
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  const locked = await draft(page);
  await expect(page.getByLabel('Y angle in °')).toBeDisabled();
  await page.mouse.move(click.x, click.y);
  await page.mouse.down();
  await page.mouse.move(click.x + 50, click.y + 30, { steps: 5 });
  await page.mouse.up();
  expect(await draft(page)).toEqual(locked);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByLabel('Y angle in °')).toBeEnabled();
  await testInfo.attach('grouped-cross', {
    body: await page.locator('.viewport canvas').screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
  expect((await draft(page)).every((piece) => !piece.groupId)).toBe(true);
  await expect(page.getByRole('region', { name: 'Selection', exact: true })).toHaveCount(0);
});

test('saves and reopens a group with its rotation frame and all screw connections', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const fixture = createGroup(jointDesign(false, true), ['base', 'arm'], 'saved-group');
  await restore(page, fixture);
  await clickPiece(page, 20, 4);
  await type(page, 'Y angle in °', 45);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design' }).click();
  const saved = await draft(page);
  await page.reload();
  await page.getByRole('dialog').getByLabel('Design name').fill('Other');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Design' }).click();
  await page.getByRole('button', { name: 'Open Assembly Check', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(saved);
});

test('types and drags a single-screw hinge while its partner and hardware stay fixed', async ({
  page,
}, testInfo) => {
  await restore(page, jointDesign());
  await clickPiece(page, 0, 4);
  await page.getByRole('button', { name: 'Swing / Hinge', exact: true }).click();
  const before = await draft(page),
    library = jointLibrary();
  const pivot = worldHole(designHoles(before, library), { pieceId: 'arm', holeIndex: 0 })!.center;
  await type(page, 'Hinge angle in °', 30);
  expect((await draft(page))[1]!.hingeAngleDeg).toBe(22.5);
  await type(page, 'Hinge angle in °', 90);
  const after = await draft(page);
  expect(after[1]!.hingeAngleDeg).toBe(90);
  expect(after[0]).toEqual(before[0]);
  expect(after[2]).toEqual(before[2]);
  expect(
    worldHole(designHoles(after, library), { pieceId: 'arm', holeIndex: 0 })!.center.distanceTo(
      pivot,
    ),
  ).toBeLessThan(1e-5);
  const start = await point(page, -2, -24),
    end = await point(page, pivot.x + 24, pivot.z + 4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  const dragged = await draft(page);
  expect(dragged[1]!.hingeAngleDeg).not.toBe(90);
  expect(Math.abs(dragged[1]!.hingeAngleDeg! % 22.5)).toBe(0);
  expect(dragged[0]).toEqual(before[0]);
  expect(dragged[2]).toEqual(before[2]);
  expect(
    worldHole(designHoles(dragged, library), { pieceId: 'arm', holeIndex: 0 })!.center.distanceTo(
      pivot,
    ),
  ).toBeLessThan(1e-5);
  await testInfo.attach('hinge-swing', {
    body: await page.locator('.viewport canvas').screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(after);
});

test('two screws fix a joint and locking one partner blocks ordinary assembly dragging', async ({
  page,
}) => {
  await restore(page, jointDesign(true));
  await clickPiece(page, 0, 4);
  await expect(page.getByRole('button', { name: 'Swing / Hinge', exact: true })).toBeDisabled();
  await expect(page.getByText('This joint is fixed.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  const before = await draft(page);
  const p = await point(page, 0, 4);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 50, p.y, { steps: 6 });
  await page.mouse.up();
  expect(await draft(page)).toEqual(before);
  await expect(page.getByLabel('Y angle in °')).toBeDisabled();
});
