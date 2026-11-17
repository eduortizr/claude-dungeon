import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{server,web,plugin,shared}/**/*.test.{ts,mjs}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
