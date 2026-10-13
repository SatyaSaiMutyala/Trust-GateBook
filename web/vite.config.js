import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The dev server proxies the API and Socket.IO to the backend so the app can use
// relative URLs (VITE_API_URL empty). Override the target with API_PROXY_TARGET.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://localhost:4000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, changeOrigin: true, ws: true },
      },
    },
    preview: {
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, changeOrigin: true, ws: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
