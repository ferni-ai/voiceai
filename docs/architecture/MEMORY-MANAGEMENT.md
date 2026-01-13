# Memory Management Architecture

> **Goal: Stateless Node.js** - Node processes should not accumulate user-specific state in memory across sessions.

## Overview

Ferni's voice agent runs on Node.js and handles multiple concurrent user sessions. Without proper memory management, in-memory caches can grow unbounded, leading to:

- **Memory leaks** - Data accumulates faster than it's cleaned up
- **OOM crashes** - Process runs out of heap space
- **Degraded performance** - GC pressure increases with memory usage
- **Horizontal scaling issues** - State trapped in single process

This document describes our memory management architecture that ensures statelessness and scalability.

---

## Core Components

### 1. SessionDataManager

**Location:** `src/services/session-data-manager.ts`

The central orchestrator for all session-scoped caches. Every service that caches user data must register with it.

```typescript
import { getSessionDataManager } from './services/session-data-manager.js';

// Register your service
getSessionDataManager().registerService({
  name: 'MyService',
  clearUserData: (userId: string) => myCache.delete(userId),
  clearAllData: () => myCache.clear(),
  getStats: () => ({ users: myCache.size, entries: countEntries() }),
});
```

**Features:**
- **Session lifecycle tracking** - Knows when sessions start/end
- **Coordinated cleanup** - Clears all registered caches on session end
- **TTL-based eviction** - Auto-evicts stale sessions (default: 2 hours)
- **Memory pressure handling** - Tiered response to high memory usage

### 2. Memory Pressure Response

The system monitors heap usage and responds with increasingly aggressive cleanup:

| Level | Threshold | Action |
|-------|-----------|--------|
| 0 | < 70% | No action |
| 1 | 70-80% | Evict oldest 10% of sessions |
| 2 | 80-90% | Evict 25% + force GC |
| 3 | 90-95% | Evict 50% + clear all caches |
| 4 | > 95% | **EMERGENCY** - Clear everything |

```typescript
// Manual check (also runs automatically every 30s)
const result = await getSessionDataManager().checkMemoryPressure();
// { triggered: true, level: 2, evicted: 15, freedMB: 128.5 }
```

### 3. IntervalManager

**Location:** `src/utils/interval-manager.ts`

Tracks all global `setInterval` calls to ensure proper cleanup during shutdown.

```typescript
import { registerInterval, clearAllIntervals } from '../utils/interval-manager.js';

// Register an interval (returns cleanup function)
const cleanup = registerInterval(
  'rate-limiter-cleanup',
  () => cleanupExpiredEntries(),
  60_000 // 1 minute
);

// On shutdown, all intervals are cleared automatically
clearAllIntervals();
```

### 4. Session Cache (Redis L2)

**Location:** `src/services/session-cache.ts`

Optional Redis-backed caching layer for true statelessness:

```typescript
import { getProductivityCache } from './services/session-cache.js';

const cache = getProductivityCache();

// L1 (memory) + L2 (Redis) caching
await cache.set(userId, productivityData);
const data = await cache.get(userId);
```

**Benefits:**
- Survives process restarts
- Enables horizontal scaling (shared state)
- Automatic fallback to memory-only if Redis unavailable

---

## Production Redis Setup (GCE)

The voice agent runs on GCE with a **Redis sidecar container** for session caching.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    GCE VM (voiceai-agent-gce)               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │  voiceai-agent      │      │  voiceai-redis      │       │
│  │  (blue or green)    │─────▶│  (redis:7-alpine)   │       │
│  │  Port: 8080/8081    │      │  Port: 6379         │       │
│  └─────────────────────┘      └─────────────────────┘       │
│           │                            │                     │
│           │ REDIS_HOST=172.17.0.1      │ --appendonly yes   │
│           │ REDIS_PORT=6379            │ --maxmemory 200mb  │
│           │                            │ --maxmemory-policy │
│           │                            │   allkeys-lru      │
│           ▼                            ▼                     │
│      External                    Persistent Volume          │
│      Traffic                     (redis-data)               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Deployment

Redis is automatically started during GCE deployment:

```bash
ferni deploy gce
```

The deploy script (`scripts/deploy-gce.ts`) will:

1. Check if Redis sidecar is already running
2. Start Redis container if not (with persistence enabled)
3. Wait for Redis to be ready
4. Deploy agent container with `REDIS_HOST` and `REDIS_PORT` env vars

### Redis Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Image | `redis:7-alpine` | Small, production-ready |
| Memory | 256MB container, 200MB data | Prevents OOM |
| Eviction | `allkeys-lru` | LRU when full |
| Persistence | AOF (appendonly) | Survives restarts |
| Volume | `redis-data` | Named Docker volume |

### Environment Variables

The agent container receives:

```bash
REDIS_HOST=172.17.0.1   # Docker host gateway
REDIS_PORT=6379
```

