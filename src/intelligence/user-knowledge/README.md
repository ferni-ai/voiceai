# User Knowledge Module

> "Your best friend forgets. We don't."

## Overview

The User Knowledge module aggregates **everything** we know about a user from all intelligence sources into a single, queryable structure. This is the foundation of "Better Than Human" - total recall of user preferences, relationships, dreams, boundaries, and patterns.

## Data Sources Aggregated

| Source | What We Get | Firestore Path |
|--------|-------------|----------------|
| User Profile | name, timezone, occupation | `bogle_users/{userId}` |
| Lifestyle Preferences | music, food, travel, learning | `bogle_users/{userId}/lifestyle_preferences/*` |
| Contacts Service | relationships, key people | `user_contacts` |
| Dream Keeper | dreams, aspirations | `bogle_users/{userId}/dreams` |
| Commitment Keeper | user commitments | `bogle_users/{userId}/commitments` |
| Ferni Commitments | things Ferni promised | `bogle_users/{userId}/ferni_commitments` |
| Inside Joke Memory | shared moments, callbacks | `bogle_users/{userId}/shared_moments` |
| Open Loops | topics to follow up | `bogle_users/{userId}/open_loops` |
| Values Alignment | user's core values | `bogle_users/{userId}/superhuman/values` |
| Emotional Trajectories | mood trends | `bogle_users/{userId}/semantic_intelligence/emotional_arcs` |
| Coaching Patterns | behavioral patterns | `userPatterns` |
| Cross-Domain Correlator | pattern insights | (in-memory) |

## 11 Knowledge Categories

1. **Identity** - name, timezone, occupation, birthday
2. **Lifestyle** - entertainment, food, travel, learning, daily habits
3. **Relationships** - contacts, key people, relationship patterns
4. **Aspirations** - dreams, commitments, goals
5. **Wellness** - health, fitness, mental, sleep
6. **Work** - role, company, stressors
7. **Communication** - preferred style, social type
8. **Emotional** - current state, trajectory, values
9. **Patterns** - behaviors, temporal, correlations
10. **Boundaries** - avoid topics, sensitivities, Ferni's promises
11. **Shared History** - inside jokes, open loops, milestones

## Usage

### Get Complete Knowledge

```typescript
import { getUserKnowledge } from './intelligence/user-knowledge/index.js';

const knowledge = await getUserKnowledge(userId);
console.log(knowledge.lifestyle.entertainment.musicLikes);
// => ['jazz', 'classical', 'indie rock']
```

### Format for LLM Context

```typescript
import { formatKnowledgeForContext } from './intelligence/user-knowledge/index.js';

const context = formatKnowledgeForContext(knowledge, {
  maxTokens: 400,
  style: 'concise',
  prioritySections: ['boundaries', 'emotional'],
});
// => "[BOUNDARIES & COMMITMENTS]\n⚠️ AVOID: politics, ex-wife\n📝 FERNI PROMISED: check in about job interview\n\n[EMOTIONAL STATE]\n📈 Emotional trend: improving (work)\n💎 Core values: family, growth, honesty"
```

### Natural Language Queries

```typescript
import { askAboutUser } from './intelligence/user-knowledge/index.js';

const result = await askAboutUser(userId, 'What music do they like?');
// => { found: true, answer: "They like jazz, classical. They don't like heavy metal", confidence: 0.9 }

const result2 = await askAboutUser(userId, 'Any allergies?');
// => { found: true, answer: "They are allergic to: peanuts, shellfish", confidence: 1.0 }
```

### Specific Queries

```typescript
import { 
  getUserAllergies,
  getAvoidTopics,
  getFerniCommitments,
  getOpenLoops,
} from './intelligence/user-knowledge/index.js';

const allergies = await getUserAllergies(userId);
// => ['peanuts', 'shellfish']

const avoid = await getAvoidTopics(userId);
// => ['politics', 'ex-wife', 'weight']

const promises = await getFerniCommitments(userId);
// => [{ description: 'check in about job interview', status: 'pending' }]

const loops = await getOpenLoops(userId);
// => [{ topic: 'mom health update', context: 'mentioned last week', mentionedAt: Date }]
```

### Completeness Score

```typescript
import { getKnowledgeCompleteness } from './intelligence/user-knowledge/index.js';

const completeness = await getKnowledgeCompleteness(userId);
// => { overall: 0.67, sections: { identity: 0.8, lifestyle: 0.7, ... } }
```

## Integration Points

### Session Init (Pre-warm at Session Start)

```typescript
// In session-init-handler.ts
import { getUserKnowledge } from '../../intelligence/user-knowledge/index.js';

// Load user knowledge in background at session start
fireAndForget(async () => {
  const knowledge = await getUserKnowledge(userId);
  diag.session('User knowledge loaded', { completeness: knowledge.metadata.completeness.overall });
}, 'user-knowledge-load');
```

### Turn Handler (Inject Context)

```typescript
// In unified-intelligence-integration.ts
import { 
  getUserKnowledge, 
  formatKnowledgeForContext 
} from '../../intelligence/user-knowledge/index.js';

export async function getCompleteIntelligence(userId: string) {
  const [baseIntelligence, userKnowledge] = await Promise.all([
    getIntelligenceForTurn(userId),
    getUserKnowledge(userId),
  ]);

  const knowledgeContext = formatKnowledgeForContext(userKnowledge, {
    maxTokens: 600,
    prioritySections: ['boundaries', 'emotional', 'relationships', 'aspirations'],
  });

  return { ...baseIntelligence, userKnowledge, knowledgeContext };
}
```

## Caching

- Knowledge is cached for 60 seconds per user
- Use `forceRefresh: true` to bypass cache
- Use `clearKnowledgeCache(userId)` to invalidate

## Performance

- All data sources are fetched in parallel
- Typical aggregation time: 50-100ms (cached: <1ms)
- Token budget can be controlled via `maxTokens` option

## Testing

```bash
# Run unit tests
pnpm vitest run src/intelligence/user-knowledge

# Run E2E tests
pnpm vitest run src/tests/user-knowledge-e2e
```
