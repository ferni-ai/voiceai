# Component Decision Trees

> **"The right component for the right moment."**

This guide helps you choose the correct Ferni component for any situation. When in doubt, choose simplicity.

---

## Quick Reference

| Need                  | Component                            | Token Reference          |
| --------------------- | ------------------------------------ | ------------------------ |
| Show persona          | `Avatar`, `PersonaCard`              | `personas.json`          |
| Celebrate achievement | `Celebration`, `MilestoneCard`       | `rituals.json`           |
| Display error         | `Toast` (brief), `ErrorState` (full) | `content-templates.json` |
| Get user input        | `Input`, `VoiceInput`                | `components.json`        |
| Show progress         | `ProgressRing`, `StreakIndicator`    | `feedback.json`          |
| Modal content         | `Dialog` (action), `Sheet` (info)    | `motion.json`            |
| Navigation            | `Menu` (side), `TabBar` (bottom)     | `spacing.json`           |

---

## 🎭 Showing a Persona

```
Do you need to show a persona?
│
├─ In a conversation/active session?
│  │
│  ├─ Primary focus (talking to them)?
│  │  └─ ✅ Avatar (full size, with breathing + glow)
│  │     - Import: `ferniEQ` for active listening
│  │     - Requires: `data-persona` attribute
│  │
│  └─ Secondary/sidebar?
│     └─ ✅ AvatarCompact (small, ring only)
│        - Shows persona color ring
│        - Click to switch
│
├─ In a list/selection context?
│  │
│  ├─ User choosing a persona?
│  │  └─ ✅ PersonaCard (compact)
│  │     - Name, role, color indicator
│  │     - Hover shows persona glow
│  │
│  └─ Showing team members?
│     └─ ✅ PersonaGrid
│        - Responsive grid layout
│        - Shows availability status
│
└─ In profile/detail view?
   └─ ✅ PersonaDetail (expanded)
      - Full bio, specialties
      - Conversation history summary
```

### Avatar States

| State         | Animation             | Glow         | Use When                      |
| ------------- | --------------------- | ------------ | ----------------------------- |
| `idle`        | Breathing (5s)        | Subtle pulse | Waiting, between interactions |
| `listening`   | Micro-nods            | Steady       | User is speaking              |
| `speaking`    | Active breathing (3s) | Brighter     | Ferni is responding           |
| `thinking`    | Curious tilt          | Dim pulse    | Processing                    |
| `celebrating` | Bounce                | Radiant      | Achievement detected          |

---

## 🎉 Celebrating Achievements

```
Is this a celebration moment?
│
├─ Small win (daily goal, small progress)?
│  │
│  └─ ✅ Toast + subtle celebration
│     - Duration: 2.5s
│     - Phrases: content-templates.celebrations.smallWin
│     - Haptic: `success`
│     - NO confetti
│
├─ Big win (major milestone, breakthrough)?
│  │
│  └─ ✅ CelebrationOverlay
│     - Duration: 4s
│     - Phrases: content-templates.celebrations.bigWin
│     - Haptic: `celebration`
│     - YES confetti
│     - Sound: celebration.big
│
├─ Streak milestone (3, 7, 14, 30, 60, 100, 365)?
│  │
│  └─ ✅ StreakCard + CelebrationOverlay
│     - Show streak count prominently
│     - Phrases: content-templates.celebrations.streak[days]
│     - Confetti for 30+ days
│
└─ Team member unlocked?
   │
   └─ ✅ TeamUnlockOverlay
      - Full celebration sequence
      - Persona entrance animation
      - Sound: celebration.teamUnlock
```

### Celebration Intensity Guide

| Achievement         | Confetti    | Sound      | Haptic        | Duration |
| ------------------- | ----------- | ---------- | ------------- | -------- |
| Small task complete | ❌          | subtle     | `success`     | 600ms    |
| Daily goal met      | ❌          | small      | `success`     | 800ms    |
| Weekly goal met     | ✅ minimal  | medium     | `celebration` | 1200ms   |
| Major milestone     | ✅ full     | big        | `celebration` | 1500ms   |
| Streak (30+ days)   | ✅ full     | streak     | `celebration` | 1500ms   |
| Team unlock         | ✅ dramatic | teamUnlock | `celebration` | 2000ms   |

---

## ❌ Showing Errors & Empty States

