import { spawnSync } from 'node:child_process';
import { build } from 'vite';

// Bundle the same TypeScript geometry used by the website, then profile it
// without browser automation or transport time skewing the measurements.
await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: 'scripts/benchmark-interactions.ts',
    outDir: 'tmp/performance',
    emptyOutDir: false,
    rolldownOptions: { output: { entryFileNames: 'benchmark.mjs' } },
  },
});
const label = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple alphanumeric report label.');
const result = spawnSync(
  process.execPath,
  [
    '--cpu-prof',
    '--cpu-prof-dir=tmp/performance',
    `--cpu-prof-name=${label}.cpuprofile`,
    'tmp/performance/benchmark.mjs',
    label,
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
