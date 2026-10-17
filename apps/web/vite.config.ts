import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command, mode }) => {
  // The API/test process may export NODE_ENV=development or test. A production
  // browser build must still resolve React and its JSX runtime in production.
  if (command === 'build' && mode === 'production') process.env.NODE_ENV = 'production';
  const envDir = fileURLToPath(new URL('../..', import.meta.url));
  const publicEnv = loadEnv(mode, envDir, 'VITE_');
  // Backend NODE_ENV must not change Vite's selected development/production mode.
  delete process.env.VITE_USER_NODE_ENV;
  const keys = Object.keys(publicEnv);
  // loadEnv creates this internal marker when the shared .env declares NODE_ENV.
  if (keys.some((key) => key !== 'VITE_API_BASE_URL' && key !== 'VITE_USER_NODE_ENV'))
    throw new Error('Only VITE_API_BASE_URL may be exposed to the browser');
  const apiPath = publicEnv.VITE_API_BASE_URL ?? '/api/v1';
  if (!/^\/api\/v1\/?$/.test(apiPath))
    throw new Error('VITE_API_BASE_URL must be the same-origin /api/v1 path');
  return {
    plugins: [react(), tailwindcss()],
    // Values are validated above and explicitly injected; do not reload backend env.
    envDir: false,
    envPrefix: 'VITE_API_BASE_URL',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiPath) },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api':
          process.env.DRIVEHIRE_E2E === '1' ? 'http://127.0.0.1:4002' : 'http://127.0.0.1:4000',
      },
    },
    build: { sourcemap: false },
  };
});
