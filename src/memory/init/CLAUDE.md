# Init Module

Memory system initialization, health checks, and shutdown.

## Quick Start

```typescript
import { 
  initializeMemory, 
  isInitialized,
  getHealth,
  shutdown 
} from './memory/init/index.js';

// At startup
await initializeMemory({
  enableRedis: true,
  usePersistentVectors: true,
});

// Check status
if (isInitialized()) {
  const health = await getHealth();
  console.log(health.overall); // 'healthy' | 'degraded' | 'unhealthy'
}

// At shutdown
await shutdown();
```

## Key Functions

### Lifecycle

| Function | Purpose |
|----------|---------|
| `initializeMemory()` | Initialize the memory system |
| `isInitialized()` | Check if system is ready |
| `getSystem()` | Get the initialized system |
| `shutdown()` | Graceful shutdown |

### Health Checks

| Function | Purpose |
|----------|---------|
| `getHealth()` | Full health status |
| `isHealthy()` | Quick health check (boolean) |
| `getStoreHealth()` | Primary store status |
| `getVectorHealth()` | Vector store status |
| `getRedisHealth()` | Redis cache status |

### Detection

| Function | Purpose |
|----------|---------|
| `detectStoreType()` | Auto-detect store type |
| `shouldUseRedis()` | Check if Redis is available |
| `shouldUsePersistentVectors()` | Check vector persistence |

## Configuration

```typescript
interface InitConfig {
  enableRedis?: boolean;           // Default: true if available
  storeType?: 'firestore' | 'postgres' | 'memory';
  usePersistentVectors?: boolean;  // Default: true in production
  lazyInit?: boolean;              // Skip blocking init
  indexPersona?: boolean;          // Index persona content
}
```

## Health Status

```typescript
interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  initialized: boolean;
  stores: {
    primary: { healthy: boolean; type: StoreType };
    vector: { healthy: boolean; usingFallback: boolean; cacheSize: number };
    redis: { enabled: boolean; healthy: boolean };
  };
  embedding: {
    provider: string;
    dimensions: number;
    dimensionMatch: boolean;
  };
}
```

## Usage Notes

- `initializeMemory()` is idempotent (safe to call multiple times)
- Use `shutdown()` for graceful cleanup (closes connections)
- Health checks don't require initialization
- Store type is auto-detected from environment variables
