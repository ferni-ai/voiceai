# 🍎 FerniDesignSystem Swift Package

> **Specification for the official Ferni SwiftUI component library.**

**Version**: Planning  
**Created**: January 2026  
**Status**: RFC (Request for Comments)

---

## Vision

A SwiftUI library that:
1. **Feels native** - Follows Apple Human Interface Guidelines while being uniquely Ferni
2. **Leverages platform** - Uses SwiftUI's full power (animations, haptics, accessibility)
3. **Is production-ready** - Type-safe, testable, documented
4. **Integrates deeply** - Works with iOS, iPadOS, macOS, watchOS, visionOS

### Design Principles

1. **SwiftUI-native** - Not a React port; built for the platform
2. **Declarative** - Compose complex UIs from simple views
3. **Accessible** - VoiceOver, Dynamic Type, Motion sensitivity
4. **Performant** - 60fps animations, minimal view updates
5. **Testable** - Preview-driven development, snapshot tests

---

## Package Structure

```
FerniDesignSystem/
├── Sources/
│   └── FerniDesignSystem/
│       ├── Components/
│       │   ├── Avatar/
│       │   │   ├── FerniAvatar.swift
│       │   │   ├── AvatarState.swift
│       │   │   └── AvatarAnimations.swift
│       │   ├── Button/
│       │   │   └── FerniButton.swift
│       │   ├── Toast/
│       │   │   ├── FerniToast.swift
│       │   │   └── ToastManager.swift
│       │   ├── Dialog/
│       │   │   └── FerniDialog.swift
│       │   ├── Celebration/
│       │   │   └── FerniCelebration.swift
│       │   └── Waveform/
│       │       └── FerniWaveform.swift
│       │
│       ├── Tokens/
│       │   ├── Colors.swift
│       │   ├── Typography.swift
│       │   ├── Spacing.swift
│       │   ├── Animation.swift
│       │   └── Haptics.swift
│       │
│       ├── Theme/
│       │   ├── FerniTheme.swift
│       │   ├── PersonaTheme.swift
│       │   └── CircadianTheme.swift
│       │
│       ├── Environment/
│       │   ├── FerniEnvironmentKey.swift
│       │   └── PersonaEnvironmentKey.swift
│       │
│       ├── Modifiers/
│       │   ├── FerniStyle.swift
│       │   ├── CelebrationModifier.swift
│       │   └── HapticModifier.swift
│       │
│       └── FerniDesignSystem.swift
│
├── Tests/
│   └── FerniDesignSystemTests/
│
├── Package.swift
└── README.md
```

---

## Core Components

### FerniAvatar

The heart of Ferni - animated persona representation.

```swift
import FerniDesignSystem

// Basic usage
FerniAvatar(persona: .ferni)

// With state binding
@State private var avatarState: AvatarState = .idle

FerniAvatar(persona: .ferni)
    .state($avatarState)
    .size(200)
    .breathing(true)
    .glow(true)
    .expression(.curious)

// In a conversation view
FerniAvatar(persona: currentPersona)
    .state(isListening ? .listening : isSpeaking ? .speaking : .idle)
    .onTap {
        // Handle tap
    }
```

#### Properties

```swift
public struct FerniAvatar: View {
    public enum Persona: String, CaseIterable {
        case ferni, peter, alex, maya, jordan, nayan
    }
    
    public enum State {
        case idle
        case speaking
        case listening
        case thinking
        case celebrating
        case concerned
    }
    
    public enum Expression {
        case neutral, happy, curious, concerned
        case thinking, excited, sleepy, surprised, warm
    }
}
```

#### View Modifiers

```swift
extension FerniAvatar {
    func state(_ state: Binding<AvatarState>) -> Self
    func size(_ size: CGFloat) -> Self
    func breathing(_ enabled: Bool) -> Self
    func glow(_ enabled: Bool) -> Self
    func expression(_ expression: Expression) -> Self
    func onTap(_ action: @escaping () -> Void) -> Self
}
```

---

### FerniButton

Warm, tactile button with haptic feedback.

```swift
import FerniDesignSystem

// Basic
FerniButton("Continue") {
    handleContinue()
}

// Variants
FerniButton("Primary", style: .primary) { }
FerniButton("Secondary", style: .secondary) { }
FerniButton("Ghost", style: .ghost) { }

// With icon
FerniButton("Settings", icon: Image(systemName: "gear")) { }

// Loading
FerniButton("Processing", isLoading: true) { }

// Full customization
FerniButton("Custom") {
    handleAction()
}
.buttonStyle(.primary)
.size(.large)
.haptic(.buttonPress)
.sound(.buttonClick)
```

#### Styles

```swift
public enum FerniButtonStyle {
    case `default`
    case primary
    case secondary
    case ghost
}

public enum FerniButtonSize {
    case small
    case medium
    case large
}
```

---

### FerniToast

Human, warm notifications.

