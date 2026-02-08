# CEO & C-Suite Commands Implementation Plan

> **Goal:** Fully implement, integrate, test, and validate all 110 CEO and C-Suite commands

---

## Phase 1: Foundation (Week 1) - High Priority

**Focus:** Core personal productivity commands that provide immediate value

### 1.1 Goals System (5 commands)
- [ ] `ferni goals list` - List all goals
- [ ] `ferni goals add "..."` - Add a goal
- [ ] `ferni goals complete <id>` - Mark complete
- [ ] `ferni goals progress` - View progress
- [ ] Backend: Firestore schema + API routes
- [ ] Tests: Unit + E2E
- [ ] Integration: Voice command support

### 1.2 Brain/Memory System (4 commands)
- [ ] `ferni brain show` - Show all memories
- [ ] `ferni brain summary` - Memory summary
- [ ] `ferni remember "..."` - Add a note
- [ ] Backend: Integrate with existing memory system
- [ ] Tests: Unit + E2E

### 1.3 Daily Briefing (3 commands)
- [ ] `ferni briefing today` - Today's briefing
- [ ] `ferni briefing tomorrow` - Tomorrow preview
- [ ] `ferni briefing week` - Week ahead
- [ ] Backend: Aggregate calendar, goals, priorities
- [ ] Tests: Unit + E2E

**Total Phase 1:** 12 commands (10% of total)
**Estimated Time:** 5-7 days
**Dependencies:** Firestore, existing memory system

---

## Phase 2: Tracking & Logging (Week 2-3)

**Focus:** Personal tracking features

### 2.1 Wins & Celebrations (6 commands)
- [ ] `ferni wins add "..."` - Log achievement
- [ ] `ferni wins list` - List all
- [ ] `ferni wins today` - Today's wins
- [ ] `ferni wins week` - Week's wins
- [ ] `ferni wins celebrate` - Celebrate mode
- [ ] Backend: Firestore wins collection
- [ ] Tests: Unit + E2E

### 2.2 Habits Tracking (5 commands)
- [ ] `ferni habits add <habit>` - Add habit
- [ ] `ferni habits list` - List habits
- [ ] `ferni habits check <habit>` - Mark done
- [ ] `ferni habits streak <habit>` - Show streak
- [ ] `ferni habits delete <habit>` - Delete
- [ ] Backend: Habit tracking with streaks
- [ ] Tests: Unit + E2E

### 2.3 Energy & Journal (10 commands)
- [ ] `ferni energy log <1-10>` - Log energy
- [ ] `ferni energy today` - Today's energy
- [ ] `ferni energy week` - Week view
- [ ] `ferni journal "..."` - Quick entry
- [ ] `ferni journal list` - List entries
- [ ] `ferni gratitude "..."` - Log gratitude
- [ ] `ferni gratitude list` - List all
- [ ] Backend: Time-series data
- [ ] Tests: Unit + E2E

### 2.4 Decisions & Priorities (13 commands)
- [ ] `ferni decisions add "..."` - Track decision
- [ ] `ferni decisions list` - List all
- [ ] `ferni decisions pending` - Pending only
- [ ] `ferni priorities list` - List priorities
- [ ] `ferni priorities add "..."` - Add priority
- [ ] `ferni priorities reorder` - Reorder
- [ ] `ferni blockers add "..."` - Track blocker
- [ ] `ferni blockers list` - List blockers
- [ ] `ferni ideas "..."` - Capture idea
- [ ] `ferni ideas list` - List ideas
- [ ] Backend: Decision/priority data models
- [ ] Tests: Unit + E2E

**Total Phase 2:** 34 commands (31% of total)
**Estimated Time:** 10-14 days
**Dependencies:** Phase 1 foundation

---

## Phase 3: Focus & Reflection (Week 4)

**Focus:** Deep work and self-awareness features

### 3.1 Focus Sessions (4 commands)
- [ ] `ferni focus start <mins>` - Start session
- [ ] `ferni focus stop` - Stop session
- [ ] `ferni focus status` - Current status
- [ ] `ferni focus history` - Past sessions
- [ ] Backend: Timer + distraction blocking
- [ ] Integration: OS notifications
- [ ] Tests: Unit + E2E

