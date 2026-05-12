import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Permite tuneis Cloudflare (dev.appbr.pro etc.) acessarem o Vite dev server.
      // Sem isso, o Vite bloqueia hosts externos por seguranca (CVE-2025-31486).
      allowedHosts: ['dev.appbr.pro', '.appbr.pro', '.trycloudflare.com', 'localhost'],
    },
  };
});
