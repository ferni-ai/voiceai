# 🧑‍🏫 Ferni Life Coaching System

> "We believe in making AI human, and the decisions we make will reflect that."

This document describes Ferni's comprehensive life coaching capabilities - a system designed to help users achieve their goals, overcome obstacles, and grow as individuals.

---

## Overview

The coaching system transforms Ferni from a conversational AI into a genuine life coach who:

- **Tracks goals** and helps users break them into actionable steps
- **Detects obstacles** and provides supportive strategies
- **Adapts coaching style** to match each user's preferences
- **Builds emotional vocabulary** for better self-understanding
- **Tracks the journey** and celebrates milestones
- **Coordinates with the team** for specialized support

---

## Core Modules

### 1. Goal Tracking (`goal-tracking.ts`)

Detects and tracks user goals across life domains.

```typescript
import { createGoal, getActiveGoals, checkInOnGoal } from './services/coaching';

// Detect a goal in user speech
const detection = detectGoalStatement('I want to exercise 3 times a week');
// => { isGoal: true, goalText: "exercise 3 times a week", domain: "health" }

// Create and track the goal
const goal = createGoal(userId, {
  description: 'Exercise 3 times a week',
  domain: 'health',
});

// Check in on progress
checkInOnGoal(userId, goal.id, {
  progress: 'I went to the gym twice this week!',
  feeling: 'proud',
});
```

**Domains**: health, career, relationships, finances, growth, creativity, spirituality

---

### 2. Action Planning (`action-planning.ts`)

Breaks goals into small, achievable steps.

```typescript
import {
  detectActionOpportunity,
  generateActionSuggestions,
  createAction,
} from './services/coaching';

// Detect when user is ready for action
const opportunity = detectActionOpportunity('I should really start going to the gym');
// => { isOpportunity: true, reason: "should_statement", extractedTopic: "gym" }

// Generate suggestions
const suggestions = generateActionSuggestions('going to the gym');
// => [
//   { action: "Pack your gym bag tonight", difficulty: "easy", timeframe: "today" },
//   { action: "Schedule one gym session for this week", difficulty: "easy", timeframe: "this_week" },
//   ...
// ]
```

---

### 3. Obstacle Detection (`obstacle-detection.ts`)

Identifies and addresses common barriers to progress.

**Obstacle Types**:
| Type | Example | Response Approach |
|------|---------|-------------------|
| `time` | "I don't have time" | Micro-actions, prioritization |
| `energy` | "I'm too tired" | Energy management, boundaries |
| `fear` | "I'm scared I'll fail" | Gradual exposure, reframing |
| `perfectionism` | "It has to be perfect" | Progress over perfection |
| `overwhelm` | "There's so much to do" | Breaking down, one step focus |
| `motivation` | "I just don't feel like it" | Values connection, momentum |

```typescript
import { detectObstacle, generateObstacleResponse } from './services/coaching';

const obstacle = detectObstacle(userId, "I just don't have the time to exercise");
// => { type: "time", severity: "moderate", ... }

const support = generateObstacleResponse(obstacle);
// => {
//   acknowledgment: "Time feels so precious, doesn't it?",
//   question: "What's one thing you could do in just 5 minutes?",
//   ssml: "<speak>..."
// }
```

---

### 4. Coaching Style Adaptation (`style-adaptation.ts`)

Adapts coaching approach to user preferences.

**Styles**:
| Style | User Signals | Approach |
|-------|-------------|----------|
| `analytical` | Data, numbers, analysis | Structured, evidence-based |
| `emotional` | Feelings, impact, support | Validation-first, gentle |
| `action` | "Let's do it", direct | Concrete steps, challenges |
| `reflective` | Deep questions, why | Socratic, exploration |
| `supportive` | Needs encouragement | Warm, celebrating small wins |
| `challenging` | "Push me", growth | Direct feedback, stretch goals |

```typescript
import { detectStyleSignals, getStyleGuidance } from './services/coaching';

// Automatically detect from conversation
detectStyleSignals(userId, "I've been analyzing my patterns and the data shows...");

// Get guidance for response
const guidance = getStyleGuidance(userId);
// => {
//   style: "analytical",
//   toneDescriptor: "structured and evidence-based",
//   responseStructure: "Present data/facts first, then discuss implications",
//   questionsToAsk: ["What patterns are you seeing?", ...]
// }
```