### 3.2 Reflection System (8 commands)
- [ ] `ferni reflect today` - Daily reflection
- [ ] `ferni reflect prompts` - Reflection prompts
- [ ] `ferni reflect history` - Past reflections
- [ ] `ferni weekly review` - Week review
- [ ] `ferni weekly plan` - Plan next week
- [ ] `ferni weekly last` - Last week
- [ ] Backend: Reflection templates + analysis
- [ ] Tests: Unit + E2E

**Total Phase 3:** 12 commands (11% of total)
**Estimated Time:** 5-7 days
**Dependencies:** Phase 1-2

---

## Phase 4: Team & Meetings (Week 5)

**Focus:** Collaboration and meeting management

### 4.1 Team Roster (6 commands)
- [ ] `ferni roster show` - Show all team
- [ ] `ferni roster maya` - Maya profile
- [ ] `ferni roster alex` - Alex profile
- [ ] `ferni roster jordan` - Jordan profile
- [ ] `ferni roster peter` - Peter profile
- [ ] Backend: Persona metadata API
- [ ] Tests: Unit + E2E

### 4.2 Meeting Notes (5 commands)
- [ ] `ferni meetings add "..."` - Add notes
- [ ] `ferni meetings list` - List meetings
- [ ] `ferni meetings today` - Today's meetings
- [ ] `ferni meetings week` - Week's meetings
- [ ] `ferni meetings search <q>` - Search
- [ ] Backend: Meeting notes storage + search
- [ ] Tests: Unit + E2E

### 4.3 AI Coaching (4 commands)
- [ ] `ferni ask "..."` - Ask anything
- [ ] `ferni coach career` - Career coaching
- [ ] `ferni coach relationship` - Relationship
- [ ] `ferni coach mindset` - Mindset
- [ ] Backend: Coaching conversation engine
- [ ] Integration: Gemini API
- [ ] Tests: Unit + E2E

**Total Phase 4:** 15 commands (14% of total)
**Estimated Time:** 5-7 days
**Dependencies:** Phase 1-3

---

## Phase 5: C-Suite Intelligence (Week 6-8)

**Focus:** Executive-level business intelligence

### 5.1 CTO Commands (6 commands)
- [ ] `ferni cto health` - Architecture health
- [ ] `ferni cto debt` - Tech debt inventory
- [ ] `ferni cto incidents` - Incident tracking
- [ ] `ferni cto security` - Security scan
- [ ] `ferni cto dependencies` - Dep health
- [ ] `ferni cto performance` - System perf
- [ ] Backend: Code analysis + metrics
- [ ] Integration: GitHub, Sentry, etc.
- [ ] Tests: Unit + E2E

### 5.2 CIO Commands (5 commands)
- [ ] `ferni cio compliance` - SOC2/GDPR status
- [ ] `ferni cio data-catalog` - Data lineage
- [ ] `ferni cio access-review` - Permissions
- [ ] `ferni cio risk` - Risk register
- [ ] `ferni cio vendors` - Vendor assessments
- [ ] Backend: Compliance tracking
- [ ] Tests: Unit + E2E

### 5.3 CPO Commands (6 commands)
- [ ] `ferni cpo roadmap` - Product roadmap
- [ ] `ferni cpo feedback` - User feedback
- [ ] `ferni cpo experiments` - A/B results
- [ ] `ferni cpo prioritize` - RICE scoring
- [ ] `ferni cpo personas` - User personas
- [ ] `ferni cpo churn` - Churn prediction
- [ ] Backend: Product analytics
- [ ] Integration: Analytics platforms
- [ ] Tests: Unit + E2E

### 5.4 CMO Commands (6 commands)
- [ ] `ferni cmo campaigns` - Campaign perf
- [ ] `ferni cmo content` - Content calendar
- [ ] `ferni cmo seo` - SEO health
- [ ] `ferni cmo social` - Social analytics
- [ ] `ferni cmo attribution` - Attribution
- [ ] `ferni cmo competitors` - Competitive intel
- [ ] Backend: Marketing analytics
- [ ] Tests: Unit + E2E

### 5.5 CSCO Commands (5 commands)
- [ ] `ferni csco costs` - Cost optimization
- [ ] `ferni csco vendors` - Vendor perf
- [ ] `ferni csco slas` - SLA monitoring
- [ ] `ferni csco capacity` - Capacity planning
- [ ] `ferni csco automation` - Automation ROI
- [ ] Backend: Ops analytics
- [ ] Tests: Unit + E2E

