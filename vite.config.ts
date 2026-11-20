import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The IDE proxy serves this app under /absproxy/5173/ (prefix is preserved).
  base: '/absproxy/5173/',
  server: {
    port: 5173,
    // Only allow the IDE's CloudFront host, not every host.
    allowedHosts: ['d149s395dq6r7g.cloudfront.net'],
    // HMR websocket must go through the public HTTPS port, not 5173.
    hmr: { protocol: 'wss', clientPort: 443 },
  },
})
