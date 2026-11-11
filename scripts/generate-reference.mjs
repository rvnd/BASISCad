import { spawnSync } from 'node:child_process';
import { build } from 'vite';

await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: 'scripts/generate-reference.ts',
    outDir: 'tmp/reference',
    rolldownOptions: { output: { entryFileNames: 'generate.mjs' } },
  },
});
process.exitCode =
  spawnSync(process.execPath, ['tmp/reference/generate.mjs'], {
    stdio: 'inherit',
  }).status ?? 1;
