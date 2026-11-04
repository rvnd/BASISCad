import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
//
// base '/BASISCad/' is the GitHub Pages project-site path:
// the app is served from https://rvnd.github.io/BASISCad/, so every
// built asset URL must be prefixed with it. Local `vite dev` ignores
// base for the dev server, so this only affects `vite build` output.
export default defineConfig({
  base: '/BASISCad/',
  plugins: [react()],
});
