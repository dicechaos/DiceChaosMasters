import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  assetsInclude: ['**/*.wasm', '**/*.ttf', '**/*.otf'],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 180000,
  },
});
