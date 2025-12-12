# 📡 Ferni Dashboard APIs - Complete Documentation

> **Generated:** December 12, 2024  
> **Status:** Production Reference  
> **Version:** 1.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Observability APIs](#observability-apis)
4. [Dashboard Metrics APIs](#dashboard-metrics-apis)
5. [Handoff Diagnostics APIs](#handoff-diagnostics-apis)
6. [Voice Humanization APIs](#voice-humanization-apis)
7. [Voice Presence APIs](#voice-presence-apis)
8. [User Analytics APIs](#user-analytics-apis)
9. [Admin Diagnostics APIs](#admin-diagnostics-apis)
10. [Dashboard-to-API Mapping](#dashboard-to-api-mapping)

---

## Overview

Ferni dashboards are powered by multiple API route handlers registered in `ui-server.js`. All APIs use:

- **Protocol:** HTTPS in production, HTTP in development
- **Base URL:** `https://app.ferni.ai` (production) or `http://localhost:3002` (development)
- **Content-Type:** `application/json`
- **Rate Limiting:** 60-100 requests per minute per IP

### Route Registration

APIs are registered in `ui-server.js`:

```javascript
// Order matters! More specific routes first
if (await handleDiagnosticsRoutes(req, res, pathname, parsedUrl)) return;
if (await handleObservabilityRoutes(req, res, pathname)) return;
if (await handleDashboardMetricsRoutes(req, res, pathname)) return;
if (await handleVoiceHumanizationRoutes(req, res, pathname)) return;
if (await handleVoicePresenceRoutes(req, res, pathname)) return;
if (await handleAnalyticsRoutes(req, res, pathname)) return;
```

---

## Authentication

### Dev Mode

In development, pass `?dev=true` or set `admin_key: 'dev-mode'` in request body.

### Production

| Method | Header | Description |
|--------|--------|-------------|
| Bearer Token | `Authorization: Bearer <token>` | Firebase ID token |
| API Key | `X-API-Key: <key>` | Admin API key |

### Auth Levels

| Level | Routes | Description |
|-------|--------|-------------|
| `requireAuth` | Most GET endpoints | Any authenticated user |
| `requireAdmin` | POST/DELETE endpoints | Admin users only |

---

## Observability APIs

**Source:** `src/api/observability-routes.ts`  
**Base Path:** `/api/observability`

### GET /api/observability

Returns full observability snapshot with all metrics.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `window` | number | 60 | Time window in minutes (1-1440) |

**Response:**
```json
{
  "llmHealth": { ... },
  "connectionHealth": { ... },
  "uxQuality": { ... },
  "memory": { ... },
  "cost": { ... },
  "errors": { ... },
  "personas": { ... },
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

### GET /api/observability/llm

LLM health metrics (tokens, latency, errors, rate limits).

**Response:**
```json
{
  "totalCalls": 1523,
  "totalTokens": 245000,
  "avgLatencyMs": 450,
  "errorRate": 0.02,
  "contextWindowUtilization": 0.65,
  "rateLimitHits": 3,
  "modelBreakdown": {
    "gemini-1.5-pro": { "calls": 1200, "tokens": 200000 },
    "gemini-1.5-flash": { "calls": 323, "tokens": 45000 }
  },
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `llm-dashboard.html`

### GET /api/observability/connection

Connection health metrics.

**Response:**
```json
{
  "activeConnections": 5,
  "avgConnectionDuration": 180000,
  "disconnectRate": 0.05,
  "reconnectAttempts": 12,
  "latencyP50": 45,
  "latencyP95": 120,
  "latencyP99": 250,
  "healthScore": 0.95,
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `connection-dashboard.html`

### GET /api/observability/ux

User experience quality metrics.

**Response:**
```json
{
  "sessionCompletionRate": 0.85,
  "avgSessionLength": 420000,
  "userSatisfactionScore": 4.2,
  "interruptionRate": 0.12,
  "responseAccuracyScore": 0.92,
  "conversationDepth": 8.5,
  "topExitPoints": [
    { "point": "greeting", "count": 5 },
    { "point": "task_completion", "count": 120 }
  ],
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `ux-dashboard.html`

### GET /api/observability/memory

Memory/RAG system metrics.

**Response:**
```json
{
  "vectorSearchLatencyMs": 45,
  "vectorSearchRelevanceScore": 0.85,
  "cacheHitRate": 0.72,
  "embeddingGenerationLatencyMs": 120,
  "totalVectorsStored": 15000,
  "storageUsageMb": 256,
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `memory-dashboard.html`

### GET /api/observability/cost

Cost tracking metrics.

**Response:**
```json
{
  "totalSpend": 45.23,
  "llmCost": 32.50,
  "ttsCost": 8.20,
  "sttCost": 3.15,
  "embeddingCost": 1.38,
  "costByModel": {
    "gemini-1.5-pro": 28.00,
    "gemini-1.5-flash": 4.50
  },
  "costEfficiency": {
    "costPerConversation": 0.12,
    "costPerMessage": 0.008
  },
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `cost-dashboard.html`

### GET /api/observability/errors

Error and recovery metrics.

**Response:**
```json
{
  "totalErrors": 23,
  "errorsByCategory": {
    "llm": 5,
    "connection": 8,
    "voice": 3,
    "system": 7
  },
  "recoveryRate": 0.87,
  "avgRecoveryTimeMs": 1200,
  "commonErrors": [
    { "message": "Rate limit exceeded", "count": 5 },
    { "message": "Connection timeout", "count": 3 }
  ],
  "errorTimeline": [...],
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `error-dashboard.html`

### GET /api/observability/personas

Persona health metrics.

**Response:**
```json
{
  "personas": {
    "ferni": {
      "bundleLoadTimeMs": 120,
      "knowledgeQuerySuccessRate": 0.98,
      "handoffSuccessRate": 0.95,
      "avgResponseLatencyMs": 350
    },
    "peter": { ... },
    "maya": { ... }
  },
  "overallHealthScore": 0.94,
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `persona-dashboard.html`

### GET /api/observability/alerts

Recent system alerts.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max alerts to return |

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert-123",
      "severity": "warning",
      "message": "LLM latency elevated",
      "timestamp": "2024-12-12T10:00:00.000Z"
    }
  ],
  "count": 5
}
```

### POST /api/observability/clear

Clear all observability metrics. **Requires admin auth.**

**Response:**
```json
{
  "message": "All observability metrics cleared"
}
```

---

## Dashboard Metrics APIs

**Source:** `src/api/dashboard-metrics-routes.ts`  
**Base Paths:** `/api/metrics`, `/api/cognitive`

### GET /api/metrics/summary

System metrics summary.

**Response:**
```json
{
  "success": true,
  "hasRealData": true,
  "data": {
    "uptime": "12:34:56",
    "activeSessions": 5,
    "totalSessions": 150,
    "firestoreReads": 12500,
    "firestoreWrites": 3200,
    "errorRate": 0.02,
    "avgLatency": 350
  },
  "lastUpdate": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `metrics-dashboard.html`

### GET /api/metrics/sessions

Active session list.

**Response:**
```json
{
  "success": true,
  "hasRealData": true,
  "data": [
    {
      "id": "session-123",
      "persona": "ferni",
      "startTime": "2024-12-12T09:45:00.000Z",
      "duration": 900000,
      "messageCount": 25
    }
  ],
  "count": 5
}
```

**Used by:** `metrics-dashboard.html`

### GET /api/metrics

Full metrics snapshot (summary + sessions).

**Response:**
```json
{
  "success": true,
  "hasRealData": true,
  "data": {
    "summary": { ... },
    "sessions": [ ... ],
    "sessionCount": 5
  },
  "lastUpdate": "2024-12-12T10:00:00.000Z"
}
```

### GET /api/cognitive/state

Current cognitive state.

**Response:**
```json
{
  "success": true,
  "hasRealData": true,
  "data": {
    "currentMode": "conversational",
    "modeDescription": "Natural dialogue mode",
    "userStyle": "analytical",
    "userStyleConfidence": 0.85,
    "voiceEmotion": "neutral",
    "voiceEmotionConfidence": 0.72,
    "responseConfidence": 0.91,
    "activeQuirks": ["uses_metaphors", "references_research"],
    "latencyBudget": 200,
    "adaptationLevel": "fully_adapted"
  },
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `cognitive-dashboard.html`

### GET /api/cognitive/history

Recent cognitive events.

**Response:**
```json
{
  "success": true,
  "hasRealData": true,
  "data": [
    {
      "type": "mode_change",
      "timestamp": "2024-12-12T09:55:00.000Z",
      "from": "listening",
      "to": "conversational"
    }
  ],
  "count": 10
}
```

---

## Handoff Diagnostics APIs

**Source:** `src/api/handoff-diagnostics.ts`  
**Base Path:** `/api/diagnostics/handoffs`

### GET /api/diagnostics/handoffs

Handoff metrics summary.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `window` | number | 60 | Time window in minutes |

**Response:**
```json
{
  "summary": {
    "totalHandoffs": 45,
    "successRate": 0.93,
    "avgDurationMs": 250,
    "failuresByReason": {
      "timeout": 2,
      "agent_unavailable": 1
    }
  },
  "meta": {
    "windowMinutes": 60,
    "timestamp": "2024-12-12T10:00:00.000Z"
  }
}
```

**Used by:** `handoff-dashboard.html`

### GET /api/diagnostics/handoffs/recent

Recent handoff traces.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max traces to return |
| `window` | number | 60 | Time window in minutes |

**Response:**
```json
{
  "traces": [
    {
      "id": "handoff-abc123",
      "from": "ferni",
      "to": "peter",
      "trigger": "user_request",
      "status": "success",
      "durationMs": 180,
      "timestamp": "2024-12-12T09:58:00.000Z",
      "context": { ... }
    }
  ],
  "count": 10,
  "meta": { ... }
}
```

**Used by:** `handoff-dashboard.html`

### GET /api/diagnostics/handoffs/failures

Recent handoff failures.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max failures to return |
| `window` | number | 60 | Time window in minutes |

**Response:**
```json
{
  "failures": [
    {
      "id": "handoff-xyz789",
      "from": "ferni",
      "to": "jordan",
      "reason": "agent_unavailable",
      "error": "Target agent not responding",
      "timestamp": "2024-12-12T09:45:00.000Z"
    }
  ],
  "count": 3,
  "meta": { ... }
}
```

**Used by:** `handoff-dashboard.html`

### GET /api/diagnostics/handoffs/in-progress

Currently active handoffs.

**Response:**
```json
{
  "inProgress": [
    {
      "id": "handoff-inprog-123",
      "from": "maya",
      "to": "alex",
      "startTime": "2024-12-12T10:00:30.000Z",
      "elapsedMs": 150
    }
  ],
  "count": 1
}
```

**Used by:** `handoff-dashboard.html`

### GET /api/diagnostics/handoffs/:traceId

Get specific handoff trace by ID.

**Response:**
```json
{
  "trace": {
    "id": "handoff-abc123",
    "from": "ferni",
    "to": "peter",
    "trigger": "user_request",
    "status": "success",
    "durationMs": 180,
    "timestamp": "2024-12-12T09:58:00.000Z",
    "steps": [
      { "name": "initiate", "durationMs": 10 },
      { "name": "transfer_context", "durationMs": 50 },
      { "name": "handshake", "durationMs": 120 }
    ],
    "context": { ... }
  }
}
```

---

## Voice Humanization APIs

**Source:** `src/api/voice-humanization-routes.ts`  
**Base Path:** `/api/voice-humanization`

### GET /api/voice-humanization/dashboard

Full dashboard data for voice humanization.

**Response:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "prosodyTurnPrediction": { "accuracy": 0.85, "latency": 45 },
      "microInterruptions": { "count": 12, "successRate": 0.92 },
      "emotionalArcTts": { "enabled": true, "engagement": 0.78 },
      "laughterDetection": { "detected": 5, "accuracy": 0.88 },
      "rhythmMirroring": { "syncScore": 0.72 }
    },
    "flags": { ... },
    "recommendations": [ ... ]
  }
}
```

**Used by:** `voice-humanization-dashboard.html` (needs connection)

### GET /api/voice-humanization/metrics

Raw metrics JSON.

**Response:**
```json
{
  "prosodyTurnPrediction": { ... },
  "microInterruptions": { ... },
  "emotionalArcTts": { ... },
  "laughterDetection": { ... },
  "ambientAwareness": { ... },
  "rhythmMirroring": { ... },
  "emotionalContagion": { ... }
}
```

### GET /api/voice-humanization/flags

Current feature flags.

**Response:**
```json
{
  "success": true,
  "data": {
    "enableProsodyTurnPrediction": true,
    "enableMicroInterruptions": true,
    "enableEmotionalArcTts": false,
    "enableLaughterDetection": true,
    "enableAmbientAwareness": false,
    "enableRhythmMirroring": true,
    "enableEmotionalContagion": false,
    "rolloutPercentage": 100,
    "enableMetrics": true
  }
}
```

### POST /api/voice-humanization/flags

Update feature flags. **Requires admin auth.**

**Request Body:**
```json
{
  "enableProsodyTurnPrediction": true,
  "rolloutPercentage": 50
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... updated flags ... }
}
```

### POST /api/voice-humanization/flags/reset

Reset flags to defaults. **Requires admin auth.**

### POST /api/voice-humanization/metrics/reset

Reset all metrics. **Requires admin auth.**

---

## Voice Presence APIs

**Source:** `src/api/voice-presence-routes.ts`  
**Base Path:** `/api/voice-presence`

### GET /api/voice-presence/dashboard

Full dashboard data with metrics and config.

**Response:**
```json
{
  "metrics": {
    "breathSync": { "accuracy": 0.85, "engagementScore": 0.78 },
    "pausePacing": { "naturalness": 0.92, "avgPauseMs": 450 },
    "turnTaking": { "smoothness": 0.88, "interruptionRate": 0.05 },
    "emotionalResonance": { "matchScore": 0.75 }
  },
  "config": { ... },
  "recommendations": [ ... ],
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `voice-presence-dashboard.html` (needs connection)

### GET /api/voice-presence/metrics

All feature metrics.

**Response:**
```json
{
  "breathSync": { ... },
  "pausePacing": { ... },
  "turnTaking": { ... },
  "emotionalResonance": { ... }
}
```

### GET /api/voice-presence/config

Current configuration.

**Response:**
```json
{
  "breathSyncEnabled": true,
  "pausePacingEnabled": true,
  "turnTakingEnabled": true,
  "emotionalResonanceEnabled": false,
  "autoTuneEnabled": false
}
```

### POST /api/voice-presence/config

Update configuration. **Requires admin auth.**

**Request Body:**
```json
{
  "breathSyncEnabled": false,
  "emotionalResonanceEnabled": true
}
```

### GET /api/voice-presence/recommendations

AI tuning recommendations.

**Response:**
```json
{
  "recommendations": [
    {
      "feature": "pausePacing",
      "parameter": "avgPauseMs",
      "currentValue": 450,
      "suggestedValue": 380,
      "reason": "Users prefer slightly faster pacing",
      "confidence": 0.82,
      "impact": "medium"
    }
  ]
}
```

### POST /api/voice-presence/apply-recommendation

Apply a tuning recommendation. **Requires admin auth.**

**Request Body:**
```json
{
  "feature": "pausePacing",
  "parameter": "avgPauseMs",
  "suggestedValue": 380
}
```

### POST /api/voice-presence/auto-tune

Toggle auto-tuning. **Requires admin auth.**

**Request Body:**
```json
{
  "enabled": true
}
```

---

## User Analytics APIs

**Source:** `src/api/user-analytics-routes.ts`  
**Base Path:** `/api/analytics`

### GET /api/analytics/summary

Full analytics summary for dashboard.

**Response:**
```json
{
  "success": true,
  "data": {
    "activeUsers": {
      "daily": 125,
      "weekly": 450,
      "monthly": 1200
    },
    "conversations": {
      "total": 5600,
      "avgPerUser": 4.7,
      "avgDurationMs": 420000
    },
    "retention": {
      "day1": 0.65,
      "day7": 0.42,
      "day30": 0.28
    },
    "topTopics": [
      { "topic": "career", "count": 450 },
      { "topic": "relationships", "count": 320 }
    ],
    "personaUsage": {
      "ferni": 0.45,
      "peter": 0.20,
      "maya": 0.15,
      "alex": 0.10,
      "jordan": 0.07,
      "nayan": 0.03
    }
  },
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

**Used by:** `analytics-dashboard.html` (currently uses mock data!)

### GET /api/analytics/concurrent

Lightweight endpoint for polling concurrent users.

**Response:**
```json
{
  "concurrent": 23,
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

### GET /api/analytics/health

Health check for analytics service.

**Response:**
```json
{
  "status": "ok",
  "service": "user-analytics",
  "initialized": true,
  "timestamp": "2024-12-12T10:00:00.000Z"
}
```

---

## Admin Diagnostics APIs

**Source:** `src/api/v1/admin/diagnostics.ts`  
**Base Path:** `/api/v1/admin/diagnostics`

### GET /api/v1/admin/diagnostics/health

System health overview.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "timestamp": "2024-12-12T10:00:00.000Z",
  "services": [
    { "name": "LiveKit", "status": "healthy", "latency": 45 },
    { "name": "Gemini", "status": "healthy", "latency": 350 },
    { "name": "Cartesia", "status": "healthy", "latency": 120 },
    { "name": "Firestore", "status": "healthy", "latency": 25 }
  ]
}
```

### GET /api/v1/admin/diagnostics/handoff/metrics

Handoff performance metrics.

**Response:**
```json
{
  "totalHandoffs": 45,
  "successRate": 93,
  "avgDuration": 250,
  "failedHandoffs": 3,
  "last24hCount": 45
}
```

### GET /api/v1/admin/diagnostics/handoff/recent

Recent handoff events (last 20).

**Response:**
```json
{
  "events": [
    {
      "id": "hoff-abc123",
      "from": "ferni",
      "to": "peter",
      "trigger": "user_request",
      "duration": 180,
      "status": "success",
      "timestamp": "2 min ago"
    }
  ]
}
```

### GET /api/v1/admin/diagnostics/services

Service status check.

**Response:**
```json
{
  "services": [
    { "name": "LiveKit", "status": "healthy", "latency": 45, "lastCheck": "2024-12-12T10:00:00.000Z" },
    { "name": "Gemini", "status": "healthy", "latency": 350, "lastCheck": "2024-12-12T10:00:00.000Z" }
  ]
}
```

---

## Dashboard-to-API Mapping

| Dashboard | API Endpoints | Status |
|-----------|---------------|--------|
| `metrics-dashboard.html` | `/api/metrics/summary`, `/api/metrics/sessions` | ✅ Connected |
| `llm-dashboard.html` | `/api/observability/llm` | ✅ Connected |
| `ux-dashboard.html` | `/api/observability/ux` | ✅ Connected |
| `error-dashboard.html` | `/api/observability/errors` | ✅ Connected |
| `persona-dashboard.html` | `/api/observability/personas` | ✅ Connected |
| `cost-dashboard.html` | `/api/observability/cost` | ✅ Connected |
| `memory-dashboard.html` | `/api/observability/memory` | ✅ Connected |
| `connection-dashboard.html` | `/api/observability/connection` | ✅ Connected |
| `cognitive-dashboard.html` | `/api/cognitive/state` | ✅ Connected |
| `handoff-dashboard.html` | `/api/diagnostics/handoffs/*` | ✅ Connected |
| `analytics-dashboard.html` | `/api/analytics/summary` | ❌ Uses mock data |
| `tools-dashboard.html` | None | ❌ All mock data |
| `voice-humanization-dashboard.html` | `/api/voice-humanization/dashboard` | ⚠️ Needs connection |
| `voice-presence-dashboard.html` | `/api/voice-presence/dashboard` | ⚠️ Needs connection |

---

## Testing APIs

### Using curl

```bash
# Development (with dev mode)
curl -H "Authorization: Bearer dev-token" "http://localhost:3002/api/observability/llm"

# Production
curl -H "Authorization: Bearer <firebase-token>" "https://app.ferni.ai/api/observability/llm"
```

### Health Check

```bash
# Quick health check
curl https://app.ferni.ai/health

# Full service status
curl -H "Authorization: Bearer <token>" https://app.ferni.ai/api/v1/admin/diagnostics/health
```

---

## Error Responses

All APIs return consistent error format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

| Status | Description |
|--------|-------------|
| 400 | Bad request (invalid params) |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Endpoint not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Changelog

- **2024-12-12:** Initial documentation created
- Documents 50+ API endpoints across 8 route handlers
- Identifies 2 dashboards with mock data that need real API integration


