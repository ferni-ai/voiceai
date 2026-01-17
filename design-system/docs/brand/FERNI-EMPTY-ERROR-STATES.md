# 🫧 Ferni Empty & Error States
## The Unloved Screens Design Guide

**Version 1.0 | December 2024**

---

> *"How you handle the edge cases says everything about your brand."*

---

# Table of Contents

1. [Philosophy](#1-philosophy)
2. [Empty States](#2-empty-states)
3. [Error States](#3-error-states)
4. [Loading States](#4-loading-states)
5. [Offline States](#5-offline-states)
6. [Permission States](#6-permission-states)
7. [Copy Guidelines](#7-copy-guidelines)
8. [Visual Patterns](#8-visual-patterns)
9. [Animation](#9-animation)
10. [Implementation](#10-implementation)

---

# 1. Philosophy

## Why These Screens Matter

Empty states, error pages, and loading screens are where users are most vulnerable. They're waiting, confused, or something went wrong. This is where trust is built or broken.

### Our Approach

| Traditional | Ferni |
|-------------|-------|
| "No data available" | "Your story starts here" |
| "Error 500" | "Something unexpected happened. We're on it." |
| "Loading..." | [Thoughtful animation with personality] |
| "Connection lost" | "Taking a breath. We'll reconnect." |

### Design Principles

1. **Never leave them alone** — Every state has guidance
2. **Never blame the user** — Even if it was their fault
3. **Always provide a path** — Clear next action
4. **Stay warm** — Even errors feel human
5. **Stay on brand** — Same voice, same visual language

---

# 2. Empty States

## 2.1 First-Time User States

### No Conversations Yet

**When:** User has never had a conversation

**Visual:** Two abstract shapes with potential connection

**Copy:**
```
Eyebrow: YOUR JOURNEY
Headline: Every great friendship starts somewhere.
Body: We're here whenever you're ready to talk. No pressure, no judgment—just a voice that listens.
CTA: Start a Conversation
```

**Layout:**
```
┌─────────────────────────────────────┐
│                                     │
│         [Illustration]              │
│          ○ · · · · ○                │
│                                     │
│       YOUR JOURNEY                  │
│                                     │
│  Every great friendship             │
│  starts somewhere.                  │
│                                     │
│  We're here whenever you're         │
│  ready to talk.                     │
│                                     │
│    [ Start a Conversation ]         │
│                                     │
└─────────────────────────────────────┘
```

---

### No Team Members Unlocked

**When:** User only has access to Ferni

**Visual:** Ferni orb prominent, ghosted shapes suggesting others

**Copy:**
```
Eyebrow: YOUR TEAM
Headline: Meet Ferni first.
Body: As we get to know each other, more specialists will join your team. It's not about gatekeeping—it's about building a relationship that matters.
CTA: Talk to Ferni
Secondary: Learn about the team →
```

---

### No Progress Data

**When:** Trust Journey opened with no data

**Visual:** Gentle upward path, first step marked

**Copy:**
```
Eyebrow: YOUR PROGRESS
Headline: The path is waiting.
Body: After a few conversations, we'll start to see patterns—the growth, the wins, the moments that matter. For now, just talk.
CTA: Start Your Journey
```

---

## 2.2 Empty Collection States

### No Wins Recorded

**When:** No small wins have been detected yet

**Visual:** Empty star shape, gentle

**Copy:**
```
Headline: We're watching for wins.
Body: Every time you follow through, show courage, or take care of yourself, we'll celebrate. The first win is just a conversation away.
```

---

### No Boundaries Set

**When:** No boundaries in boundary memory

**Visual:** Open, welcoming space

**Copy:**
```
Headline: Your space, your rules.
Body: As we learn what matters to you—and what doesn't—we'll remember. We're here to respect your boundaries, not test them.
```

---

### No Inside Jokes Yet

**When:** No shared moments recorded

**Visual:** Two shapes close together

**Copy:**
```
Headline: Shared history takes time.
Body: The inside jokes, the callbacks, the "remember when"s—they come from conversations. Let's make some memories.
```

---

## 2.3 Search/Filter Empty States

### No Search Results

**When:** Search returns nothing

**Visual:** Magnifying glass with curious expression (abstract)

**Copy:**
```
Headline: Nothing quite matched that.
Body: Try different words, or browse instead.
CTA: Clear Search
Secondary: Browse All →
```

---

### No Items After Filter

**When:** Filter returns zero results

**Visual:** Empty container with filter icon

**Copy:**
```
Headline: Nothing here with those filters.
Body: Try removing some filters to see more.
CTA: Clear Filters
```

---

# 3. Error States

## 3.1 Connection Errors

### Connection Lost (Temporary)

**When:** WebSocket disconnects unexpectedly

**Visual:** Two shapes with dashed line between

**Copy:**
```
Headline: Taking a breath.
Body: We lost connection for a moment. Trying to reconnect now...
[Reconnecting indicator]
```

**Behavior:** Auto-reconnect with backoff, show progress

---

### Connection Failed (After Retries)

**When:** Multiple reconnect attempts failed

**Visual:** Two shapes, line broken but shapes intact

**Copy:**
```
Headline: We couldn't reconnect.
Body: Something's getting in the way. Check your internet connection and try again.
CTA: Try Again
Secondary: Check Status →
```

---

### Server Unavailable

**When:** Backend is down or unreachable

**Visual:** Cloud with patience indicator

**Copy:**
```
Headline: We're taking a moment.
Body: Our servers are catching their breath. This usually resolves quickly.
CTA: Refresh
Secondary: Check @ferniAI for updates
```

---

## 3.2 API Errors

### Generic Error (500)

**When:** Unknown server error

**Visual:** Puzzle piece slightly askew

**Copy:**
```
Headline: Something unexpected happened.
Body: We hit a bump, but we're looking into it. Your data is safe.
CTA: Try Again
Secondary: Contact Support →
```

**Important:** Log error ID for support reference

---

### Rate Limited (429)

**When:** User hit rate limit

**Visual:** Gentle hourglass

**Copy:**
```
Headline: Let's slow down a moment.
Body: We limit how fast things can happen to keep everything running smoothly. Ready to continue in [countdown].
[Progress bar until ready]
```

---

### Not Found (404)

**When:** Requested resource doesn't exist

**Visual:** Empty frame with question mark

**Copy:**
```
Headline: That page doesn't exist.
Body: It might have moved, or the link might be wrong.
CTA: Go Home
Secondary: Search for something →
```

---

### Unauthorized (401/403)

**When:** Auth required or denied

**Visual:** Gentle lock

**Copy:**
```
Headline: You need to sign in first.
Body: This content is for signed-in users. It only takes a moment.
CTA: Sign In
Secondary: Learn About Ferni →
```

---

## 3.3 User Errors

### Invalid Input

**When:** Form validation failed

**Visual:** Inline error styling, no separate illustration

**Copy Pattern:**
```
❌ "Invalid email"
✅ "That doesn't look like an email. Mind checking?"

❌ "Password too short"  
✅ "A bit longer—8 characters minimum."

❌ "Required field"
✅ "We need this one."
```

---

### Action Failed

**When:** User action couldn't complete

**Visual:** Gentle warning indicator

**Copy:**
```
Headline: That didn't work.
Body: [Specific reason if known]. Want to try again?
CTA: Try Again
```

---

# 4. Loading States

## 4.1 Initial Load

### App Starting

**When:** App is initializing

**Visual:** Ferni logo with subtle breathing animation

**Copy:**
```
[Ferni Logo]
[Subtle animation]
```

**Duration guideline:** If >3 seconds, show progress

---

### Connecting

**When:** Establishing WebSocket connection

**Visual:** Connection progress steps

**Copy:**
```
Step 1: "Waking up..." 
Step 2: "Finding you..."
Step 3: "Almost there..."
Step 4: [Connected - no text, just transition]
```

---

## 4.2 Content Loading

### Skeleton Screens

Use skeleton screens for predictable content:

```
┌─────────────────────────────────────┐
│ ██████████                          │ ← Avatar skeleton
│                                     │
│ ████████████████████                │ ← Title skeleton
│ ██████████████████████████████      │ ← Body skeleton
│ █████████████████████               │
│                                     │
│ ████████ ████████                   │ ← Button skeletons
└─────────────────────────────────────┘
```

**Skeleton styling:**
- Background: `--color-bg-secondary`
- Animation: Shimmer left to right, 2s cycle
- Border radius: Match real element

---

### Inline Loading

For actions (buttons, forms):

```
[ Saving... ◐ ]
[ Thinking... ◑ ]
```

- Replace button text
- Show subtle spinner
- Disable interaction
- Keep same button width

---

## 4.3 AI Thinking

### Processing Response

**Visual:** Thinking dots (3 dots bouncing in sequence)

**Copy:** None—animation speaks

**Duration:** Match actual processing time

---

# 5. Offline States

## 5.1 Offline Banner

**When:** Device loses internet

**Visual:** Subtle banner, warm color

**Copy:**
```
"You're offline. We'll save your progress and sync when you're back."
```

**Position:** Top of screen, non-blocking

---

## 5.2 Offline Mode

**When:** User tries to use features that require connection

**Visual:** Feature with offline indicator

**Copy:**
```
Headline: This needs a connection.
Body: You're offline right now. We'll be here when you're back.
```

---

## 5.3 Back Online

**When:** Connection restored

**Visual:** Brief success banner

**Copy:**
```
"We're back! ✓"
[Auto-dismiss after 2 seconds]
```

---

# 6. Permission States

## 6.1 Microphone Permission

### Requesting

**Visual:** Microphone icon, friendly

**Copy:**
```
Headline: Ready to talk?
Body: Ferni needs microphone access to hear you. We only listen when you're speaking—never in the background.
CTA: Enable Microphone
Secondary: Maybe later
```

---

### Denied

**Visual:** Microphone with gentle block

**Copy:**
```
Headline: We can't hear you.
Body: Microphone access was denied. You can change this in your browser settings.
CTA: Open Settings
Secondary: Type instead →
```

---

## 6.2 Notification Permission

### Requesting

**Visual:** Bell icon, warm

**Copy:**
```
Headline: Stay in the loop?
Body: We'll only notify you for things that matter—like when we're thinking of you.
CTA: Enable Notifications
Secondary: Not now
```

---

### Denied

**Visual:** Muted bell

**Copy:**
```
Headline: Notifications are off.
Body: That's okay—you can always turn them on later in settings.
```

---

# 7. Copy Guidelines

## 7.1 Tone for Each State

| State | Tone | Example |
|-------|------|---------|
| **Empty (first time)** | Inviting, exciting | "Your story starts here" |
| **Empty (after use)** | Reassuring | "Nothing here yet—that's okay" |
| **Error (our fault)** | Apologetic, active | "Something went wrong. We're on it." |
| **Error (their action)** | Helpful, never blaming | "That didn't work. Want to try again?" |
| **Loading** | Brief or silent | [Animation only] or "Getting ready..." |
| **Offline** | Calm, reassuring | "We'll reconnect soon" |

## 7.2 Word Choice

### Instead of...

| Don't Say | Say |
|-----------|-----|
| Error | Something unexpected happened |
| Failed | Didn't work |
| Invalid | Doesn't look quite right |
| Required | We need this one |
| Forbidden | This isn't available right now |
| Empty | Nothing here yet |
| No data | Your story starts here |
| Retry | Try again |
| Abort | Cancel |
| Terminate | End |

---

# 8. Visual Patterns

## 8.1 Illustration Sizing

| Context | Illustration Size | Position |
|---------|-------------------|----------|
| Full page empty | 128-200px | Centered above text |
| Inline empty | 64-96px | Left of text or centered |
| Error banner | 24-32px | Left of text |
| Toast | 20-24px | Left of text |

## 8.2 Layout Patterns

### Centered Empty State
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│         [Illustration]              │
│                                     │
│            Headline                 │
│                                     │
│     Body text goes here with       │
│     a moderate line length.        │
│                                     │
│         [ Primary CTA ]             │
│          Secondary →                │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

### Inline Error
```
┌─────────────────────────────────────┐
│  ⚠️ Headline                        │
│     Body text explanation           │
│     [ CTA ]                         │
└─────────────────────────────────────┘
```

---

# 9. Animation

## 9.1 Empty State Animations

- **Illustration:** Subtle floating or breathing (2-4s cycle)
- **Entrance:** Fade up from 20px below (500ms)
- **CTA:** Gentle attention pulse after 3s

## 9.2 Error State Animations

- **Entrance:** Fade in (200ms)
- **Shake:** On error trigger (400ms)
- **Recovery:** Green pulse when resolved

## 9.3 Loading Animations

- **Skeleton shimmer:** 2s cycle, ease-in-out
- **Spinner:** 1s rotation, linear
- **Thinking dots:** 1.4s cycle, staggered
- **Progress bar:** Dynamic based on actual progress

---

# 10. Implementation

## 10.1 Component API

```typescript
interface EmptyStateProps {
  type: 'first-time' | 'empty-collection' | 'no-results';
  illustration: IllustrationId;
  eyebrow?: string;
  headline: string;
  body: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

interface ErrorStateProps {
  type: 'connection' | 'api' | 'user' | 'permission';
  errorCode?: string;
  headline: string;
  body: string;
  recoverable: boolean;
  onRetry?: () => void;
  supportId?: string;
}
```

## 10.2 Usage

```tsx
// Empty State
<EmptyState
  type="first-time"
  illustration="connection-potential"
  eyebrow="YOUR JOURNEY"
  headline="Every great friendship starts somewhere."
  body="We're here whenever you're ready to talk."
  primaryAction={{
    label: "Start a Conversation",
    onClick: startConversation
  }}
/>

// Error State
<ErrorState
  type="connection"
  headline="We couldn't reconnect."
  body="Check your internet connection and try again."
  recoverable={true}
  onRetry={reconnect}
/>
```

---

# Appendix: State Checklist

Before shipping any feature, ensure:

- [ ] Empty state defined for first-time users
- [ ] Empty state defined for returning users with no data
- [ ] Loading state with appropriate animation
- [ ] Error states for all API calls
- [ ] Offline handling if applicable
- [ ] Permission request flows if applicable
- [ ] Copy reviewed for tone
- [ ] Illustrations match brand
- [ ] Animations respect reduced motion

---

**© 2024 Ferni. All rights reserved.**

*The screens no one designs are the ones that make or break trust.*

