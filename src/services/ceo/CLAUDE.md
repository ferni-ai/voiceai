# CEO Services

> **Personal productivity and business intelligence for the Ferni CLI.**

Services in this directory power the CEO CLI commands - from personal productivity tracking to executive dashboards.

---

## Architecture Level

CEO Services are at **Level 60** (Services layer):

```
Level 100: agents/, api/, cli/
Level 70:  personas/, intelligence/, tools/
Level 60:  services/, services/ceo/    <- THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Services

### Goals Service

**File:** `goals.ts`

Manages user goals with Firestore persistence.

```typescript
import { goalsService, createGoal, getGoals } from '../services/ceo/index.js';

// Create a goal
const goal = await createGoal(userId, {
  title: 'Launch v2.0',
  category: 'career',
  targetDate: new Date('2026-03-01'),
  milestones: [
    { title: 'Complete design' },
    { title: 'Finish implementation' },
    { title: 'QA testing' },
  ],
});

// Get all active goals
const goals = await getGoals(userId, 'active');

// Update progress
await goalsService.updateProgress(userId, goal.id, 50);

// Complete a milestone (auto-recalculates progress)
await goalsService.completeMilestone(userId, goal.id, milestoneId);
```

**Firestore Collection:** `users/{userId}/goals`

**Data Model:**

```typescript
interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: Date;
  progress: number;           // 0-100, auto-calculated from milestones
  status: 'active' | 'completed' | 'paused';
  category: 'career' | 'health' | 'relationship' | 'financial' | 'personal';
  milestones: Milestone[];
  createdAt: Date;
  updatedAt: Date;
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
}
```

**Features:**
- Auto-calculates progress from milestones
- Auto-completes goal when all milestones done
- Validates progress (0-100), status, and category
- Graceful degradation when Firestore unavailable

---

### Notification Service

**File:** `notification.ts`

Handles Slack and email notifications for autonomous actions.

```typescript
import { notificationService, getCEONotificationService } from '../services/ceo/notification.js';

