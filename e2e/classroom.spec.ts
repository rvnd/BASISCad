import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

async function document(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!));
}

async function openReference(page: Page) {
  await page.goto(appUrl);
  const response = await page.request.get(
    new URL('examples/classroom.basiscad.json', page.url()).href,
  );
  expect(response.ok()).toBe(true);
  const text = await response.text();
  await page.getByRole('button', { name: 'Open Backup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open backup', exact: true });
  await dialog.getByLabel('Backup file').setInputFiles({
    name: 'classroom.basiscad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await dialog.getByRole('button', { name: 'Open backup', exact: true }).click();
  await expect(page.locator('.library-status-ready')).toHaveCount(17);
  const expected = JSON.parse(text).document;
  await expect.poll(async () => (await document(page)).placed).toEqual(expected.placed);
  return expected;
}

test('emulated touch edits a classroom project and restores it after refresh', async ({ page }) => {
  test.setTimeout(60_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  try {
    await openReference(page);
    await page
      .getByRole('listitem')
      .filter({ hasText: '1x4 Girder' })
      .getByRole('button', { name: 'Place', exact: true })
      .click();
    const baseline = (await document(page)).placed;
    const control = page.getByRole('button', { name: 'Move Y', exact: true });
    const box = await control.boundingBox(),
      canvas = await page.locator('.viewport canvas').boundingBox();
    if (!box || !canvas) throw new Error('Missing touch targets');
    const left = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const right = { id: 2, x: canvas.x + canvas.width * 0.18, y: canvas.y + canvas.height * 0.4 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
    for (let i = 1; i <= 6; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [left, { ...right, y: right.y - i * 6 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () => (await document(page)).placed.at(-1).position.y)
      .toBeGreaterThan(baseline.at(-1).position.y);
    const moved = (await document(page)).placed;
    expect(moved.slice(0, -1)).toEqual(baseline.slice(0, -1));
    expect(moved.at(-1).position.x).toBe(baseline.at(-1).position.x);
    expect(moved.at(-1).position.z).toBe(baseline.at(-1).position.z);
    expect(moved.at(-1).rotation).toEqual(baseline.at(-1).rotation);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await document(page)).placed).toEqual(baseline);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Save Design', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Open saved design', exact: true }).click();
    await page.getByRole('button', { name: 'Open Classroom Reference', exact: true }).click();
    expect((await document(page)).placed).toEqual(moved);
  } finally {
    await cdp
      .send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      .catch(() => undefined);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  }
});

test('classroom reference keeps every stock type and joint across editing, refresh and a two-page print', async ({
  page,
}, testInfo) => {
  test.setTimeout(process.env.PLAYWRIGHT_RELAY_URL ? 120_000 : 60_000);
  const original = await openReference(page);
  const placed = original.placed as { libraryId: string; fastener?: unknown; groupId?: string }[];
  expect(placed).toHaveLength(27);
  expect(new Set(placed.filter((p) => !p.fastener).map((p) => p.libraryId)).size).toBe(17);
  expect(placed.filter((p) => p.fastener)).toHaveLength(4);
  expect(placed.filter((p) => p.groupId === 'classroom-group')).toHaveLength(2);
  const place = page
    .getByRole('listitem')
    .filter({ hasText: '1x4 Girder' })
    .getByRole('button', { name: 'Place', exact: true });
  await place.click();
  await expect.poll(async () => (await document(page)).placed.length).toBe(28);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await document(page)).placed).toEqual(original.placed);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open saved design', exact: true }).click();
  await page.getByRole('button', { name: 'Open Classroom Reference', exact: true }).click();
  await expect.poll(async () => (await document(page)).placed).toEqual(original.placed);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Print Design', exact: true }).click();
  const print = page.getByRole('dialog', { name: 'Print Design', exact: true });
  await print.getByRole('radio', { name: 'Top', exact: true }).check();
  await print.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Print preview', exact: true });
  await expect(preview.locator('.print-page')).toHaveCount(2);
  const budget = preview.getByRole('region', { name: 'Budget page' });
  await expect(budget.getByText('Total pieces: 23', { exact: true })).toBeVisible();
  await expect(budget.getByText('Screw/nut pairs: 4', { exact: true })).toBeVisible();
  await expect(budget.getByText('Total cost: $135.00', { exact: true })).toBeVisible();
  await expect(budget.locator('tbody').first().locator('tr')).toHaveCount(19);
  if (!process.env.PLAYWRIGHT_RELAY_URL) {
    const path = testInfo.outputPath('print-proof.pdf');
    const pdf = await page.pdf({
      path,
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    await testInfo.attach('classroom-print', { path, contentType: 'application/pdf' });
  }
  await preview.getByRole('button', { name: 'Close preview', exact: true }).click();
  expect((await document(page)).placed).toEqual(original.placed);
});

test('a corrupt mesh import and unavailable storage preserve the classroom design', async ({
  page,
}) => {
  const original = await openReference(page);
  await page.locator('#import-pieces-file').setInputFiles({
    name: 'broken.obj',
    mimeType: 'text/plain',
    buffer: Buffer.from('v NaN 0 0\nv 10 0 0\nv 0 0 10\nf 1 2 3\n'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'invalid vertex' })).toBeVisible();
  expect((await document(page)).placed).toEqual(original.placed);
  expect((await document(page)).imports).toBeUndefined();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not save this design' }),
  ).toBeVisible();
  expect((await document(page)).placed).toEqual(original.placed);
  // Export uses the live document even when device storage is full.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const download = process.env.PLAYWRIGHT_RELAY_URL ? null : page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export Backup', exact: true }).click();
  if (download)
    expect((await download).suggestedFilename()).toBe('Classroom-Reference.basiscad.json');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not save this design' }),
  ).toHaveCount(0);
});

test('an import still reading its file cannot land in a different project', async ({ page }) => {
  await openReference(page);
  await page.evaluate(() => {
    const state = window as unknown as { finishImport?: () => void; importRead?: Promise<void> };
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise<void>((resolve) => {
        state.finishImport = resolve;
      });
      const bytes = read.call(this);
      state.importRead = bytes.then(() => undefined);
      return bytes;
    };
  });
  await page.locator('#import-pieces-file').setInputFiles({
    name: 'late.obj',
    mimeType: 'text/plain',
    buffer: Buffer.from('v 0 0 0\nv 10 0 0\nv 0 0 10\nf 1 2 3\n'),
  });
  await expect(page.getByText('Importing…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Design', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Design name').fill('Next class');
  await page.getByRole('button', { name: 'Start Design', exact: true }).click();
  await page.evaluate(() => (window as unknown as { finishImport: () => void }).finishImport());
  await expect(page.getByText('Importing…', { exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    await (window as unknown as { importRead: Promise<void> }).importRead;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect((await document(page)).name).toBe('Next class');
  expect((await document(page)).placed).toEqual([]);
  expect((await document(page)).imports).toBeUndefined();
  await expect(page.getByText('late', { exact: true })).toHaveCount(0);
});
