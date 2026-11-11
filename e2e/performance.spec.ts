import * as THREE from 'three';
import { appUrl, expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { loadFixtureLibrary, performanceDesign } from '../scripts/designFixtures';
import { serializeBackup } from '../src/app/projectBackup';
import { createFramingCamera } from '../src/three/workplane';
import { getCameraView } from '../src/three/cameraViews';

interface Metrics {
  draws: number;
  buffers: number;
  inputMs: number[];
  framesMs: number[];
}
async function frames(page: Page, count = 2) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const next = () => {
          if (--count === 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}
async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => (window as unknown as { cadMetrics: Metrics }).cadMetrics);
}
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
}

for (const count of [2, 20, 50, 100])
  test(`${count}-item design redraws edits, preserves undo and releases buffers after repeated add/remove`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(process.env.PLAYWRIGHT_RELAY_URL ? 240_000 : 90_000);
    await page.addInitScript(() => {
      const result: Metrics = { draws: 0, buffers: 0, inputMs: [], framesMs: [] };
      (window as unknown as { cadMetrics: Metrics }).cadMetrics = result;
      const buffers = new Set<WebGLBuffer>(),
        proto = WebGL2RenderingContext.prototype;
      const create = proto.createBuffer,
        remove = proto.deleteBuffer;
      proto.createBuffer = function () {
        const buffer = create.call(this);
        if (buffer) buffers.add(buffer);
        result.buffers = buffers.size;
        return buffer;
      };
      proto.deleteBuffer = function (buffer) {
        if (buffer) buffers.delete(buffer);
        result.buffers = buffers.size;
        remove.call(this, buffer);
      };
      let input: number | null = null,
        frameTime = 0,
        lastFrame = -1;
      const raf = requestAnimationFrame;
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          frameTime = time;
          callback(time);
        });
      document.addEventListener(
        'pointermove',
        (event) => {
          if (event.isTrusted && event.buttons && event.target instanceof HTMLCanvasElement)
            input = performance.now();
        },
        true,
      );
      const rendered = () => {
        result.draws++;
        if (frameTime === lastFrame) return;
        const pending = input;
        input = null;
        if (lastFrame > 0) result.framesMs.push(frameTime - lastFrame);
        lastFrame = frameTime;
        raf(() => {
          if (pending !== null) result.inputMs.push(performance.now() - pending);
        });
      };
      const arrays = proto.drawArrays,
        elements = proto.drawElements;
      proto.drawArrays = function (...args: Parameters<typeof arrays>) {
        rendered();
        return arrays.apply(this, args);
      };
      proto.drawElements = function (...args: Parameters<typeof elements>) {
        rendered();
        return elements.apply(this, args);
      };
    });
    const library = loadFixtureLibrary(),
      placed = performanceDesign(count, library);
    await page.goto(appUrl);
    await page.getByRole('button', { name: 'Open Backup', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Open backup', exact: true });
    await dialog.getByLabel('Backup file').setInputFiles({
      name: 'performance.basiscad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        serializeBackup({
          id: 'performance',
          name: `Performance ${count}`,
          updatedAt: 1,
          placed,
        }),
      ),
    });
    await dialog.getByRole('button', { name: 'Open backup', exact: true }).click();
    await expect(page.locator('.library-status-ready')).toHaveCount(17);
    await page.getByRole('button', { name: /Camera view:/ }).click();
    await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
    await frames(page, 5);
    const canvas = await page.locator('.viewport canvas').boundingBox();
    if (!canvas) throw new Error('Missing workplane');
    const camera = createFramingCamera(canvas.width / canvas.height),
      view = getCameraView('top')!;
    camera.position.set(...view.position);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const point = (x: number) => {
      const p = new THREE.Vector3(x, 1.5, 350).project(camera);
      return {
        x: canvas.x + ((p.x + 1) * canvas.width) / 2,
        y: canvas.y + ((1 - p.y) * canvas.height) / 2,
      };
    };
    const start = point(400),
      end = point(440);
    await page.mouse.click(start.x, start.y);
    await expect(page.getByLabel('X in mm', { exact: true })).toBeVisible();
    await frames(page, 5);
    const idle = await metrics(page);
    await frames(page, 5);
    expect((await metrics(page)).draws).toBe(idle.draws);
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed,
    );
    await page.evaluate(() => {
      const m = (window as unknown as { cadMetrics: Metrics }).cadMetrics;
      m.inputMs = [];
      m.framesMs = [];
    });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 120; i++) {
      await page.mouse.move(
        start.x + ((end.x - start.x) * i) / 120,
        start.y + ((end.y - start.y) * i) / 120,
      );
      await frames(page);
    }
    await page.mouse.up();
    await frames(page);
    const measured = await metrics(page);
    expect(measured.draws).toBeGreaterThan(idle.draws);
    await expect
      .poll(() => page.getByLabel('X in mm', { exact: true }).inputValue())
      .not.toBe('400');
    // Latency is reported, not gated on shared CI machines or relay transport.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await frames(page);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed),
    ).toEqual(before);
    await page.evaluate(() => {
      (window as unknown as { cadMetrics: Metrics }).cadMetrics.framesMs = [];
    });
    const orbit = { x: canvas.x + 25, y: canvas.y + 25 };
    await page.mouse.move(orbit.x, orbit.y);
    await page.mouse.down();
    for (let i = 1; i <= 32; i++) {
      await page.mouse.move(orbit.x + i * 3, orbit.y + i / 2);
      await frames(page, 1);
    }
    await page.mouse.up();
    await frames(page, 5);
    const orbitFrames = (await metrics(page)).framesMs;
    const bufferBaseline = (await metrics(page)).buffers;
    const place = page
      .getByRole('listitem')
      .filter({ hasText: '1x4 Girder' })
      .getByRole('button', { name: 'Place', exact: true });
    for (let i = 0; i < 5; i++) {
      await place.click();
      await frames(page);
      await page.getByRole('button', { name: '🗑 Remove from design', exact: true }).click();
      await frames(page);
    }
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('basiscad.recovery.v1')!).placed),
    ).toEqual(before);
    expect((await metrics(page)).buffers).toBeLessThanOrEqual(bufferBaseline);
    const environment = await page.evaluate(() => {
      const gl = document.querySelector('canvas')!.getContext('webgl2')!,
        debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        pixelRatio: devicePixelRatio,
        cores: navigator.hardwareConcurrency,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      };
    });
    await testInfo.attach('performance-measurements', {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify(
          {
            items: count,
            ...environment,
            method: 'trusted pointer event to next animation-frame callback after WebGL submission',
            relay: Boolean(process.env.PLAYWRIGHT_RELAY_URL),
            samples: measured.inputMs.length,
            inputMedianMs: percentile(measured.inputMs, 0.5),
            inputP95Ms: percentile(measured.inputMs, 0.95),
            orbitFrameMedianMs: percentile(orbitFrames, 0.5),
            orbitFrameP95Ms: percentile(orbitFrames, 0.95),
            buffersBefore: bufferBaseline,
            buffersAfter: (await metrics(page)).buffers,
          },
          null,
          2,
        ),
      ),
    });
  });
