import * as THREE from 'three';
import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
import { getCameraView } from '../src/three/cameraViews';
import { createFramingCamera } from '../src/three/workplane';

async function start(page: Page) {
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Fastener Test');
  await page.getByRole('button', { name: 'Start Design' }).click();
}

async function addLayer(page: Page, height: number) {
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  const panel = page.getByRole('region', { name: 'Move and rotate' });
  for (const [label, value] of [
    ['X in mm', 0],
    ['Z in mm', 0],
    ['Y · height in mm', height],
  ] as const) {
    await panel.getByLabel(label).fill(String(value));
    await panel.getByLabel(label).press('Enter');
  }
}

async function draft(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
  );
}

async function setView(page: Page, view: 'Top' | 'Front', steps = 6) {
  await page.getByRole('button', { name: /Camera view:/ }).click();
  await page.getByRole('menuitem', { name: view, exact: true }).click();
  for (let i = 0; i < steps; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
}

async function point(
  page: Page,
  view: 'top' | 'front',
  position: { x: number; y: number; z: number },
  steps = 6,
) {
  const bounds = await page.locator('.viewport canvas').boundingBox();
  if (!bounds) throw new Error('Workplane is missing');
  const camera = createFramingCamera(bounds.width / bounds.height);
  const preset = getCameraView(view)!;
  camera.position.set(...preset.position).multiplyScalar(0.8 ** steps);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3(position.x, position.y, position.z).project(camera);
  return {
    x: bounds.x + ((projected.x + 1) * bounds.width) / 2,
    y: bounds.y + ((1 - projected.y) * bounds.height) / 2,
  };
}

test('asks once after alignment, adds adjacent pairs with + targets, and deletes by head and nut without moving stock', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await start(page);
  await addLayer(page, 10);
  await addLayer(page, 13.175);
  await expect(page.getByRole('dialog', { name: 'Add screw and nut?' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  let placed = await draft(page);
  expect(placed.filter((piece: { fastener?: unknown }) => piece.fastener)).toHaveLength(1);
  expect(placed.at(-1).fastener.lengthInches).toBe(0.375);
  const stock = placed.slice(0, 2);
  // The distant 3D view must leave each large + separately clickable.
  await page.getByRole('button', { name: 'Screw + Nut', exact: true }).click();
  await expect(page.locator('.fastener-target')).toHaveCount(5);
  const targets = await page.locator('.fastener-target').evaluateAll((buttons) =>
    buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      expect(
        Math.hypot(targets[i]!.x - targets[j]!.x, targets[i]!.y - targets[j]!.y),
      ).toBeGreaterThanOrEqual(29.5);
  await page.keyboard.press('Escape');
  await setView(page, 'Top');
  await page.getByRole('button', { name: 'Screw + Nut', exact: true }).click();
  await expect(page.locator('.fastener-target')).toHaveCount(5);
  await expect(page.locator('.fastener-target').first()).toHaveText('+');
  await page.locator('.fastener-target').first().click();
  placed = await draft(page);
  expect(placed.filter((piece: { fastener?: unknown }) => piece.fastener)).toHaveLength(2);
  expect(placed.slice(0, 2)).toEqual(stock);
  await page.getByRole('button', { name: 'Screw + Nut', exact: true }).click();
  await expect(page.locator('.fastener-target')).toHaveCount(4);
  await page.keyboard.press('Escape');
  const first = placed[2];
  const head = await point(page, 'top', {
    x: first.position.x,
    y: first.position.y + 9.525 + 0.9,
    z: first.position.z,
  });
  await page.mouse.click(head.x, head.y);
  await expect(
    page
      .getByRole('region', { name: 'Selection' })
      .getByText('#6-32 screw + nut · 3/8 in', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '🗑 Remove from design', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  placed = await draft(page);
  expect(placed.slice(0, 2)).toEqual(stock);
  expect(placed).toHaveLength(3);
  await setView(page, 'Front', 8);
  const second = placed[2];
  const nut = await point(
    page,
    'front',
    {
      x: second.position.x,
      y: second.position.y + 1.6,
      z: second.position.z + 3.8,
    },
    8,
  );
  await page.mouse.click(nut.x, nut.y);
  await expect(
    page
      .getByRole('region', { name: 'Selection' })
      .getByText('#6-32 screw + nut · 3/8 in', { exact: true }),
  ).toBeVisible();
  await testInfo.attach('selected-nut', {
    body: await page.locator('.viewport canvas').screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: '🗑 Remove from design', exact: true }).click();
  await expect.poll(() => draft(page)).toEqual(stock);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const layers of [3, 4])
  test(`automatically chooses a half-inch pair for ${layers} aligned layers`, async ({ page }) => {
    await start(page);
    await addLayer(page, 10);
    for (let i = 1; i < layers; i++) {
      await addLayer(page, 10 + i * 3.175);
      await expect(page.getByRole('dialog', { name: 'Add screw and nut?' })).toBeVisible();
      await page
        .getByRole('button', { name: i === layers - 1 ? 'Yes' : 'Not now', exact: true })
        .click();
    }
    const placed = await draft(page),
      units = placed.filter((piece: { fastener?: unknown }) => piece.fastener);
    expect(units).toHaveLength(1);
    expect(units[0].fastener).toMatchObject({ lengthInches: 0.5 });
    expect(units[0].fastener.holes).toHaveLength(layers);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
