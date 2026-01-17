# Ferni API Authentication Guide

Complete guide to authenticating with the Ferni Developer Platform API.

---

## Overview

The Ferni API uses **API keys** for authentication. Each request must include your API key in the `Authorization` header using the Bearer scheme.

```http
Authorization: Bearer ferni_live_xxxxxxxxxxxxx
```

---

## API Key Types

Ferni provides two types of API keys:

| Type | Prefix | Purpose | Rate Limits |
|------|--------|---------|-------------|
| **Test** | `ferni_test_` | Development and testing | 100 req/min |
| **Live** | `ferni_live_` | Production usage | Plan-based |

### Test Keys

- Use for development and integration testing
- Safe to use in CI/CD pipelines
- Limited rate limits (100 requests/minute)
- Sessions marked as "test" in analytics
- No charges incurred
- Personas must be in "approved" or "published" status

### Live Keys

- Use for production applications
- Higher rate limits based on your plan
- Sessions count toward billing
- Full analytics and monitoring
- Requires approved/published personas

---

## Creating API Keys

### Via SDK

```typescript
import { FerniClient } from '@ferni/sdk';

const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
});

// Create a test key
const { key } = await ferni.createApiKey({
  type: 'test',
  name: 'Development Key',
});

console.log('New API Key:', key.apiKey);
// ⚠️ This is the ONLY time you'll see the full key!
```

### Via Dashboard

1. Log in to the [Ferni Developer Dashboard](https://developers.ferni.ai)
2. Navigate to **Settings → API Keys**
3. Click **Create New Key**
4. Choose **Test** or **Live**
5. Give it a descriptive name
6. Copy and securely store the key

---

## Using API Keys

### In the SDK

```typescript
import { FerniClient } from '@ferni/sdk';

// Initialize with your API key
const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
});

// All methods automatically include authentication
const { personas } = await ferni.listPersonas();
```

### Direct HTTP Requests

```bash
curl https://api.ferni.ai/api/v1/developers/personas \
  -H "Authorization: Bearer ferni_live_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json"
```

### In Different Languages

**Node.js (fetch)**
```javascript
const response = await fetch('https://api.ferni.ai/api/v1/developers/personas', {
  headers: {
    'Authorization': `Bearer ${process.env.FERNI_API_KEY}`,
    'Content-Type': 'application/json',
  },
});
```

**Python (requests)**
```python
import os
import requests

response = requests.get(
    'https://api.ferni.ai/api/v1/developers/personas',
    headers={
        'Authorization': f'Bearer {os.environ["FERNI_API_KEY"]}',
        'Content-Type': 'application/json',
    }
)
```

**Go**
```go
req, _ := http.NewRequest("GET", "https://api.ferni.ai/api/v1/developers/personas", nil)
req.Header.Set("Authorization", "Bearer "+os.Getenv("FERNI_API_KEY"))
req.Header.Set("Content-Type", "application/json")
```

---

## Key Management

### Viewing Keys

List all your API keys (returns prefixes only for security):

```typescript
const { keys } = await ferni.listApiKeys();

for (const key of keys) {
  console.log(`${key.name}: ${key.keyPrefix}... (${key.type})`);
  console.log(`  Created: ${key.createdAt}`);
  console.log(`  Last used: ${key.lastUsedAt || 'Never'}`);
}
```

### Rotating Keys

Rotate a key to generate a new secret while keeping the same key ID:

```typescript
// Rotate a key (old key is immediately revoked)
const { key } = await ferni.rotateApiKey('key_abc123');

console.log('New API Key:', key.apiKey);
// ⚠️ Update your applications with the new key immediately!
```

**When to rotate:**
- Suspected compromise
- Employee departure
- Regular security policy (e.g., every 90 days)
- After testing in insecure environments

### Revoking Keys

Permanently revoke a key:

```typescript
await ferni.revokeApiKey('key_abc123');
// Key is immediately invalid - all requests will fail
```

**Warning:** Revoking a key is immediate and irreversible. Ensure no production systems depend on the key before revoking.

---

## Security Best Practices

### 1. Never Expose Keys in Code

```typescript
// ❌ WRONG - hardcoded key
const ferni = new FerniClient({
  apiKey: 'ferni_live_xxxxxxxxxxxxx',
});

// ✅ RIGHT - environment variable
const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
});
```

### 2. Use Different Keys Per Environment

| Environment | Key Type | Key Name |
|-------------|----------|----------|
| Local dev | Test | `Development - Local` |
| CI/CD | Test | `Development - CI` |
| Staging | Test | `Staging` |
| Production | Live | `Production` |

### 3. Restrict Key Access

- Store keys in secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)
- Use CI/CD environment variables, not code
- Limit who can view/manage keys in your organization

### 4. Monitor Key Usage

Check key activity regularly:

