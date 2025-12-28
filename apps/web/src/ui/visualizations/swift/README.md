# Ferni SwiftUI Visualizations

Beautiful, native SwiftUI visualizations for the Ferni iOS app. These components match the web visualizations exactly while feeling native to iOS.

## Design Philosophy

> "Better than the Pixar lamp"

The Pixar lamp has personality through movement. Ferni has personality through **AWARENESS**. Our avatar doesn't just animate - it sees you, recognizes you, and responds with genuine presence.

### "Better Than Human" Principles

Every component embodies our core belief that AI should feel more human than static interfaces:

| Principle | Implementation |
|-----------|----------------|
| **Presence** | Avatar breathes, blinks, shifts gaze naturally |
| **Recognition** | Pupils dilate when "seeing" the user |
| **Micro-expressions** | 40-150ms subliminal emotional flashes |
| **Warmth** | Ambient glow that responds to emotional state |
| **Anticipation** | Avatar shows emotion before user finishes |

## Architecture

```
swift/
├── FerniVisualizationModels.swift  # Data models (Codable)
├── FerniColors.swift               # Design system colors
├── FerniAvatarView.swift           # Living, breathing avatar ⭐ NEW
├── FerniSplashScreen.swift         # Avatar "waking up" splash ⭐ NEW
├── EnergyRingsView.swift           # Apple Watch-style rings
├── MoodCalendarView.swift          # Calendar grid with moods
├── GrowthRadarView.swift           # Spider/radar chart
└── YourStoryDashboard.swift        # Main dashboard (all visualizations)
```

## Quick Start

### 1. Add Files to Xcode Project

Copy all `.swift` files to your iOS project. They have no external dependencies.

### 2. Fetch Data from API

```swift
import Foundation

class VisualizationService {
    func fetchStoryData(userId: String) async throws -> YourStoryData {
        let url = URL(string: "https://api.ferni.ai/insights/\(userId)")!
        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(VisualizationApiResponse.self, from: data)

        return YourStoryData(
            daysTogether: 45,
            conversationCount: 127,
            // ... map response to YourStoryData
            energyRings: response.energyRings,
            moodCalendar: response.moodCalendar,
            // ... etc
        )
    }
}
```

### 3. Display the Dashboard

```swift
import SwiftUI

struct ContentView: View {
    @State private var showingStory = false
    @State private var storyData: YourStoryData?

    var body: some View {
        Button("View Your Story") {
            showingStory = true
        }
        .sheet(isPresented: $showingStory) {
            if let data = storyData {
                YourStoryDashboard(data: data) {
                    showingStory = false
                }
            }
        }
        .task {
            // Load data
            storyData = await loadDemoData()
        }
    }
}
```

## Individual Components

### Ferni Avatar (Living Presence)

The avatar replaces static icons and "connect bubbles" with genuine presence:

```swift
// Main avatar with mood
FerniAvatarView(
    size: 120,
    mood: .curious,      // neutral, curious, joyful, listening, thinking, caring, excited, calm
    isListening: false,
    isThinking: false,
    showBreathing: true
)

// Listening state (with pulse rings)
FerniListeningAvatarView(size: 120)

// Thinking state (with animated dots)
FerniThinkingAvatarView(size: 120)

// Compact for lists/headers
FerniCompactAvatarView(size: 44, mood: .neutral, showGlow: true)
```

**Avatar Moods:**
| Mood | Pupil | Eyes | Glow | Use Case |
|------|-------|------|------|----------|
| `neutral` | 1.0x | Normal | Low | Default state |
| `curious` | 1.15x | Wider | Medium | User says something interesting |
| `joyful` | 1.1x | Crinkled | High | Celebrating with user |
| `listening` | 1.2x | Attentive | Medium | During user speech |
| `thinking` | 0.95x | Up-left | Low | Processing request |
| `caring` | 1.1x | Soft | Medium | Emotional support |
| `excited` | 1.25x | Wide | High | Exciting news |
| `calm` | 0.9x | Relaxed | Medium | Grounding moments |

### Ferni Splash Screen (Avatar Awakening)

Instead of a static "F" logo, the avatar "wakes up" to greet the user:

```swift
// Full awakening sequence (~3.5 seconds)
FerniSplashScreen(
    onComplete: { /* Navigate to main app */ },
    userName: "Seth"  // Optional - personalizes greeting
)

// Minimal splash for quick return (~1 second)
FerniMinimalSplashScreen(
    onComplete: { /* Navigate to main app */ }
)
```

**Animation Sequence:**
1. **Darkness** - Pure black (0.3s)
2. **Ambient Glow** - Subtle warmth appears (0.8s)
3. **Avatar Appears** - Fades in with eyes closed (0.6s)
4. **Eyes Open** - Gentle awakening (0.5s)
5. **Recognition** - Pupils dilate ("I see you") (0.4s)
6. **Greeting** - Personalized text appears (0.6s)
7. **Ready** - Transition to app (0.3s)

### Energy Rings

```swift
// Full view with legend
EnergyRingsView(
    data: EnergyRingsData(
        emotional: 75,
        mental: 82,
        physical: 68,
        overall: 72
    ),
    size: 200,
    showLabels: true,
    animated: true
)

// Compact for widgets/watch
CompactEnergyRingsView(
    data: energyData,
    size: 70
)

// Card wrapper
EnergyRingsCard(data: energyData)
```

### Mood Calendar

