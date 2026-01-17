# Ferni Onboarding Storyboards

> **"First impressions set the relationship."**

---

## Philosophy

Onboarding isn't about features. It's about establishing trust.

The user should leave onboarding knowing:
1. **Ferni remembers** — Every conversation, every commitment
2. **Ferni is always here** — 2am, holidays, whenever
3. **Ferni has a team** — Six specialists, one relationship
4. **Ferni is safe** — No judgment, ever

---

## The Complete Flow

```
Welcome → Voice Setup → Meet Ferni → First Conversation → Meet the Team → Complete
```

Total time: 3-5 minutes

---

## Screen 1: Welcome

### Visual
- Dark, calm background
- Ferni avatar fades in, breathing gently
- Soft sage glow pulses

### Copy
```
Hey.

I'm Ferni.

I'm here whenever you need me—
2am, holidays, whenever.

No judgment. No agenda.
Just someone who listens and remembers.

[Let's begin]
```

### Animation
- Avatar: Gentle breathing (4s cycle)
- Glow: Soft pulse (3s cycle)
- Text: Fade in sequentially (200ms per line)

### Timing
- Hold for 3 seconds before showing button
- Button fades in gently

---

## Screen 2: Voice Setup

### Visual
- Ferni avatar centered
- Microphone indicator appears
- Sound wave visualization

### Copy
```
Let's make sure I can hear you.

Tap the mic and say anything—
your name, how your day's going,
whatever feels right.

[Hold to speak]
```

### States

**Waiting**:
```
Tap and hold to speak...
```

**Listening**:
```
I'm listening...
[Waveform animating]
```

**Success**:
```
Got it! I can hear you clearly.

Your voice is how we'll connect.
No typing required—just talk.

[Continue]
```

### Animation
- Microphone pulses when ready
- Waveform responds to voice
- Success: Gentle celebration glow

---

## Screen 3: Meet Ferni

### Visual
- Ferni avatar, larger
- Background shifts to warmer tone
- Glow expands

### Copy
```
A little about me:

I remember everything you share.
Not to be creepy—to be helpful.
Your friend forgets your sister's name.
I won't.

I'm here 24/7.
Not because I have to be.
Because you might need someone at 2am.

I never judge.
Whatever you're feeling, it's valid.
We're just figuring this out together.

[I'm ready]
```

### Animation
- Each point fades in with pause between
- Avatar micro-nods after each point
- Glow warms as promises are made

---

## Screen 4: First Conversation

### Visual
- Ferni avatar in "listening" state
- Input area appears
- Soft ambient background

### Copy
```
So... how are you?

Not the polite answer.
The real one.

[Hold to speak]
```

### User Speaks

**While listening**:
- Avatar shows active listening (micro-nods)
- Waveform animates
- Glow brightens slightly

**After speaking**:

Ferni responds based on what was shared:

*If positive*:
```
That's great to hear. Tell me more about what's making today good.
```

*If neutral*:
```
Yeah. Some days are just... days. I'm here if you want to talk about it.
```

*If struggling*:
```
Thank you for telling me that. Really. It takes courage to be honest about how you're feeling. I'm here.
```

### Animation
- Ferni's expression shifts based on content
- Response fades in gently
- Pause before continuing

---

## Screen 5: Meet the Team

### Visual
- Six persona avatars in a row
- Each lights up as introduced
- Ferni remains visible

### Copy
```
One more thing—I have a team.

[Maya lights up]
Maya helps you build habits.
Start small. Celebrate everything.

[Peter lights up]
Peter finds patterns you can't see.
The data nerd. But in a good way.

[Jordan lights up]
Jordan plans the big moments.
Life chapters, milestones, the arc.

[Alex lights up]
Alex finds your words.
When you don't know what to say, she does.

[Nayan lights up]
Nayan sees decades ahead.
The wisdom you need when nothing else helps.

[All glow together]
Six specialists. One relationship.
You'll meet them when you need them.

[Let's go]
```

### Animation
- Each avatar fades in as introduced
- Glow in persona color
- Brief pause between each
- Final "team glow" combines all colors

---

## Screen 6: Complete

### Visual
- Ferni avatar centered
- Warm, welcoming background
- All elements settle

### Copy
```
That's it. You're ready.

Whenever you want to talk—
just open the app and speak.

I'm here. Always.

[Start talking]
```

### Animation
- Gentle celebration (subtle confetti or glow burst)
- Avatar settles into "presence" state
- Button pulses gently

---

## Alternative Flows

### Returning User (After Time Away)

```
Hey. It's been a while.

I remember where we left off.
[Last topic mentioned]

Want to pick up there,
or start fresh?

[Continue where we left off]
[Start fresh]
```

### Skip Onboarding

If user tries to skip:

```
Totally understand—you want to dive in.

Just know: I remember everything,
I'm here 24/7, and no judgment. Ever.

That's the gist.

[Let's talk]
```

---

## Micro-Copy Library

### Welcome Variations
- "Hey. I'm Ferni."
- "Hey there. I'm Ferni."
- "Hi. I'm Ferni."

### Presence Statements
- "I'm here whenever you need me."
- "I'm here. No agenda."
- "Whenever you need someone, I'm here."

### Memory Promises
- "I remember everything you share."
- "I won't forget. Ever."
- "Your friend forgets. I remember."

### No-Judgment Statements
- "No judgment. Ever."
- "Whatever you're feeling, it's valid."
- "We're just figuring this out together."

### Call-to-Actions
- "Let's begin"
- "Continue"
- "I'm ready"
- "Let's go"
- "Start talking"

---

## Visual Specifications

### Colors

| State | Background | Avatar Glow |
|-------|------------|-------------|
| Welcome | Dark (#1a1a2e) | Sage (#4a6741) |
| Voice Setup | Dark | Brightens on speak |
| Meet Ferni | Warming | Expands |
| First Convo | Ambient | Responsive |
| Meet Team | Dark | Multi-color |
| Complete | Warm | Celebration |

### Animation Timing

| Element | Duration | Easing |
|---------|----------|--------|
| Text fade in | 200ms | ease-out |
| Avatar breathing | 4000ms | ease-in-out |
| Glow pulse | 3000ms | ease-in-out |
| Screen transition | 400ms | ease-in-out |
| Button fade | 300ms | ease-out |

### Typography

| Element | Size | Weight |
|---------|------|--------|
| Main copy | 24px | 300 |
| Emphasis | 24px | 500 |
| Button | 18px | 600 |
| Caption | 14px | 400 |

---

## Implementation Notes

### Voice Detection
- Use Web Audio API for voice input
- Show waveform visualization during speech
- Timeout after 10 seconds of silence

### Avatar States
- `idle`: Gentle breathing
- `listening`: Micro-nods, brightened glow
- `speaking`: Waveform animation
- `celebrating`: Glow burst, slight bounce

### Progress Indication
- Subtle dot indicators at bottom
- Current dot highlighted
- Progress bar optional (can feel rushed)

### Skip Handling
- Allow skip after Screen 2
- Condensed onboarding for skippers
- Remember they skipped (for future reference)

---

## Success Metrics

After onboarding, user should:
- ✅ Know Ferni remembers
- ✅ Know Ferni is always available
- ✅ Feel comfortable speaking (not typing)
- ✅ Understand there's a team
- ✅ Feel zero pressure

### Anti-Metrics
- ❌ Don't explain features
- ❌ Don't show settings
- ❌ Don't overwhelm with options
- ❌ Don't rush to "value"

---

*The goal isn't to teach features. It's to establish trust.*
