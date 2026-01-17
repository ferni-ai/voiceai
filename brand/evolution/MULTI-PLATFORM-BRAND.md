# Ferni Multi-Platform Brand Guidelines
## Consistent Brand Across Every Touchpoint

**Version 1.0 | January 2026**

---

> *"Ferni should feel like Ferni whether you're on your phone at 2am or your watch during a run."*

---

## Platform Strategy

### Core Principle

**Adapt the expression, not the essence.**

Every platform has different constraints and contexts. Ferni's brand essence stays constant; how it's expressed adapts to each platform's strengths.

### Platform Priority

| Priority | Platform | Status | Rationale |
|----------|----------|--------|-----------|
| **P0** | iOS App | ✅ Live | Primary experience |
| **P0** | Web App | ✅ Live | Cross-platform access |
| **P1** | Android App | 🔴 Planned | Market reach |
| **P1** | iOS Widget | 🔴 Planned | Daily touchpoint |
| **P2** | watchOS | 🔴 Planned | In-moment access |
| **P2** | Mac Menu Bar | 🔴 Planned | Desktop presence |
| **P3** | Android Widget | 🔴 Planned | Android parity |
| **P3** | CarPlay | 🔴 Planned | Commute conversations |
| **P4** | Apple TV | 🔴 Future | Living room reflection |

---

## Platform-Specific Guidelines

### iOS App (Primary)

**Context:** Full-featured experience, typically used in quiet moments

**Brand Expression:**
- Full avatar with all expressions
- Complete motion language
- Full sound design
- All personas available
- Deep conversations

**Design Specifications:**
- Safe areas respected
- Dynamic Type supported
- Dark/Light mode full support
- Haptics for key moments
- Face ID for privacy

**Unique Opportunities:**
- Live Activities for ongoing sessions
- Focus modes integration
- Siri Shortcuts
- Home Screen Quick Actions

---

### iOS Widget

**Context:** Quick glance, invitation to engage

**Widget Sizes:**

| Size | Content |
|------|---------|
| **Small** | Avatar + one prompt |
| **Medium** | Avatar + prompt + streak/stat |
| **Large** | Avatar + prompt + recent insight + CTA |

**Small Widget (2x2)**
```
┌─────────────────────┐
│                     │
│     [Avatar]        │
│                     │
│  "How are you       │
│   feeling?"         │
│                     │
└─────────────────────┘
```

**Medium Widget (4x2)**
```
┌─────────────────────────────────────────┐
│                                         │
│  [Avatar]    "What's on your mind       │
│              today?"                    │
│                                         │
│  🔥 7 day streak    Last: 2h ago        │
│                                         │
└─────────────────────────────────────────┘
```

**Large Widget (4x4)**
```
┌─────────────────────────────────────────┐
│                                         │
│  [Avatar]                               │
│                                         │
│  "What's one thing you're grateful      │
│   for today?"                           │
│                                         │
│  ────────────────────────────           │
│                                         │
│  💡 Recent insight:                     │
│  "You've been more relaxed this         │
│   week. What changed?"                  │
│                                         │
│                        [Talk to Ferni]  │
│                                         │
└─────────────────────────────────────────┘
```

**Widget Design Rules:**
- Avatar always visible (brand recognition)
- Single prompt (not overwhelming)
- Warm colors, Paper Cream background
- Tappable area opens app to relevant context
- Updates every 15-30 minutes
- No widget animations (battery)

---

### watchOS

**Context:** Quick interactions, in-moment support

**App Type:** Companion app (not standalone)

**Core Features:**
- Quick check-in ("How are you?")
- Breathing exercise
- Daily prompt
- Streak display
- Emergency grounding

**Complication Types:**

| Complication | Display |
|--------------|---------|
| **Circular** | Avatar face only |
| **Rectangular** | Avatar + short prompt |
| **Corner** | Streak number |
| **Graphic** | Avatar with glow (mood-colored) |

**Interaction Design:**
- Voice-first (dictation)
- Simple taps
- Crown for scrolling
- Haptic confirmations
- Maximum 3 screens deep

**watchOS-Specific:**
- Respect wrist-down detection
- Battery-conscious animations
- Accessible tap targets (44pt minimum)
- High contrast for outdoor visibility