---

### 5. Emotional Granularity (`emotional-granularity.ts`)

Helps users develop richer emotional vocabulary.

```typescript
import { detectVagueExpression, getVocabularySuggestions } from './services/coaching';

const detection = detectVagueExpression(userId, 'I just feel bad');
// => {
//   isVague: true,
//   expression: "bad",
//   category: "sadness",
//   alternatives: ["disappointed", "discouraged", "lonely", "drained"],
//   expansionPrompt: "When you say 'bad', I'm curious - is it more like feeling disappointed? Drained? Something else?"
// }
```

---

### 6. Journey Tracking (`journey-tracking.ts`)

Tracks the user's overall coaching journey and celebrates milestones.

**Milestone Types**:

- `session_count` - Number of coaching sessions (5, 10, 25, 50, 100)
- `time_duration` - Duration of coaching relationship (1 month, 3 months, etc.)
- `goal_completed` - Completing a goal
- `breakthrough_moment` - Significant insight or shift
- `habit_streak` - Maintaining a habit consistently
- `challenge_overcome` - Successfully navigating a difficult obstacle

```typescript
import { recordSession, generateJourneyReflection } from './services/coaching';

// Record each session
const milestone = recordSession(userId, {
  topics: ['work-life balance', 'boundaries'],
  emotionalTone: 'hopeful',
  hadBreakthrough: true,
});

// Generate journey reflection
const reflection = generateJourneyReflection(userId);
// => {
//   title: "One Month Together",
//   reflection: "Looking back at our conversations, I see real growth...",
//   themes: ["work-life balance", "self-compassion"],
//   highlights: [...]
// }
```

---

### 7. Cognitive Reframes (`cognitive-reframes.ts`)

Detects cognitive distortions and offers reframing techniques.

**Distortion Types**:
| Distortion | Example | Reframe Technique |
|------------|---------|-------------------|
| `all_or_nothing` | "I'm a total failure" | Finding middle ground |
| `catastrophizing` | "This will be a disaster" | Realistic probability |
| `mind_reading` | "They think I'm stupid" | Evidence examination |
| `should_statements` | "I should be further" | Flexible preferences |
| `overgeneralization` | "I always mess up" | Specific instances |

```typescript
import { detectDistortions, generateReframes } from './services/coaching';

const distortions = detectDistortions('I always fail at everything I try');
// => [{ type: "overgeneralization", confidence: 0.85, trigger: "always" }]

const reframes = generateReframes(userId, 'I always fail', 'overgeneralization');
// => {
//   techniques: [
//     { technique: "Specific Exception", reframedThought: "Can you think of one time you succeeded?" },
//     { technique: "Reality Testing", reframedThought: "What evidence supports this? What contradicts it?" },
//     ...
//   ]
// }
```

---

### 8. Socratic Engine (`socratic-engine.ts`)

Guides users to self-discovery through thoughtful questions.

**Question Types**:
| Type | Purpose | Example |
|------|---------|---------|
| `clarifying` | Understanding what they mean | "What do you mean by success?" |
| `assumption_probing` | Examining beliefs | "What makes you believe that?" |
| `evidence_seeking` | Finding support | "What evidence supports this?" |
| `perspective_taking` | New viewpoints | "How might someone else see this?" |
| `implication_exploring` | Consequences | "What would happen if...?" |

```typescript
import { generateSocraticResponse } from './services/coaching';

const response = generateSocraticResponse("I can't handle the pressure at work", 'overwhelmed');
// => {
//   validation: "That sounds like a heavy load you're carrying.",
//   question: {
//     type: "clarifying",
//     question: "When you say you can't handle it, what specifically feels most overwhelming?"
//   },
//   combined: "That sounds like a heavy load... What specifically feels most overwhelming?",
//   ssml: "<speak>..."
// }
```

---

### 9. Values Coaching (`values-coaching.ts`)

Helps users identify and align with their core values.

