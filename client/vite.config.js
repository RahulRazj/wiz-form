import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const clientRoot = path.dirname(fileURLToPath(import.meta.url))
  const env = loadEnv(mode, clientRoot, '')
  const clientApiUrl = mode === 'development' ? '' : (env.API_URL || '')
  const advanceAmountMin = Number.parseInt(env.ADVANCE_AMOUNT_MIN || '200', 10)
  const advanceAmountMax = Number.parseInt(env.ADVANCE_AMOUNT_MAX || '100000', 10)
  const proxyTarget = env.API_URL || 'http://localhost:3000'

  return {
    plugins: [react()],
    envDir: clientRoot,
    define: {
      'import.meta.env.API_URL': JSON.stringify(clientApiUrl),
      'import.meta.env.ADVANCE_AMOUNT_MIN': JSON.stringify(Number.isFinite(advanceAmountMin) && advanceAmountMin > 0 ? advanceAmountMin : 200),
      'import.meta.env.ADVANCE_AMOUNT_MAX': JSON.stringify(Number.isFinite(advanceAmountMax) && advanceAmountMax > 0 ? advanceAmountMax : 100000),
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