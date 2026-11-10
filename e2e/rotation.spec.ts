import { appUrl, expect, test } from './fixtures';

test('manual rotation steps and typed angles use 22.5 degrees on every axis, with undo and wrapping', async ({
  page,
}) => {
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Rotation Check');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  const panel = page.getByRole('region', { name: 'Move and rotate' });
  await expect(panel.getByLabel('Rotation step size')).toHaveText('Step: 22.5°');
  for (const axis of ['X', 'Y', 'Z']) {
    const field = panel.getByLabel(`${axis} angle in °`, { exact: true });
    await panel
      .getByRole('button', { name: `Rotate ${axis} by plus 22.5 degrees`, exact: true })
      .click();
    await expect(field).toHaveValue('22.5');
    await panel
      .getByRole('button', { name: `Rotate ${axis} by minus 22.5 degrees`, exact: true })
      .click();
    await expect(field).toHaveValue('0');
    await field.fill('30');
    await field.press('Enter');
    await expect(field).toHaveValue('22.5');
    await field.fill('-30');
    await field.press('Enter');
    await expect(field).toHaveValue('-22.5');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(field).toHaveValue('22.5');
    await field.fill('0');
    await field.press('Enter');
  }
  const yAngle = panel.getByLabel('Y angle in °', { exact: true });
  await yAngle.fill('180');
  await yAngle.press('Enter');
  await panel.getByRole('button', { name: 'Rotate Y by plus 22.5 degrees', exact: true }).click();
  await expect(yAngle).toHaveValue('-157.5');
  const xPosition = panel.getByLabel('X in mm', { exact: true });
  await xPosition.fill('3.175');
  await xPosition.press('Enter');
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed[0],
  );
  expect(saved.position.x).toBe(3.175);
  expect(saved.rotation).toEqual({ x: 0, y: -157.5, z: 0 });
});
