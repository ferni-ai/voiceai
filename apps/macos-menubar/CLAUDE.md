# macOS Menubar App

Native macOS menubar app for voice conversations with Ferni, built with Swift and SwiftUI.

## Purpose

One-click voice access to Ferni from the menubar. Features animated avatar, waveform visualization, global hotkey, and both native SDK and CLI backend modes.

## Key Files

```
Sources/
├── FerniVoiceApp.swift          # App entry point & delegate
├── Models/
│   ├── Persona.swift            # 6 personas with colors
│   └── VoiceState.swift         # State machine
├── Views/
│   ├── FerniEyeAvatar.swift     # The iconic eye avatar
│   ├── GlowHalo.swift           # Animated halo effects
│   ├── Waveform.swift           # Audio waveform bars
│   ├── AvatarComposite.swift    # Combined avatar view
│   ├── VoiceWindow.swift        # Floating window UI
│   ├── SettingsWindow.swift     # Preferences
│   ├── MenubarIcon.swift        # Custom menubar icon
│   └── TextAvatar.swift         # Text-based avatar
├── Animation/
│   ├── AvatarLamp.swift         # Pixar lamp animations
│   ├── AvatarSoul.swift         # Soul/emotional animations
│   └── PixarAnimations.swift    # Animation constants
├── Services/
│   ├── VoiceSession.swift       # Voice session manager
│   ├── LoginItemManager.swift   # Launch at login
│   ├── ClaudeCodeBridge.swift   # Claude Code integration
│   └── TerminalBridge.swift     # Terminal control
└── Widget/
    └── FerniWidget.swift        # macOS Widget extension

Tests/
├── PersonaTests.swift
├── PixarAnimationTests.swift
├── VoiceStateTests.swift
├── VoiceSessionTests.swift
├── VoiceBinaryTests.swift
└── E2ETests.swift
```

## Build & Run

```bash
cd apps/macos-menubar

# Build and run
swift build
swift run

# Build .app bundle
./build.sh
open ".build/Ferni Voice.app"

# Create DMG installer
./create-dmg.sh

# Sign and notarize (requires Apple Developer)
./sign-and-notarize.sh

# Run tests
swift test
```

## Dual Voice Backends

### Native SDK Mode (Default)
- Direct LiveKit Swift SDK
- Native AVAudioEngine
- ~100ms lower latency
- No subprocess overhead

### CLI Mode (Development)
- Uses CLI subprocess (`voice-live.ts`)
- Easy to debug (see logs)
- Requires sox installed

Toggle via Settings > Advanced or right-click menu.

## Usage

| Action | How |
|--------|-----|
| Start/stop session | Click menubar icon |
| Toggle from anywhere | `Cmd+Shift+F` |
| Switch persona | Right-click menubar |
| Cloud/local mode | Right-click > Switch mode |
| Settings | Right-click > Settings (Cmd+,) |
| Launch at login | Right-click > Launch at Login |

## Animation System

From `design-system/tokens/animation.json`:

- **Breathing**: 5s cycle, 1.0-1.025 scale, sine.inOut
- **Glow Halo**: Inner (5s), outer (8s), pulse on speaking
- **Waveform**: 8 bars, 100ms updates, random heights

## Persona Colors

| Persona | Color | Hex |
|---------|-------|-----|
| Ferni | Sage | #4a6741 |
| Maya | Rose | #a67a6a |
| Alex | Slate | #5a6b8a |
| Jordan | Coral | #c4856a |
| Peter | Teal | #3a6b73 |
| Nayan | Gold | #9a7b5a |

## Requirements

### Cloud Mode (Recommended)
- Internet connection (connects to app.ferni.ai)

### Local Development
- Token server: `node token-server.js`
- Agent: `pnpm agent:dev`
- sox: `brew install sox`

## Distribution

```bash
# Development
./build.sh && open ".build/Ferni Voice.app"

# DMG
./create-dmg.sh

# Signed & Notarized
export FERNI_DEVELOPER_ID="Developer ID Application: ..."
export FERNI_APPLE_ID="your@email.com"
./sign-and-notarize.sh
```
