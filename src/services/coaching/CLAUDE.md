# Coaching Services

> **Life coaching intelligence and goal tracking.**

## Overview

Coaching services power Ferni's ability to help users grow:
- Goal setting and tracking
- Milestone detection
- Cognitive reframing
- Cross-persona coaching coordination

---

## Directory Structure

```
coaching/
├── index.ts                       # Main exports
├── persistence.ts                 # Coaching data persistence
│
├── # Goal & Progress
├── goal-tracking.ts               # Track user goals
├── milestone-detection.ts         # Detect achievements
├── journey-tracking.ts            # Long-term progress
├── progress-metrics.ts            # Progress measurement
├── obstacle-detection.ts          # Detect obstacles to goals
├── reengagement.ts                # Re-engage lapsed users
│
├── # Cognitive Support
├── cognitive-reframes.ts          # Reframe negative thinking
├── emotional-granularity.ts       # Detailed emotion naming
├── action-planning.ts             # Break goals into actions
├── socratic-engine.ts             # Socratic questioning engine
├── values-coaching.ts             # Values-based coaching
├── style-adaptation.ts            # Adapt coaching style to user
├── profile-personalizer.ts        # Personalize coaching profile
│
├── # Semantic Intelligence
├── semantic-calendar.ts           # Calendar-aware coaching
├── semantic-confidence-tracker.ts # Track coaching confidence
├── semantic-handoff.ts            # Semantic handoff context
├── semantic-trust.ts              # Trust-aware coaching
├── seasonal-awareness.ts          # Season-aware coaching
│
├── # Coordination
├── cross-persona-context.ts       # Share context between personas
├── handoff-intelligence.ts        # Smart persona handoffs
│
└── __tests__/                     # Coaching tests
```

**Total: 24 modules**

---

## Usage

```typescript
import { trackGoal, detectMilestone } from './goal-tracking.js';

await trackGoal(userId, {
  description: 'Exercise 3x per week',
  category: 'health',
  targetDate: nextMonth,
});

const milestone = await detectMilestone(userId, userText);
if (milestone) {
  // Celebrate!
}
```

---

## Coaching Modes

| Mode | Description |
|------|-------------|
| `supportive` | Gentle encouragement |
| `challenging` | Push for growth |
| `exploratory` | Ask questions |
| `celebratory` | Acknowledge wins |

---

## Integration Points

- **Trust Systems**: Honor boundaries while coaching
- **Intelligence**: Pattern detection for insights
- **Personas**: Maya specializes in habits, Jordan in goals

---

*Last updated: January 2026*
