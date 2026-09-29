/**
 * Voice AI Desktop - Electron Main Process
 * 
 * This is the main entry point for the Electron desktop application.
 * It creates the browser window and manages application lifecycle.
 */

const { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// ============================================================================
// SENTRY ERROR TRACKING
// ============================================================================
const Sentry = require('@sentry/electron/main');

// Initialize Sentry for error tracking (replace DSN with your project's DSN)
// Get your DSN from: https://sentry.io/settings/projects/YOUR_PROJECT/keys/
const SENTRY_DSN = process.env.SENTRY_DSN || '';

// Production loads the hosted web app: its API calls are relative (/api, /token,
// /spotify...) and Firebase Auth needs an authorised https origin, neither of
// which works from file://. The bundled build is only an offline fallback.
const APP_URL = process.env.FERNI_APP_URL || 'https://app.ferni.ai';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: app.isPackaged ? 'production' : 'development',
    release: `voiceai-desktop@${app.getVersion()}`,
    // Performance monitoring
    tracesSampleRate: 0.2, // 20% of transactions
    // Only send errors in production
    enabled: app.isPackaged,
  });
  console.log('✅ Sentry initialized for error tracking');
} else {
  console.log('ℹ️ Sentry DSN not configured - error tracking disabled');
}

// Persistent store. electron-store >= 9 is ESM-only, so it can't be require()d
// from this CommonJS entry point; it's loaded via import() once the app is ready.
let store = null;

async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store({
    name: 'voiceai-settings',
    defaults: {
      windowBounds: { width: 1200, height: 800 },
      alwaysOnTop: false,
      startMinimized: false,
    }
  });
}

/**
 * Open a URL in the system browser. Only http(s) is allowed: handing file:,
 * smb: or custom-protocol URLs from the renderer to the OS can execute code.
 */
function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') {
      shell.openExternal(url);
    }
  } catch {
    // Malformed URL - ignore
  }
}

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;

// Check if we're in development mode
const isDev = !app.isPackaged;

/**
 * Create the main application window
 */
function createWindow() {
  const { width, height, x, y } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 400,
    minHeight: 600,
    title: 'Voice AI',
    icon: path.join(__dirname, 'resources', 'icon.png'),
    backgroundColor: '#0d0d1a', // Match app background
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // The sandboxed preload can't read package.json / app.getVersion()
      additionalArguments: [`--app-version=${app.getVersion()}`],
      // Enable Web Audio API and WebRTC
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false, // Don't show until ready
  });

  // Handle window ready to show
  mainWindow.once('ready-to-show', () => {
    if (!store.get('startMinimized')) {
      mainWindow.show();
    }
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:3004');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(APP_URL);
    // Offline: fall back to the bundled build once (it can't reach the API)
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, _desc, url) => {
      if (url.startsWith(APP_URL) && errorCode !== -3 /* ERR_ABORTED */) {
        mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
      }
    });
  }

  // Save window bounds on resize/move
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle minimize to tray on macOS
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

/**
 * Save window bounds to store
 */
function saveWindowBounds() {
  if (mainWindow) {
    store.set('windowBounds', mainWindow.getBounds());
  }
}

/**
 * Create system tray icon
 */
function createTray() {
  const trayIcon = path.join(__dirname, 'resources', process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png');
  
  // Check if tray icon exists
  const fs = require('fs');
  if (!fs.existsSync(trayIcon)) {
    console.warn('Tray icon not found:', trayIcon);
    return; // Skip tray creation if icon is missing
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip('Voice AI');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Voice AI',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: store.get('alwaysOnTop'),
      click: (menuItem) => {
        store.set('alwaysOnTop', menuItem.checked);
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(menuItem.checked);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon shows window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: store.get('alwaysOnTop'),
          click: (menuItem) => {
            store.set('alwaysOnTop', menuItem.checked);
            if (mainWindow) {
              mainWindow.setAlwaysOnTop(menuItem.checked);
            }
          }
        },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://voiceai.app');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

// Handle theme sync with system
ipcMain.handle('get-system-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('get-store-value', (event, key) => {
  return store.get(key);
});

ipcMain.handle('set-store-value', (event, key, value) => {
  store.set(key, value);
});

// Renderer errors are forwarded here: the sandboxed preload can't load Sentry
ipcMain.on('report-error', (event, error, context) => {
  if (!SENTRY_DSN) return;
  const err = new Error(error && error.message ? error.message : String(error));
  if (error && error.stack) err.stack = error.stack;
  Sentry.captureException(err, { extra: context });
});

// ============================================================================
// APP LIFECYCLE
// ============================================================================

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      // The window may be hidden (macOS close-to-tray, startMinimized)
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // App ready (only for the primary instance - a second instance must not
  // create its own window/tray before quitting)
  app.whenReady().then(onReady).catch((error) => {
    console.error('Failed to start Voice AI:', error);
    app.quit();
  });
}

async function onReady() {
  await initStore();
  createWindow();
  createTray();
  createMenu();

  // Apply always on top setting
  if (mainWindow && store.get('alwaysOnTop')) {
    mainWindow.setAlwaysOnTop(true);
  }

  // Listen for system theme changes
  nativeTheme.on('updated', () => {
    if (mainWindow) {
      mainWindow.webContents.send('system-theme-changed', 
        nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
      );
    }
  });
}

// macOS: Re-create window when dock icon clicked
app.on('activate', () => {
  // 'activate' can fire before the store is initialised on first launch
  if (!store) return;
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle before quit
app.on('before-quit', () => {
  app.isQuitting = true;
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    // Only allow navigation to the app's own pages
    const appRoots = isDev
      ? ['http://localhost:3004']
      : [`${new URL(APP_URL).origin}/`, pathToFileURL(path.join(__dirname, 'web')).href];
    if (!appRoots.some((root) => navigationUrl.startsWith(root))) {
      event.preventDefault();
      openExternalSafe(navigationUrl);
    }
  });
});