**Sample Flows:**

**Quick Check-In:**
```
[Watch Face] → Tap complication → 
"How are you?" → Voice response → 
"Got it. Take care." → Back to watch face
```

**Breathing Exercise:**
```
[Watch Face] → Tap complication → 
"Need a moment?" → "Yes" → 
[Breathing animation synced to haptics] → 
"Better?" → "Yes" → "Good. I'm here."
```

---

### Mac Menu Bar

**Context:** Desktop work environment, ambient presence

**Menu Bar Icon:**
- Ferni avatar (simple version)
- Subtle glow indicates status
- Click reveals dropdown

**Dropdown Menu:**
```
┌─────────────────────────────┐
│  [Avatar]  Hey Seth         │
│  ─────────────────────────  │
│  📝 Quick thought...        │
│  🎯 Today's intention       │
│  📊 Your week so far        │
│  ─────────────────────────  │
│  🔥 7 day streak            │
│  ─────────────────────────  │
│  ⚙️ Settings                │
│  🚪 Open Ferni              │
└─────────────────────────────┘
```

**Quick Thought:**
- Pop-up window for quick voice note
- Keyboard shortcut (Cmd+Shift+F)
- Transcribed and saved to memory

**Ambient Features:**
- Gentle reminder notifications
- Calendar awareness
- Focus mode integration
- Do Not Disturb respect

**Design Rules:**
- Native macOS styling (SF Symbols, system fonts)
- Dark/light mode automatic
- Retina-ready assets
- Minimal CPU usage

---

### Android App

**Context:** Primary experience for Android users

**Android-Specific Considerations:**
- Material Design 3 integration
- Back button handling
- Notification channels
- App shortcuts
- Widgets (separate specification)

**Design Adaptations:**
| iOS Element | Android Equivalent |
|-------------|-------------------|
| SF Pro | Roboto |
| SF Symbols | Material Icons |
| Bottom tab bar | Bottom navigation |
| Pull to refresh | Same |
| Haptics | Vibration patterns |

**Brand Consistency:**
- Same color palette
- Same avatar design
- Same motion language (adapted)
- Same voice/tone

---

### CarPlay

**Context:** Commute, hands-free conversation

**Screen Layout:**
```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│            [Large Avatar]               │
│                                         │
│                                         │
│  "What's on your mind for today?"       │
│                                         │
│  [━━━━━━━━━━━━━] Listening...          │
│                                         │
└─────────────────────────────────────────┘
```

**Interaction Model:**
- 100% voice-driven
- Large touch targets (for glances)
- No text input
- Audio feedback for all actions

**Safety Considerations:**
- Minimal visual distraction
- No complex interactions
- Clear audio cues
- Easy to pause/resume

**CarPlay-Specific Features:**
- Commute conversations
- Morning briefing
- Traffic-aware check-ins
- Arrival reflection

---

### Apple TV (Future)

**Context:** Living room, relaxation, family

**Use Cases:**
- Guided evening reflection (ambient)
- Family gratitude sharing
- Visualization of growth journey
- Ambient soundscapes

**Design:**
- Focus on visuals (large screen)
- Beautiful data visualization
- Ambient mode (screensaver-like)
- Voice via Siri Remote

---

## Cross-Platform Design System

### Avatar Adaptation

| Platform | Avatar Complexity | Size |
|----------|-------------------|------|
| iOS App | Full (all expressions) | 120-200pt |
| Widget | Simplified | 48-64pt |
| watchOS | Minimal (face only) | 32-40pt |
| Menu Bar | Icon-level | 16-22pt |
| CarPlay | Large, simple | 200pt+ |

### Animation Adaptation

| Platform | Animation Level | Reason |
|----------|-----------------|--------|
| iOS App | Full | Primary experience |
| Widget | None | Battery/performance |
| watchOS | Minimal | Battery |
| Menu Bar | Subtle | CPU, distraction |
| CarPlay | None | Safety |

### Color Adaptation

| Platform | Color Usage |
|----------|-------------|
| iOS App | Full palette |
| Widget | Muted, background-aware |
| watchOS | High contrast |
| Menu Bar | System-integrated |
| CarPlay | High contrast, minimal |