```swift
MoodCalendarCard(
    data: MoodCalendarData(
        entries: [...],
        summary: MoodCalendarSummary(
            dominantMood: .calm,
            calmDays: 12,
            trend: .improving
        ),
        period: "month"
    )
)
```

### Growth Radar

```swift
GrowthRadarCard(
    data: GrowthRadarData(
        dimensions: [
            GrowthDimension(name: "Self-Awareness", value: 0.75, ...),
            GrowthDimension(name: "Connection", value: 0.72, ...),
            // ...
        ],
        overallGrowth: 0.66,
        focusArea: "Purpose"
    )
)
```

## Design System

### Colors

All colors are defined in `FerniColors` and match the web design system:

```swift
// Brand
FerniColors.accent          // #3D5A45 - Primary green
FerniColors.ferni           // #4a6741 - Ferni persona

// Backgrounds
FerniColors.background      // #fffdfb - Warm off-white
FerniColors.backgroundElevated  // #ffffff - Cards

// Text
FerniColors.textPrimary     // #2C2520 - Natural ink
FerniColors.textSecondary   // #5c544a
FerniColors.textMuted       // #9a8f85

// Moods
FerniColors.mood(.calm)     // Dynamic color per mood type
FerniColors.moods.joyful    // Direct access

// Energy
FerniColors.energy.emotional
FerniColors.energy.mental
FerniColors.energy.physical

// Status
FerniColors.status(.thriving)
FerniColors.status(.balanced)
FerniColors.status(.stretched)
FerniColors.status(.depleted)
FerniColors.status(.critical)
```

### Shadows

```swift
// Subtle shadow
view.ferniShadow()

// Card shadow
view.cardShadow()
```

### Gradients

```swift
LinearGradient.ferni           // Brand gradient
LinearGradient.warmBackground  // Background gradient
LinearGradient.energyRings     // Energy colors
```

## Data Models

All models conform to `Codable` for easy JSON parsing and `Identifiable` for SwiftUI lists.

### Key Types

- `EnergyRingsData` - Emotional, mental, physical energy (0-100)
- `MoodCalendarData` - Mood entries with calendar display
- `GrowthRadarData` - Spider chart dimensions (0-1)
- `BurnoutGaugeData` - Capacity with status
- `LifeTimelineData` - Life chapters narrative
- `EmotionalArcsData` - Hero's journey phases
- `RelationshipNetworkData` - Connections graph
- `OpenLoopsData` - Unfinished threads
- `PredictionsData` - AI predictions

## Animations

Views support reduced motion via `DeviceContext`:

```swift
// Check reduced motion preference
if DeviceContext.current.prefersReducedMotion {
    // Skip animation
}

// Animated views have `animated` parameter
EnergyRingsView(data: data, animated: !prefersReducedMotion)
```

## Platform Support

- **iOS 15+** - Full support
- **watchOS** - Use `CompactEnergyRingsView`
- **macOS** - Works with Catalyst
- **tvOS** - Large display versions (TBD)

## Matching Web Components

| SwiftUI | Web (TypeScript) |
|---------|------------------|
| `FerniAvatarView` | `avatar-soul.ui.ts`, `ferni-eye.ui.ts` |
| `FerniSplashScreen` | Splash handled by native iOS |
| `EnergyRingsView` | `builders/energy-rings.ts` |
| `MoodCalendarView` | `builders/mood-calendar.ts` |
| `GrowthRadarView` | `builders/growth-radar.ts` |
| `YourStoryDashboard` | `your-story-dashboard.ui.ts` |

Both share:
- Same API response format (`VisualizationApiResponse`)
- Same color palette (via `FerniColors` / CSS variables)
- Same data models (Swift `Codable` / TypeScript interfaces)

## Avatar Usage Patterns

### Replacing "Connect Bubbles"

Instead of abstract animated bubbles during connection, use the avatar with state changes:

```swift
struct ConnectionView: View {
    @State private var connectionState: ConnectionState = .idle

    var body: some View {
        VStack {
            switch connectionState {
            case .idle:
                FerniAvatarView(size: 140, mood: .neutral)
                Text("Tap to connect")

            case .connecting:
                FerniListeningAvatarView(size: 140)  // Pulse rings
                Text("Connecting...")

            case .listening:
                FerniAvatarView(size: 140, mood: .listening, isListening: true)
                Text("I'm listening")

            case .thinking:
                FerniThinkingAvatarView(size: 140)
                Text("Thinking...")

            case .speaking:
                FerniAvatarView(size: 140, mood: .joyful)
                Text("Speaking")
            }
        }
    }
}
```

### App Lifecycle Integration

```swift
@main
struct FerniApp: App {
    @State private var showingSplash = true
    @AppStorage("userName") private var userName: String?

    var body: some Scene {
        WindowGroup {
            ZStack {
                MainView()
                    .opacity(showingSplash ? 0 : 1)

                if showingSplash {
                    FerniSplashScreen(
                        onComplete: { showingSplash = false },
                        userName: userName
                    )
                    .transition(.opacity)
                }
            }
        }
    }
}
```

### Navigation Bar Avatar

```swift
.toolbar {
    ToolbarItem(placement: .navigationBarTrailing) {
        Button(action: openSettings) {
            FerniCompactAvatarView(size: 32, mood: .neutral, showGlow: false)
        }
    }
}
```

## Previews

All views include `#Preview` macros for Xcode Canvas:

```swift
#Preview("Energy Rings") {
    EnergyRingsView(data: sampleData)
}

#Preview("Energy Rings Card") {
    EnergyRingsCard(data: sampleData)
}
```