```typescript
import {
  getValuesExplorationPrompt,
  identifyValue,
  generateValuesCheck,
} from './services/coaching';

// Explore values
const exploration = getValuesExplorationPrompt(userId);
// => { prompt: "I'm curious about what matters most to you...", ... }

// Record identified value
identifyValue(userId, 'Family', 'relationships', 5);

// Check decision against values
const check = generateValuesCheck(userId, 'Should I take this job offer?');
// => {
//   questions: [
//     "How does this align with your value of Family?",
//     "What would you need to feel good about this decision?",
//     ...
//   ],
//   relevantValues: [...]
// }
```

---

### 10. Team Handoff Intelligence (`handoff-intelligence.ts`)

Coordinates with other team members for specialized support.

**Team Members**:
| Persona | Specialty | Trigger Topics |
|---------|-----------|----------------|
| Maya | Habits & Routines | Morning routine, habits, consistency |
| Alex | Communication | Email, difficult conversations, conflict |
| Peter | Research | Deep dives, analysis, information |
| Jordan | Event Planning | Parties, travel, organization |
| Jack | Wisdom & Mentorship | Life decisions, philosophy, career |

```typescript
import { detectHandoffOpportunity, generateTeamIntroduction } from './services/coaching';

const handoff = detectHandoffOpportunity(userId, "I can't stick to my morning routine", 'ferni');
// => {
//   shouldHandoff: true,
//   targetPersona: "maya",
//   confidence: 0.8,
//   reason: "Habit and routine expertise"
// }

const intro = generateTeamIntroduction('maya', 'morning routine struggles');
// => {
//   intro: "You know, Maya is actually amazing with routines. Want me to bring her in?",
//   ssml: "<speak>..."
// }
```

---

### 11. Cross-Persona Context (`cross-persona-context.ts`)

Ensures continuity across team member interactions.

```typescript
import { shareContext, getContextForPersona, buildCrossPersonaContext } from './services/coaching';

// Share insight with team
shareContext(userId, {
  fromPersona: 'ferni',
  type: 'insight',
  content: 'User is working on work-life balance, has young kids',
  importance: 'high',
  expiresInDays: 30,
});

// Get context when switching personas
const context = getContextForPersona(userId, 'maya');
// => {
//   recentSharedContexts: [...],
//   recentTeamInteractions: [...],
//   relevantItems: ["User has young kids", "Working on boundaries"]
// }
```

---

### 12. Progress Metrics (`progress-metrics.ts`)

Tracks and presents user growth over time.

```typescript
import { recordProgressSession, generateProgressReflection } from './services/coaching';

// Record session data
recordProgressSession(userId, {
  topics: ['career', 'confidence'],
  emotionalStart: 'anxious',
  emotionalEnd: 'hopeful',
  hadInsight: true,
  goalProgress: true,
});

// Generate reflection
const reflection = generateProgressReflection(userId);
// => {
//   title: "Your Growth Journey",
//   reflection: "In our last few conversations, I've noticed some real shifts...",
//   highlights: [
//     { type: "emotional_shift", description: "From anxious to hopeful" },
//     { type: "insight", description: "Recognized limiting belief" },
//   ]
// }
```

---

### 13. Seasonal Awareness (`seasonal-awareness.ts`)

Understands seasonal and contextual factors affecting users.

```typescript
import { getCurrentSeason, getUpcomingHolidays, recordDifficultTime } from './services/coaching';

// Know the season
const season = getCurrentSeason(new Date());
// => "winter" (with associated mood/energy considerations)

// Upcoming holidays
const holidays = getUpcomingHolidays(userId, new Date('2024-12-20'));
// => [{ name: "Christmas", date: ..., culturalSignificance: "high" }]

// Remember difficult times
recordDifficultTime(userId, 'December', 'anniversary of loss');
// Future Decembers will include extra sensitivity
```

---

### 14. Re-engagement (`reengagement.ts`)

Thoughtfully reaches out to users who haven't been active.

