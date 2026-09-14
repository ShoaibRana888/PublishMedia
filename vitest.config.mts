import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const emptyModule = fileURLToPath(new URL('./test/empty-module.ts', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      'server-only': emptyModule,
      'client-only': emptyModule,
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
