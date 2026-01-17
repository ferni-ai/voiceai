# Relationship Stage Systems

> **Understanding the TWO stage systems in Ferni and why they're different.**

---

## Overview

Ferni has **two separate relationship stage systems** that serve different purposes. This document explains what they are, why they exist, and how they map to each other.

## The Two Systems

### 1. Team Unlock Stages (UI System)

**Purpose:** Controls team member unlocking, feature gating, and UI progression indicators.

**Where it's used:**
- `apps/web/src/services/relationship-stage.service.ts` - Main UI service
- `apps/web/src/services/team-unlock.service.ts` - Team member unlock logic
- `src/services/team-unlocks.ts` - Backend unlock validation
- `src/api/routes/relationship.ts` - API endpoints

**Stage Names:**
```typescript
type TeamUnlockStage =
  | 'first-meeting'
  | 'getting-started'
  | 'building-trust'
  | 'established'
  | 'deep-partnership';
```

**Thresholds:**

| Stage | Conversations | Days | Streak | Team Members Unlocked |
|-------|---------------|------|--------|----------------------|
| first-meeting | 0 | 0 | 0 | Ferni |
| getting-started | 10 | 0 | 0 | +Maya Santos (Habits) |
| building-trust | 15 | 5 | 3 | +Peter John (Research) |
| established | 30 | 21 | 7 | +Alex Chen, +Jordan Taylor |
| deep-partnership | 60 | 45 | 14 | +Nayan Patel (premium) |

**Why these thresholds?** The "Cameo Unlock System" uses higher thresholds to:
1. Let users get to know Ferni before meeting teammates
2. Allow natural, contextual introductions during relevant conversations
3. Create retention through unlocking anticipation

---

### 2. Persona Behavior Stages (Conversation System)

**Purpose:** Controls how personas behave in conversation - their warmth, depth, and conversation style.

**Where it's used:**
- `src/types/relationship-stages.ts` - Type definitions
- `src/personas/shared/relationship-triggers.json` - Shared behavior rules
- `src/personas/bundles/ferni/content/behaviors/relationship-stages.json` - Per-persona behaviors

**Stage Names:**
```typescript
type PersonaBehaviorStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'trusted_confidant';
```

**Thresholds (from relationship-stages.json):**

| Stage | Turns | Sessions | Behaviors Unlocked |
|-------|-------|----------|-------------------|
| stranger | 0-14 | 0 | Basic questions, surface empathy, gentle curiosity |
| acquaintance | 15-74 | 1-4 | Probing questions, light humor, callbacks to past |
| friend | 75-249 | 5-14 | Deeper questions, gentle challenges, personal stories |
| trusted_confidant | 250+ | 15+ | Tough love, accountability, direct feedback |

**Why different thresholds?** Lower thresholds because:
1. We want personas to feel warm and personal quickly
2. Conversation style should evolve naturally within sessions
3. Users shouldn't feel like they're talking to a cold stranger for 10+ conversations

---

## Why Two Systems?

The systems are **intentionally different** to balance:

| Concern | Team Unlock | Persona Behavior |
|---------|-------------|------------------|
| **Goal** | Retention, monetization | Natural conversation |
| **Pacing** | Slow (days/weeks) | Fast (within sessions) |
| **User feeling** | Anticipation, achievement | Warmth, connection |
| **Metric focus** | Calendar time, streaks | Turn count, depth |

**Example scenario:**
- User has 8 conversations (not at "getting-started" yet for unlocks)
- But they've had 150+ turns, sharing deeply
- **Team Unlock:** Still "first-meeting" - no Maya yet
- **Persona Behavior:** "Friend" level - Ferni is warm, personal, remembers details

This creates the right experience: Users feel connected to Ferni while still having team members to unlock.

---

## Stage Mapping

When you need to translate between systems, use these mappings from `src/types/relationship-stages.ts`:

### Team Unlock → Persona Behavior

```typescript
import { teamUnlockToPersonaBehavior } from '../types/relationship-stages.js';

const unlockStage: TeamUnlockStage = 'building-trust';
const behaviorStage = teamUnlockToPersonaBehavior(unlockStage);
// → 'friend'
```

| Team Unlock Stage | → Persona Behavior Stage |
|-------------------|--------------------------|
| first-meeting | stranger |
| getting-started | acquaintance |
| building-trust | friend |
| established | friend |
| deep-partnership | trusted_confidant |

### Persona Behavior → Team Unlock

