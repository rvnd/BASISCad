import { spawnSync } from 'node:child_process';
import { build } from 'vite';

const large = process.argv.includes('--large');
const profile = process.argv.includes('--profile');
const label = process.argv.slice(2).find((argument) => !argument.startsWith('--')) || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple alphanumeric report label.');
// Timings and CPU profiles are separate runs to avoid profiling overhead.
await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: large ? 'scripts/benchmark-large-designs.ts' : 'scripts/benchmark-interactions.ts',
    outDir: 'tmp/performance',
    emptyOutDir: false,
    rolldownOptions: { output: { entryFileNames: 'benchmark.mjs' } },
  },
});
const result = spawnSync(
  process.execPath,
  [
    ...(profile
      ? ['--cpu-prof', '--cpu-prof-dir=tmp/performance', `--cpu-prof-name=${label}.cpuprofile`]
      : []),
    'tmp/performance/benchmark.mjs',
    label,
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
