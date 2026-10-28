import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { host: true, allowedHosts: true, proxy: { '/api': 'http://localhost:3000' } },
});
