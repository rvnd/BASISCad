import { appUrl, expect, test } from './fixtures';
test('prints the chosen view with labels, two classroom pages, and a three-piece fourteen-dollar budget', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Budget Check');
  await page.getByRole('button', { name: 'Start Design' }).click();
  for (const name of ['1x4 Girder', '1x4 Girder', '1x6 Girder'])
    await page
      .getByRole('listitem')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Place' })
      .click();
  await page.getByRole('button', { name: 'Expand Labels' }).click();
  await page.getByRole('radio', { name: 'Piece Names', exact: true }).check();
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
  );
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Print Design', exact: true }).click();
  const choose = page.getByRole('dialog', { name: 'Print Design', exact: true });
  await expect(choose.getByRole('radio')).toHaveCount(4);
  await expect(choose.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();
  await choose.getByRole('radio', { name: 'Top', exact: true }).check();
  await choose.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Print preview', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.locator('.print-page')).toHaveCount(2);
  const design = preview.getByRole('region', { name: 'Design page' }),
    budget = preview.getByRole('region', { name: 'Budget page' });
  await expect(design.getByRole('heading', { name: 'Budget Check', exact: true })).toBeVisible();
  await expect(design.getByText(/Top view/)).toBeVisible();
  await expect(design.getByText(/Overall size: X .* × Y .* × Z .* mm/)).toBeVisible();
  await expect(design.locator('svg text')).toHaveCount(3);
  await expect(budget.getByText('Total pieces: 3', { exact: true })).toBeVisible();
  await expect(budget.getByText('Total cost: $14.00', { exact: true })).toBeVisible();
  await expect(budget.getByRole('heading', { name: 'Materials Needed' })).toBeVisible();
  await expect(budget.getByRole('heading', { name: 'Materials Cost' })).toBeVisible();
  await expect(budget.getByRole('heading', { name: 'Evaluation' })).toBeVisible();
  await expect(budget.getByLabel('Blank evaluation space')).toHaveText('');
  await expect(preview.locator('.brand')).toHaveCount(2);
  if (!process.env.PLAYWRIGHT_RELAY_URL) {
    const path = testInfo.outputPath('print-proof.pdf');
    const pdf = await page.pdf({
      path,
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    await testInfo.attach('print-proof', { path, contentType: 'application/pdf' });
  }
  await page.getByRole('button', { name: 'Change view', exact: true }).click();
  await expect(choose).toBeVisible();
  await choose.getByRole('radio', { name: '3D', exact: true }).check();
  await choose.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(preview.getByText(/3D view/)).toBeVisible();
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
    ),
  ).toEqual(before);
});