// Send a Slack message
await notificationService.sendSlack('#ceo-alerts', {
  text: 'Experiment promoted!',
  blocks: [
    {
      type: 'header',
      text: { type: 'plain_text', text: ':trophy: Winner!', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Experiment *voice-v2* promoted to 100%' },
    },
  ],
});

// Send an email
await notificationService.sendEmail(
  'ceo@company.com',
  'Daily Digest',
  '<h1>Your daily update</h1><p>Metrics look great!</p>'
);

// Notify about experiment promotion
await notificationService.notifyExperimentPromotion('voice-v2', 'variant_a');

// Notify about an incident
await notificationService.notifyIncident({
  id: 'inc-001',
  title: 'High latency on voice agent',
  severity: 'major',
  status: 'investigating',
  affectedServices: ['voice-agent'],
  startedAt: new Date(),
});

// Send daily/weekly digest
await notificationService.sendDigest(userId, 'daily');

// Check configuration status
const isSlack = notificationService.isSlackConfigured();
const isEmail = notificationService.isEmailConfigured();

// Check rate limit status
const status = notificationService.getRateLimitStatus();
```

**Environment Variables:**
- `SLACK_CEO_WEBHOOK_URL` - Slack webhook URL (falls back to `SLACK_WEBHOOK_URL`)
- `SENDGRID_API_KEY` - SendGrid API key for email
- `CEO_NOTIFICATION_EMAIL` - Default email recipient
- `SENDGRID_FROM_EMAIL` - From email address (default: notifications@ferni.ai)

**Features:**
- Graceful degradation when credentials are missing (logs only)
- Rate limiting: 30 Slack messages/burst, 10 emails/burst
- Nice formatted Slack messages with blocks and attachments
- HTML email templates with Ferni branding
- Experiment promotion notifications
- Incident alerts (sends email for critical incidents)
- Daily/weekly digest support

---

### Wins Service

**File:** `wins.ts`

Track personal achievements for motivation and reflection.

```typescript
import { winsService, addWin, getWins, getRandomWin } from '../services/ceo/index.js';

// Log a win
const win = await addWin(userId, 'Shipped the new feature!', 'work');

// Get today's wins
const todayWins = await getWins(userId, 'today');

// Get a random win for motivation
const randomWin = await getRandomWin(userId);

// Get wins by category
const workWins = await winsService.getWinsByCategory(userId, 'work');
```

**Firestore Collection:** `users/{userId}/wins`

**Data Model:**

```typescript
interface Win {
  id: string;
  userId: string;
  description: string;
  category?: string;
  linkedGoalId?: string;
  createdAt: Date;
}
```

---

### Journal Service

**File:** `journal.ts`

Quick journaling with auto-sentiment detection.

```typescript
import { journalService, addEntry, getEntries, search } from '../services/ceo/index.js';

// Add a journal entry (sentiment auto-detected)
const entry = await addEntry(userId, 'Had a great day, feeling productive!');
// entry.sentiment = 'positive'

// Get this week's entries
const weekEntries = await getEntries(userId, 'week');

// Search journal
const results = await search(userId, 'productive');

// Get entries by sentiment
const positiveEntries = await journalService.getEntriesBySentiment(userId, 'positive');
```

**Firestore Collection:** `users/{userId}/journal`

**Data Model:**

```typescript
interface JournalEntry {
  id: string;
  userId: string;
  content: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  tags?: string[];
  createdAt: Date;
}
```

**Features:**
- Auto-detects sentiment from content
- Full-text search (client-side for simplicity)
- Filter by sentiment

---

### Energy Service

**File:** `energy.ts`

Track energy levels throughout the day.

```typescript
import { energyService, logEnergy, getWeeklyAverage, getWeeklyAnalysis } from '../services/ceo/index.js';

// Log energy (1-10 scale)
await logEnergy(userId, 8, 'Feeling great after morning workout');

// Get today's logs
const todayLogs = await energyService.getToday(userId);

// Get weekly average
const average = await getWeeklyAverage(userId); // e.g., 7.2

// Get detailed weekly analysis
const analysis = await getWeeklyAnalysis(userId);
// {
//   logs: [...],
//   average: 7.2,
//   trend: 'improving' | 'stable' | 'declining',
//   peakTime: '10AM',
//   lowTime: '3PM'
// }
```

**Firestore Collection:** `users/{userId}/energy`

**Data Model:**

```typescript
interface EnergyLog {
  id: string;
  userId: string;
  level: number;  // 1-10
  notes?: string;
  createdAt: Date;
}
```

**Features:**
- Level clamped to 1-10 range
- Weekly trend analysis (improving/stable/declining)
- Peak and low time detection

---

### Gratitude Service

**File:** `gratitude.ts`

Log things you're grateful for.

```typescript
import { gratitudeService, addGratitude, getRandom, getStreak } from '../services/ceo/index.js';

// Add gratitude entry
await addGratitude(userId, 'Morning coffee with my partner', 'people');

// Get a random entry for mood boost
const random = await getRandom(userId);

// Get today's entries
const todayEntries = await gratitudeService.getToday(userId);

// Get streak (consecutive days with entries)
const streak = await getStreak(userId); // e.g., 5 days
```

**Firestore Collection:** `users/{userId}/gratitude`

**Data Model:**

```typescript
interface GratitudeEntry {
  id: string;
  userId: string;
  content: string;
  category?: string;  // 'people', 'health', 'work', etc.
  createdAt: Date;
}
```

**Features:**
- Random entry retrieval for mood boost
- Streak tracking (consecutive days)
- Pre-defined categories available via `GRATITUDE_CATEGORIES`

---

### Insights Service - "Better than Human" Cross-Data Intelligence

**File:** `insights.ts`

This is the KEY differentiator for Ferni - superhuman pattern recognition across ALL CEO data. No human friend could maintain this level of comprehensive awareness.

```typescript
import { insightsService, getAllInsights, getCriticalInsights } from '../services/ceo/index.js';

// Get all insights (with caching - 30 min TTL)
const insights = await getAllInsights(userId);

// Force refresh (bypass cache)
const fresh = await insightsService.refreshInsights(userId);

// Get only urgent/high priority insights
const critical = await getCriticalInsights(userId);

// Get specific insight types
const energyInsights = await insightsService.getEnergyGoalInsights(userId);
const blockerInsights = await insightsService.getBlockerImpactInsights(userId);
const burnoutWarning = await insightsService.getBurnoutWarning(userId);
```

**Firestore Collection:** `users/{userId}/insights_cache`

**Data Model:**

```typescript
interface Insight {
  id: string;
  type: 'correlation' | 'pattern' | 'warning' | 'celebration' | 'suggestion';
  category: 'energy' | 'goals' | 'decisions' | 'focus' | 'momentum' | 'burnout' | 'patterns' | 'blockers' | 'productivity';
  title: string;
  description: string;
  confidence: number;       // 0-1
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dataPoints: number;       // How many data points support this
  actionable?: string;      // Suggested action
  relatedIds?: string[];    // Related goal/decision/blocker IDs
  createdAt: Date;
}
```

**Insight Categories:**

| Function | What It Detects |
|----------|-----------------|
| `getEnergyGoalInsights()` | Correlations between energy levels and goal progress |
| `getBlockerImpactInsights()` | Long-standing blockers affecting goals |
| `getDecisionQualityInsights()` | Decision outcomes correlated with energy |
| `getFocusEffectivenessInsights()` | Optimal focus session durations |
| `getMomentumInsights()` | Win streaks and momentum patterns |
| `getBurnoutWarning()` | Declining energy + increasing blockers + decreasing wins |
| `getWeeklyPatterns()` | Day-of-week productivity patterns |

**Example Insights:**

- "Decisions made when energy is 7+ have 40% higher outcome ratings"
- "Your 90-min focus sessions are 2x more effective than 25-min"
- "Blocker 'waiting on vendor' has been affecting 3 goals for 5 days"
- "You're on a 5-day career win streak!"
- "Burnout warning: energy dropped 30%, wins dropped from 8 to 2"
- "Mondays you log 3x more ideas than Fridays"

**Features:**

- Cross-references ALL CEO data (goals, wins, energy, journal, gratitude, focus, decisions, priorities, blockers, ideas, meetings)
- 30-minute cache TTL for performance
- Confidence scores based on data points
- Actionable suggestions for each insight
- Priority-sorted results (urgent -> high -> medium -> low)
- Links to related entities (goalIds, blockerIds, etc.)

---

## Adding New Services

1. Create `{service-name}.ts` in this directory
2. Export from `index.ts`
3. Update this CLAUDE.md

### Template

```typescript
/**
 * My Service
 *
 * Brief description.
 */

import { getFirestoreDb, cleanForFirestore, recordDegradation } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'my-service' });

