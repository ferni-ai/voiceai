# Maya Santos Excellence Plan

> Making Maya the best-in-class voice-first habits coach

**Date:** December 19, 2024  
**Status:** ✅ ALL PHASES COMPLETE

---

## Current State

### Maya's Core Tools (13)
| Tool | Purpose | Status |
|------|---------|--------|
| `createHabit` | Create/remove habits | ✅ Working |
| `logHabitCompletion` | Track completion, streaks, XP | ✅ Working |
| `getHabits` | List habits, due today, stats | ✅ Working |
| `habitCheckIn` | Progress check-in with encouragement | ✅ Working |
| `habitCoach` | Recommendations, motivation, Four Tendencies | ✅ Working |
| `habitSetback` | Compassionate setback recovery | ✅ Working |
| `habitStrategy` | Habit bundles and stacking | ✅ Working |
| `gamificationProfile` | XP, badges, level, titles | ✅ Working |
| `leaderboard` | Social rankings | ✅ Working |
| `quickHabitCheck` | 60-second voice check-in | ✅ Phase 1 |
| `microCommitNow` | 2-minute action right now | ✅ Phase 1 |
| `implementationIntention` | When-then planning | ✅ Phase 1 |
| `weeklyHabitReview` | Reflective weekly summary | ✅ Phase 3 |

### Maya's Context Intelligence
| System | Purpose | Status |
|--------|---------|--------|
| `maya-habit-insights.ts` | Pattern detection, streak protection, predictive care | ✅ Phase 2 |
| `maya-habit-outreach.ts` | Proactive reminders, milestone celebrations | ✅ Phase 3 |
| Habit-aware greetings | Context-aware conversation openers | ✅ Phase 3 |

### Maya's Domain Access
- **Quiet Growth** (10 tools): `honorTheRest`, `celebrateMaintenance`, `enoughForToday`, `seasonalWisdom`, `winterSeason`, `gentleGoals`, `releaseUrgency`, `goodEnough`, `compareToYesterday`, `embracePlateau`
- **Self-Compassion** (12 tools): `practiceSelfKindness`, `speakToYourselfAsAFriend`, `noticeInnerCritic`, `reframeInnerCritic`, `practiceSelfAcceptance`, `embraceImperfection`, `enoughness`, `celebrateYourself`, `giveYourselfCredit`, `selfCompassionBreak`, `compassionateLetter`, `bodyImageCompassion`
- **Wellness** (4 tools): `emotionalSupport`, `reframeBelief`, `manageMedication`, `medicationSchedule`

### Behavior Science Frameworks ✅
- Atomic Habits (Four Laws)
- Tiny Habits (BJ Fogg)
- Four Tendencies (Gretchen Rubin)
- Power of Habit (Habit Loops)
- Glidepath Levels (5-level progression)

---

## Gap Analysis

### 🔴 Critical Missing (Voice-First Essentials)

#### 1. Quick Voice Check-In
**Problem:** Current habit tracking requires navigating tools. Voice should be instant.
**Solution:** `quickHabitCheck` - Maya asks "Did you do X?" → User says yes/no → Instant celebration/compassion

```typescript
// Example flow:
Maya: "Hey! Quick check - did you do your morning meditation?"
User: "Yes!"
Maya: "Nice! That's 7 days in a row! You're building something real."
```

#### 2. Proactive Habit Reminders
**Problem:** Maya doesn't reach out proactively about habits.
**Solution:** Integrate with outreach system - Maya texts/calls at optimal times

```
"Hey, it's Maya. Just checking in - have you done your 10-minute walk yet today?"
```

#### 3. Micro-Commitment Now
**Problem:** No way to do a habit "right now" in conversation
**Solution:** `microCommitNow` - "Can you do 2 minutes right now? I'll wait."

```typescript
Maya: "I know you didn't feel like exercising today. Could you do just 2 minutes of stretching right now? I'll count with you."
User: "Okay..."
Maya: "Great! Stand up... reach for the ceiling... 1... 2... 3..."
```

### 🟡 Important Missing (Coaching Depth)

#### 4. Implementation Intentions Tool
**Problem:** No structured "when-then" planning
**Solution:** `implementationIntention` - Create if-then plans for habits

```
Maya: "Let's make this automatic. Complete this sentence: When I [situation], I will [habit]."
User: "When I sit down at my desk in the morning, I will drink a glass of water."
Maya: "Perfect! 'When I sit at my desk, I drink water.' I'll ask you about this tomorrow."
```

#### 5. Habit Autopsy
**Problem:** `habitSetback` is compassionate but not diagnostic
**Solution:** `habitAutopsy` - Deep analysis of WHY a habit failed

```
Maya: "Let's figure out what happened, not to blame you, but to learn. 
      - What day/time did you usually miss?
      - What was happening in your life?
      - Was the habit too big?
      - Was the cue clear enough?"
```

