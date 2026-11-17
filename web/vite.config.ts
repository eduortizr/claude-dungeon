import { defineConfig } from 'vite'

// In dev, the map runs on Vite (:5173) and proxies the server's routes, so the
// page uses the same relative URLs as when the server serves the built map.
export default defineConfig({
  build: { target: 'es2022' }, // main.ts awaits the tileset at the top level
  server: {
    port: 5173,
    proxy: {
      '/stream': 'http://127.0.0.1:4747',
      '/state': 'http://127.0.0.1:4747',
      '/events': 'http://127.0.0.1:4747',
    },
  },
})
