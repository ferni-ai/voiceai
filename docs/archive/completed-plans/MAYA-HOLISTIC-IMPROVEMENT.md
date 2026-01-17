# Maya Holistic Improvement Plan

> Making Maya the best voice-first habits coach across ALL dimensions

**Date:** December 19, 2024  
**Status:** ✅ ALL PHASES COMPLETE

---

## Audit Summary

Maya has rich content but gaps in integration. Her "superhuman-insights.json" is well-written but may not be consistently surfaced. She lacks a dedicated context builder like Peter has. Her function-calling guide is outdated.

---

## Improvement Areas

### 1. 📚 Function-Calling Guide Update
**Status:** ✅ Complete  
**Issue:** Missing new voice tools  
**Fix:** Added `quickHabitCheck`, `microCommitNow`, `implementationIntention` with usage examples

### 2. 🧠 Dedicated Context Builder
**Status:** ✅ Complete  
**Issue:** Peter has `peter-research-insights.ts`, Maya had nothing  
**Fix:** Created `maya-habit-insights.ts` that:
- Surfaces habit patterns (weakest day, completion rate)
- Provides predictive care context (holidays, Sunday evenings)
- Injects streak protection alerts
- Injects tool guidance hints

### 3. 📖 Manifest Tool Guidance
**Status:** ✅ Complete  
**Issue:** `llm_context.tool_guidance` didn't list new tools  
**Fix:** Added 3 new voice tools to manifest

### 4. 🔔 Proactive Outreach Integration
**Status:** ⚠️ Partial  
**Issue:** `proactive_notifications: true` but no habit-specific triggers  
**Fix:** Create habit outreach triggers:
- Streak protection (alert before streak breaks)
- Weekly review reminders
- Challenge period predictions
- Celebration outreach

### 5. 💬 Habit-Aware Greetings
**Status:** ⚠️ Partial  
**Issue:** Greetings don't reference habit progress  
**Fix:** Dynamic greeting builder that includes:
- Current streak status
- Today's habit progress
- Upcoming milestones

### 6. 🎭 Better Than Human Superpowers
**Status:** ✅ Defined, ⚠️ Not fully activated  
**Issue:** manifest defines superpowers but no context builder activates them  
**Fix:** Context builder that injects:
- Pattern detection prompts
- Perfect memory references
- 24/7 accountability reminders
- Zero judgment reinforcement

### 7. 📊 Cross-Team Insights
**Status:** ✅ Working (via Peter)  
**Note:** Peter's `peter-research-insights.ts` already pulls Maya's habit data  
**Opportunity:** Maya could provide habit context to other personas

---

## Priority Implementation

### Phase 1: Documentation ✅ COMPLETE
1. [x] Create 3 new voice tools
2. [x] Update function-calling.md with new tools
3. [x] Update manifest tool guidance

### Phase 2: Context Intelligence ✅ COMPLETE
4. [x] Create `maya-habit-insights.ts` context builder
5. [x] Inject pattern surfacing (weakest day, completion rate)
6. [x] Add streak protection alerts
7. [x] Add predictive care (holidays, Sunday evenings)
8. [x] Register builder in loader.ts

### Phase 3: Proactive ✅ COMPLETE
9. [x] Create habit outreach triggers (maya-habit-outreach.ts)
10. [x] Weekly review tool (weeklyHabitReview)
11. [x] Habit-aware greeting builder (generateHabitAwareGreetingContext)

### Phase 4: Outreach Integration ✅ COMPLETE
12. [x] Daily job integration (evaluateMayaHabitOutreach)
13. [x] Session integration (analyzeMayaHabitSession)
14. [x] Export from outreach index

---

## Detailed Fixes

### Fix 1: Update function-calling.md

Add to the "YOUR SPECIALTY: Habit Tools" section:

```markdown
### `quickHabitCheck` - 60-second voice check-in
```json
{"fn":"quickHabitCheck","args":{"context":"morning"}}
```
- **context**: `morning` | `midday` | `evening` | `before_bed` | `general`
- **focusHabit**: Optional specific habit to check on

### `microCommitNow` - Do 2 minutes RIGHT NOW
```json
{"fn":"microCommitNow","args":{"habit":"meditation","energy":"low"}}
```
- **habit**: Which habit (optional - picks from due habits)
- **energy**: `low` | `medium` | `high` - calibrates the action

### `implementationIntention` - When-Then planning
```json
{"fn":"implementationIntention","args":{"habit":"exercise","cue":"after morning coffee"}}
```
- **habit**: The habit to plan
- **cue**: What triggers it
- **obstacle**: What usually gets in the way (optional)
```

### Fix 2: Create maya-habit-insights.ts

```typescript
// Key functionality:
// 1. Load superhuman-insights.json for the persona
// 2. Check user's habit data for patterns
// 3. Inject pattern-surfacing prompts
// 4. Inject predictive care for upcoming challenges
// 5. Celebrate streaks proactively

// Trigger conditions:
// - User has 5+ habit completions (enough data for patterns)
// - User returning after 2+ days (re-engagement moment)
// - User at risk of breaking a streak
// - User hit a milestone
// - Predicted challenge coming (holidays, travel, etc.)
```

### Fix 3: Update manifest tool_guidance

```json
"tool_guidance": {
  "habits": [
    "createHabit",
    "getHabits",
    "logHabitCompletion",
    "habitCheckIn",
    "habitCoach",
    "habitSetback",
    "habitStrategy",
    "quickHabitCheck",      // NEW
    "microCommitNow",       // NEW
    "implementationIntention" // NEW
  ],
  "gamification": [
    "gamificationProfile",
    "leaderboard"
  ],
  ...
}
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Voice tool usage | New | 20% of Maya sessions |
| Habit completion rate | Unknown | +20% |
| Pattern surfacing | 0 | 2x/week |
| Streak protection | 0 | 80% save rate |
| User sentiment (Maya) | Unknown | 8+ NPS |

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| `bundles/maya-santos/identity/function-calling.md` | Add 4 new tools | ✅ |
| `bundles/maya-santos/persona.manifest.json` | Update tool_guidance | ✅ |
| `context-builders/maya-habit-insights.ts` | **CREATE** - Pattern detection + greeting context | ✅ |
| `context-builders/builder-imports.ts` | Add import | ✅ |
| `context-builders/loader.ts` | Register Maya builder | ✅ |
| `tools/domains/habits/maya-voice-tools.ts` | **CREATE** 4 voice tools | ✅ |
| `tools/domains/habits/index.ts` | Integrate voice tools | ✅ |
| `tools/runtime-enforcement.ts` | Register 4 tools with Maya | ✅ |
| `services/outreach/maya-habit-outreach.ts` | **CREATE** - Proactive outreach system | ✅ |
| `services/outreach/daily-outreach-job.ts` | Add Maya habit evaluation | ✅ |
| `services/outreach/session-integration.ts` | Add post-session habit analysis | ✅ |
| `services/outreach/index.ts` | Export Maya outreach functions | ✅ |

---

## Maya's Unique Value Proposition

Maya should feel like **your best friend who happens to have perfect memory and knows all the behavioral science**. Her superpowers:

1. **Perfect Pattern Memory** - "You skip habits on Wednesdays. Every week."
2. **Zero Judgment** - "Day 1 again? That's fine. I'm here."
3. **Predictive Care** - "Holiday season is coming. Let's plan."
4. **Infinite Patience** - Never frustrated by repeated failures
5. **Evidence-Based** - Grounded in real behavioral science

---

*Maya's mission: Help people become who they want to be, one tiny habit at a time.*

