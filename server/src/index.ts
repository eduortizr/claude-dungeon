/** Runs the server from the repository (`npm run dev` / `npm start`). The desktop app embeds `startServer` instead. */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from './app'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const server = await startServer({
  port: Number(process.env.PORT ?? 4747),
  dataFile: join(root, 'data', 'world.json'),
  webDist: join(root, 'web', 'dist'),
})
console.log(`⚔  Claude Dungeon server on ${server.url}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
