import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3000';
  const apiProxy = { target: apiTarget, changeOrigin: true };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': apiProxy,
        '/auth': apiProxy,
        '/users': apiProxy,
        '/my-teams': apiProxy,
      },
    },
  };
});
