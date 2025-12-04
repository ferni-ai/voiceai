# Voice AI Desktop (Electron)

Native desktop application for Voice AI, built with Electron.

## Features

- 🖥️ Native desktop experience on macOS, Windows, and Linux
- 🎙️ Full WebRTC/LiveKit support for voice conversations
- 🔒 Secure context isolation
- 📌 System tray integration
- 💾 Persistent settings
- 🌙 System theme sync

## Prerequisites

- Node.js 18+
- npm or yarn
- Built frontend (from `frontend-typescript/`)

## Development

### Quick Start

```bash
# From the apps/electron directory
npm install

# Start in development mode (connects to Vite dev server)
# Make sure frontend dev server is running first:
# cd ../../frontend-typescript && npm run dev
npm start
```

### Building

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac
npm run build:win
npm run build:linux
```

### Output

Built applications will be in the `dist/` directory:
- **macOS**: `.dmg` and `.zip` (universal binary)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` and `.deb`

## Architecture

```
apps/electron/
├── main.js           # Main process (window management, IPC)
├── preload.js        # Preload script (secure API bridge)
├── package.json      # Electron dependencies & build config
├── resources/        # App icons and entitlements
│   ├── icon.icns     # macOS icon
│   ├── icon.ico      # Windows icon
│   ├── icon.png      # Linux/tray icon
│   └── entitlements.mac.plist
└── web/              # Built frontend (copied from frontend-typescript/dist)
```

## Configuration

Settings are stored using `electron-store`:
- `windowBounds` - Window size and position
- `alwaysOnTop` - Keep window above others
- `startMinimized` - Start in system tray

## Security

- **Context Isolation**: Enabled - web content cannot access Node.js
- **Node Integration**: Disabled - secure by default
- **Preload Script**: Carefully exposes only necessary APIs
- **Hardened Runtime**: Enabled for macOS code signing

## Code Signing

For distribution, you'll need to sign the app:

### macOS
```bash
# Set environment variables
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

## Troubleshooting

### Microphone not working
- Ensure microphone permissions are granted in System Preferences
- The entitlements.mac.plist includes the necessary permissions

### White screen on launch
- Check that the frontend is built: `npm run build:frontend`
- Or ensure the dev server is running for development mode

### WebRTC issues
- Check firewall settings - WebRTC needs UDP access
- The app requires network.client and network.server entitlements

