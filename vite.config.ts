import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/toast.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
        onboarding: resolve(__dirname, 'src/onboarding/index.html'),
        settings: resolve(__dirname, 'src/settings/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
      }
    }
  }
})
