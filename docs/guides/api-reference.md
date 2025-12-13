# 🔌 API Reference

This document covers all REST API endpoints provided by Ferni AI.

## Authentication

All API routes support multiple authentication methods:

### 1. API Key (Server-to-Server)
```http
X-API-Key: your-api-key
```

### 2. JWT Bearer Token (Frontend/Apps)
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 3. User ID Header (Development Only)
```http
X-User-Id: user-123
```

### 4. Dev Mode (Development Only)
```http
GET /api/endpoint?admin_key=dev-mode&userId=user-123
```

---

## Environment Configuration

```bash
# API Authentication
API_KEYS=key1,key2,key3               # Valid API keys (comma-separated)
ADMIN_API_KEYS=admin_key1             # Admin keys (elevated privileges)
JWT_SECRET=your-256-bit-secret        # JWT signing secret
ALLOWED_ORIGINS=https://ferni.ai      # CORS allowed origins
```

---

## Endpoints Overview

| Category | Base Path | Description |
|----------|-----------|-------------|
| [Subscription](#subscription-api) | `/api/subscription` | Stripe subscriptions |
| [Engagement](#engagement-api) | `/api/engagement` | User analytics |
| [Agents](#agents-api) | `/api/agents` | Agent registry |
| [Diagnostics](#diagnostics-api) | `/api/diagnostics` | Handoff metrics |
| [DORA](#dora-api) | `/api/dora` | DevOps metrics |
| [Feature Flags](#feature-flags-api) | `/api/flags` | Feature toggles |
| [Observability](#observability-api) | `/api/observability` | System metrics |
| [Voice Presence](#voice-presence-api) | `/api/voice-presence` | Voice analytics |

---

## Subscription API

Manage Stripe subscriptions and usage tracking.

### Get Subscription Status
```http
GET /api/subscription/status?userId=user-123
```

**Response:**
```json
{
  "userId": "user-123",
  "tier": "friend",
  "status": "active",
  "conversationsUsed": 15,
  "conversationsLimit": null,
  "expiresAt": "2025-01-15T00:00:00Z"
}
```

### Check Can Start Conversation
```http
GET /api/subscription/can-start?userId=user-123
```

**Response:**
```json
{
  "allowed": true,
  "conversationsRemaining": null,
  "tier": "friend"
}
```

### Create Checkout Session
```http
POST /api/subscription/checkout
Content-Type: application/json

{
  "userId": "user-123",
  "tier": "friend",
  "successUrl": "https://ferni.ai/success",
  "cancelUrl": "https://ferni.ai/cancel",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "sessionId": "cs_live_...",
  "url": "https://checkout.stripe.com/..."
}
```

### Create Billing Portal Session
```http
POST /api/subscription/portal
Content-Type: application/json

{
  "userId": "user-123",
  "returnUrl": "https://ferni.ai/settings"
}
```

### Record Conversation Usage
```http
POST /api/usage/conversation
Content-Type: application/json

{
  "userId": "user-123",
  "durationMinutes": 15
}
```

### Stripe Webhook
```http
POST /api/subscription/webhook
Stripe-Signature: t=...,v1=...

(raw body)
```

### Get Subscription Config
```http
GET /api/subscription/config
```

**Response:**
```json
{
  "enabled": true,
  "tiers": [
    {
      "id": "free",
      "name": "Getting Started",
      "priceInCents": 0,
      "conversationsPerMonth": 5
    },
    {
      "id": "friend",
      "name": "Your Life Coach",
      "priceInCents": 999,
      "conversationsPerMonth": null,
      "popular": true
    },
    {
      "id": "partner",
      "name": "Partner in Growth",
      "priceInCents": 1999,
      "conversationsPerMonth": null
    }
  ]
}
```

---

## Engagement API

Track user engagement, conversations, and analytics.

### Get Profile
```http
GET /api/profile?userId=user-123
```

### Update Profile
```http
POST /api/profile
Content-Type: application/json

{
  "userId": "user-123",
  "profile": {
    "name": "John",
    "lifeStage": "early_career",
    "goals": ["build savings", "career growth"]
  }
}
```

### Get Conversation History
```http
GET /api/conversations?userId=user-123&limit=50
```

### Get Conversation Highlights
```http
GET /api/conversations/highlights?userId=user-123&days=30
```

### Get Analytics Summary
```http
GET /api/analytics/summary?userId=user-123
```

**Response:**
```json
{
  "totalConversations": 47,
  "totalMinutes": 423,
  "streakDays": 5,
  "topPersonas": [
    { "id": "ferni", "count": 25 },
    { "id": "maya-santos", "count": 15 }
  ],
  "topTopics": ["career", "habits", "relationships"]
}
```

### Get Predictions
```http
GET /api/predictions?userId=user-123&type=engagement
```

### Update Prediction Actuals
```http
POST /api/predictions/:id/actuals
Content-Type: application/json

{
  "actual": true,
  "notes": "User did return within predicted timeframe"
}
```

### Get Rituals
```http
GET /api/rituals?userId=user-123
```

### Create Ritual
```http
POST /api/rituals
Content-Type: application/json

{
  "userId": "user-123",
  "name": "Morning Check-in",
  "schedule": "daily",
  "time": "08:00"
}
```

### Complete Ritual
```http
POST /api/rituals/:id/complete
Content-Type: application/json

{
  "userId": "user-123",
  "notes": "Great session"
}
```

### Get Cognitive Memories
```http
GET /api/cognitive/memories?userId=user-123
```

### Export User Data
```http
POST /api/export
Content-Type: application/json

{
  "userId": "user-123",
  "format": "json",
  "include": ["profile", "conversations", "memories"]
}
```

### Delete All User Data
```http
DELETE /api/export/all
Content-Type: application/json

{
  "userId": "user-123",
  "confirm": true
}
```

---

## Agents API

Access the agent registry and manage agents.

### List All Agents
```http
GET /api/agents
```

**Response:**
```json
{
  "agents": [
    {
      "id": "ferni",
      "name": "Ferni",
      "initials": "F",
      "subtitle": "Life Coach",
      "role": "life-coach",
      "isCoordinator": true,
      "canHandoff": true,
      "voiceId": "fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc"
    },
    // ... more agents
  ],
  "count": 6,
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### Get Single Agent
```http
GET /api/agents/:id
```

### Enable/Disable Agent
```http
POST /api/agents/:id/enable
Content-Type: application/json

{
  "enabled": true
}
```

### Update Agent Settings
```http
PUT /api/agents/:id
Content-Type: application/json

{
  "subtitle": "Your Life Guide",
  "colors": {
    "primary": "#4a6741"
  }
}
```

### Validate All Agents
```http
POST /api/agents/validate
```

---

## Diagnostics API

Handoff metrics and diagnostics. **Requires admin authentication.**

### Get Handoff Metrics
```http
GET /api/diagnostics/handoffs?window=60
X-API-Key: admin-key
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalAttempts": 150,
    "totalSuccesses": 143,
    "totalFailures": 7,
    "successRate": 0.953,
    "averageDurationMs": 245,
    "byTargetAgent": {
      "alex-chen": { "attempts": 45, "successes": 44 },
      "maya-santos": { "attempts": 38, "successes": 37 }
    },
    "byFailureReason": {
      "timeout": 3,
      "agent_not_found": 2
    }
  },
  "meta": {
    "windowMinutes": 60,
    "generatedAt": "2025-01-01T00:00:00Z"
  }
}
```

### Get Recent Handoffs
```http
GET /api/diagnostics/handoffs/recent?limit=50&window=60
```

### Get Handoff Failures
```http
GET /api/diagnostics/handoffs/failures?limit=50
```

### Get In-Progress Handoffs
```http
GET /api/diagnostics/handoffs/in-progress
```

### Get Specific Trace
```http
GET /api/diagnostics/handoffs/:traceId
```

---

## DORA API

DevOps Research and Assessment metrics.

### Get DORA Metrics
```http
GET /api/dora/metrics?days=30
```

**Response:**
```json
{
  "deploymentFrequency": {
    "value": 2.5,
    "unit": "per_day",
    "trend": "improving"
  },
  "leadTime": {
    "value": 4.2,
    "unit": "hours",
    "trend": "stable"
  },
  "changeFailureRate": {
    "value": 0.05,
    "trend": "improving"
  },
  "mttr": {
    "value": 45,
    "unit": "minutes",
    "trend": "stable"
  }
}
```

### Record Deployment
```http
POST /api/dora/deployments
Content-Type: application/json

{
  "version": "1.2.3",
  "environment": "production",
  "commitSha": "abc123",
  "success": true
}
```

### Record Deployment Failure
```http
POST /api/dora/deployments/:id/fail
Content-Type: application/json

{
  "reason": "Container startup timeout"
}
```

### Get Incidents
```http
GET /api/dora/incidents?status=open
```

### Record Incident
```http
POST /api/dora/incidents
Content-Type: application/json

{
  "title": "High latency in voice processing",
  "severity": "major",
  "description": "Response times increased to 500ms+"
}
```

### Resolve Incident
```http
POST /api/dora/incidents/:id/resolve
Content-Type: application/json

{
  "resolution": "Scaled up voice processing pods",
  "rootCause": "Traffic spike from marketing campaign"
}
```

---

## Feature Flags API

Manage feature toggles.

### Get All Flags
```http
GET /api/flags
```

**Response:**
```json
{
  "flags": [
    {
      "id": "new-handoff-system",
      "name": "New Handoff System",
      "enabled": true,
      "rolloutPercentage": 100,
      "description": "Use v2 handoff architecture"
    }
  ]
}
```

### Get Single Flag
```http
GET /api/flags/:id
```

### Create Flag
```http
POST /api/flags
Content-Type: application/json

{
  "id": "beta-feature",
  "name": "Beta Feature",
  "enabled": false,
  "rolloutPercentage": 0,
  "description": "New experimental feature"
}
```

### Update Flag
```http
PUT /api/flags/:id
Content-Type: application/json

{
  "enabled": true,
  "rolloutPercentage": 50
}
```

### Delete Flag
```http
DELETE /api/flags/:id
```

---

## Observability API

System metrics and monitoring.

### Get LLM Metrics
```http
GET /api/observability/llm?hours=24
```

### Get Connection Metrics
```http
GET /api/observability/connections?hours=24
```

### Get UX Metrics
```http
GET /api/observability/ux?hours=24
```

### Get Memory Metrics
```http
GET /api/observability/memory?hours=24
```

### Get Cost Metrics
```http
GET /api/observability/costs?hours=24
```

### Get Error Summary
```http
GET /api/observability/errors?hours=24
```

### Get Persona Usage
```http
GET /api/observability/personas?hours=24
```

### Get Alerts
```http
GET /api/observability/alerts?hours=24
```

### Clear Metrics
```http
POST /api/observability/clear
```

---

## Voice Presence API

Voice analytics and presence tuning.

### Get Analytics
```http
GET /api/voice-presence/analytics?userId=user-123
```

### Get Recommendations
```http
GET /api/voice-presence/recommendations?userId=user-123
```

### Get Current Config
```http
GET /api/voice-presence/config?userId=user-123
```

### Update Config
```http
POST /api/voice-presence/config
Content-Type: application/json

{
  "userId": "user-123",
  "pauseMultiplier": 1.2,
  "speedMultiplier": 0.9
}
```

### Apply Recommendation
```http
POST /api/voice-presence/apply-recommendation
Content-Type: application/json

{
  "userId": "user-123",
  "recommendationId": "rec-123"
}
```

### Trigger Auto-Tune
```http
POST /api/voice-presence/auto-tune
Content-Type: application/json

{
  "userId": "user-123"
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Rate Limiting

Default rate limits:
- **Standard endpoints**: 100 requests/minute per IP
- **Auth endpoints**: 20 requests/minute per IP
- **Webhook endpoints**: 1000 requests/minute

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

---

## CORS

CORS is configured via the `ALLOWED_ORIGINS` environment variable:

```bash
# Development (allows all)
ALLOWED_ORIGINS=*

# Production (restrict to your domains)
ALLOWED_ORIGINS=https://ferni.ai,https://app.ferni.ai
```

---

## Webhooks

### Stripe Webhooks

Configure in Stripe Dashboard:
```
Endpoint URL: https://your-domain/api/subscription/webhook
Events: customer.subscription.*, invoice.*, checkout.session.completed
```

Webhook signature verification:
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```
