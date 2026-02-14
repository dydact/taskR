import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const useHttps = process.env.VITE_DEV_HTTPS === '1' || process.env.VITE_DEV_HTTPS === 'true';
const TASKR_PROXY_TARGET = process.env.VITE_TASKR_API || process.env.TASKR_API_URL || 'http://localhost:8010';

export default defineConfig({
  plugins: useHttps ? [react(), basicSsl()] : [react()],
  server: {
    https: useHttps,
    host: true,
    port: 5173,
    strictPort: false,
    hmr: useHttps
      ? { protocol: 'wss', host: 'localhost' }
      : { protocol: 'ws', host: 'localhost' },
    proxy: {
      '^/(analytics|dashboards|spaces|tasks|lists|folders|comments|user-preferences|subtasks|preferences|docs|events|health|chat|summaries|hr)': {
        target: TASKR_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@dydact/control-center")) {
            return "dydact-control-center";
          }
          if (id.includes("node_modules/@copilotkit")) {
            return "copilotkit";
          }
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react")) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: true,
  },
});
