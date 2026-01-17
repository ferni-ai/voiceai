---
layout: layouts/docs.njk
title: Activities API
description: Track custom activities and metrics for analytics
order: 6
---

# Activities API

Log custom activities and metrics to track how users interact with your integrations. Use activities for analytics, debugging, and building dashboards.

**Base URL:** `https://api.ferni.ai/api/v2/developers/activities`

---

## Log Activity

Create a new activity record.

```http
POST /activities
```

### Request Body

```json
{
  "type": "customer_lookup",
  "name": "Customer Lookup Completed",
  "data": {
    "query": "Acme Corp",
    "resultCount": 3,
    "selectedCustomerId": "cust_123"
  },
  "sessionId": "sess_456",
  "status": "completed",
  "duration": 1250
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Activity type (developer-defined) |
| `name` | string | Yes | Human-readable name |
| `data` | object | No | Custom data payload (max 10KB) |
| `sessionId` | string | No | Associated session ID |
| `status` | string | No | `started`, `completed`, or `failed` |
| `duration` | number | No | Duration in milliseconds |
| `startedAt` | string | No | ISO timestamp (defaults to now) |
| `completedAt` | string | No | ISO timestamp |

### Response

```json
{
  "success": true,
  "data": {
    "id": "act_abc123xyz",
    "type": "customer_lookup",
    "name": "Customer Lookup Completed",
    "status": "completed",
    "duration": 1250,
    "createdAt": "2026-01-11T10:00:00Z"
  }
}
```

---

## Query Activities

Search and filter activities.

```http
GET /activities
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by activity type |
| `status` | string | Filter: `started`, `completed`, `failed` |
| `sessionId` | string | Filter by session |
| `from` | string | Start date (ISO format) |
| `to` | string | End date (ISO format) |
| `limit` | number | Max results (default: 50, max: 200) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "act_abc123xyz",
      "type": "customer_lookup",
      "name": "Customer Lookup Completed",
      "status": "completed",
      "duration": 1250,
      "sessionId": "sess_456",
      "data": {
        "query": "Acme Corp",
        "resultCount": 3
      },
      "createdAt": "2026-01-11T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Get Activity

Retrieve a specific activity.

```http
GET /activities/:id
```

---

## Delete Activity

Remove an activity record.

```http
DELETE /activities/:id
```

---

## Get Aggregate Stats

Get aggregated statistics for activities.

```http
GET /activities/stats
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by activity type |
| `from` | string | Start date (ISO format) |
| `to` | string | End date (ISO format) |
| `groupBy` | string | `hour`, `day`, `week`, or `month` |

### Response

```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 1250,
      "completed": 1180,
      "failed": 70,
      "averageDuration": 890,
      "p50Duration": 750,
      "p95Duration": 2100
    },
    "byType": {
      "customer_lookup": {
        "count": 450,
        "averageDuration": 1100
      },
      "order_created": {
        "count": 320,
        "averageDuration": 650
      },
      "ticket_resolved": {
        "count": 480,
        "averageDuration": 920
      }
    },
    "timeSeries": [
      { "period": "2026-01-10", "count": 156, "averageDuration": 880 },
      { "period": "2026-01-11", "count": 203, "averageDuration": 920 }
    ]
  }
}
```

---

## Get Stats by Type

Get detailed statistics for a specific activity type.

```http
GET /activities/stats/:type
```

### Response

```json
{
  "success": true,
  "data": {
    "type": "customer_lookup",
    "summary": {
      "total": 450,
      "completed": 435,
      "failed": 15,
      "averageDuration": 1100,
      "successRate": 0.967
    },
    "recentTrend": {
      "direction": "up",
      "change": 0.12,
      "period": "7d"
    },
    "topErrors": [
      { "message": "Customer not found", "count": 10 },
      { "message": "Timeout", "count": 5 }
    ]
  }
}
```

---

## Activity Patterns

### Simple Activity

```json
{
  "type": "feature_used",
  "name": "Used Weather Feature",
  "status": "completed"
}
```

### Activity with Timing

```json
{
  "type": "api_call",
  "name": "External API Request",
  "status": "started",
  "startedAt": "2026-01-11T10:00:00Z"
}
```

Later, update with completion:

```json
{
  "type": "api_call",
  "name": "External API Request",
  "status": "completed",
  "duration": 1250,
  "data": {
    "endpoint": "/customers",
    "statusCode": 200
  }
}
```

### Activity with Rich Data

```json
{
  "type": "workflow_completed",
  "name": "Daily Standup Workflow",
  "status": "completed",
  "duration": 5200,
  "sessionId": "sess_456",
  "data": {
    "workflowId": "wf_123",
    "stepsExecuted": 5,
    "meetingsFound": 3,
    "calendarProvider": "google"
  }
}
```

### Failed Activity

```json
{
  "type": "crm_sync",
  "name": "CRM Sync Failed",
  "status": "failed",
  "data": {
    "error": "Connection timeout",
    "retryCount": 3,
    "lastAttempt": "2026-01-11T10:05:00Z"
  }
}
```

---

## Use Cases

### 1. Feature Usage Analytics

Track which features users engage with:

```json
{
  "type": "feature_engagement",
  "name": "Customer Lookup Used",
  "data": { "source": "voice", "persona": "ferni" }
}
```

### 2. Integration Health

Monitor your integrations:

```json
{
  "type": "integration_health",
  "name": "CRM Connection Check",
  "status": "completed",
  "duration": 89,
  "data": { "endpoint": "https://crm.example.com", "healthy": true }
}
```

### 3. User Journey Tracking

Track user flows:

```json
{
  "type": "journey_step",
  "name": "Onboarding - Step 2",
  "sessionId": "sess_456",
  "data": { "step": 2, "totalSteps": 5, "timeOnStep": 45000 }
}
```

### 4. Error Monitoring

Log errors for debugging:

```json
{
  "type": "error",
  "name": "Tool Execution Failed",
  "status": "failed",
  "data": {
    "toolId": "tool_123",
    "error": "Rate limit exceeded",
    "context": { "query": "test" }
  }
}
```

---

## Data Retention

| Plan | Retention |
|------|-----------|
| Free | 7 days |
| Pro | 90 days |
| Enterprise | 1 year+ |

Activities older than your retention period are automatically deleted.

---

## Rate Limits

| Plan | Activities/minute |
|------|-------------------|
| Free | 100 |
| Pro | 1000 |
| Enterprise | 10000 |

---

## Best Practices

1. **Use consistent type names** — `customer_lookup` not `customerLookup` or `customer-lookup`
2. **Include sessionId** — Enables session-level analytics
3. **Track duration** — Helps identify performance issues
4. **Limit data size** — Keep `data` under 10KB
5. **Use status correctly** — `started` → `completed`/`failed`

---

## Related

- [Webhooks API](/developers/api/webhooks/) — Receive activity events
- [Workflows API](/developers/api/workflows/) — Log activities from workflows
