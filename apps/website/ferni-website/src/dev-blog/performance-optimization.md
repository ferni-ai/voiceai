---
title: "Performance Optimization: Achieving Sub-200ms Response Times"
excerpt: "How Ferni delivers real-time voice AI - and how you can optimize your integration for the best user experience."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-14
category: "Deep Dives"
image: "performance-optimization.png"
readTime: 10
---

In voice AI, latency is everything.

Humans perceive delays over 200ms as unnatural. Above 500ms, conversations feel broken. Our goal is to make voice AI feel as natural as talking to a friend.

Here's how we achieve it - and how you can too.

## The Latency Budget

A voice interaction has multiple stages:

```
User speaks → STT → LLM → Your code → TTS → User hears
              50ms   80ms   ???ms     60ms

Total budget: 200ms
Your budget:  ~10ms
```

Every millisecond in "Your code" directly impacts user experience.

## Connection Optimization

### Use Persistent Connections

Don't reconnect for each interaction:

```typescript
// ❌ Bad: New connection per request
app.post('/voice', async (req, res) => {
  const client = new FerniClient({ apiKey });  // 50-100ms overhead
  const response = await client.process(req.body);
  res.json(response);
});

// ✅ Good: Reuse connection pool
const clientPool = new FerniClientPool({
  apiKey,
  poolSize: 10,
  idleTimeout: 300000,  // 5 minutes
});

app.post('/voice', async (req, res) => {
  const client = await clientPool.acquire();  // <1ms
  try {
    const response = await client.process(req.body);
    res.json(response);
  } finally {
    clientPool.release(client);
  }
});
```

### Pre-warm Connections

Initialize before users need them:

```typescript
// On server start
async function warmup() {
  const client = new FerniClient({ apiKey });

  // Pre-authenticate
  await client.authenticate();

  // Pre-load common contexts
  await client.preloadContext(['greeting', 'faq', 'help']);

  console.log('Ferni client warmed up');
}

warmup();
```

---

## Context Window Optimization

The LLM context window is your biggest performance lever.

### Keep Context Lean

```typescript
// ❌ Bad: Everything in context
const context = {
  fullConversationHistory: [...],  // 10,000 tokens
  allUserPreferences: {...},        // 2,000 tokens
  entireKnowledgeBase: {...},       // 50,000 tokens
};

// ✅ Good: Relevant context only
const context = {
  recentMessages: conversationHistory.slice(-10),  // 500 tokens
  relevantPreferences: getRelevantPrefs(intent),   // 100 tokens
  semanticSearchResults: await search(query, 3),   // 300 tokens
};
```

### Use Semantic Compression

```typescript
// Compress long conversations
async function compressConversation(messages) {
  if (messages.length < 20) return messages;

  const summary = await client.summarize(messages.slice(0, -10));

  return [
    { role: 'system', content: `Previous conversation summary: ${summary}` },
    ...messages.slice(-10),
  ];
}
```

### Progressive Context Loading

Load context based on conversation stage:

```typescript
const contextLoaders = {
  greeting: () => ({
    userBasics: user.name,
  }),

  deepConversation: async () => ({
    userBasics: user.name,
    recentHistory: await getRecentHistory(user.id, 10),
    preferences: await getPreferences(user.id),
  }),

  taskExecution: async (task) => ({
    userBasics: user.name,
    taskContext: await getTaskContext(task),
    relevantTools: await getToolsForTask(task),
  }),
};

// Load only what's needed
const context = await contextLoaders[conversationStage]();
```

---

## Parallel Processing

Don't wait for things that can run concurrently:

```typescript
// ❌ Bad: Sequential
const preferences = await getPreferences(userId);      // 20ms
const history = await getConversationHistory(userId);  // 30ms
const calendar = await getCalendarContext(userId);     // 25ms
// Total: 75ms

// ✅ Good: Parallel
const [preferences, history, calendar] = await Promise.all([
  getPreferences(userId),       // 20ms
  getConversationHistory(userId), // 30ms
  getCalendarContext(userId),   // 25ms
]);
// Total: 30ms (max of all)
```

