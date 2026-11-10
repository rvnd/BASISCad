import type { Page, CDPSession } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

async function start(page: Page) {
  await page.goto(appUrl);
  await page.getByRole('dialog').getByLabel('Design name').fill('Tablet Check');
  await page.getByRole('button', { name: 'Start Design' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: '1x6 Girder' })
    .getByRole('button', { name: 'Place' })
    .click();
}

async function pieces(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('basiscad.recovery.v1') ?? 'null').placed,
  );
}

async function drag(
  page: Page,
  cdp: CDPSession,
  name: string,
  dx: number,
  dy: number,
  releaseLeftEarly = false,
) {
  const button = page
    .getByRole('region', { name: 'Tablet axis controls' })
    .getByRole('button', { name, exact: true });
  const box = await button.boundingBox(),
    canvas = await page.locator('.viewport canvas').boundingBox();
  if (!box || !canvas) throw new Error('Tablet gesture targets are missing');
  const left = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const right = { id: 2, x: canvas.x + canvas.width * 0.18, y: canvas.y + canvas.height * 0.4 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [left, { ...right, x: right.x + (dx * i) / 6, y: right.y + (dy * i) / 6 }],
    });
    if (name.startsWith('Rotate')) {
      const axis = name.at(-1)!.toLowerCase();
      await expect
        .poll(async () => Math.abs((await pieces(page))[0].rotation[axis] % 22.5))
        .toBe(0);
    }
  }
  if (releaseLeftEarly) {
    const endpoint = { ...right, x: right.x + dx, y: right.y + dy };
    // Chrome releases the explicitly listed point; the other finger stays down.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [left] });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...endpoint, x: endpoint.x + 40 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
}

test('desktop input shows no tablet axis buttons', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('region', { name: 'Tablet axis controls' })).toHaveCount(0);
});

test('two touches rotate Z through 180 degrees and move each axis independently with one-step undo', async ({
  page,
}, testInfo) => {
  test.setTimeout(process.env.PLAYWRIGHT_RELAY_URL ? 120_000 : 60_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  try {
    await start(page);
    const controls = page.getByRole('region', { name: 'Tablet axis controls' });
    await expect(controls).toBeVisible();
    await expect(controls.getByRole('button')).toHaveCount(6);
    const baseline = await pieces(page);
    await drag(page, cdp, 'Rotate Z', 360, 0, true);
    await expect.poll(async () => Math.abs((await pieces(page))[0].rotation.z)).toBeCloseTo(180, 4);
    const turned = await pieces(page);
    expect(turned[0].rotation.x).toBe(baseline[0].rotation.x);
    expect(turned[0].rotation.y).toBe(baseline[0].rotation.y);
    expect(turned[0].position.y).toBeGreaterThanOrEqual(0);
    await testInfo.attach('tablet-two-hand-rotation', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => pieces(page)).toEqual(baseline);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(() => pieces(page)).toEqual(turned);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: /Camera view:/ }).click();
    await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
    for (const [axis, dx, dy] of [
      ['x', 40, 0],
      ['y', 0, -40],
      ['z', 0, 40],
    ] as const) {
      await drag(page, cdp, `Move ${axis.toUpperCase()}`, dx, dy);
      await expect
        .poll(async () => (await pieces(page))[0].position[axis])
        .toBeGreaterThan(baseline[0].position[axis]);
      const moved = (await pieces(page))[0];
      for (const other of ['x', 'y', 'z'] as const) {
        if (other !== axis) expect(moved.position[other]).toBe(baseline[0].position[other]);
      }
      expect(moved.rotation).toEqual(baseline[0].rotation);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect.poll(() => pieces(page)).toEqual(baseline);
    }
    for (const axis of ['x', 'y'] as const) {
      await drag(page, cdp, `Rotate ${axis.toUpperCase()}`, 37, 0);
      await expect.poll(async () => (await pieces(page))[0].rotation[axis]).toBeCloseTo(22.5, 4);
      const rotated = (await pieces(page))[0];
      for (const other of ['x', 'y', 'z'] as const) {
        if (other !== axis) expect(rotated.rotation[other]).toBe(baseline[0].rotation[other]);
      }
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect.poll(() => pieces(page)).toEqual(baseline);
    }
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    for (const button of await controls.getByRole('button').all())
      await expect(button).toBeDisabled();
  } finally {
    await cdp
      .send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      .catch(() => undefined);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  }
});