**Nudge Types**:
| Type | When | Tone |
|------|------|------|
| `gentle_checkin` | After a few days | "Just thinking of you" |
| `celebrating_independence` | User doing well | "So glad you're thriving!" |
| `supportive_reach` | After difficult conversation | "How are you doing?" |
| `casual_hello` | General absence | Light, no pressure |
| `milestone_based` | Near goal deadline | Relevant reminder |

```typescript
import { shouldSendNudge, generateNudge } from './services/coaching';

const result = shouldSendNudge(userId);
// => { shouldNudge: true, nudgeType: "gentle_checkin", reason: "3 days since last session" }

const nudge = generateNudge(userId);
// => {
//   type: "gentle_checkin",
//   message: "Hey, just thinking of you. How have things been going with the morning routine?",
//   ssml: "<speak>..."
// }
```

---

## Safety Integration

The coaching system integrates deeply with the safety module for crisis detection.

```typescript
import { performSafetyCheck } from './services/safety';

const check = performSafetyCheck(userMessage, {
  userId,
  personaId: 'ferni',
  sessionSignals: [],
});

if (check.crisisDetected) {
  // Priority shifts to safety
  // Warm, validating response with resources
}
```

**Safety Philosophy**:

- Never abandon the user
- Validate first, resources second
- "I'm here, AND I want you to have more support"
- Conservative detection (false positives are acceptable)

---

## Context Builder Integration

The coaching system injects context into the LLM through the `coaching-context.ts` context builder:

```typescript
// Automatically injected when Ferni processes a turn:

[🎯 GOAL DETECTED]
User mentioned a goal: "exercise more"
Consider: "Would you like me to help you make a plan for that?"

[🚧 OBSTACLE: TIME]
User is experiencing a time obstacle.
"Time feels so precious, doesn't it?"
Question: "What's one thing you could do in just 5 minutes?"

[💭 EMOTIONAL VOCABULARY OPPORTUNITY]
User used vague emotional language.
Consider gently asking: "When you say 'bad', what does that feel like specifically?"
```

---

## Persistence

All coaching profiles are persisted to Firestore:

```typescript
import { initializeCoachingForSession, persistCoachingForSession } from './services/coaching';

// On session start
await initializeCoachingForSession(userId);

// On session end
await persistCoachingForSession(userId);
```

**Persisted Data**:

- Goal profiles (goals, check-ins, completions)
- Action profiles (actions, follow-ups)
- Obstacle profiles (patterns, successful strategies)
- Style profiles (detected preferences, explicit settings)
- Journey profiles (milestones, sessions, reflections)
- Values profiles (identified values, importance ratings)
- Progress profiles (metrics, highlights)
- Team context (cross-persona insights, interactions)

---

## Unified API

For convenience, all coaching capabilities are available through a unified API:

```typescript
import {
  getCoachingContextForLLM,
  analyzeForCoaching,
  // ... all exports
} from './services/coaching';

// Get full coaching context for LLM injection
const context = getCoachingContextForLLM(userId, {
  currentPersona: 'ferni',
  userMessage: userText,
});

// Analyze a message for coaching opportunities
const analysis = analyzeForCoaching(userId, userText, { currentPersona: 'ferni' });
// => {
//   hasGoalStatement: true,
//   hasObstacle: false,
//   hasVagueEmotion: true,
//   suggestedHandoff: false,
//   ...
// }
```

---

## Running Tests

```bash
npm run test -- src/tests/coaching.test.ts
```

---

## Future Enhancements

1. **Machine Learning Integration** - Train models on successful coaching patterns
2. **Outcome Tracking** - Long-term goal completion analytics
3. **Group Coaching** - Family/team goal coordination
4. **Integrations** - Connect with fitness apps, calendars, habit trackers
5. **Personalized Frameworks** - Detect which therapeutic approaches work best per user

---

## Philosophy

> "Better than human."

This isn't arrogance - it's the promise. We offer what human coaches can't:

- **Perfect memory** - We never forget a single goal, obstacle, or breakthrough
- **Constant presence** - 2am gets the same quality coaching as noon
- **Zero judgment** - Pure acceptance, always
- **Six perspectives** - Instantly available, no referrals
- **Emotional consistency** - No bad days, no distraction

Every feature in this system is designed to make that promise real.
