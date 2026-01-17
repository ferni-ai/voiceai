---
title: "Deploying Voice AI to Production: The Complete Checklist"
excerpt: "Everything you need to verify before going live - from infrastructure to monitoring, security to scaling."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-22
category: "Tutorial"
image: "production-deployment-checklist.png"
readTime: 14
---

You've built your voice AI integration, tested it thoroughly, and stakeholders are excited. Now comes the critical step: deploying to production. This checklist ensures you don't miss anything that could cause problems at scale.

## Pre-Deployment Checklist

### Infrastructure

- [ ] **SSL/TLS configured** - All connections must be encrypted
- [ ] **WebSocket support enabled** - Required for real-time audio
- [ ] **CORS configured** - Allow your domains only
- [ ] **CDN configured** - For static assets and audio files
- [ ] **Load balancer health checks** - Verify agents are responsive
- [ ] **Auto-scaling configured** - Handle traffic spikes

```yaml
# Example: Kubernetes HPA for voice agent pods
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: voice-agent-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: voice-agent
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Environment Variables

- [ ] **API keys rotated** - Don't use development keys
- [ ] **Secrets in vault** - Never in code or env files
- [ ] **Environment clearly set** - `NODE_ENV=production`
- [ ] **Logging level appropriate** - `info` or `warn`, not `debug`

```typescript
// src/config/production.ts
export const config = {
  // Verify all required env vars are set
  ferniApiKey: requireEnv('FERNI_API_KEY'),
  ferniApiSecret: requireEnv('FERNI_API_SECRET'),
  
  // Appropriate defaults for production
  logLevel: process.env.LOG_LEVEL || 'info',
  enableDebugPanel: false,
  enableConversationRecording: true,
  
  // Timeouts tuned for production
  sttTimeout: 30000,
  ttsTimeout: 30000,
  toolTimeout: 10000,
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
```

### Security

- [ ] **Rate limiting configured** - Prevent abuse
- [ ] **Authentication required** - No anonymous access to sensitive features
- [ ] **Input validation** - Sanitize all user input
- [ ] **Audit logging enabled** - Track who did what
- [ ] **GDPR/privacy compliance** - Data handling documented

```typescript
// src/middleware/security.ts
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

export const securityMiddleware = [
  // Security headers
  helmet(),
  
  // Rate limiting
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  }),
  
  // Voice session rate limit (stricter)
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 new sessions per minute per IP
    keyGenerator: (req) => req.ip + '-voice-session',
    message: 'Too many voice sessions, please try again later',
  }),
];
```

### Performance

- [ ] **Cold start optimized** - First request should be fast
- [ ] **Connection pooling** - Reuse database/API connections
- [ ] **Caching configured** - Cache static responses
- [ ] **Compression enabled** - Gzip/Brotli for responses

```typescript
// src/performance/optimizations.ts

// Pre-warm connections on startup
export async function warmUp() {
  console.log('Warming up connections...');
  
  // Initialize Ferni SDK connection
  await ferniClient.connect();
  
  // Pre-load frequently used data
  await cache.preload(['personas', 'tools', 'prompts']);
  
  // Verify database connection
  await db.ping();
  
  console.log('Warm-up complete');
}

// Connection pooling
export const ferniClient = new FerniClient({
  apiKey: config.ferniApiKey,
  poolSize: 10,
  keepAlive: true,
  reconnect: true,
});
```

## Deployment Steps

### Step 1: Final Testing

Run your full test suite one more time:

```bash
# Run all tests
pnpm test

# Run integration tests against staging
FERNI_ENV=staging pnpm test:integration

# Run load tests
pnpm test:load --users 100 --duration 5m
```

### Step 2: Database Migrations

```bash
# Check pending migrations
pnpm db:migrate:status

# Run migrations (with backup!)
pnpm db:backup
pnpm db:migrate:run

# Verify data integrity
pnpm db:verify
```

### Step 3: Deploy with Zero Downtime

```bash
# Blue-green deployment
pnpm deploy:blue-green

# Or rolling update
kubectl rollout restart deployment/voice-agent

# Watch the rollout
kubectl rollout status deployment/voice-agent
```

### Step 4: Verify Deployment

```bash
# Health check
curl https://api.yourapp.com/health

# Voice agent status
curl https://api.yourapp.com/voice/status

