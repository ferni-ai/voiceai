---
title: "Error Handling Patterns for Voice AI"
excerpt: "Beyond try/catch - building resilient voice applications that recover gracefully and keep users informed."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: 2026-01-16
category: "Quick Tips"
image: "error-handling.png"
readTime: 6
---

Voice errors are different. Users can't see stack traces. Silence is the worst error message. Here's how to handle failures gracefully.

## The Golden Rule

**Never leave users in silence.** Any error should produce some audio feedback.

```typescript
// ❌ Bad: Silent failure
try {
  const result = await fetchData();
} catch (error) {
  console.error(error);
  // User hears nothing...
}

// ✅ Good: Always respond
try {
  const result = await fetchData();
} catch (error) {
  console.error(error);
  return {
    response: "I couldn't get that information right now. " +
              "Want me to try again?",
    retry: true,
  };
}
```

---

## Pattern 1: Retry with Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, backoff = 'exponential', onRetry } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      const delay = backoff === 'exponential'
        ? Math.pow(2, attempt) * 100
        : attempt * 200;

      onRetry?.(attempt, error as Error);
      await sleep(delay);
    }
  }

  throw new Error('Unreachable');
}

// Usage
const data = await withRetry(
  () => client.fetchUserData(userId),
  {
    maxAttempts: 3,
    onRetry: (attempt) => {
      if (attempt > 1) {
        speak("Just a moment, reconnecting...");
      }
    },
  }
);
```

---

## Pattern 2: Graceful Degradation

When a feature fails, fall back to simpler alternatives:

```typescript
async function getWeather(location: string) {
  // Try primary source
  try {
    return await weatherApi.getForecast(location);
  } catch (primaryError) {
    console.warn('Primary weather API failed:', primaryError);
  }

  // Fall back to cached data
  const cached = await cache.get(`weather:${location}`);
  if (cached && isRecent(cached, { hours: 2 })) {
    return {
      ...cached,
      note: "Using recent data - live weather temporarily unavailable",
    };
  }

  // Fall back to general response
  return {
    type: 'unavailable',
    response: "I can't check the weather right now. " +
              "You might want to look outside or check your phone.",
  };
}
```

---

## Pattern 3: Circuit Breaker

Prevent cascading failures by stopping requests to failing services:

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private resetTimeout = 30000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

// Usage
const weatherBreaker = new CircuitBreaker(5, 30000);

async function getWeatherSafe(location: string) {
  try {
    return await weatherBreaker.call(() => weatherApi.get(location));
  } catch (error) {
    if (error.message === 'Circuit breaker is open') {
      return "Weather service is temporarily unavailable. Try again in a minute.";
    }
    throw error;
  }
}
```

---

## Pattern 4: User-Friendly Error Messages

Map technical errors to human responses:

```typescript
const errorMessages: Record<string, string> = {
  'NETWORK_ERROR': "I'm having trouble connecting. Is your internet working?",
  'RATE_LIMITED': "I need to slow down for a moment. Can you repeat that in a few seconds?",
  'CONTEXT_LIMIT': "That's a lot to process! Let me summarize what we've discussed and continue.",
  'AUTH_EXPIRED': "I need you to sign in again. I'll wait.",
  'SERVICE_UNAVAILABLE': "That feature isn't working right now. Is there something else I can help with?",
};

function handleError(error: FerniError): VoiceResponse {
  const message = errorMessages[error.code] ||
    "Something went wrong. Let me try that again.";

  return {
    response: message,
    action: error.code === 'AUTH_EXPIRED' ? 'prompt_login' : 'retry',
    logError: true,
  };
}
```

---

## Pattern 5: Timeout Handling

Voice has strict latency requirements:

```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback?: () => T
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  );

  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    if (error.message === 'Timeout' && fallback) {
      return fallback();
    }
    throw error;
  }
}

// Usage: 200ms timeout with fallback
const response = await withTimeout(
  complexProcessing(input),
  200,
  () => ({
    response: "Let me think about that for a moment...",
    continue: true,
  })
);
```

---

## Pattern 6: Error Boundaries

Wrap conversation sections in error boundaries:

```typescript
class ConversationErrorBoundary {
  async execute(
    fn: () => Promise<VoiceResponse>,
    context: ConversationContext
  ): Promise<VoiceResponse> {
    try {
      return await fn();
    } catch (error) {
      // Log for debugging
      console.error('Conversation error:', error);

      // Track for monitoring
      metrics.increment('conversation_errors', {
        type: error.code || 'unknown',
        stage: context.currentStage,
      });

      // Attempt recovery
      if (this.canRecover(error)) {
        return this.recover(error, context);
      }

      // Graceful failure
      return {
        response: "I ran into an issue. Let's start fresh - how can I help you?",
        action: 'reset_context',
      };
    }
  }

  private canRecover(error: Error): boolean {
    return ['CONTEXT_LIMIT', 'TRANSIENT_FAILURE'].includes(error.code);
  }

  private async recover(error: Error, context: ConversationContext) {
    if (error.code === 'CONTEXT_LIMIT') {
      await context.compact();
      return { response: "Got it. Please continue.", retry: true };
    }
    // Other recovery strategies...
  }
}
```

---

## Quick Reference

| Error Type | User Message | Action |
|------------|--------------|--------|
| Network | "Connection issue..." | Auto-retry |
| Rate limit | "Need to slow down..." | Backoff |
| Auth | "Please sign in..." | Prompt login |
| Timeout | "Let me think..." | Continue async |
| Unknown | "Let's try that again..." | Retry once |

---

## Next Steps

- [Performance Optimization](/developers/blog/performance-optimization/)
- [Monitoring Guide](/developers/docs/monitoring/)
- [Testing Voice AI](/developers/guides/testing/)