### Speculative Execution

Predict what you'll need:

```typescript
// While user is speaking, prepare likely responses
client.on('speech_start', async (partialTranscript) => {
  // Start loading potential contexts in background
  const predictions = predictIntent(partialTranscript);

  predictions.forEach(intent => {
    prefetchContext(intent);  // Non-blocking
  });
});

client.on('speech_end', async (fullTranscript) => {
  // Context likely already cached
  const context = await getContext(detectIntent(fullTranscript));
});
```

---

## Caching Strategies

### Multi-Layer Cache

```typescript
const cache = new MultiLayerCache({
  layers: [
    // L1: In-memory (fastest)
    {
      type: 'memory',
      maxSize: 1000,
      ttl: 60,  // 1 minute
    },
    // L2: Redis (shared across instances)
    {
      type: 'redis',
      url: process.env.REDIS_URL,
      ttl: 300,  // 5 minutes
    },
    // L3: Database (persistent)
    {
      type: 'postgres',
      ttl: 3600,  // 1 hour
    },
  ],
});

// Automatic cascading lookup
const userContext = await cache.get(`context:${userId}`);
```

### Cache Warming

Pre-populate cache for active users:

```typescript
// Warm cache before daily peak hours
async function warmCaches() {
  const activeUsers = await getActiveUsers({ lastDay: true });

  await Promise.all(
    activeUsers.map(user =>
      cache.set(`context:${user.id}`, await buildContext(user.id))
    )
  );
}

// Run at 6 AM local time
schedule('0 6 * * *', warmCaches);
```

---

## Database Optimization

### Use Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000,
});

// Reuse connections
async function query(sql, params) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}
```

### Index Your Queries

Most voice AI queries filter by user + time:

```sql
-- Essential indexes
CREATE INDEX idx_conversations_user_time
ON conversations(user_id, created_at DESC);

CREATE INDEX idx_memories_user_relevance
ON memories(user_id, relevance_score DESC);

-- Partial index for active conversations
CREATE INDEX idx_active_conversations
ON conversations(user_id, id)
WHERE status = 'active';
```

---

## Measuring Performance

### Track the Right Metrics

```typescript
import { metrics } from '@ferni/sdk';

// Track end-to-end latency
const timer = metrics.startTimer('voice_response_latency');

const response = await client.process(input);

timer.end({
  intent: response.intent,
  cached: response.fromCache,
  contextSize: response.contextTokens,
});

// Alert on p95 > 200ms
metrics.alert('voice_response_latency', {
  percentile: 95,
  threshold: 200,
  action: 'page',
});
```

### Profile Regularly

```typescript
// Enable detailed profiling in development
const client = new FerniClient({
  apiKey,
  profiling: process.env.NODE_ENV === 'development',
});

client.on('profile', (data) => {
  console.table({
    stage: data.stage,
    duration: `${data.durationMs}ms`,
    tokens: data.tokens,
  });
});
```

---

## Performance Checklist

Before going live:

- [ ] Connection pooling enabled
- [ ] Context window under 4,000 tokens
- [ ] Database queries under 10ms (p95)
- [ ] Multi-layer caching implemented
- [ ] Parallel processing for independent operations
- [ ] Latency metrics and alerts configured
- [ ] Cache warming for peak hours
- [ ] Connection pre-warming on startup

---

## Benchmarks

Our target metrics for production deployments:

| Metric | Target | Acceptable |
|--------|--------|------------|
| End-to-end latency (p50) | <150ms | <200ms |
| End-to-end latency (p95) | <200ms | <300ms |
| Context load time | <10ms | <25ms |
| Database queries | <5ms | <10ms |
| Cache hit rate | >80% | >60% |

---

## Next Steps

- [Scaling Guide](/developers/docs/scaling/)
- [Monitoring & Observability](/developers/blog/monitoring-guide/)
- [Infrastructure Patterns](/developers/docs/infrastructure/)

Questions? Join us on [Discord](https://discord.gg/ferni).
