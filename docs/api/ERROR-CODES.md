# Ferni API Error Codes Reference

Complete reference of all error codes returned by the Ferni Developer Platform API.

---

## Error Response Format

All API errors follow this structure:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

| Status | Category | Description |
|--------|----------|-------------|
| `400` | Client Error | Invalid request (bad syntax, missing params) |
| `401` | Auth Error | Missing or invalid authentication |
| `403` | Auth Error | Valid auth but no permission |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource state conflict |
| `422` | Validation | Request valid but can't process |
| `429` | Rate Limit | Too many requests |
| `500` | Server Error | Internal server error |
| `503` | Unavailable | Service temporarily unavailable |

---

## Authentication Errors

### UNAUTHORIZED

**HTTP Status:** 401

**Message:** `Invalid or missing API key`

**Causes:**
- No `Authorization` header provided
- Malformed header (not `Bearer <key>`)
- Invalid API key format
- Key has been revoked

**Solution:**
```typescript
// Ensure header is correct
const response = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${apiKey}`, // No extra spaces!
    'Content-Type': 'application/json',
  },
});
```

---

### FORBIDDEN

**HTTP Status:** 403

**Message:** `Access denied to this resource`

**Causes:**
- Trying to access another publisher's resources
- Key doesn't have required permissions
- Resource requires higher plan tier

**Solution:**
- Verify you're accessing your own resources
- Check your subscription plan includes the feature
- Contact support for permission issues

---

### API_KEY_REVOKED

**HTTP Status:** 401

**Message:** `This API key has been revoked`

**Causes:**
- Key was manually revoked
- Key was rotated (old key is now invalid)
- Security incident triggered automatic revocation

**Solution:**
- Generate a new API key in the dashboard
- Update all applications with the new key

---

## Rate Limit Errors

### RATE_LIMIT_EXCEEDED

**HTTP Status:** 429

**Message:** `Rate limit exceeded. Please retry after {seconds} seconds`

**Causes:**
- Too many requests per minute
- Burst limit exceeded

**Response Headers:**
```http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704067260
Retry-After: 30
```

**Solution:**
```typescript
import { FerniApiError } from '@ferni/sdk';

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FerniApiError && error.status === 429) {
      const retryAfter = 30; // Use Retry-After header value
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return fn();
    }
    throw error;
  }
}
```

---

## Validation Errors

### VALIDATION_ERROR

**HTTP Status:** 400

**Message:** `Validation failed: {details}`

**Causes:**
- Missing required fields
- Invalid field values
- Field constraints violated

**Example:**
```json
{
  "success": false,
  "error": "Validation failed: personality.warmth must be between 0 and 1",
  "code": "VALIDATION_ERROR"
}
```

**Solution:**
- Check request body matches schema
- Review field requirements in API reference
- Ensure values are within valid ranges

---

### INVALID_PARAMETER

**HTTP Status:** 400

**Message:** `Invalid parameter: {param}`

**Causes:**
- Wrong data type for parameter
- Invalid enum value
- Malformed ID format

**Solution:**
```typescript
// Ensure correct types
await ferni.createPersona({
  identity: {
    id: 'my-persona-v1',    // string, kebab-case
    name: 'My Persona',      // string, required
    tagline: 'A helper',     // string, required
  },
  personality: {
    warmth: 0.8,             // number 0-1, not string!
    humor_level: 0.5,
    directness: 0.7,
    formality: 0.4,
    traits: ['friendly'],    // array of strings
  },
  // ...
});
```

---

### MISSING_PARAMETER

**HTTP Status:** 400

**Message:** `Missing required parameter: {param}`

**Causes:**
- Required field not provided
- Null value for required field

**Solution:**
- Check API reference for required fields
- Ensure all required fields are populated

---

## Resource Errors

### NOT_FOUND

**HTTP Status:** 404

**Message:** `Resource not found`

**Causes:**
- Invalid resource ID
- Resource was deleted
- Typo in resource identifier

**Solution:**
```typescript
// Verify resource exists before operations
try {
  const { persona } = await ferni.getPersona('my-persona-id');
} catch (error) {
  if (error instanceof FerniApiError && error.status === 404) {
    console.log('Persona does not exist');
    // Handle missing resource
  }
}
```

---

### ALREADY_EXISTS

**HTTP Status:** 409

**Message:** `Resource already exists with ID: {id}`

**Causes:**
- Creating persona with duplicate ID
- Creating webhook with duplicate URL + events

**Solution:**
- Use unique IDs for resources
- Update existing resource instead of creating new

---

### CONFLICT

**HTTP Status:** 409

**Message:** `Resource in conflicting state`

**Causes:**
- Updating a persona that's currently being validated
- Deleting an active webhook

**Solution:**
- Wait for pending operations to complete
- Check resource status before modifying

---

## Persona Errors

### PERSONA_NOT_APPROVED

**HTTP Status:** 403

**Message:** `Persona must be approved before use`

**Causes:**
- Using a draft persona with live key
- Persona was rejected

**Solution:**
- Submit persona for review
- Use test key for draft personas
- Fix rejection issues and resubmit

---

### PERSONA_VALIDATION_FAILED

**HTTP Status:** 422

**Message:** `Persona validation failed`

**Response includes validation errors:**
```json
{
  "success": false,
  "error": "Persona validation failed",
  "code": "PERSONA_VALIDATION_FAILED",
  "validation": {
    "valid": false,
    "errors": [
      "personality.traits must have at least 2 items",
      "voice.voice_id is required"
    ],
    "warnings": [
      "Consider adding aliases for better discovery"
    ]
  }
}
```

**Solution:**
- Review validation errors in response
- Fix all errors before submitting
- Address warnings for better quality

---

### PERSONA_ALREADY_SUBMITTED

**HTTP Status:** 409

**Message:** `Persona is already submitted for review`

**Causes:**
- Submitting a persona that's already pending review

**Solution:**
- Wait for review to complete
- Contact support to expedite if urgent

---

### PERSONA_CANNOT_UPDATE

**HTTP Status:** 409

**Message:** `Cannot update persona in current state`

**Causes:**
- Updating a published persona (requires new version)
- Updating while validation is in progress

**Solution:**
- For published personas, create a new version
- Wait for validation to complete

---

## Webhook Errors

### WEBHOOK_URL_INVALID

**HTTP Status:** 400

**Message:** `Webhook URL must be HTTPS`

**Causes:**
- Using HTTP instead of HTTPS
- Malformed URL

**Solution:**
- Use HTTPS URLs only
- Verify URL is properly formatted

---

### WEBHOOK_URL_UNREACHABLE

**HTTP Status:** 422

**Message:** `Could not reach webhook URL`

**Causes:**
- Endpoint doesn't respond
- Firewall blocking requests
- Invalid DNS

**Solution:**
- Verify endpoint is accessible from public internet
- Check firewall rules
- Test with `curl` from external machine

---

### WEBHOOK_SIGNATURE_INVALID

**HTTP Status:** 401

**Message:** `Invalid webhook signature`

**Causes:**
- Wrong webhook secret
- Signature timestamp too old (>5 minutes)
- Modified request body

**Solution:**
```typescript
// Ensure you're using raw body for verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// Use the correct secret
const event = await parseWebhookEvent(
  req.body.toString(),  // Raw body, not parsed
  headers['x-webhook-signature'],
  process.env.WEBHOOK_SECRET  // Match the one from creation
);
```

---

### WEBHOOK_DELIVERY_FAILED

**HTTP Status:** 502

**Message:** `Webhook delivery failed after all retries`

**Causes:**
- Endpoint returning errors
- Timeout (>30 seconds)
- Connection refused

**Solution:**
- Check webhook logs for specific errors
- Ensure endpoint responds within 30 seconds
- Return 2xx status codes on success

---

## Session Errors

### SESSION_NOT_FOUND

**HTTP Status:** 404

**Message:** `Session not found or expired`

**Causes:**
- Invalid session ID
- Session already ended
- Session expired

**Solution:**
- Verify session ID is correct
- Create new session if needed

---

### SESSION_LIMIT_EXCEEDED

**HTTP Status:** 429

**Message:** `Maximum concurrent sessions reached`

**Causes:**
- Plan limit on concurrent sessions reached

**Solution:**
- Wait for active sessions to end
- Upgrade plan for more concurrent sessions

---

## Analytics Errors

### ANALYTICS_PERIOD_INVALID

**HTTP Status:** 400

**Message:** `Invalid analytics period`

**Causes:**
- Unknown period value

**Valid periods:** `day`, `week`, `month`, `year`

**Solution:**
```typescript
// Use valid period values
const { overview } = await ferni.getAnalyticsOverview('week');
```

---

### ANALYTICS_DATA_UNAVAILABLE

**HTTP Status:** 503

**Message:** `Analytics data temporarily unavailable`

**Causes:**
- Analytics system processing
- Temporary service disruption

**Solution:**
- Retry after a few minutes
- Check status page for incidents

---

## Server Errors

### INTERNAL_ERROR

**HTTP Status:** 500

**Message:** `An internal error occurred`

**Causes:**
- Unexpected server error
- Bug in the platform

**Solution:**
- Retry the request
- If persistent, contact support with request ID

---

### SERVICE_UNAVAILABLE

**HTTP Status:** 503

**Message:** `Service temporarily unavailable`

**Causes:**
- Planned maintenance
- High load
- Infrastructure issues

**Solution:**
- Check [status.ferni.ai](https://status.ferni.ai) for incidents
- Retry with exponential backoff

---

## Error Handling Best Practices

### 1. Type-Safe Error Handling

```typescript
import { FerniApiError } from '@ferni/sdk';

