# iOS Widget Specifications

> **Ferni on your Home Screen** - Ambient presence that invites reflection.

---

## Design Philosophy

The Ferni widget isn't a notification center or a dashboard. It's a **gentle invitation** to reflection—Ferni's presence in your daily life without demanding attention.

**Core Principles:**
1. **Calm presence** - Never urgent, always available
2. **Single focus** - One prompt, one thought, one breath
3. **Beautiful simplicity** - Luxo-style eyes, warm colors, minimal text
4. **Tap = connection** - Opens to continue the thought

---

## Widget Sizes

### Small Widget (2x2)

**Dimensions:** 158 x 158 pts (iPhone), 170 x 170 pts (iPad)

**Layout:**
```
┌─────────────────────┐
│                     │
│      [Avatar]       │
│       ◉ ◉          │
│                     │
│  "Good morning"     │
│                     │
└─────────────────────┘
```

**Components:**
- **Avatar:** Ferni face, centered, 64x64 pts
- **Text:** Single greeting or micro-prompt, max 2 lines
- **Background:** Subtle gradient using `--color-background-elevated`

**Content Rotation:**
- Time-based greeting (Good morning/afternoon/evening)
- Today's Reflection Sunday prompt (on Sundays)
- Streak reminder ("Day 7 🔥")
- Mood check-in invitation

**Tap Action:** Opens app with context preserved

---

### Medium Widget (4x2)

**Dimensions:** 338 x 158 pts (iPhone), 364 x 170 pts (iPad)

**Layout:**
```
┌─────────────────────────────────────────┐
│                                         │
│  [Avatar]    "What's one thing you're   │
│   ◉ ◉        grateful for today?"       │
│                                         │
│              [Tap to reflect →]         │
│                                         │
└─────────────────────────────────────────┘
```

**Components:**
- **Avatar:** Left-aligned, 56x56 pts
- **Prompt:** Right side, max 3 lines, `--font-body`
- **CTA:** Subtle "Tap to reflect" in `--color-text-muted`
- **Background:** Solid `--color-background-elevated`

**Content Types:**
- Daily reflection prompt
- Memory callback teaser ("Remember when you said...")
- Habit streak with celebration
- Weekly theme introduction

**Tap Action:** Opens directly to conversation with prompt pre-loaded

---

### Large Widget (4x4)

**Dimensions:** 338 x 338 pts (iPhone), 364 x 376 pts (iPad)

**Layout:**
```
┌─────────────────────────────────────────┐
│  🌿 Reflection Sunday                   │
│                                         │
│      [Avatar - larger]                  │
│         ◉ ◉                            │
│                                         │
│  "What surprised you                    │
│   about yourself this week?"            │
│                                         │
│  ─────────────────────────              │
│                                         │
│  Last week: You talked about            │
│  feeling overwhelmed at work.           │
│  How's that going?                      │
│                                         │
│              [Continue →]               │
└─────────────────────────────────────────┘
```

**Components:**
- **Header:** Category label with emoji
- **Avatar:** Centered, 80x80 pts
- **Primary Prompt:** Large text, centered
- **Divider:** Subtle line
- **Context:** Memory callback or recent insight
- **CTA:** "Continue →" button

**Content Types:**
- Full Reflection Sunday experience
- Growth Letter preview
- Weekly summary with insight
- Milestone celebration

---

## Lock Screen Widgets (iOS 16+)

### Circular Accessory

**Dimensions:** 50 x 50 pts

**Layout:**
```
  ┌───┐
  │◉◉ │  ← Ferni eyes only
  └───┘
```

**Behavior:**
- Static Ferni eyes (Luxo-style)
- Tap opens app
- No text

### Rectangular Accessory

**Dimensions:** 150 x 50 pts

**Layout:**
```
┌────────────────────┐
│ ◉◉  Good morning  │
└────────────────────┘
```

**Behavior:**
- Ferni eyes + time-aware greeting
- Tap opens app

### Inline Accessory

**Dimensions:** Variable width

**Content:** "◉◉ Ferni • Day 7 streak"

---

## Visual Specifications

### Avatar Rendering

```swift
// Ferni eyes - Luxo-style
// Pure white fill, no pupils, no gradients
// Expression through shape only

struct FerniEyes: View {
    let size: CGFloat
    let expression: Expression // .neutral, .warm, .curious
    
    var body: some View {
        HStack(spacing: size * 0.15) {
            Circle()
                .fill(Color.white)
                .frame(width: size * 0.4, height: size * 0.4)
            Circle()
                .fill(Color.white)
                .frame(width: size * 0.4, height: size * 0.4)
        }
        .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
    }
}
```

### Color Tokens

```swift
extension Color {
    static let ferniPrimary = Color(hex: "#4a6741")
    static let ferniSecondary = Color(hex: "#3d5a35")
    static let backgroundElevated = Color(hex: "#FFFDFB")
    static let textPrimary = Color(hex: "#2C2520")
    static let textMuted = Color(hex: "#8B7355")
}
```

### Typography

```swift
// Primary prompt text
.font(.system(size: 17, weight: .medium, design: .rounded))

// Secondary/context text
.font(.system(size: 14, weight: .regular, design: .rounded))

// Category labels
.font(.system(size: 12, weight: .semibold, design: .rounded))
.foregroundColor(.ferniPrimary)
```

