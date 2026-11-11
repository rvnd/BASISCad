import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
import { jointDesign } from './connectionSetup';
import { serializeBackup } from '../src/app/projectBackup';
import type { DesignDocument } from '../src/app/projects';

async function upload(page: Page, text: string) {
  await page
    .getByRole('dialog', { name: 'Open backup', exact: true })
    .getByLabel('Backup file')
    .setInputFiles({
      name: 'bridge.basiscad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
}
async function draft(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!));
}
async function exportFile(page: Page): Promise<DesignDocument> {
  if (process.env.PLAYWRIGHT_RELAY_URL) {
    // The relay has no download events. Capture the actual Blob passed to Chrome;
    // native CI verifies the downloaded file itself.
    await page.evaluate(() => {
      const state = window as unknown as { backupText?: Promise<string> };
      const create = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        if (blob instanceof Blob) state.backupText = blob.text();
        return create.call(this, blob);
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download.endsWith('.basiscad.json')) click.call(this);
      };
    });
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const downloaded = process.env.PLAYWRIGHT_RELAY_URL ? null : page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export Backup', exact: true }).click();
  let text: string;
  if (downloaded) {
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(/\.basiscad\.json$/);
    text = readFileSync((await file.path())!, 'utf8');
  } else {
    text = await page.evaluate(
      () => (window as unknown as { backupText: Promise<string> }).backupText,
    );
  }
  return JSON.parse(text).document;
}

test('portable files preserve joints, groups, labels and an imported OBJ across export, reopen and refresh', async ({
  page,
}) => {
  test.setTimeout(process.env.PLAYWRIGHT_RELAY_URL ? 120_000 : 60_000);
  const placed = jointDesign(false, true).map((piece) => ({
    ...piece,
    groupId: 'school-group',
    groupRotation: { x: 0, y: 45, z: 0 },
    label: { hidden: false, offset: { x: 24, y: -18 } },
  }));
  const original: DesignDocument = {
    id: 'original',
    name: 'Portable Bridge',
    labelMode: 'names',
    updatedAt: 1,
    placed,
  };
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Open Backup', exact: true }).click();
  await upload(page, serializeBackup(original));
  await page
    .getByRole('dialog', { name: 'Open backup', exact: true })
    .getByRole('button', { name: 'Open backup', exact: true })
    .click();
  await page.locator('#import-pieces-file').setInputFiles({
    name: 'class-block.obj',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'v 0 0 0\nv 10 0 0\nv 0 3 0\nv 0 0 12\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 3 1 4\n',
    ),
  });
  const custom = page.getByRole('listitem').filter({ hasText: 'class-block' });
  await custom.getByRole('button', { name: 'Place', exact: true }).click();
  const before = await draft(page);
  expect(before.imports).toHaveLength(1);
  expect(before.imports[0].positions.length).toBeGreaterThan(0);
  const exported = await exportFile(page);
  expect(exported.placed).toEqual(before.placed);
  expect(exported.imports).toEqual(before.imports);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Backup', exact: true }).click();
  await upload(page, serializeBackup(exported));
  await page
    .getByRole('dialog', { name: 'Open backup', exact: true })
    .getByRole('button', { name: 'Open backup', exact: true })
    .click();
  const reopened = await draft(page);
  expect(reopened.id).not.toBe(before.id);
  expect(reopened.placed).toEqual(before.placed);
  expect(reopened.imports).toEqual(before.imports);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Design', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open saved design', exact: true }).click();
  await page.getByRole('button', { name: 'Open Portable Bridge', exact: true }).click();
  expect((await draft(page)).placed).toEqual(before.placed);
  expect((await draft(page)).imports).toEqual(before.imports);
  await expect(custom.getByRole('button', { name: 'Place', exact: true })).toBeEnabled();
});

test('invalid backup files and cancellation preserve the open design', async ({ page }) => {
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Keep This');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
  const before = await draft(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Backup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open backup', exact: true });
  for (const value of ['{', JSON.stringify({ format: 'BASISCad', version: 99 })]) {
    await upload(page, value);
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Open backup', exact: true })).toBeDisabled();
    expect((await draft(page)).placed).toEqual(before.placed);
  }
  await upload(
    page,
    serializeBackup({
      ...before,
      imports: [
        {
          id: 'bad-mesh',
          name: 'Broken mesh',
          category: 'girders',
          colourName: 'Grey',
          colourHex: '#808080',
          positions: '!!!!',
          normals: '!!!!',
        },
      ],
    }),
  );
  await expect(dialog.getByRole('button', { name: 'Open backup', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Open backup', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('mesh encoding');
  expect((await draft(page)).placed).toEqual(before.placed);
  expect((await draft(page)).id).toBe(before.id);
  await upload(page, serializeBackup({ ...before, name: 'Replacement' }));
  await expect(dialog.getByText('Replacement', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await draft(page)).placed).toEqual(before.placed);
  await expect(page.getByRole('button', { name: 'Rename design Keep This' })).toBeVisible();
});
