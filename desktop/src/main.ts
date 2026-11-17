/**
 * Claude Dungeon as a desktop app: one window with the map and a tray icon,
 * with the server running inside the app. The Claude Code hooks keep posting
 * to http://127.0.0.1:4747, so nothing changes on the plugin side.
 *
 * Closing the window hides it to the tray (the server must stay up to keep
 * receiving events); "Sair" in the tray menu quits for real.
 */
import { join } from 'node:path'
import { BrowserWindow, Menu, Tray, app, nativeImage, shell } from 'electron'
import { startServer, type RunningServer } from '../../server/src/app'
import { resolveMarketDir } from '../../server/src/market'

const PORT = Number(process.env.PORT ?? 4747)
const MAP_URL = `http://127.0.0.1:${PORT}/`
/** Passed by the login item: start in the tray, without opening the window. */
const STARTED_HIDDEN = process.argv.includes('--hidden')

let window: BrowserWindow | undefined
let tray: Tray | undefined
let server: RunningServer | undefined
let isQuitting = false

function asset(name: string): string {
  return join(__dirname, '..', 'assets', name)
}

/** The built map: next to the app once installed, in the repository while developing. */
function webDist(): string {
  return app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '..', '..', 'web', 'dist')
}

async function startEmbeddedServer(): Promise<string | undefined> {
  try {
    const dataDir = app.getPath('userData')
    server = await startServer({
      port: PORT,
      dataFile: join(dataDir, 'world.json'),
      webDist: webDist(),
      marketDir: await resolveMarketDir(dataDir),
    })
    return undefined
  } catch (error) {
    // Another Claude Dungeon (npm run dev, say) already serves the port: show its map.
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') return 'usando o servidor que já está rodando'
    throw error
  }
}

function createWindow(note?: string): void {
  window = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 720,
    minHeight: 480,
    title: note ? `Claude Dungeon (${note})` : 'Claude Dungeon',
    backgroundColor: '#120d16',
    icon: asset('icon.png'),
    autoHideMenuBar: true,
    show: !STARTED_HIDDEN,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  void window.loadURL(MAP_URL)

  // Links (the README, GitHub) open in the browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.on('close', event => {
    if (isQuitting) return
    event.preventDefault()
    window?.hide()
  })
}

function showWindow(): void {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(asset('tray.png')))
  tray.setToolTip('Claude Dungeon')
  const startsWithWindows = () => app.getLoginItemSettings().openAtLogin
  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Abrir o mapa', click: showWindow },
      { label: 'Abrir no navegador', click: () => void shell.openExternal(MAP_URL) },
      { type: 'separator' },
      {
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        checked: startsWithWindows(),
        click: item => {
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] })
          tray?.setContextMenu(buildMenu())
        },
      },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
  tray.setContextMenu(buildMenu())
  tray.on('click', showWindow)
}

// One app at a time: opening it again brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('window-all-closed', () => {
    // Stay in the tray: the server keeps receiving events.
  })
  app.on('before-quit', () => {
    isQuitting = true
  })
  app.on('will-quit', event => {
    if (!server) return
    event.preventDefault()
    const closing = server
    server = undefined
    void closing.close().finally(() => app.quit())
  })

  void app.whenReady().then(async () => {
    const note = await startEmbeddedServer()
    createWindow(note)
    createTray()
  })
}