```
Is something wrong or empty?
│
├─ System error (connection, processing)?
│  │
│  ├─ Brief, recoverable?
│  │  └─ ✅ Toast (error variant)
│  │     - Phrases: content-templates.errorStates
│  │     - Duration: 4s (longer than success)
│  │     - Warm tone, blame system not user
│  │
│  └─ Serious, needs action?
│     └─ ✅ ErrorState (full page/section)
│        - Friendly illustration
│        - Clear explanation
│        - Action button
│
├─ Empty state (no data yet)?
│  │
│  ├─ First time / onboarding?
│  │  └─ ✅ EmptyState (welcoming variant)
│  │     - Phrases: content-templates.emptyStates
│  │     - Encouraging, not apologetic
│  │     - Clear CTA
│  │
│  └─ Feature not used yet?
│     └─ ✅ EmptyState (discovery variant)
│        - Explain the benefit
│        - Low-pressure CTA
│
└─ No results (search, filter)?
   └─ ✅ EmptyState (search variant)
      - Acknowledge the search
      - Suggest alternatives
      - Easy way to clear filters
```

### Error Message Patterns

```typescript
// ❌ WRONG - blames user, cold
'Invalid input. Please try again.';

// ✅ RIGHT - blames system, warm
"Hmm. Something's not working right. (That's on me, not you.)";

// ❌ WRONG - technical jargon
'Connection timeout. Error code: 504';

// ✅ RIGHT - human language
'We lost the thread. Give me a sec to reconnect.';
```

---

## 📝 Getting User Input

```
Do you need input from the user?
│
├─ Voice input (primary)?
│  │
│  └─ ✅ VoiceInput
│     - Central to experience
│     - Shows waveform while speaking
│     - Automatic silence detection
│
├─ Text input?
│  │
│  ├─ Short answer (name, email)?
│  │  └─ ✅ Input (single line)
│  │     - Clear label above
│  │     - Helpful placeholder
│  │     - Validation feedback
│  │
│  ├─ Long answer (message, note)?
│  │  └─ ✅ Textarea
│  │     - Auto-growing height
│  │     - Character count if limited
│  │
│  └─ Structured choice?
│     │
│     ├─ Few options (2-5)?
│     │  └─ ✅ SegmentedControl or RadioGroup
│     │
│     ├─ Many options (5+)?
│     │  └─ ✅ Select dropdown
│     │
│     └─ Multiple selections?
│        └─ ✅ CheckboxGroup
│
└─ Action confirmation?
   └─ ✅ Dialog with confirm/cancel
      - Clear consequence explanation
      - Destructive actions in red
```

---

## 📊 Showing Progress

```
Do you need to show progress?
│
├─ Single metric?
│  │
│  ├─ Percentage/completion?
│  │  └─ ✅ ProgressRing
│  │     - Persona color fill
│  │     - Optional label inside
│  │
│  └─ Count/stat?
│     └─ ✅ StatCard
│        - Large number
│        - Label below
│        - Optional trend indicator
│
├─ Multiple metrics?
│  │
│  └─ ✅ StatsGrid
│     - 2-4 StatCards in grid
│     - Consistent sizing
│
├─ Over time (history)?
│  │
│  └─ ✅ ProgressChart
│     - Line or area chart
│     - Persona color
│     - Hover for details
│
└─ Streak/consistency?
   │
   └─ ✅ StreakIndicator
      - Flame icon + count
      - Celebration at milestones
```

---

## 🪟 Modal & Overlay Content

```
Do you need to show content over the current view?
│
├─ Requires user decision/action?
│  │
│  └─ ✅ Dialog (centered modal)
│     - Backdrop blur: 20px
│     - Scale + fade animation
│     - Clear action buttons
│     - NEVER side panel
│
├─ Information only (no action needed)?
│  │
│  ├─ Brief info?
│  │  └─ ✅ Popover
│  │     - Attached to trigger
│  │     - Dismiss on click outside
│  │
│  └─ Detailed info?
│     └─ ✅ Sheet (or Dialog)
│        - Scrollable content
│        - Close button top-right
│
├─ Navigation menu?
│  │
│  └─ ✅ Menu (slide from right)
│     - ONLY exception to "no side panels"
│     - Navigation items only
│     - Content opens in Dialog
│
└─ Full-screen takeover?
   │
   └─ ✅ Overlay
      - Onboarding flows
      - Celebration sequences
      - Major announcements
```

### Modal Animation Tokens

| Component | Entry                     | Exit                       | Duration      |
| --------- | ------------------------- | -------------------------- | ------------- |
| Dialog    | scale(0.9→1) + fadeIn     | scale(1→0.95) + fadeOut    | 300ms / 200ms |
| Menu      | translateX(100%→0)        | translateX(0→100%)         | 400ms / 300ms |
| Toast     | translateY(16→0) + fadeIn | translateY(0→-8) + fadeOut | 300ms / 200ms |
| Overlay   | fadeIn                    | fadeOut                    | 500ms / 400ms |

---

## 🧭 Navigation

