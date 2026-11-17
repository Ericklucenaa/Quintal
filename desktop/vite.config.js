import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Content-Security-Policy for production builds (desktop app and web). The dev
// server is left without it so Vite's HMR keeps working.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://apis.google.com https://www.gstatic.com https://www.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // blob: o GLTFLoader decodifica as texturas embutidas nos .glb dos avatares a partir de URLs blob: criadas pelo
  // próprio app; sem isso a CSP bloqueia as texturas e o corpo dos avatares não aparece (1.4.0).
  "connect-src 'self' blob: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.web.app https://tenor.googleapis.com https://www.google.com",
  // 'self' e o Hosting: o player da Vitrola (music-player.html) roda num iframe; sem isso ficava em branco (1.4.x).
  "frame-src 'self' https://concord-3af70.web.app https://*.firebaseapp.com https://accounts.google.com https://www.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const cspPlugin = {
  name: 'concord-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace(
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
  )
};

export default defineConfig({
  plugins: [react(), cspPlugin],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Vendor code changes rarely; separate chunks stay cached between releases.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom'],
          icons: ['lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 900
  }
});
