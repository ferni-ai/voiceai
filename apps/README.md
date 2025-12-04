# Voice AI Native Apps

This directory contains native application wrappers for Voice AI.

## Structure

```
apps/
├── electron/     # Desktop app (macOS, Windows, Linux)
├── ios/          # iOS app (Capacitor wrapper)
└── README.md
```

## Quick Start

### Desktop (Electron)

```bash
cd apps/electron
npm install
npm start      # Development
npm run build  # Production build
```

### iOS (Capacitor)

```bash
cd apps/ios
npm install
npm run build  # Build web + sync iOS
npm run open   # Open in Xcode
```

## Shared Web Assets

All native apps use the same web frontend from `frontend-typescript/`. The build process:

1. Builds the TypeScript frontend (`npm run build` in frontend-typescript)
2. Copies/references the built assets
3. Packages with the native wrapper

## Platform-Specific Features

| Feature | Electron | iOS |
|---------|----------|-----|
| WebRTC/LiveKit | ✅ Full support | ✅ WKWebView |
| Haptics | ❌ N/A | ✅ Native |
| System Tray | ✅ Yes | ❌ N/A |
| Background Audio | ✅ Yes | ✅ With config |
| Auto-update | ✅ electron-updater | ✅ App Store |
| Code Signing | ✅ Notarization | ✅ Apple signing |

## Development Tips

### Live Reload

**Electron**: Automatically connects to Vite dev server at `localhost:3004`

**iOS**: Update `capacitor.config.ts` with your local IP:
```typescript
server: {
  url: 'http://192.168.x.x:3004',
  cleartext: true,
}
```

### Debugging

**Electron**: DevTools are enabled by default in development

**iOS**: Use Safari Developer Tools (Safari → Develop → Device)

## Build Pipeline

For CI/CD, use these commands:

```bash
# Build all platforms
./scripts/build-apps.sh

# Or individually:
cd apps/electron && npm run build:mac
cd apps/ios && npm run build && npx cap copy ios
```

