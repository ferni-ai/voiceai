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
- **🚀 Launch at Login** - Start automatically when you log in
- **⚙️ Settings Window** - Configure audio, personas, and preferences
- **🎨 Custom Menubar Icon** - Beautiful Ferni eye icon in your menubar
- **🔊 Real Audio Levels** - Waveform responds to actual audio
- **📦 DMG Installer** - Professional distribution with notarization

## Quick Start

```bash
# Build and run
cd apps/macos-menubar
swift build
swift run

# Or build the .app bundle
./build.sh
open .build/Ferni\ Voice.app

# Create DMG installer
./create-dmg.sh

# Sign and notarize for distribution (requires Apple Developer account)
./sign-and-notarize.sh
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
│   ├── VoiceWindow.swift        # Floating window UI
│   ├── SettingsWindow.swift     # Preferences window
│   ├── MenubarIcon.swift        # Custom Ferni menubar icon
│   └── TextAvatar.swift         # Text-based avatar (initials)
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
├── PersonaTests.swift           # Persona model tests
├── VoiceStateTests.swift        # State machine tests
├── VoiceSessionTests.swift      # Session manager tests
├── VoiceBinaryTests.swift       # Binary/environment tests
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
| Open settings | Right-click → Settings (⌘,) |
| Launch at login | Right-click → Launch at Login |
| End session | Click "End" button |
| Quit | Right-click → Quit |

## Settings

Access settings via right-click → Settings or `⌘,`:

- **General**: Launch at login, global hotkey, notifications, sounds
- **Audio**: Input/output device selection
- **Personas**: Set default persona, view all team members
- **Advanced**: Cloud/local mode, data location, reset
- **About**: Version info, links, copyright

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

## Distribution

### Development Build

```bash
./build.sh
open ".build/Ferni Voice.app"
```

### DMG Installer

```bash
./create-dmg.sh
# Creates .build/FerniVoice-1.0.0.dmg
```

### Signed & Notarized (Production)

Requires Apple Developer account ($99/year):

```bash
# Set environment variables
export FERNI_DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)"
export FERNI_APPLE_ID="your@email.com"
export FERNI_TEAM_ID="XXXXXXXXXX"
export FERNI_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password

# Sign, notarize, and staple
./sign-and-notarize.sh
```

The resulting DMG can be distributed without Gatekeeper warnings.

## Design System Integration

Colors and animations are sourced from:
- `design-system/tokens/colors.json` - Persona colors
- `design-system/tokens/animation.json` - Timing & easing
- `apps/web/src/ui/ferni-logo.ui.ts` - Eye avatar design
- `apps/web/src/ui/avatar-soul.ui.ts` - Soul animations

## Widget

A macOS Widget is available showing:
- Current persona with avatar
- Connection status
- Quick start/end button

Add from Control Center → Edit Widgets → Ferni Voice

## Dual-Mode Voice Backend

The app supports **two voice backends** that you can switch between at runtime:

### 🚀 Native SDK Mode (Default)

Direct LiveKit Swift SDK integration for the best performance:

```
macOS App → LiveKit Swift SDK → Server
     ↓
AVAudioEngine (native)
```

**Benefits:**
- Direct WebRTC connection
- Native AVAudioEngine (no sox)
- ~100ms lower latency
- Better battery/memory
- No subprocess overhead
- Proper audio device selection

### 🔧 CLI Mode (Development/Debugging)

Uses a CLI subprocess for voice streaming:

```
macOS App → spawns → CLI Process → @livekit/rtc-node → Server
                           ↓
                     sox (audio I/O)
```

**Benefits:**
- Easy to debug (see subprocess output)
- Shares code with `ferni voice` CLI
- Works without LiveKit Swift dependency

### Switching Modes

**Via Menu:**
1. Right-click the menubar icon
2. Look for "⚡️ Native SDK" or "🖥️ CLI Subprocess"
3. Click "Switch to CLI Mode" or "Switch to Native Mode"

**Via Settings:**
1. Right-click → Settings (or `⌘,`)
2. Go to Advanced tab
3. Select your preferred backend mode

### Feature Comparison

| Feature | Native SDK | CLI Subprocess |
|---------|------------|----------------|
| Latency | ~100ms | ~200ms |
| Memory | ~20MB | ~100MB |
| Dependencies | None | sox, node |
| Debugging | Harder | Easy (text logs) |
| Audio levels | State-based | Parsed from CLI |
| Battery | Lower | Higher |
| Subprocess | None | 85MB process |

### All TypeScript Capabilities Work in Both Modes

Both modes connect to the **same TypeScript voice agent**, so all these features work identically:

- 🎭 **6 Personas** - Ferni, Maya, Alex, Jordan, Peter, Nayan
- 🔄 **Handoffs** - Seamless persona switching mid-conversation
- 💭 **Trust Systems** - Memory, relationship building
- 🛠️ **Tools** - Calendar, web search, reminders
- 😊 **Emotions** - Mood detection, concern analysis
- 📊 **Data Channels** - Real-time state sync

The client (this app) is just a "dumb pipe" for audio - all intelligence lives on the server!

### Data Channel Messages

The native SDK listens for these events from the TypeScript agent:

```swift
// Handoff events
case .handoffStarted  // Persona is changing
case .handoffComplete // New persona ready
case .handoffFailed   // Handoff cancelled

// Emotional intelligence
case .mood           // Energy level, relationship stage
case .emotionEvent   // Detected emotions (concern, joy, etc.)

// Transcription
case .partialTranscript // Real-time speech-to-text
```

These update the UI in real-time - the avatar changes color during handoffs, shows appropriate expressions, etc.

### Why Support Both Modes?

1. **Development** - CLI mode shows logs, easier to debug agent issues
2. **Fallback** - If native SDK has issues, CLI is proven stable
3. **Testing** - Verify behavior is identical in both modes
4. **Offline** - CLI can work with local agent; native needs token server
