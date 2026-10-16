import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../..', import.meta.url));
  const publicEnv = loadEnv(mode, envDir, 'VITE_');
  const keys = Object.keys(publicEnv);
  if (keys.some((key) => key !== 'VITE_API_BASE_URL'))
    throw new Error('Only VITE_API_BASE_URL may be exposed to the browser');
  const apiPath = publicEnv.VITE_API_BASE_URL ?? '/api/v1';
  if (!/^\/api\/v1\/?$/.test(apiPath))
    throw new Error('VITE_API_BASE_URL must be the same-origin /api/v1 path');
  return {
    plugins: [react(), tailwindcss()],
    envDir,
    server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4000' } },
    build: { sourcemap: false },
  };
});