// Types
export interface MyData {
  id: string;
  userId: string;
  // ...
}

// Implementation
export async function createMyData(userId: string, input: MyInput): Promise<MyData> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('my-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  // Implementation...
}

// Singleton export
export const myService = {
  createMyData,
  // ...
};
```

---

## Service Status

| Service | File | Purpose | Status |
|---------|------|---------|--------|
| Goals | `goals.ts` | Goal tracking | Done |
| Notification | `notification.ts` | Slack/email notifications | Done |
| Wins | `wins.ts` | Achievement logging | Done |
| Journal | `journal.ts` | Quick journaling | Done |
| Energy | `energy.ts` | Energy logging | Done |
| Gratitude | `gratitude.ts` | Gratitude logging | Done |
| Briefing | `briefing.ts` | Morning briefing | Done |
| Focus | `focus.ts` | Focus sessions | Done |
| Weekly | `weekly-review.ts` | Weekly review | Done |
| Ask | `ask.ts` | Ask Ferni anything | Done |
| Decisions | `decisions.ts` | Decision tracking | Done |
| Priorities | `priorities.ts` | Priority management | Done |
| Blockers | `blockers.ts` | Blocker tracking | Done |
| Ideas | `ideas.ts` | Idea capture | Done |
| Meetings | `meetings.ts` | Meeting notes & action items | Done |
| **Insights** | `insights.ts` | **"Better than Human" cross-data intelligence** | **Done** |

---

## Related Documentation

- `docs/plans/CLI-IMPLEMENTATION-PLAN.md` - Full implementation plan
- `apps/cli/CLAUDE.md` - CLI development guide
- `../CLAUDE.md` - Services layer patterns

---

*Last updated: January 2026*