# Test a simple interaction
curl -X POST https://api.yourapp.com/voice/test \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"message": "Hello, can you hear me?"}'
```

## Post-Deployment Checklist

### Monitoring

- [ ] **Uptime monitoring** - Alert if service goes down
- [ ] **Error rate monitoring** - Alert on spike in errors
- [ ] **Latency monitoring** - Alert on slow responses
- [ ] **Conversation quality monitoring** - Track success rates

```typescript
// src/monitoring/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const metrics = {
  // Conversation metrics
  conversationsStarted: new Counter({
    name: 'voice_conversations_started_total',
    help: 'Total voice conversations started',
    labelNames: ['persona', 'channel'],
  }),
  
  conversationDuration: new Histogram({
    name: 'voice_conversation_duration_seconds',
    help: 'Duration of voice conversations',
    buckets: [10, 30, 60, 120, 300, 600],
  }),
  
  // Latency metrics
  sttLatency: new Histogram({
    name: 'voice_stt_latency_seconds',
    help: 'Speech-to-text latency',
    buckets: [0.1, 0.25, 0.5, 1, 2, 5],
  }),
  
  ttsLatency: new Histogram({
    name: 'voice_tts_latency_seconds',
    help: 'Text-to-speech latency',
    buckets: [0.1, 0.25, 0.5, 1, 2, 5],
  }),
  
  // Error metrics
  errors: new Counter({
    name: 'voice_errors_total',
    help: 'Total voice errors',
    labelNames: ['type', 'severity'],
  }),
  
  // Active sessions
  activeSessions: new Gauge({
    name: 'voice_active_sessions',
    help: 'Currently active voice sessions',
  }),
};
```

### Alerting

Set up alerts for critical metrics:

```yaml
# alerts/voice-agent.yml
groups:
  - name: voice-agent-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(voice_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate in voice agent"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: HighLatency
        expr: histogram_quantile(0.95, voice_stt_latency_seconds) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High STT latency detected"
          description: "P95 latency is {{ $value }}s"

      - alert: LowConversationSuccessRate
        expr: |
          sum(rate(voice_conversations_completed_total[1h])) /
          sum(rate(voice_conversations_started_total[1h])) < 0.8
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Low conversation success rate"
          description: "Conversation completion rate below 80%"
```

### Logging

Ensure you can diagnose issues:

```typescript
// src/logging/production.ts
import pino from 'pino';

export const logger = pino({
  level: 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['req.headers.authorization', 'user.email', 'audioData'],
    censor: '[REDACTED]',
  },
  transport: {
    targets: [
      // Console for local debugging
      { target: 'pino-pretty', level: 'info' },
      // Cloud logging for production
      {
        target: '@google-cloud/logging-pino',
        level: 'info',
        options: { projectId: process.env.GCP_PROJECT },
      },
    ],
  },
});
```

## Rollback Plan

Always have a rollback plan ready:

```bash
# Quick rollback script
#!/bin/bash
# scripts/rollback.sh

echo "Rolling back to previous version..."

# Get previous deployment
PREVIOUS=$(kubectl rollout history deployment/voice-agent | tail -2 | head -1 | awk '{print $1}')

# Rollback
kubectl rollout undo deployment/voice-agent --to-revision=$PREVIOUS

# Verify
kubectl rollout status deployment/voice-agent

echo "Rollback complete. Verify at https://yourapp.com/health"
```

## Launch Day Runbook

### T-1 Hour
- [ ] All team members on standby
- [ ] Monitoring dashboards open
- [ ] Rollback script tested
- [ ] Customer support briefed

### T-0 (Launch)
- [ ] Deploy to production
- [ ] Verify health checks pass
- [ ] Test one real conversation
- [ ] Monitor error rates for 15 minutes

### T+1 Hour
- [ ] Review initial metrics
- [ ] Check for any alerts
- [ ] Gather initial feedback
- [ ] Address any critical issues

### T+24 Hours
- [ ] Review daily metrics
- [ ] Analyze conversation quality
- [ ] Document any issues found
- [ ] Plan fixes for next release

## Common Production Issues

### Issue: High Latency Spikes

**Symptoms:** Occasional 5-10 second response times

**Solution:** Usually cold starts or connection issues
```typescript
// Keep connections warm
setInterval(() => {
  ferniClient.ping();
}, 30000);
```

### Issue: Audio Quality Degradation

**Symptoms:** Choppy audio, transcription errors

**Solution:** Check network quality, implement adaptive bitrate
```typescript
const audioConfig = {
  sampleRate: navigator.connection?.downlink > 2 ? 48000 : 16000,
  channels: 1,
  codec: 'opus',
};
```

### Issue: Memory Leaks

**Symptoms:** Gradual memory increase, eventual OOM

**Solution:** Clean up audio buffers and event listeners
```typescript
// Always clean up on session end
session.on('end', () => {
  audioBuffer.clear();
  eventEmitter.removeAllListeners();
  recorder.stop();
});
```

## Success Metrics

Track these metrics to know your deployment is healthy:

| Metric | Healthy Range |
|--------|---------------|
| Error rate | < 1% |
| P95 latency | < 500ms |
| Conversation completion rate | > 85% |
| User satisfaction (CSAT) | > 4.0/5 |
| System uptime | > 99.9% |

---

**Need help with your deployment?** Our team is available in [Discord](https://discord.gg/ferni) or via [support@ferni.ai](mailto:support@ferni.ai).