### Verifying Redis in Production

```bash
# SSH to GCE VM
gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a

# Check Redis is running
docker ps | grep redis

# Test Redis connectivity
docker exec voiceai-redis redis-cli ping
# Should return: PONG

# Check Redis memory usage
docker exec voiceai-redis redis-cli info memory | grep used_memory_human
```

### Troubleshooting Redis

**Redis container not starting:**
```bash
# Check logs
docker logs voiceai-redis

# Remove and recreate
docker rm -f voiceai-redis
# Re-run deployment: ferni deploy gce
```

**Agent can't connect to Redis:**
```bash
# Verify network connectivity
docker exec voiceai-agent-blue curl -s http://172.17.0.1:6379 || echo "Cannot connect"

# Check agent logs for Redis errors
docker logs voiceai-agent-blue 2>&1 | grep -i redis
```

**Redis using too much memory:**
```bash
# Check memory
docker exec voiceai-redis redis-cli info memory

# Manually flush if needed (clears all sessions!)
docker exec voiceai-redis redis-cli flushall
```

---

## Service Integration Guide

### Step 1: Identify Your Caches

Find all `Map`, `Set`, or object caches that store user-specific data:

```typescript
// ❌ Before: Unbounded cache
class MyService {
  private userCache = new Map<string, UserData>();
  
  getData(userId: string) {
    return this.userCache.get(userId);
  }
}
```

### Step 2: Add Cleanup Methods

```typescript
// ✅ After: With cleanup methods
class MyService {
  private userCache = new Map<string, UserData>();
  
  getData(userId: string) {
    return this.userCache.get(userId);
  }
  
  // Required: Clear single user
  clearUserData(userId: string): void {
    this.userCache.delete(userId);
  }
  
  // Required: Clear all data
  clearAllData(): void {
    this.userCache.clear();
  }
  
  // Required: Return stats
  getStats(): { users: number; entries: number } {
    return { users: this.userCache.size, entries: this.userCache.size };
  }
}
```

### Step 3: Register with SessionDataManager

```typescript
import { getSessionDataManager } from '../services/session-data-manager.js';

// At initialization
const myService = new MyService();

getSessionDataManager().registerService({
  name: 'MyService',
  clearUserData: (userId) => myService.clearUserData(userId),
  clearAllData: () => myService.clearAllData(),
  getStats: () => myService.getStats(),
});
```

### Step 4: Add LRU/TTL (Optional but Recommended)

For high-traffic caches, add eviction:

```typescript
interface CacheEntry<T> {
  data: T;
  lastAccessed: number;
  userId: string;
}

class MyService {
  private cache = new Map<string, CacheEntry<UserData>>();
  private maxEntries = 1000;
  private ttlMs = 2 * 60 * 60 * 1000; // 2 hours
  
  getData(userId: string): UserData | undefined {
    const entry = this.cache.get(userId);
    if (!entry) return undefined;
    
    // Check TTL
    if (Date.now() - entry.lastAccessed > this.ttlMs) {
      this.cache.delete(userId);
      return undefined;
    }
    
    // Update access time (LRU)
    entry.lastAccessed = Date.now();
    return entry.data;
  }
  
  setData(userId: string, data: UserData): void {
    // Evict if over limit
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
    
    this.cache.set(userId, {
      data,
      lastAccessed: Date.now(),
      userId,
    });
  }
  
  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = key;
      }
    }
    
    if (oldest) this.cache.delete(oldest);
  }
}
```

---

## Registered Services

The following services are registered with SessionDataManager:

| Service | Cache Type | Cleanup |
|---------|------------|---------|
| `ProductivityStore` | User productivity data | Per-user |
| `PersonaMemories` | Persona-specific memories | Per-user |
| `CrossPersonaContext` | Shared persona context | Per-user |
| `OutreachIntelligence` | Proactive outreach data | Per-user |
| `TopicTracking` | Conversation topics | Per-user |
| `HabitCoaching` | Habit data | Per-user |
| `ContextBuilders` | Session context state | Per-session |
| `SuperhumanEngines` | Humanization state | Per-session |

---

## Monitoring & Debugging

### API Endpoints

```bash
# Cache statistics
curl http://localhost:8080/api/cache

# Memory metrics
curl http://localhost:8080/api/memory

# Prometheus metrics
curl http://localhost:8080/metrics
```

### Sample `/api/cache` Response

```json
{
  "activeSessions": 42,
  "services": {
    "ProductivityStore": { "users": 38, "entries": 1247 },
    "PersonaMemories": { "users": 42, "entries": 168 },
    "ContextBuilders": { "users": 42, "entries": 42 }
  },
  "memory": {
    "heapUsedMB": 256.4,
    "heapTotalMB": 512.0,
    "percentUsed": 50.1
  },
  "evictionConfig": {
    "ttlMs": 7200000,
    "checkIntervalMs": 60000,
    "memoryThresholds": [0.7, 0.8, 0.9, 0.95]
  }
}
```

