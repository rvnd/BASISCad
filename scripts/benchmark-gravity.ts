import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { loadFixtureLibrary, performanceDesign } from './designFixtures';
import { prepareGravityInput } from '../src/three/gravityInput';
import { GravityWorld, initializeGravity } from '../src/three/gravityWorld';
import { GRAVITY_STEP_SECONDS } from '../src/app/gravity';

await initializeGravity();
const library = loadFixtureLibrary();
const rows = [];
const samples = 120;
for (const items of [2, 20, 50, 100]) {
  for (const scenario of ['supported', 'raised'] as const) {
    const placed = performanceDesign(items, library).map((piece) => ({
      ...piece,
      position: { ...piece.position, y: piece.position.y + (scenario === 'raised' ? 100 : 0) },
    }));
    const input = prepareGravityInput(placed, library, 9.81);
    const begin = performance.now(),
      world = new GravityWorld(input);
    const prepareMs = performance.now() - begin;
    try {
      const steps = [];
      for (let i = 0; i < samples; i++) {
        const start = performance.now();
        world.step();
        steps.push(performance.now() - start);
      }
      steps.sort((a, b) => a - b);
      rows.push({
        items,
        scenario,
        ...world.summary,
        prepareMs,
        samples,
        simulatedSeconds: samples * GRAVITY_STEP_SECONDS,
        stepMedianMs: steps[Math.floor(samples / 2)],
        stepP95Ms: steps[Math.floor(samples * 0.95)],
        stepMaxMs: steps.at(-1),
        awakeAtEnd: world.frame().awake,
      });
    } finally {
      world.dispose();
    }
  }
}
const report = {
  runtime: process.version,
  cpu: cpus()[0]?.model,
  stepsPerSecond: 1 / GRAVITY_STEP_SECONDS,
  rows,
};
console.table(rows);
writeFileSync(
  `tmp/performance/${process.argv[2] || 'gravity'}.json`,
  JSON.stringify(report, null, 2) + '\n',
);
