import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Stellt die Vercel-Funktionen aus api/ auch im lokalen Entwicklungsserver bereit. */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/product-info', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/product-info.ts')
        const response: Response = await mod.default.fetch(new Request(new URL(req.originalUrl ?? '/', 'http://localhost')))
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
})
