import { expect, test } from '@playwright/test';

test('loads the workplane and the available shape library', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('.brand')).toHaveAttribute('aria-label', 'BASIScad');
  await expect(page.getByRole('region', { name: '3D workplane' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shapes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fit' })).toBeEnabled();

  const girder = page.getByRole('listitem').filter({ hasText: '1x6 Girder' });
  await expect(girder).toBeVisible();
  await expect(girder.getByRole('button', { name: 'Place' })).toBeEnabled();
});

test('places and removes a library piece', async ({ page }) => {
  await page.goto('./');

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

test('rotates a piece from the X handle and updates the live angle', async ({ page }) => {
  await page.goto('./');
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
  let handlePoint: { x: number; y: number } | null = null;
  for (
    let y = bounds.y + bounds.height * 0.08;
    y < bounds.y + bounds.height * 0.78 && handlePoint === null;
    y += 14
  ) {
    for (
      let x = bounds.x + bounds.width * 0.2;
      x < bounds.x + bounds.width * 0.8 && handlePoint === null;
      x += 14
    ) {
      await page.mouse.move(x, y);
      if ((await hoverNote.allTextContents()).some((text) => text.includes('about X'))) {
        handlePoint = { x, y };
      }
    }
  }
  expect(handlePoint, 'the red X rotation handle should respond to hover').not.toBeNull();
  if (handlePoint === null) {
    throw new Error('Could not find the X rotation handle in the viewport.');
  }

  await expect(hoverNote).toContainText('about X');
  await page.mouse.move(handlePoint.x, handlePoint.y);
  await page.mouse.down();
  await page.mouse.move(handlePoint.x + 22, handlePoint.y - 28, { steps: 8 });
  await page.mouse.up();

  const angleBadge = page.locator('.angle-badge');
  await expect(angleBadge).toBeVisible();
  await expect(angleBadge).toContainText('X');
  await expect(angleBadge).not.toHaveText('X 0°');
});
