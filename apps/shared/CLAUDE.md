# Shared Swift Code

Swift Package shared between iOS (`apps/ios-native/`) and macOS (`apps/macos-menubar/`) apps.

## Purpose

Common code for Apple platforms - views, animations, models, services, and design system components that work on both iOS and macOS.

## Structure

```
apps/shared/
├── Package.swift           # Swift Package manifest
├── Sources/FerniShared/
│   ├── Animation/          # Shared animation utilities
│   ├── Audio/              # Audio processing utilities
│   ├── BetterThanHuman/    # EQ system components
│   ├── Design/             # FerniColors, design tokens
│   ├── Extensions/         # Swift extensions
│   ├── LiveActivity/       # Live Activity support
│   ├── Models/             # Shared data models
│   ├── Services/           # Shared services
│   ├── Shaders/            # Metal shaders
│   ├── Views/              # Cross-platform SwiftUI views
│   └── WatchOS/            # Watch-specific utilities
└── Tests/FerniSharedTests/
```

## Platforms

- iOS 16+
- macOS 13+

## Usage

### In iOS Native App

```swift
// Package.swift or project settings
dependencies: [
    .package(path: "../shared")
]

// In code
import FerniShared

let colors = FerniColors.shared
let avatar = MagicalPixarEyes()
```

### In macOS Menubar App

```swift
// Package.swift
dependencies: [
    .package(path: "../shared")
]
```

## Build

```bash
cd apps/shared

# Build
swift build

# Run tests
swift test
```

## Key Components

### Views
- `MagicalPixarEyes.swift` - LUXO-style eye avatar (opaque white, no pupils)
- `MagicalSplashView.swift` - Splash screen animation
- `PixarVoiceOrb.swift` - Voice visualization orb

### BetterThanHuman
- `BreathSyncHaptics.swift` - Breath synchronization with haptics

### Animation
- Shared animation constants from `design-system/tokens/animation.json`
- Pixar-quality timing curves

### Design
- `FerniColors` - Persona colors, design tokens
- Cross-platform color definitions

## Adding New Shared Code

1. Add file to appropriate folder in `Sources/FerniShared/`
2. Ensure imports work on both iOS and macOS
3. Add tests in `Tests/FerniSharedTests/`
4. Both iOS and macOS apps will automatically pick up changes

## Related

- `apps/ios-native/` - iOS app using this package
- `apps/macos-menubar/` - macOS app using this package
- `design-system/tokens/` - Source of truth for design tokens
