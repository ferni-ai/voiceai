# Electron Desktop App

Cross-platform desktop application for Ferni Voice AI (macOS, Windows, Linux).

## Purpose

Native desktop experience wrapping the web frontend with Electron, providing system tray integration, persistent settings, and full WebRTC/LiveKit support.

## Key Files

```
apps/electron/
├── main.js           # Main process (window management, IPC)
├── preload.js        # Preload script (secure API bridge)
├── package.json      # Dependencies & build config
├── resources/        # App icons and entitlements
│   ├── icon.icns     # macOS icon
│   ├── icon.ico      # Windows icon
│   ├── icon.png      # Linux/tray icon
│   └── entitlements.mac.plist
└── web/              # Built frontend (from apps/web/dist)
```

## Build & Run

```bash
cd apps/electron
npm install

# Development (connects to Vite dev server)
# First start: cd ../web && pnpm dev
npm start

# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac
npm run build:win
npm run build:linux
```

## Output

Built apps in `dist/`:
- **macOS**: `.dmg` and `.zip` (universal binary)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` and `.deb`

## Security

- **Context Isolation**: Enabled
- **Node Integration**: Disabled
- **Preload Script**: Carefully exposes only necessary APIs
- **Hardened Runtime**: Enabled for macOS

## Code Signing

### macOS
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
export APPLE_ID=your-apple-id
export APPLE_ID_PASSWORD=app-specific-password
npm run build:mac
```

### Windows
```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your-password
npm run build:win
```

## Features

- System tray integration
- Window bounds persistence
- System theme sync (dark/light)
- WebRTC/LiveKit voice support
- Microphone permissions handling
