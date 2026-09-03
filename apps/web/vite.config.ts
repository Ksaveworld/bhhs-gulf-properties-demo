import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: Number(process.env.BHHS_WEB_PORT || 5173), strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.BHHS_API_PORT || 8001}` },
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/data/private/**', '**/data/incoming/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8001' } },
});
