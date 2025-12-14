# Marketplace API Reference

Complete API documentation for the Ferni Marketplace.

## Base URL

- **Production**: `https://voiceai-ui-johnb-2025.a.run.app`
- **Local**: `http://localhost:3002`

## Authentication

Most endpoints require authentication via Firebase ID token:

```
Authorization: Bearer <firebase_id_token>
```

Publisher endpoints require publisher authentication:

```
X-Publisher-Token: <publisher_session_token>
```

---

## Browse Endpoints

### List Tools

```
GET /api/marketplace/browse/tools
```

Returns all published tools in the marketplace.

**Response:**
```json
{
  "tools": [
    {
      "id": "tool_weather",
      "name": "Weather Tool",
      "description": "Get current weather",
      "category": "utilities",
      "publisher": { "id": "pub_123", "name": "WeatherCo", "verified": true },
      "pricing": { "model": "free" },
      "stats": { "installs": 1000, "rating": 4.5 }
    }
  ]
}
```

### List Agents

```
GET /api/marketplace/browse/agents
```

Returns all published agents in the marketplace.

### Get Tool Details

```
GET /api/marketplace/browse/tools/:id
```

### Get Agent Details

```
GET /api/marketplace/browse/agents/:id
```

---

## Installation Endpoints

### Install Tool

```
POST /api/marketplace/install/tool
```

**Request:**
```json
{
  "toolId": "tool_weather",
  "permissions": ["external:http:read"]
}
```

**Response:**
```json
{
  "installation": {
    "id": "inst_abc123",
    "itemId": "tool_weather",
    "itemType": "tool",
    "userId": "user_123",
    "status": "active",
    "installedAt": "2025-12-13T10:00:00Z"
  }
}
```

### Install Agent

```
POST /api/marketplace/install/agent
```

**Request:**
```json
{
  "agentId": "agent_coach",
  "permissions": ["user:profile:read", "memory:read"]
}
```

### Uninstall Tool

```
DELETE /api/marketplace/install/tool/:id
```

### Uninstall Agent

```
DELETE /api/marketplace/install/agent/:id
```

### List Installations

```
GET /api/marketplace/install/list
```

Returns all installations for the authenticated user.

---

## Usage & Billing Endpoints

### Get Item Usage

```
GET /api/marketplace/usage/:itemId
```

**Response:**
```json
{
  "summary": {
    "totals": {
      "executions": 150,
      "executionTimeMs": 45000,
      "dataTransferBytes": 1024000
    },
    "quota": {
      "usagePercentage": 30,
      "exceeded": false
    },
    "period": {
      "startDate": "2025-12-01T00:00:00Z",
      "endDate": "2025-12-31T23:59:59Z"
    }
  }
}
```

### Get Usage Summary

```
GET /api/marketplace/usage/summary
```

Returns aggregated usage across all installed items.

### Get Usage History

```
GET /api/marketplace/usage/history?itemId=tool_weather&startDate=2025-12-01&endDate=2025-12-13
```

### Check Quota

```
GET /api/marketplace/quota/check/:itemId
```

**Response:**
```json
{
  "canExecute": true,
  "remainingExecutions": 850,
  "quotaResetDate": "2025-01-01T00:00:00Z"
}
```

### Get Pending Payouts (Publishers)

```
GET /api/marketplace/billing/payouts
```

Requires publisher authentication.

---

## Publisher Endpoints

### Submit Tool/Agent

```
POST /api/marketplace/publisher/submit
```

**Request:**
```json
{
  "type": "tool",
  "manifest": {
    "id": "tool_mytool",
    "name": "My Tool",
    "version": "1.0.0",
    "description": { "short": "Does something", "long": "..." },
    "licensing": { "type": "free" },
    "permissions": { "required": [], "optional": [] },
    "execution": { ... },
    "interface": { ... }
  }
}
```

### Update Submission

```
PUT /api/marketplace/publisher/:id
```

### List Publisher Items

```
GET /api/marketplace/publisher/items
```

### Get Item Analytics

```
GET /api/marketplace/publisher/:id/analytics
```

**Response:**
```json
{
  "analytics": {
    "totalInstalls": 500,
    "activeInstalls": 450,
    "totalExecutions": 10000,
    "revenue": {
      "totalCents": 50000,
      "pendingCents": 5000
    },
    "ratings": { "average": 4.5, "count": 50 }
  }
}
```

### Delete Submission

```
DELETE /api/marketplace/publisher/:id
```

### Get Publisher Profile

```
GET /api/marketplace/publisher/profile
```

---

## Webhook Endpoint

### Stripe Webhooks

```
POST /api/marketplace/webhook
```

**Headers:**
```
Stripe-Signature: <webhook_signature>
Content-Type: application/json
```

**Handled Events:**
- `checkout.session.completed` - Purchase completed
- `invoice.paid` - Subscription renewed
- `invoice.payment_failed` - Payment failed
- `payout.paid` - Publisher payout completed
- `customer.subscription.deleted` - Subscription cancelled

---

## Scheduled Job Endpoints

These endpoints are called by Cloud Scheduler. They require the `X-CloudScheduler: true` header.

### Daily Usage Aggregation

```
POST /api/jobs/marketplace-daily-aggregation
```

### Weekly Usage Reports

```
POST /api/jobs/marketplace-weekly-reports
```

### Monthly Revenue Calculation

```
POST /api/jobs/marketplace-monthly-revenue
```

### Publisher Payouts

```
POST /api/jobs/marketplace-publisher-payouts
```

### Quarterly Cleanup

```
POST /api/jobs/marketplace-quarterly-cleanup
```

### Job Status

```
GET /api/jobs/status
```

Returns configuration for all scheduled jobs.

---

## Checkout Flow

### Create Checkout Session

```
POST /api/marketplace/checkout
```

**Request:**
```json
{
  "itemId": "tool_premium",
  "itemType": "tool",
  "successUrl": "https://app.ferni.ai/marketplace/success",
  "cancelUrl": "https://app.ferni.ai/marketplace/cancel"
}
```

**Response:**
```json
{
  "sessionId": "cs_test_123",
  "url": "https://checkout.stripe.com/pay/cs_test_123"
}
```

---

## Error Responses

All errors return JSON with this structure:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `QUOTA_EXCEEDED` | 429 | Usage quota exceeded |
| `PAYMENT_REQUIRED` | 402 | Payment needed for premium item |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Browse | 100/min |
| Install/Uninstall | 20/min |
| Usage queries | 60/min |
| Publisher APIs | 30/min |
| Webhooks | Unlimited |
