# Ferni Voice - macOS Menubar App

A beautiful, native macOS menubar app for voice conversations with Ferni and the team.

![Ferni Voice](../../brand/icons/ferni-robot-listening.svg)

## Features

- **🌿 Ferni Eye Avatar** - Animated "thinking stone" logo with persona colors
- **✨ Breathing Animation** - Human-like breathing makes the avatar feel alive
- **🌈 Glow Halo** - Persona-colored halo that pulses with state changes
- **📊 Waveform Visualization** - Audio-reactive bars during conversation
- **🔮 6 Personas** - Full team: Ferni, Maya, Alex, Jordan, Peter, Nayan
- **⌨️ Global Hotkey** - `Cmd+Shift+F` works from anywhere
- **☁️ Cloud/Local Mode** - Connect to app.ferni.ai or localhost

## Quick Start

```bash
# Build and run
cd apps/macos-menubar
swift build
swift run

# Or build the .app bundle
./build.sh
open .build/Ferni\ Voice.app
```

## Architecture

```
Sources/
├── FerniVoiceApp.swift          # App entry point & delegate
├── Models/
│   ├── Persona.swift            # Persona model & registry
│   └── VoiceState.swift         # Voice state machine
├── Views/
│   ├── FerniEyeAvatar.swift     # The iconic eye avatar
│   ├── GlowHalo.swift           # Animated halo effects
│   ├── Waveform.swift           # Audio waveform bars
│   ├── AvatarComposite.swift    # Combined avatar view
│   └── VoiceWindow.swift        # Floating window UI
└── Services/
    └── VoiceSession.swift       # Voice session manager

Tests/
├── PersonaTests.swift           # Persona model tests
├── VoiceStateTests.swift        # State machine tests
├── VoiceSessionTests.swift      # Session manager tests
└── E2ETests.swift               # Integration tests
```

## Animations

The app implements the same animation system as the web frontend:

### Breathing Animation
- **Duration**: 5 seconds per cycle (from `design-system/tokens/animation.json`)
- **Scale**: 1.0 → 1.025 (subtle expansion)
- **Easing**: `sine.inOut` for organic feel

### Glow Halo
- **Inner Ring**: Breathing sync (5s), opacity 0.3-0.4
- **Outer Ring**: Ambient glow (8s), opacity 0.15-0.2
- **Pulse Ring**: Expands outward when speaking

### Waveform
- **8 bars** with staggered animation
- **Random heights** (0.3-1.0) create organic movement
- **Updates every 100ms** for smooth visualization

## Persona Colors

| Persona | Primary Color | Role |
|---------|--------------|------|
| 🌿 Ferni | `#4a6741` (Sage) | Life Coach |
| 🦋 Maya | `#a67a6a` (Rose) | Habits Coach |
| 💬 Alex | `#5a6b8a` (Slate) | Communications |
| 📋 Jordan | `#c4856a` (Coral) | Life Planner |
| 🔬 Peter | `#3a6b73` (Teal) | Research |
| 🧘 Nayan | `#9a7b5a` (Gold) | Wisdom |

## Usage

| Action | How |
|--------|-----|
| Start/stop session | Click menubar icon |
| Toggle from anywhere | `Cmd+Shift+F` |
| Switch persona | Right-click menubar icon |
| Toggle cloud/local | Right-click → Switch mode |
| End session | Click "End" button |
| Quit | Right-click → Quit |

## Requirements

### For Cloud Mode (Recommended)
- Internet connection
- The app connects to `app.ferni.ai` automatically

### For Local Development
1. **Token server running:**
   ```bash
   cd ~/Documents/voiceai
   node token-server.js
   ```

2. **Agent running:**
   ```bash
   pnpm agent:dev
   ```

3. **sox for audio:**
   ```bash
   brew install sox
   ```

## Testing

```bash
# Run all tests
swift test

# Run specific test
swift test --filter PersonaTests

# Run with verbose output
swift test --verbose
```

### Test Coverage

- **PersonaTests**: Registry, colors, equality, required fields
- **VoiceStateTests**: State properties, transitions, equality
- **VoiceSessionTests**: Session lifecycle, persona switching, cloud mode
- **E2ETests**: Full flow integration, view creation, state machine

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

# Clean build
rm -rf .build
```

## Troubleshooting

**App not responding to clicks?**
- Kill any existing instances: `pkill -f FerniVoice`

**No audio?**
- Check System Settings > Privacy > Microphone
- Make sure sox is installed: `brew install sox`

**"Server not running" error?**
- For cloud mode: Check internet connection
- For local mode: Start token server: `node token-server.js`

**Build errors?**
- Clean and rebuild: `rm -rf .build && swift build`
- Ensure Xcode command line tools: `xcode-select --install`

## How It Works

1. **Click** the menubar icon or press `Cmd+Shift+F`
2. App spawns the voice CLI subprocess
3. CLI connects to LiveKit room with selected persona
4. Audio streams between your mic and Ferni
5. The avatar animates based on connection state
6. Transcriptions appear in the floating window

The app uses the same `voice-live.ts` CLI that powers `ferni voice`, ensuring consistent behavior across platforms.

## Design System Integration

Colors and animations are sourced from:
- `design-system/tokens/colors.json` - Persona colors
- `design-system/tokens/animation.json` - Timing & easing
- `frontend-typescript/src/ui/ferni-logo.ui.ts` - Eye avatar design
- `frontend-typescript/src/ui/avatar-soul.ui.ts` - Soul animations