```
What type of navigation do you need?
│
├─ Primary app navigation?
│  │
│  ├─ Mobile?
│  │  └─ ✅ TabBar (bottom)
│  │     - 3-5 items max
│  │     - Icons + labels
│  │     - Active state with persona color
│  │
│  └─ Desktop?
│     └─ ✅ Sidebar or TopNav
│        - Logo top-left
│        - Primary actions visible
│
├─ Settings/menu?
│  │
│  └─ ✅ Menu (slide from right)
│     - Triggered by hamburger/avatar
│     - Grouped by category
│
├─ Within a flow/wizard?
│  │
│  └─ ✅ Stepper
│     - Shows progress
│     - Back/Next buttons
│
└─ Breadcrumb trail?
   │
   └─ ✅ Breadcrumb
      - Home > Section > Page
      - Clickable ancestors
```

---

## 💬 Feedback & Notifications

```
What kind of feedback do you need to give?
│
├─ Immediate action feedback?
│  │
│  ├─ Success?
│  │  └─ ✅ Toast (success) - "Saved!" - 2.5s
│  │
│  ├─ Error?
│  │  └─ ✅ Toast (error) - warm message - 4s
│  │
│  └─ Loading?
│     └─ ✅ LoadingIndicator
│        - Breathing animation
│        - NEVER spinner
│
├─ Background notification?
│  │
│  └─ ✅ Push notification (system)
│     - "Thinking of you" moments
│     - Magic moment follow-ups
│
└─ Persistent status?
   │
   └─ ✅ StatusIndicator
      - Connection status
      - Sync status
      - Subtle, corner position
```

---

## Decision Matrix Summary

| Scenario              | First Choice        | Second Choice      | Avoid            |
| --------------------- | ------------------- | ------------------ | ---------------- |
| Show persona actively | Avatar (full)       | AvatarCompact      | Static image     |
| Celebrate             | Toast + glow        | CelebrationOverlay | Alert/banner     |
| Error message         | Toast (warm)        | ErrorState         | Alert            |
| Empty state           | EmptyState          | -                  | Just blank space |
| Text input            | Input               | Textarea           | Prompt()         |
| Choice (few)          | SegmentedControl    | RadioGroup         | Dropdown         |
| Choice (many)         | Select              | -                  | Long radio list  |
| Progress              | ProgressRing        | StatCard           | Text only        |
| Modal content         | Dialog (centered)   | -                  | Side panel       |
| Navigation            | TabBar (mobile)     | Sidebar (desktop)  | Hamburger-only   |
| Success feedback      | Toast               | -                  | Alert            |
| Loading               | Breathing indicator | -                  | Spinner          |

---

## Anti-Patterns (Never Do)

### ❌ Side Panels for Content

```typescript
// WRONG
<SidePanel>
  <UserProfile />
</SidePanel>

// RIGHT
<Dialog>
  <UserProfile />
</Dialog>
```

### ❌ Spinners for Loading

```typescript
// WRONG
<Spinner />

// RIGHT
<LoadingIndicator variant="breathing" />
```

### ❌ Static Avatars

```typescript
// WRONG
<img src="/avatars/ferni.png" />

// RIGHT
<Avatar persona="ferni" state="idle" />
// Includes breathing animation, glow, EQ capabilities
```

### ❌ Alert Boxes for Errors

```typescript
// WRONG
<Alert type="error">
  Error: Connection failed
</Alert>

// RIGHT
<Toast variant="error">
  We lost the thread. Give me a sec.
</Toast>
```

### ❌ Generic Confirmations

```typescript
// WRONG
if (confirm("Are you sure?")) { ... }

// RIGHT
<Dialog>
  <DialogTitle>Delete this goal?</DialogTitle>
  <DialogDescription>
    This can't be undone. Your progress history will remain.
  </DialogDescription>
  <DialogActions>
    <Button variant="ghost">Keep it</Button>
    <Button variant="destructive">Delete</Button>
  </DialogActions>
</Dialog>
```

---

## Quick Component Lookup

### By User Action

| User Wants To... | Use                              |
| ---------------- | -------------------------------- |
| Talk to Ferni    | `VoiceInput` + `Avatar`          |
| Switch persona   | `PersonaCard` or `AvatarCompact` |
| Check progress   | `StatsGrid` or `ProgressRing`    |
| See history      | `ProgressChart`                  |
| Change settings  | `Menu` → `Dialog`                |
| Get help         | `Dialog` with help content       |

### By System Event

| System Needs To...  | Use                             |
| ------------------- | ------------------------------- |
| Confirm success     | `Toast` (success)               |
| Report error        | `Toast` (error) or `ErrorState` |
| Show loading        | `LoadingIndicator`              |
| Celebrate           | `Toast` or `CelebrationOverlay` |
| Ask confirmation    | `Dialog`                        |
| Notify (background) | Push notification               |

---

_"The best interface is no interface. The second best is the simplest component that works."_