try {
  await ferni.createPersona(manifest);
} catch (error) {
  if (error instanceof FerniApiError) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        console.error('Fix validation issues:', error.message);
        break;
      case 'RATE_LIMIT_EXCEEDED':
        await sleep(30000);
        // Retry...
        break;
      case 'UNAUTHORIZED':
        console.error('Check API key');
        break;
      default:
        console.error(`Error ${error.code}:`, error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 2. Retry with Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof FerniApiError) {
        // Don't retry client errors (4xx except 429)
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }
      }

      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. Graceful Degradation

```typescript
async function getAnalyticsSafe() {
  try {
    return await ferni.getAnalyticsOverview('day');
  } catch (error) {
    if (error instanceof FerniApiError && error.status === 503) {
      // Return cached or default data
      return getCachedAnalytics();
    }
    throw error;
  }
}
```

### 4. Logging for Debugging

```typescript
try {
  await ferni.createPersona(manifest);
} catch (error) {
  if (error instanceof FerniApiError) {
    console.error({
      code: error.code,
      status: error.status,
      message: error.message,
      timestamp: new Date().toISOString(),
      manifest: JSON.stringify(manifest),
    });
  }
  throw error;
}
```

---

## Getting Help

If you encounter persistent errors:

1. **Check the status page:** [status.ferni.ai](https://status.ferni.ai)
2. **Search the documentation:** Look for your specific error code
3. **Contact support:** Include the error code, request ID, and timestamp
4. **Community forums:** [community.ferni.ai](https://community.ferni.ai)

---

## Related Documentation

- [API Reference](/docs/api/DEVELOPER-API-REFERENCE.md) - Full API documentation
- [Authentication](/docs/api/AUTHENTICATION.md) - API key management
- [Webhook Events](/docs/api/WEBHOOK-EVENTS.md) - Webhook reference
- [Integration Tutorial](/docs/api/INTEGRATION-TUTORIAL.md) - Getting started

---

*Last updated: January 2025*