### Typography Adaptation

| Platform | Font |
|----------|------|
| iOS App | Plus Jakarta Sans + Inter |
| Widget | SF Pro (system) |
| watchOS | SF Compact |
| Menu Bar | SF Pro |
| Android | Roboto (with Plus Jakarta for headlines) |
| CarPlay | SF Pro (large) |

---

## Notification Strategy

### Notification Types by Platform

| Type | iOS | Watch | Mac | Android |
|------|-----|-------|-----|---------|
| Morning intention | ✓ | ✓ | ✓ | ✓ |
| Evening reflection | ✓ | ✓ | | ✓ |
| Streak reminder | ✓ | ✓ | | ✓ |
| Insight generated | ✓ | | ✓ | ✓ |
| Proactive check-in | ✓ | ✓ | ✓ | ✓ |

### Notification Design

**iOS Rich Notification:**
```
┌─────────────────────────────────────────┐
│ 🌿 Ferni                          now   │
│ ────────────────────────────────────────│
│                                         │
│  [Avatar]                               │
│                                         │
│  Hey, you mentioned feeling stressed    │
│  about work lately. How's today going?  │
│                                         │
│  [Reply]                    [Open Ferni]│
└─────────────────────────────────────────┘
```

### Notification Principles

1. **Never spam** — Quality over quantity
2. **Respect context** — No 3am notifications
3. **Add value** — Every notification should feel like a gift
4. **Allow easy control** — Granular notification settings
5. **Be warm** — Same voice as in-app

---

## Handoff & Continuity

### Cross-Device Experience

**Scenario:** User starts conversation on iPhone, continues on Mac

**Implementation:**
- Handoff enabled between iOS and macOS
- Conversation state synced via iCloud
- Context preserved across devices
- Visual indicator of sync status

### State Sync

| Data | Sync Method | Latency |
|------|-------------|---------|
| Conversation | Real-time (CloudKit) | <2s |
| Preferences | Background | Minutes |
| Memory | Server-sync | Minutes |
| Streaks | Real-time | <2s |

---

## Platform-Specific Features Matrix

| Feature | iOS | Android | Watch | Mac | CarPlay |
|---------|-----|---------|-------|-----|---------|
| Full conversation | ✓ | ✓ | | ✓ | ✓ |
| Voice input | ✓ | ✓ | ✓ | ✓ | ✓ |
| Text input | ✓ | ✓ | | ✓ | |
| All personas | ✓ | ✓ | | ✓ | |
| Quick check-in | ✓ | ✓ | ✓ | ✓ | |
| Breathing exercise | ✓ | ✓ | ✓ | | |
| Insights dashboard | ✓ | ✓ | | ✓ | |
| Settings | ✓ | ✓ | | ✓ | |
| Notifications | ✓ | ✓ | ✓ | ✓ | |

---

## Implementation Priority

### Phase 1 (Months 1-3)
- [ ] iOS Widget (all sizes)
- [ ] Android app (feature parity)

### Phase 2 (Months 4-6)
- [ ] watchOS app
- [ ] Mac menu bar app
- [ ] Android widget

### Phase 3 (Months 7-12)
- [ ] CarPlay
- [ ] Cross-device handoff
- [ ] Apple TV exploration

---

## Quality Checklist

Before launching on any platform:

### Brand Consistency
- [ ] Avatar matches brand guidelines
- [ ] Colors use design tokens
- [ ] Typography follows system
- [ ] Voice/tone consistent
- [ ] Animations appropriate

### Platform Excellence
- [ ] Follows platform HIG/guidelines
- [ ] Uses native UI patterns where appropriate
- [ ] Respects platform accessibility features
- [ ] Optimized for platform constraints
- [ ] Tested on multiple devices

### User Experience
- [ ] Clear value proposition for platform
- [ ] Appropriate feature set (not feature dumping)
- [ ] Smooth cross-platform transition
- [ ] Consistent data across platforms
- [ ] Easy to understand controls

---

**Document Owner:** Design Lead  
**Last Updated:** January 2026  
**Review Cycle:** Per platform launch

---

*"Ferni should feel like coming home, no matter what screen you're on."*
