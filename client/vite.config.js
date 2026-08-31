import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const clientApiUrl = mode === 'development' ? '' : (env.API_URL || '')

  return {
    plugins: [react()],
    define: {
      'import.meta.env.API_URL': JSON.stringify(clientApiUrl),
    },
    server: {
      proxy: {
        '/api': {
          target: env.API_URL,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})