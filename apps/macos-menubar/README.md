# Ferni Voice - macOS Menubar App

A delightfully simple native macOS app for voice conversations with Ferni and friends.

## Features

- **One-click start** - Click the menubar icon to start talking
- **Global hotkey** - `Cmd+Shift+F` works from anywhere
- **Beautiful floating window** - Persona avatar, breathing animation, waveform
- **6 personas** - Ferni, Maya, Alex, Jordan, Peter, Nayan
- **Lives in menubar** - No dock icon, always ready

## Quick Start

```bash
# Build
cd apps/macos-menubar
swift build

# Run
swift run

# Or build the .app bundle
./build.sh
open .build/Ferni\ Voice.app
```

## Usage

| Action | How |
|--------|-----|
| Start/stop session | Click menubar icon |
| Toggle from anywhere | `Cmd+Shift+F` |
| Switch persona | Right-click menubar icon |
| End session | Click "End" button or menubar icon |

## Requirements

1. **Token server running:**
   ```bash
   cd ~/Documents/voiceai
   node token-server.js
   ```

2. **Agent running (for local dev):**
   ```bash
   pnpm agent:dev
   ```

3. **sox for audio:**
   ```bash
   brew install sox
   ```

## Personas

| Emoji | Name | Focus |
|-------|------|-------|
| 🌿 | Ferni | Life coach |
| 🦋 | Maya | Habits |
| 💬 | Alex | Communication |
| 📋 | Jordan | Planning |
| 🔬 | Peter | Research |
| 🧘 | Nayan | Wisdom |

## Troubleshooting

**App not responding to clicks?**
- Kill any existing instances: `pkill -f FerniVoice`

**No audio?**
- Check System Settings > Privacy > Microphone
- Make sure sox is installed: `brew install sox`

**"Server not running" error?**
- Start token server: `node token-server.js`

## Development

```bash
# Debug build
swift build

# Release build
swift build -c release

# Run directly
swift run

# Build app bundle
./build.sh
```

The app spawns the voice CLI (`apps/cli/src/features/voice/voice-live.ts`) as a subprocess and monitors its output to detect connection state.
