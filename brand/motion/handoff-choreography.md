# Persona Handoff Choreography

> **"Every transition tells a story."**

---

## The Philosophy

When users switch between personas—or when Ferni brings in a team member—it should feel like watching friends pass the baton. Not a cold interface change. A warm, intentional handoff.

---

## Handoff Scenarios

### 1. User-Initiated Switch
User explicitly requests a different persona.

**Trigger**: "Can I talk to Maya?" / Taps persona selector

**Flow**:
```
Current Persona → Farewell Micro-Animation → Crossfade → New Persona Entry
```

### 2. Ferni-Suggested Handoff
Ferni recognizes another persona would serve better.

**Trigger**: Topic detection (habits → Maya, patterns → Peter, etc.)

**Flow**:
```
Ferni → Suggestion Message → User Confirms → Graceful Exit → Team Member Entry
```

### 3. Team Collaboration
Persona brings in another team member momentarily.

**Trigger**: Cross-domain insight needed

**Flow**:
```
Current Persona → "Let me check with Peter..." → Brief Overlay → Insight → Return
```

---

## Visual Choreography

### Phase 1: Farewell (300-500ms)

The departing persona acknowledges the handoff:

| Persona | Farewell Animation | Message Example |
|---------|-------------------|-----------------|
| **Ferni** | Gentle nod, glow dims softly | "I'll let Maya take it from here." |
| **Maya** | Warm smile, slight wave | "You're in good hands." |
| **Peter** | Quick nod, lightbulb dims | "I'll be here if you need patterns." |
| **Jordan** | Enthusiastic wave, bounce | "Go get 'em!" |
| **Alex** | Crisp nod, clean exit | "Got it. Handing off." |
| **Nayan** | Slow bow, stillness | "Namaskaram." |

**Animation Specs**:
```css
.farewell-animation {
    animation: fadeAndScale 400ms ease-out forwards;
}

@keyframes fadeAndScale {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.95); }
}
```

### Phase 2: Transition (200-400ms)

The in-between moment:

**Color Shift**:
```
Departing Color → Neutral (#f5f5f5) → Arriving Color
```

**Timing**:
- Color transition: 200ms with soft blur
- Avatar crossfade: 300ms overlap
- Glow transfer: 250ms

**Implementation**:
```css
.color-transition {
    transition: background-color 200ms ease-in-out;
    filter: blur(2px);
}

.avatar-crossfade {
    animation: crossfade 300ms ease-in-out;
}
```

### Phase 3: Arrival (400-600ms)

The new persona makes their entrance:

| Persona | Entrance Animation | Signature Move |
|---------|-------------------|----------------|
| **Ferni** | Fade in, gentle pulse | Soft glow expansion |
| **Maya** | Warm bloom from center | Celebration colors |
| **Peter** | Quick materialize, lightbulb flash | Pattern recognition spark |
| **Jordan** | Bouncy scale up, confetti hint | Elastic entrance |
| **Alex** | Clean slide in, crisp stop | Smooth professional |
| **Nayan** | Slow fade, stillness | Deep presence settle |

**Animation Specs**:
```css
.entrance-animation {
    animation: scaleAndFade 500ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes scaleAndFade {
    0% { opacity: 0; transform: scale(0.9); }
    100% { opacity: 1; transform: scale(1); }
}
```

---

## Persona-Specific Handoff Pairs

Some handoffs happen more frequently. These have extra polish:

### Ferni → Maya (Habits)
**Common trigger**: User mentions wanting to build a habit

```
Ferni: "Sounds like you want to build something new. Maya's amazing at this."
[Ferni's sage glow warms to terracotta]
[Avatar morphs with soft breathing transition]
Maya: "Hey! I heard 'habit.' What are we building?"
```

**Visual**: Sage → Warm bloom → Terracotta

### Ferni → Peter (Patterns)
**Common trigger**: User shares data or asks about trends

```
Ferni: "I'm seeing something here, but Peter would spot it faster."
[Ferni's glow sharpens, shifts to teal]
[Quick, curious transition]
Peter: "Ooh! Show me what you've got."
```

**Visual**: Sage → Sharp focus → Teal discovery

### Ferni → Jordan (Milestones)
**Common trigger**: User mentions upcoming event or life transition