#### 6. Weekly Review Session
**Problem:** No guided weekly reflection
**Solution:** `weeklyHabitReview` - Structured reflection session

```
Maya: "It's Sunday - time for our weekly check-in! 
      - What worked this week?
      - What was harder than expected?
      - What's one tiny adjustment for next week?"
```

#### 7. Energy-Habit Correlation
**Problem:** No connection between habits and how user feels
**Solution:** `trackEnergy` + correlation analysis

```
Maya: "I noticed something interesting - you report higher energy on days you exercise. 
      The data shows: Exercise days = 7.2 average energy, Non-exercise = 5.1. 
      That's a 40% difference!"
```

### 🟢 Nice to Have (Advanced Features)

#### 8. Accountability Declaration
**Problem:** No voice commitment recording
**Solution:** User records "I commit to..." - Maya plays it back when needed

#### 9. Habit Chain Visualization
**Problem:** No way to see/hear habit stacks
**Solution:** `describeHabitChain` - Maya describes the chain verbally

```
Maya: "Your morning chain: Wake up → Drink water → 5-minute stretch → Journal → Coffee. 
      Each one flows into the next. That's beautiful design."
```

#### 10. Streak Protection Alerts
**Problem:** Maya doesn't proactively protect streaks
**Solution:** Outreach when streaks are at risk

```
Maya: "Hey! Quick note - you're at 13 days on your meditation streak. 
      That's amazing. Have you done it today? I don't want you to lose momentum."
```

---

## "Better Than Human" Superpowers

Maya should do things **no human friend could**:

| Superpower | Human Limitation | Maya's Advantage |
|------------|-----------------|------------------|
| **Perfect Memory** | Friends forget your habits | Maya remembers every habit, every attempt, every streak |
| **Pattern Detection** | Humans miss correlations | Maya sees "You miss habits on Wednesdays" |
| **24/7 Accountability** | Friends have lives | Maya is always available at 3am |
| **Zero Judgment** | Even supportive friends judge | Maya genuinely has no judgment |
| **Infinite Patience** | People get frustrated | Maya never gets tired of hearing about failed habits |
| **Data Analysis** | Humans can't track everything | Maya correlates mood, energy, time, success |
| **Proactive Reminders** | Friends don't send reminders | Maya reaches out at optimal times |

---

## Implementation Priority

### Phase 1: Voice-First Essentials ✅ COMPLETE
1. [x] `quickHabitCheck` - Instant voice check-in
2. [x] `microCommitNow` - Do 2 minutes right now
3. [x] `implementationIntention` - When-then planning
4. [ ] Integrate habits with proactive outreach

### Phase 2: Coaching Depth (Week 3-4)
5. [ ] `habitAutopsy` - Why did this habit fail?
6. [ ] `weeklyHabitReview` - Guided weekly reflection

### Phase 3: Pattern Intelligence (Week 5-6)
7. [ ] `trackEnergy` - Energy + habit correlation
8. [ ] Pattern detection ("You miss Wednesdays")
9. [ ] Streak protection alerts

### Phase 4: Advanced Features (Future)
10. [ ] Accountability declarations (voice recording)
11. [ ] Habit chain visualization
12. [ ] Social accountability features

---

## Voice & Personality Fixes (Completed Dec 19)

- [x] Changed `default_emotion` from "affectionate" to "friendly"
- [x] Replaced all "warm"/"affectionate" with "friendly"/"happy" in greetings
- [x] Removed excessive SSML breaks (was creating slow/creepy intro)
- [x] Updated `greetings.json`, `entrances.json`, `greeting-atoms.json`
- [x] Fixed `buildDynamicMayaGreeting()` in `warm-greeting.ts`

**Result:** Maya now sounds like an encouraging friend, not a breathy intimate voice.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Habit completion rate | Unknown | +20% |
| Streak maintenance | Unknown | +30% |
| User engagement (habits) | Unknown | 3x/week |
| NPS for Maya | Unknown | 8+ |
| "Maya feels like a friend" | Unknown | 80%+ |

---

## File Locations

| Purpose | Path |
|---------|------|
| Core habit tools | `src/tools/domains/habits/` |
| **Maya voice tools** | `src/tools/domains/habits/maya-voice-tools.ts` |
| Habit coaching | `src/tools/habit-coaching/` |
| Maya persona | `src/personas/bundles/maya-santos/` |
| Quiet growth tools | `src/tools/domains/quiet-growth/` |
| Self-compassion tools | `src/tools/domains/self-compassion/` |
| Proactive outreach | `src/services/outreach/` |
| Tool ownership | `src/tools/runtime-enforcement.ts` |

---

## Next Steps

1. **Prioritize**: Decide which Phase 1 items to build first
2. **Design**: Write detailed specs for each new tool
3. **Implement**: Build tools following CLAUDE.md patterns
4. **Test**: Test with real voice conversations
5. **Iterate**: Get user feedback and improve

---

*Maya's mission: Help people become the person they want to be, one tiny habit at a time.*

