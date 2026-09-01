import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const clientRoot = path.dirname(fileURLToPath(import.meta.url))
  const env = loadEnv(mode, clientRoot, '')
  const clientApiUrl = mode === 'development' ? '' : (env.API_URL || '')
  const proxyTarget = env.API_URL || 'http://localhost:3000'

  return {
    plugins: [react()],
    envDir: clientRoot,
    define: {
      'import.meta.env.API_URL': JSON.stringify(clientApiUrl),
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})