**Total Phase 5:** 28 commands (25% of total)
**Estimated Time:** 15-21 days
**Dependencies:** Phase 1-4

---

## Implementation Strategy

### Architecture Pattern

```typescript
// 1. CLI Command (apps/cli/src/commands/ceo/<feature>.ts)
export const goalsCommand = {
  command: 'goals <action>',
  describe: 'Track your goals',
  handler: async (argv) => {
    const response = await fetch('/api/ceo/goals', {
      method: 'POST',
      body: JSON.stringify({ action: argv.action })
    });
    console.log(response);
  }
};

// 2. API Route (src/api/ceo-routes.ts)
router.post('/api/ceo/goals', async (req, res) => {
  const result = await goalsService.handleAction(req.body);
  res.json(result);
});

// 3. Service Layer (src/services/ceo/goals-service.ts)
export class GoalsService {
  async handleAction(action: string) {
    // Business logic
    return await db.goals.query();
  }
}

// 4. Storage Layer (src/services/ceo/goals-storage.ts)
export class GoalsStorage {
  async list(userId: string) {
    return await firestore.collection('goals')
      .where('userId', '==', userId)
      .get();
  }
}

// 5. Tests (src/tests/ceo/goals.test.ts)
describe('Goals Service', () => {
  it('should list goals', async () => {
    const goals = await goalsService.list(userId);
    expect(goals).toHaveLength(3);
  });
});
```

### Data Models (Firestore)

```typescript
// collections/users/{userId}/goals/{goalId}
interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  targetDate?: Date;
  progress: number; // 0-100
  milestones: Milestone[];
  createdAt: Date;
  updatedAt: Date;
}

// collections/users/{userId}/wins/{winId}
interface Win {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  date: Date;
  celebratedAt?: Date;
}

// collections/users/{userId}/habits/{habitId}
interface Habit {
  id: string;
  userId: string;
  name: string;
  frequency: 'daily' | 'weekly';
  streak: number;
  lastCompletedAt?: Date;
  history: Date[];
}
```

### Voice Integration

All commands should be voice-callable:

```typescript
// In tool definition
{
  name: 'trackGoal',
  description: 'Track progress on a goal',
  parameters: {
    action: { type: 'string', enum: ['list', 'add', 'complete'] },
    goal: { type: 'string', optional: true }
  }
}

// User says: "Show me my goals"
// → Gemini calls: trackGoal({ action: 'list' })
// User says: "Mark my fitness goal as complete"
// → Gemini calls: trackGoal({ action: 'complete', goal: 'fitness' })
```

---

## Testing Strategy

### 1. Unit Tests (Vitest)
```bash
pnpm test src/services/ceo/
pnpm test src/api/ceo-routes.test.ts
```

### 2. Integration Tests (Firestore Emulator)
```bash
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm test
```

### 3. E2E Tests (CLI)
```bash
ferni goals add "Test goal"
ferni goals list
ferni goals complete test-goal-id
```

### 4. Voice Tests (Synthetic)
```typescript
describe('Voice Integration', () => {
  it('should track goal via voice', async () => {
    const response = await voiceAgent.process({
      transcript: 'Show me my goals'
    });
    expect(response.toolCalls).toContain('trackGoal');
  });
});
```

---

## Success Metrics

| Phase | Commands | Coverage | E2E Tests | Status |
|-------|----------|----------|-----------|--------|
| Phase 1 | 12 | 80%+ | 12 | 🔴 Not started |
| Phase 2 | 34 | 80%+ | 34 | 🔴 Not started |
| Phase 3 | 12 | 80%+ | 12 | 🔴 Not started |
| Phase 4 | 15 | 80%+ | 15 | 🔴 Not started |
| Phase 5 | 28 | 80%+ | 28 | 🔴 Not started |
| **Total** | **101** | **80%+** | **101** | **0% complete** |

---

## Next Steps

1. **Approve this plan** or request changes
2. **Start with Phase 1** (Goals, Brain, Briefing)
3. **Create Firestore schemas** for data models
4. **Implement CLI commands** following the pattern
5. **Add API routes** for each command
6. **Write tests** (unit + E2E)
7. **Integrate with voice** (tool definitions)
8. **Validate E2E** (manual testing)
9. **Move to Phase 2** once Phase 1 is 100% complete

---

*Last updated: February 2026*