### Prometheus Metrics

```
# HELP ferni_session_count Active session count
# TYPE ferni_session_count gauge
ferni_session_count 42

# HELP ferni_cache_entries_total Total cache entries across all services
# TYPE ferni_cache_entries_total gauge
ferni_cache_entries_total 1457

# HELP ferni_memory_pressure_level Current memory pressure level (0-4)
# TYPE ferni_memory_pressure_level gauge
ferni_memory_pressure_level 0

# HELP ferni_evictions_total Total evictions by level
# TYPE ferni_evictions_total counter
ferni_evictions_total{level="1"} 15
ferni_evictions_total{level="2"} 3
```

---

## Cleanup Handler Integration

The voice agent cleanup handler (`src/agents/voice-agent/cleanup-handler.ts`) coordinates cleanup across all systems:

```typescript
// GROUP 5: Session data manager
await SessionDataManager.sessionEnded(userId);

// GROUP 6: Event handlers
runRegistryCleanup(sessionId);

// GROUP 7: Global registries
resetSessionGlobally(sessionId);

// GROUP 8: Context builders
cleanupContextBuilderSession(sessionId);

// GROUP 9: Superhuman engines
clearAllSuperhumanEngines(userId, sessionId);
```

---

## Graceful Shutdown

On process termination, all resources are cleaned up:

```typescript
// In startup.ts
process.on('SIGTERM', async () => {
  // 1. Stop accepting new connections
  // 2. Flush dirty data to persistence
  await shutdownProductivityStore();
  
  // 3. Clear all intervals
  clearAllIntervals();
  
  // 4. Shutdown session manager (clears all caches)
  await shutdownSessionDataManager();
  
  // 5. Shutdown memory monitor
  await shutdownMemoryMonitor();
  
  process.exit(0);
});
```

---

## Best Practices

### DO ✅

- **Register all caches** with SessionDataManager
- **Use LRU eviction** for high-traffic caches
- **Set TTLs** for all cached data
- **Clean up on session end** - don't wait for eviction
- **Use Redis** for data that must survive restarts
- **Monitor memory** via `/api/memory` endpoint

### DON'T ❌

- **Never use unbounded Maps** for user data
- **Never store per-user data** in module-level singletons without cleanup
- **Never skip cleanup** in error paths
- **Never assume sessions end cleanly** - always have TTL fallback
- **Never use setInterval** directly - use IntervalManager

---

## Troubleshooting

### Memory growing despite cleanup

1. Check for unregistered services: `curl /api/cache` - missing services?
2. Check for leaked intervals: `IntervalManager.getIntervalStats()`
3. Check event listeners: Look for `on()` without corresponding `off()`
4. Profile with `--inspect`: `node --inspect agent.js`

### Session data not cleaning up

1. Verify session end is called: Check logs for "Session ended"
2. Check service registration: Is your service in `/api/cache` output?
3. Check for async cleanup: Are you awaiting cleanup promises?

### Redis connection issues

1. Check `REDIS_URL` environment variable
2. Verify Redis is running: `redis-cli ping`
3. Check fallback behavior: System should work with memory-only

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Voice Agent Process                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ SessionDataMgr   │◄───│ Memory Monitor   │                   │
│  │  - Track sessions│    │  - Check heap    │                   │
│  │  - Coordinate    │    │  - Trigger evict │                   │
│  │    cleanup       │    │  - Export metrics│                   │
│  └────────┬─────────┘    └──────────────────┘                   │
│           │                                                      │
│           │ registerService()                                    │
│           ▼                                                      │
│  ┌────────────────────────────────────────────────────┐         │
│  │              Registered Services                    │         │
│  ├────────────────────────────────────────────────────┤         │
│  │ ProductivityStore │ PersonaMemories │ TopicTracking│         │
│  │ CrossPersonaCtx   │ OutreachIntel   │ HabitCoaching│         │
│  │ ContextBuilders   │ SuperhumanEngines │ ...        │         │
│  └────────────────────────────────────────────────────┘         │
│           │                                                      │
│           │ clearUserData() / clearAllData()                    │
│           ▼                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   L1: Memory     │───►│   L2: Redis      │                   │
│  │   (Fast, Local)  │    │   (Shared, TTL)  │                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                   │                              │
│                                   ▼                              │
│                          ┌──────────────────┐                   │
│                          │   L3: Firestore  │                   │
│                          │   (Persistent)   │                   │
│                          └──────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [Clean Architecture](./CLEAN-ARCHITECTURE.md) - Overall system architecture
- [Agent Lifecycle](./AGENT-LIFECYCLE.md) - Session start/end handling
- [Deployment](docs/deployment/) - Use `ferni deploy` - Production deployment with memory limits