---

## Content Strategy

### Daily Rotation

| Time | Content Type |
|------|--------------|
| 5-9 AM | Morning greeting + intention prompt |
| 9 AM-12 PM | Energy check-in or focus reminder |
| 12-2 PM | Midday pause invitation |
| 2-6 PM | Reflection prompt |
| 6-9 PM | Day recap invitation |
| 9 PM-12 AM | Wind-down prompt |
| 12-5 AM | Gentle presence ("Still here") |

### Weekly Features

| Day | Feature |
|-----|---------|
| Sunday | Reflection Sunday prompt |
| Monday | Week intention |
| Tuesday-Thursday | Daily prompts |
| Friday | Week celebration |
| Saturday | Rest/creative prompt |

### Special States

**Streak Celebration:**
```
┌─────────────────────┐
│      🔥             │
│     Day 30!         │
│                     │
│  [Avatar - happy]   │
│                     │
│  "You showed up."   │
└─────────────────────┘
```

**Milestone:**
```
┌─────────────────────┐
│      🎂             │
│   1 Year with       │
│     Ferni           │
│                     │
│  [Avatar]           │
│                     │
│  "Thank you."       │
└─────────────────────┘
```

---

## Technical Implementation

### Timeline Provider

```swift
struct FerniWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> FerniEntry {
        FerniEntry(date: Date(), content: .greeting("Hello"))
    }
    
    func getSnapshot(in context: Context, completion: @escaping (FerniEntry) -> Void) {
        let entry = FerniEntry(date: Date(), content: getTimeAwareContent())
        completion(entry)
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<FerniEntry>) -> Void) {
        var entries: [FerniEntry] = []
        let currentDate = Date()
        
        // Generate entries for the next 6 hours
        for hourOffset in 0..<6 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
            let entry = FerniEntry(date: entryDate, content: getContentFor(date: entryDate))
            entries.append(entry)
        }
        
        let timeline = Timeline(entries: entries, policy: .atEnd)
        completion(timeline)
    }
}
```

### Content Types

```swift
enum WidgetContent {
    case greeting(String)
    case prompt(String, category: String)
    case memoryCallback(quote: String, timeAgo: String)
    case streak(days: Int)
    case milestone(type: MilestoneType, message: String)
    case reflectionSunday(prompt: String)
}
```

### Deep Link Handling

```swift
// Widget URL scheme
// ferni://widget?action=reflection&prompt_id=self-1
// ferni://widget?action=conversation&context=streak_celebration

struct DeepLinkHandler {
    static func handle(_ url: URL) -> ConversationContext? {
        guard url.scheme == "ferni",
              url.host == "widget" else { return nil }
        
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let action = components?.queryItems?.first(where: { $0.name == "action" })?.value
        
        switch action {
        case "reflection":
            let promptId = components?.queryItems?.first(where: { $0.name == "prompt_id" })?.value
            return .reflectionPrompt(promptId)
        case "conversation":
            let context = components?.queryItems?.first(where: { $0.name == "context" })?.value
            return .contextual(context)
        default:
            return .default
        }
    }
}
```

---

## Accessibility

### VoiceOver

```swift
// Small widget
.accessibilityLabel("Ferni widget")
.accessibilityHint("Double tap to open Ferni and start a conversation")
.accessibilityValue("Good morning. Tap to reflect.")

// Medium widget
.accessibilityLabel("Ferni reflection prompt")
.accessibilityValue("What's one thing you're grateful for today?")
.accessibilityHint("Double tap to open Ferni and respond")
```

### Dynamic Type

- Support up to xxxLarge
- Truncate gracefully with "..."
- Never clip Ferni avatar

### Reduce Motion

- Disable any ambient animations
- Use static avatar expressions
- Respect system preference

---

## Implementation Timeline

### Phase 1 (Week 1-2)
- [ ] Small widget with time-aware greeting
- [ ] Basic tap-to-open functionality
- [ ] Avatar rendering

### Phase 2 (Week 3-4)
- [ ] Medium widget with prompts
- [ ] Content rotation system
- [ ] Deep link handling

### Phase 3 (Week 5-6)
- [ ] Large widget with memory callbacks
- [ ] Streak visualization
- [ ] Reflection Sunday integration

### Phase 4 (Week 7-8)
- [ ] Lock screen widgets
- [ ] watchOS complications (see MULTI-PLATFORM-BRAND.md)
- [ ] iPad optimization

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Widget install rate | 40% of iOS users |
| Daily widget interactions | 2+ per user |
| App opens from widget | 30% of total opens |
| Reflection Sunday widget engagement | 60% of participants |
| Widget retention (30-day) | 70% |

---

## Related Documents

- `MULTI-PLATFORM-BRAND.md` - Full multi-platform strategy
- `CULTURAL-RITUALS.md` - Reflection Sunday specs
- `SIGNATURE-MOMENTS.md` - Memory callback details
- `design-system/tokens/colors.json` - Color tokens

---

*The widget is Ferni's quiet presence in daily life—not demanding, just available.*
