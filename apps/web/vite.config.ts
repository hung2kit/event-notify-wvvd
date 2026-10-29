import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const apiOrigin = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/health': apiOrigin,
      '/api': apiOrigin,
    },
  },
});
