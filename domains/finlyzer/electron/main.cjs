const path = require('node:path')
const { app, BrowserWindow, shell, session } = require('electron')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const rendererUrl = process.env.VITE_DEV_SERVER_URL
const rendererIndexFile = path.join(__dirname, '..', 'dist', 'index.html')
const preloadFile = path.join(__dirname, 'preload.cjs')
const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === '1'
const remoteDebuggingPort = process.env.ELECTRON_REMOTE_DEBUGGING_PORT

if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

if (isDev) {
  app.disableHardwareAcceleration()
}

function getContentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "connect-src 'self'",
  ]

  if (isDev && rendererUrl) {
    const rendererOrigin = new URL(rendererUrl)
    const wsProtocol = rendererOrigin.protocol === 'https:' ? 'wss:' : 'ws:'
    const connectSrc = [
      "'self'",
      rendererOrigin.origin,
      `${wsProtocol}//${rendererOrigin.host}`,
    ]
    directives[directives.length - 1] = `connect-src ${connectSrc.join(' ')}`
  }

  return directives.join('; ')
}

function installContentSecurityPolicy() {
  const contentSecurityPolicy = getContentSecurityPolicy()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    })
  })
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f6f7f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && rendererUrl) {
    window.loadURL(rendererUrl)
    if (shouldOpenDevTools) {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    return window
  }

  window.loadFile(rendererIndexFile)
  return window
}

app.whenReady().then(() => {
  installContentSecurityPolicy()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})