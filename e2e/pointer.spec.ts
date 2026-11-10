import { expect, test } from './fixtures';

test('keeps pointer coordinates consistent while frames are captured', async ({ page }) => {
  await page.setContent('<main>Pointer coordinate check</main>');
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.evaluate(() => {
    document.addEventListener('pointerdown', (event) => {
      (window as unknown as { pointerCheck: { x: number; y: number } }).pointerCheck = {
        x: event.clientX,
        y: event.clientY,
      };
    });
  });
  for (let i = 0; i < 12; i += 1) {
    const x = (size.width * ((i % 3) + 1)) / 4;
    const y = (size.height * ((i % 3) + 1)) / 4;
    await page.mouse.click(x, y);
    const received = await page.evaluate(
      () => (window as unknown as { pointerCheck: { x: number; y: number } }).pointerCheck,
    );
    // The installed extension can add a few pixels of cursor jitter.
    expect(Math.abs(received.x - x)).toBeLessThan(4);
    expect(Math.abs(received.y - y)).toBeLessThan(4);
  }
});