```typescript
import { personaBehaviorToTeamUnlock } from '../types/relationship-stages.js';

const behaviorStage: PersonaBehaviorStage = 'friend';
const unlockStage = personaBehaviorToTeamUnlock(behaviorStage);
// → 'building-trust' (minimum unlock stage for that behavior)
```

---

## Features Unlocked by Stage

### Team Unlock Features

```typescript
// From relationship-stage.service.ts
const UNLOCKABLE_FEATURES = {
  // Getting Started
  'custom-rituals': 'getting-started',
  'relationship-progress': 'getting-started',
  'progress-analytics': 'getting-started',

  // Building Trust
  'team-huddle': 'building-trust',
  'memory-browser': 'building-trust',
  'memory-timeline': 'building-trust',
  'wellbeing-dashboard': 'building-trust',
  'prediction-accuracy': 'building-trust',
  'group-coaching': 'building-trust',
  'video-sessions': 'building-trust',

  // Established
  'deep-insights': 'established',
  'conversation-history': 'established',
};
```

### Persona Behavior Features

From `relationship-triggers.json`:

| Stage | Allowed | Not Yet |
|-------|---------|---------|
| stranger | Basic questions, surface empathy, gentle curiosity | Probing questions, tough love, personal stories |
| acquaintance | Probing questions, light humor, callbacks | Tough love, deep vulnerability, accountability |
| friend | Personal stories, deeper questions, gentle challenges | Harsh truths, ultimatums |
| trusted_confidant | Tough love, accountability, direct feedback, everything | - |

---

## Common Mistakes to Avoid

### ❌ Using the wrong stage type

```typescript
// Wrong - mixing types
const stage: RelationshipStage = 'building-trust'; // Error!

// Correct
const unlockStage: TeamUnlockStage = 'building-trust';
const behaviorStage: PersonaBehaviorStage = 'friend';
```

### ❌ Hardcoding thresholds

```typescript
// Wrong - will drift from source of truth
if (conversations >= 15 && days >= 5) { ... }

// Correct - use constants
import { TEAM_UNLOCK_THRESHOLDS } from '../types/relationship-stages.js';
const threshold = TEAM_UNLOCK_THRESHOLDS['building-trust'];
if (conversations >= threshold.minConversations && days >= threshold.minDays) { ... }
```

### ❌ Forgetting streak requirements

```typescript
// Wrong - missing streak check
if (conversations >= 15 && days >= 5) {
  return 'building-trust';
}

// Correct - check all three
const { minConversations, minDays, minStreak } = TEAM_UNLOCK_THRESHOLDS['building-trust'];
if (conversations >= minConversations && days >= minDays && bestStreak >= minStreak) {
  return 'building-trust';
}
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/relationship-stages.ts` | Type definitions, mapping utilities |
| `apps/web/src/services/relationship-stage.service.ts` | Main UI stage service |
| `apps/web/src/services/team-unlock.service.ts` | Team member unlock logic |
| `src/services/team-unlocks.ts` | Backend unlock validation |
| `src/api/routes/relationship.ts` | API endpoints |
| `src/personas/shared/relationship-triggers.json` | Shared behavior triggers |
| `src/personas/bundles/ferni/content/behaviors/relationship-stages.json` | Ferni-specific behaviors |

---

## Adding a New Stage (Checklist)

If you need to add a new stage to either system:

### Team Unlock Stage
- [ ] Update `TeamUnlockStage` type in `src/types/relationship-stages.ts`
- [ ] Add thresholds to `TEAM_UNLOCK_THRESHOLDS`
- [ ] Update `TEAM_UNLOCK_STAGE_ORDER` and `TEAM_UNLOCK_STAGE_LEVELS`
- [ ] Update mapping functions
- [ ] Update in `apps/web/src/services/relationship-stage.service.ts`
- [ ] Update in `apps/web/src/services/team-unlock.service.ts`
- [ ] Update in `src/services/team-unlocks.ts`
- [ ] Update in `src/api/routes/relationship.ts`

### Persona Behavior Stage
- [ ] Update `PersonaBehaviorStage` type in `src/types/relationship-stages.ts`
- [ ] Add thresholds to `STAGE_THRESHOLDS`
- [ ] Update `STAGE_LEVELS`
- [ ] Update mapping functions
- [ ] Update in `src/personas/shared/relationship-triggers.json`
- [ ] Update in each persona's `relationship-stages.json`

---

*Last updated: December 2024*

