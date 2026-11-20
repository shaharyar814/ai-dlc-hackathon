import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // The IDE proxy serves the dev server under /absproxy/5173/ (prefix is preserved).
  // The production build is served from the site root (S3 and CloudFront).
  base: command === 'build' ? '/' : '/absproxy/5173/',
  server: {
    port: 5173,
    // Only allow the IDE's CloudFront host, not every host.
    allowedHosts: ['d149s395dq6r7g.cloudfront.net'],
    // HMR websocket must go through the public HTTPS port, not 5173.
    hmr: { protocol: 'wss', clientPort: 443 },
  },
}))
