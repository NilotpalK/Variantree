import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss() as any],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      // Point @variantree/core directly at the TypeScript source
      // so Vite transpiles it on-the-fly — no build step needed
      '@variantree/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