```swift
import FerniDesignSystem

// Setup in app
@main
struct MyApp: App {
    @StateObject var toastManager = ToastManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .ferniToasts(manager: toastManager)
        }
    }
}

// Trigger toasts
@EnvironmentObject var toast: ToastManager

toast.show("Saved!")
toast.success("Done!")
toast.error("Couldn't save that")
toast.info("Processing...")

// With options
toast.show("Custom", duration: 3, persona: .maya) {
    // Action
    Text("Undo")
}
```

---

### FerniDialog

Centered modal with Ferni warmth.

```swift
import FerniDesignSystem

@State private var showDialog = false

FerniDialog(isPresented: $showDialog) {
    // Header
    FerniDialogHeader {
        Text("Confirm Action")
    } description: {
        Text("Are you sure you want to continue?")
    }
    
    // Body
    FerniDialogBody {
        // Content
    }
    
    // Footer
    FerniDialogFooter {
        FerniButton("Cancel", style: .ghost) {
            showDialog = false
        }
        FerniButton("Confirm", style: .primary) {
            handleConfirm()
            showDialog = false
        }
    }
}
```

---

### FerniCelebration

Celebrate wins and milestones.

```swift
import FerniDesignSystem

@State private var celebrate = false

VStack {
    // Content
}
.ferniCelebration(.smallWin, isActive: $celebrate)

// Or trigger imperatively
@EnvironmentObject var celebration: CelebrationManager

celebration.trigger(.bigWin)
celebration.trigger(.milestone, metadata: ["streak": 7])
```

#### Celebration Types

```swift
public enum CelebrationType {
    case smallWin
    case bigWin
    case milestone
    case streak(count: Int)
    case teamUnlock(persona: FerniAvatar.Persona)
}
```

---

### FerniWaveform

Audio visualization.

```swift
import FerniDesignSystem

FerniWaveform(persona: .ferni)
    .state($isListening ? .listening : .idle)
    .intensity(audioLevel)
    .frame(height: 60)
```

---

## Theme System

### FerniTheme

```swift
import FerniDesignSystem

@main
struct MyApp: App {
    @StateObject var theme = FerniTheme()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .ferniTheme(theme)
        }
    }
}

// Access theme in views
@Environment(\.ferniTheme) var theme

Text("Hello")
    .foregroundColor(theme.colors.textPrimary)
    .font(theme.typography.body)
```

### PersonaTheme

```swift
// Get persona-specific styling
let personaTheme = PersonaTheme(persona: .peter)

personaTheme.primaryColor    // Peter's teal
personaTheme.animation       // Peter's timing (0.85x)
personaTheme.voiceProfile    // Peter's voice characteristics
```

### CircadianTheme

```swift
// Time-aware theming
@Environment(\.ferniCircadian) var circadian

VStack {
    // Content
}
.brightness(circadian.brightness)
.saturation(circadian.warmth)

// Or use the modifier
.ferniCircadian()
```

---

## Environment Values

### Custom Environment Keys

```swift
// Persona
@Environment(\.ferniPersona) var persona

// Theme
@Environment(\.ferniTheme) var theme

// Circadian
@Environment(\.ferniCircadian) var circadian

// Relationship depth
@Environment(\.ferniRelationshipDepth) var depth

// Accessibility
@Environment(\.ferniReducedMotion) var reducedMotion
@Environment(\.ferniReducedHaptics) var reducedHaptics
```

---

## View Modifiers

### Ferni Styling

```swift
// Apply Ferni styling to any view
Text("Hello")
    .ferniStyle()

// Persona-specific styling
Card()
    .ferniStyle(persona: .peter)
```

### Haptic Feedback

```swift
Button("Tap") {
    action()
}
.ferniHaptic(.buttonPress)

// Custom haptic on any view
MyView()
    .onTapGesture {
        // ...
    }
    .ferniHaptic(.celebration, trigger: showCelebration)
```

### Sound Feedback

```swift
Button("Complete") {
    markComplete()
}
.ferniSound(.success)
```

### Celebration

```swift
VStack {
    // Content
}
.ferniCelebration(.smallWin, isActive: $celebrate)
```

---

## Tokens

### Colors

```swift
public struct FerniColors {
    // Brand
    public static let ferni = Color("Ferni", bundle: .module)
    public static let peter = Color("Peter", bundle: .module)
    // ... all personas
    
    // Semantic
    public static let textPrimary = Color("TextPrimary", bundle: .module)
    public static let textSecondary = Color("TextSecondary", bundle: .module)
    public static let background = Color("Background", bundle: .module)
    public static let backgroundElevated = Color("BackgroundElevated", bundle: .module)
    
    // Status
    public static let success = Color("Success", bundle: .module)
    public static let warning = Color("Warning", bundle: .module)
    public static let error = Color("Error", bundle: .module)
}
```

### Typography

```swift
public struct FerniTypography {
    // Display
    public static let displayLarge = Font.custom("PlusJakartaSans-Bold", size: 48)
    public static let displayMedium = Font.custom("PlusJakartaSans-Bold", size: 36)
    
    // Body
    public static let body = Font.custom("Inter-Regular", size: 16)
    public static let bodyLarge = Font.custom("Inter-Regular", size: 18)
    public static let bodySmall = Font.custom("Inter-Regular", size: 14)
    
    // Labels
    public static let label = Font.custom("Inter-Medium", size: 14)
    public static let labelSmall = Font.custom("Inter-Medium", size: 12)
}
```