```
Ferni: "This sounds like a big chapter. Jordan lives for these moments."
[Ferni's glow brightens, shifts to coral]
[Celebratory transition with subtle confetti]
Jordan: "Oh! Tell me everything!"
```

**Visual**: Sage → Joy burst → Sunset coral

### Ferni → Alex (Communication)
**Common trigger**: User needs help with a difficult message

```
Ferni: "Let's get this exactly right. Alex is the one for this."
[Ferni's glow focuses, shifts to indigo]
[Clean, efficient transition]
Alex: "Okay. What do you actually want to say?"
```

**Visual**: Sage → Focus → Indigo clarity

### Ferni → Nayan (Deep Questions)
**Common trigger**: User asks existential or long-view questions

```
Ferni: "This is the kind of question Nayan lives for."
[Ferni's glow deepens, warms to amber]
[Slow, contemplative transition]
Nayan: "Mm. Let's sit with this."
```

**Visual**: Sage → Deepen → Amber wisdom

---

## Handoff Messages

### Ferni Handing Off

| To | Message |
|----|---------|
| Maya | "Maya's got you. She built everything from tiny habits." |
| Peter | "Let me get Peter—he sees patterns I miss." |
| Jordan | "Jordan's going to love this. She lives for milestones." |
| Alex | "Alex will find the right words. She always does." |
| Nayan | "This deserves Nayan's perspective. He thinks in decades." |

### Team Members Handing Back to Ferni

| From | Return Message |
|------|----------------|
| Maya | "Ferni's got you from here. Keep going." |
| Peter | "I'll let Ferni know what I found. They'll take it from here." |
| Jordan | "Back to Ferni—but I'm so excited for you!" |
| Alex | "Done. Ferni's got the rest." |
| Nayan | "Ferni will hold what we've uncovered." |

---

## Timing Chart

| Phase | Duration | Easing |
|-------|----------|--------|
| Farewell message | 200ms | ease-out |
| Farewell animation | 400ms | ease-out |
| Color transition | 200ms | ease-in-out |
| Avatar crossfade | 300ms | ease-in-out |
| Glow transfer | 250ms | ease-out |
| Entrance animation | 500ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Greeting message | 200ms | ease-in |

**Total handoff time**: ~1.5-2 seconds

---

## Sound Design (Future)

Each handoff could have subtle audio cues:

| Phase | Sound |
|-------|-------|
| Farewell | Soft chime down |
| Transition | Gentle whoosh |
| Arrival | Warm chime up |

Persona-specific tones:
- Maya: Warm, organic
- Peter: Crisp, discovery
- Jordan: Bright, celebratory
- Alex: Clean, efficient
- Nayan: Deep, resonant

---

## Edge Cases

### Rapid Switching
If user switches personas quickly:
- Skip farewell animation
- Direct crossfade (200ms)
- Abbreviated greeting

### Same Persona Re-selection
If user selects the current persona:
- Gentle pulse acknowledgment
- No transition animation
- Confirmation message: "Still here."

### Mid-Conversation Suggestion
If Ferni suggests a handoff during active conversation:
- Suggestion appears as subtle overlay
- User can dismiss or accept
- No interruption to current flow

### Return After Handoff
When returning to original persona:
- Brief "welcome back" animation
- Context preserved
- "Where were we?" acknowledgment

---

## Implementation Checklist

### UI Components
- [ ] Persona selector with transition states
- [ ] Avatar crossfade component
- [ ] Color theme transition system
- [ ] Glow transfer animation
- [ ] Handoff message overlay

### State Management
- [ ] Current persona state
- [ ] Transition state (entering, exiting, stable)
- [ ] Conversation context preservation
- [ ] Handoff history tracking

### Animation System
- [ ] Farewell animations per persona
- [ ] Entrance animations per persona
- [ ] Color transition utilities
- [ ] Timing orchestration

---

## The Ultimate Test

After every handoff, ask:

1. **Did it feel seamless?** Not jarring, not abrupt.
2. **Did both personas feel present?** The goodbye and hello both mattered.
3. **Was context preserved?** The new persona knows what happened.
4. **Did it feel like friends?** Not a database query. A warm handoff.

If yes to all four, the choreography is working.

---

*Every handoff is a chance to show: this is a team that cares about you.*
