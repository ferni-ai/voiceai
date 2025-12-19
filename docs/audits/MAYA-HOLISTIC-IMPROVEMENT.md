# Maya Holistic Improvement Plan

> Making Maya the best voice-first habits coach across ALL dimensions

**Date:** December 19, 2024  
**Status:** In Progress

---

## Audit Summary

Maya has rich content but gaps in integration. Her "superhuman-insights.json" is well-written but may not be consistently surfaced. She lacks a dedicated context builder like Peter has. Her function-calling guide is outdated.

---

## Improvement Areas

### 1. 📚 Function-Calling Guide Update
**Status:** ❌ Outdated  
**Issue:** Missing new voice tools  
**Fix:** Add `quickHabitCheck`, `microCommitNow`, `implementationIntention`

### 2. 🧠 Dedicated Context Builder
**Status:** ❌ Missing  
**Issue:** Peter has `peter-research-insights.ts`, Maya has nothing  
**Fix:** Create `maya-habit-insights.ts` that:
- Surfaces habit patterns from her superhuman-insights.json
- Provides predictive care context (upcoming challenges)
- Injects streak protection alerts
- Analyzes mood-habit correlations

### 3. 📖 Manifest Tool Guidance
**Status:** ❌ Outdated  
**Issue:** `llm_context.tool_guidance` doesn't list new tools  
**Fix:** Add new voice tools to manifest

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

### Phase 1: Documentation (Today) ✅
1. [x] Create 3 new voice tools
2. [ ] Update function-calling.md with new tools
3. [ ] Update manifest tool guidance

### Phase 2: Context Intelligence (Next)
4. [ ] Create `maya-habit-insights.ts` context builder
5. [ ] Inject superhuman-insights.json content
6. [ ] Add habit-aware greeting builder

### Phase 3: Proactive (Future)
7. [ ] Create habit outreach triggers
8. [ ] Streak protection system
9. [ ] Weekly review automation

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

## Files to Modify

| File | Change |
|------|--------|
| `bundles/maya-santos/identity/function-calling.md` | Add new tools |
| `bundles/maya-santos/persona.manifest.json` | Update tool_guidance |
| `context-builders/maya-habit-insights.ts` | **CREATE** |
| `context-builders/loader.ts` | Register Maya builder |
| `services/outreach/` | Add habit triggers |

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

