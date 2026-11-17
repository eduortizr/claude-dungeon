/** Runs the server from the repository (`npm run dev` / `npm start`). The desktop app embeds `startServer` instead. */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from './app'
import { resolveMarketDir } from './market'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const dataDir = join(root, 'data')
const server = await startServer({
  port: Number(process.env.PORT ?? 4747),
  dataFile: join(dataDir, 'world.json'),
  webDist: join(root, 'web', 'dist'),
  marketDir: await resolveMarketDir(dataDir),
})
console.log(`⚔  Claude Dungeon server on ${server.url}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
