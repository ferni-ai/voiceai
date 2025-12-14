# Ferni Voice - macOS Menubar App

A native macOS menubar app for voice conversations with Ferni.

## Features

- Lives in the menubar (no dock icon)
- Click to start/stop voice sessions
- Persona picker (Ferni, Maya, Alex, etc.)
- Visual status indicators
- Native macOS experience

## Requirements

- macOS 13.0 (Ventura) or later
- Xcode Command Line Tools (`xcode-select --install`)
- Node.js & npm (for the backend)
- sox (`brew install sox`)

## Building

```bash
# Make build script executable
chmod +x build.sh

# Build the app
./build.sh

# Install to Applications
cp -r .build/Ferni\ Voice.app /Applications/

# Or run directly
open .build/Ferni\ Voice.app
```

## Before Running

Make sure the backend servers are running:

```bash
# Terminal 1: Token server
cd /path/to/voiceai
node token-server.js

# Terminal 2: Agent (if running locally)
pnpm agent:dev
```

## Usage

1. Click the microphone icon in the menubar
2. Select "Start Voice Session"
3. Speak naturally - Ferni is listening
4. Click "End Session" when done

### Menubar Icons

| Icon | State |
|------|-------|
| Mic circle | Disconnected (ready) |
| Mic filled | Connecting |
| Waveform | Connected (talking) |
| Exclamation | Error |

### Keyboard Shortcuts

- `Cmd+S` - Start voice session
- `Cmd+E` - End voice session
- `Cmd+Q` - Quit app

## Persona Selection

Use the "Persona" submenu to switch between:
- **Ferni** - Life coach (default)
- **Maya** - Habits coach
- **Alex** - Communications coach
- **Jordan** - Life planner
- **Peter** - Research analyst
- **Nayan** - Wisdom sage

## Development

The app is built with Swift and SwiftUI using Swift Package Manager.

```bash
# Build for development
swift build

# Build for release
swift build -c release

# Run directly (for debugging)
swift run
```

### Architecture

```
Sources/
└── FerniVoiceApp.swift    # Main app with menubar UI and voice manager
```

The app spawns the CLI voice client (`scripts/cli/voice-live.ts`) as a subprocess and monitors its output to determine connection state.

## Troubleshooting

### "Token server not running"

Start the token server:
```bash
node token-server.js
```

### Microphone not working

1. Check System Preferences > Privacy & Security > Microphone
2. Ensure "Ferni Voice" has permission
3. If not listed, remove and reinstall the app

### App not appearing in menubar

1. Check if another instance is running: `pkill -f FerniVoice`
2. Try running from terminal: `open "/Applications/Ferni Voice.app"`

## Code Signing (Optional)

For distribution, sign the app:

```bash
codesign --force --deep --sign "Developer ID Application: Your Name" \
    --entitlements .build/Ferni\ Voice.app/Contents/entitlements.plist \
    ".build/Ferni Voice.app"
```