### Animation

```swift
public struct FerniAnimation {
    // Durations
    public static let instant: Double = 0.05
    public static let fast: Double = 0.15
    public static let normal: Double = 0.25
    public static let slow: Double = 0.4
    public static let dramatic: Double = 0.8
    
    // Springs
    public static let springDefault = Animation.spring(
        response: 0.4,
        dampingFraction: 0.7,
        blendDuration: 0
    )
    public static let springBouncy = Animation.spring(
        response: 0.4,
        dampingFraction: 0.5,
        blendDuration: 0
    )
    public static let springGentle = Animation.spring(
        response: 0.6,
        dampingFraction: 0.8,
        blendDuration: 0
    )
    
    // Persona-specific
    public static func forPersona(_ persona: FerniAvatar.Persona) -> Animation {
        let multiplier = personaTimingMultipliers[persona] ?? 1.0
        return .spring(response: 0.4 * multiplier, dampingFraction: 0.7)
    }
}
```

### Haptics

```swift
public struct FerniHaptics {
    // Primitives
    public static let light = UIImpactFeedbackGenerator.FeedbackStyle.light
    public static let medium = UIImpactFeedbackGenerator.FeedbackStyle.medium
    public static let heavy = UIImpactFeedbackGenerator.FeedbackStyle.heavy
    
    // Patterns
    public enum Pattern {
        case connection
        case disconnect
        case buttonPress
        case buttonPressAccent
        case toggleOn
        case toggleOff
        case success
        case error
        case celebration(CelebrationType)
        case handoff(FerniAvatar.Persona)
    }
    
    public static func trigger(_ pattern: Pattern) {
        // Implementation using Core Haptics
    }
}
```

---

## Accessibility

### Reduced Motion

```swift
struct FerniAvatar: View {
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    
    var body: some View {
        // Adapt animation based on preference
        avatar
            .animation(reduceMotion ? .easeInOut(duration: 0.2) : .springBouncy)
    }
}
```

### VoiceOver

```swift
FerniAvatar(persona: .ferni)
    .accessibilityLabel("Ferni, your life coach")
    .accessibilityHint("Double tap to interact")
    .accessibilityAddTraits(.isButton)
```

### Dynamic Type

```swift
Text("Hello")
    .font(FerniTypography.body)
    .dynamicTypeSize(...DynamicTypeSize.accessibility3) // Limit max size
```

---

## Package.swift

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FerniDesignSystem",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
        .watchOS(.v9),
        .tvOS(.v16),
        .visionOS(.v1)
    ],
    products: [
        .library(
            name: "FerniDesignSystem",
            targets: ["FerniDesignSystem"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "FerniDesignSystem",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "FerniDesignSystemTests",
            dependencies: ["FerniDesignSystem"]
        ),
    ]
)
```

---

## Installation

### Swift Package Manager

```swift
dependencies: [
    .package(url: "https://github.com/ferni/FerniDesignSystem.git", from: "1.0.0")
]
```

### Xcode

1. File → Add Packages
2. Enter: `https://github.com/ferni/FerniDesignSystem.git`
3. Select version rule

---

## Usage Example

```swift
import SwiftUI
import FerniDesignSystem

struct ConversationView: View {
    @StateObject var theme = FerniTheme()
    @StateObject var toast = ToastManager()
    @State var avatarState: AvatarState = .idle
    @State var currentPersona: FerniAvatar.Persona = .ferni
    @State var showCelebration = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Avatar
            FerniAvatar(persona: currentPersona)
                .state($avatarState)
                .size(200)
                .padding()
            
            // Waveform
            FerniWaveform(persona: currentPersona)
                .state(avatarState == .speaking ? .active : .idle)
                .frame(height: 60)
            
            Spacer()
            
            // Controls
            HStack {
                FerniButton("End", style: .ghost) {
                    endConversation()
                }
                
                FerniButton(avatarState == .listening ? "Stop" : "Speak", style: .primary) {
                    toggleListening()
                }
            }
            .padding()
        }
        .ferniTheme(theme)
        .ferniToasts(manager: toast)
        .ferniCelebration(.smallWin, isActive: $showCelebration)
        .ferniCircadian()
    }
}
```

---

## Roadmap

### v1.0.0 (MVP)

- [ ] FerniAvatar component
- [ ] FerniButton component
- [ ] FerniToast system
- [ ] FerniDialog component
- [ ] Theme system
- [ ] Basic haptics
- [ ] iOS 16+ support
- [ ] Documentation

### v1.1.0

- [ ] FerniCelebration component
- [ ] FerniWaveform component
- [ ] Advanced haptic patterns
- [ ] Sound integration
- [ ] watchOS support
- [ ] macOS support

### v1.2.0

- [ ] Full component library
- [ ] visionOS support
- [ ] Circadian theming
- [ ] Relationship depth
- [ ] Live Activities support

---

**© 2026 Ferni. SwiftUI components with soul.**

*"The best components feel like they were always part of the platform."*