```typescript
const { keys } = await ferni.listApiKeys();

for (const key of keys) {
  const daysSinceUse = key.lastUsedAt
    ? Math.floor((Date.now() - new Date(key.lastUsedAt).getTime()) / 86400000)
    : null;

  if (daysSinceUse === null) {
    console.log(`⚠️ ${key.name}: Never used - consider revoking`);
  } else if (daysSinceUse > 90) {
    console.log(`⚠️ ${key.name}: Not used in ${daysSinceUse} days`);
  }
}
```

### 5. Use Least Privilege

Create separate keys for different services/components. If one is compromised, others remain safe.

### 6. Rotate Regularly

Set up a rotation schedule:

```typescript
// Example: Check for keys older than 90 days
const { keys } = await ferni.listApiKeys();
const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

for (const key of keys) {
  const createdAt = new Date(key.createdAt).getTime();
  if (createdAt < ninetyDaysAgo) {
    console.log(`⚠️ ${key.name} is older than 90 days - rotate it!`);
  }
}
```

---

## Environment Configuration

### Local Development

Create a `.env` file (add to `.gitignore`!):

```bash
# .env
FERNI_API_KEY=ferni_test_xxxxxxxxxxxxx
FERNI_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

Load with dotenv:

```typescript
import 'dotenv/config';
import { FerniClient } from '@ferni/sdk';

const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY!,
});
```

### Production Deployment

#### AWS

```bash
# Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name ferni/production/api-key \
  --secret-string "ferni_live_xxxxxxxxxxxxx"

# Or use SSM Parameter Store
aws ssm put-parameter \
  --name /ferni/production/api-key \
  --value "ferni_live_xxxxxxxxxxxxx" \
  --type SecureString
```

#### Google Cloud

```bash
# Store in Secret Manager
echo -n "ferni_live_xxxxxxxxxxxxx" | \
  gcloud secrets create ferni-api-key --data-file=-
```

#### Docker

```bash
# Use Docker secrets or environment variables
docker run -e FERNI_API_KEY=ferni_live_xxxxxxxxxxxxx myapp
```

#### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ferni-credentials
type: Opaque
stringData:
  api-key: ferni_live_xxxxxxxxxxxxx
```

---

## Rate Limits

Rate limits are applied per API key:

| Plan | Rate Limit | Burst |
|------|------------|-------|
| Free | 100/min | 20/sec |
| Pro | 500/min | 50/sec |
| Enterprise | Custom | Custom |

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 495
X-RateLimit-Reset: 1704067260
```

### Handling Rate Limits

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof FerniApiError && error.status === 429) {
        // Rate limited - wait and retry
        const waitMs = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limited, waiting ${waitMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const personas = await withRetry(() => ferni.listPersonas());
```

---

## Webhook Authentication

Webhooks use a different authentication mechanism - **HMAC-SHA256 signatures**.

### Signature Format

```
X-Webhook-Signature: t=1704067200,v1=abc123...
```

- `t` - Unix timestamp (seconds)
- `v1` - HMAC-SHA256 signature

### Verification

```typescript
import { parseWebhookEvent } from '@ferni/sdk';

app.post('/webhooks/ferni', async (req, res) => {
  try {
    const event = await parseWebhookEvent(
      req.body.toString(), // Raw body
      req.headers['x-webhook-signature'] as string,
      process.env.FERNI_WEBHOOK_SECRET!
    );

    // Signature verified - process event
    await handleEvent(event);
    res.status(200).json({ received: true });

  } catch (error) {
    // Invalid signature
    res.status(401).json({ error: 'Invalid signature' });
  }
});
```

### Getting Your Webhook Secret

The webhook secret is provided when you create a webhook:

```typescript
const { data: webhook } = await ferni.createWebhook({
  name: 'My Webhook',
  url: 'https://myapp.com/webhooks/ferni',
  events: ['session.started', 'session.ended'],
});

console.log('Webhook Secret:', webhook.secret);
// Store this securely - it won't be shown again!
```

---

## Troubleshooting

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Invalid or missing API key",
  "code": "UNAUTHORIZED"
}
```

**Solutions:**
1. Verify the key is correct (no extra spaces)
2. Check the key hasn't been revoked
3. Ensure you're using the right key type (test vs live)
4. Verify the `Authorization` header format

### 403 Forbidden

```json
{
  "success": false,
  "error": "Access denied to this resource",
  "code": "FORBIDDEN"
}
```

**Solutions:**
1. Check you have access to the requested resource
2. Verify the key belongs to your organization
3. For personas, ensure they're approved/published

### 429 Rate Limited

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

**Solutions:**
1. Implement exponential backoff
2. Check `X-RateLimit-Reset` header
3. Consider upgrading your plan

---

## Related Documentation

- [API Reference](/docs/api/DEVELOPER-API-REFERENCE.md) - Full API documentation
- [Webhook Events](/docs/api/WEBHOOK-EVENTS.md) - Webhook authentication
- [Error Codes](/docs/api/ERROR-CODES.md) - Error reference
- [Integration Tutorial](/docs/api/INTEGRATION-TUTORIAL.md) - Getting started

---

*Last updated: January 2025*
