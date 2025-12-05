# Sentry Error Tracking Setup

This guide explains how to set up Sentry for error tracking in Ferni AI.

## Quick Start

### 1. Create Sentry Project

1. Go to sentry.io and sign up/login
2. Create a new project:
   - Platform: Node.js
   - Project Name: ferni-ai-backend
3. Copy the DSN from the project settings

### 2. Add Environment Variable

Add to your .env file:

```bash
SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id
NODE_ENV=production
```

### 3. Verify Integration

The Sentry integration is already configured in src/services/error-tracking.ts. It will:

- Automatically capture unhandled exceptions
- Track performance (10% sampling in production)
- Scrub sensitive data (auth headers, cookies)
- Add context for better debugging

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| SENTRY_DSN | (none) | Your Sentry project DSN |
| NODE_ENV | development | Environment name |
| SENTRY_TRACES_SAMPLE_RATE | 0.1 | Performance sampling (0-1) |

## Usage

### Manual Error Capture

```typescript
import { captureError, setUserContext, addBreadcrumb } from '../services/error-tracking.js';

// Capture an error with context
captureError(error, {
  userId: 'user-123',
  sessionId: 'session-456',
  action: 'handoff-attempt',
});

// Set user context for all errors
setUserContext({
  id: 'user-123',
  email: 'user@example.com',
});
```

## Dashboard Setup

### Recommended Alerts

1. High Error Rate - Trigger: > 10 errors in 5 minutes
2. New Error Type - Trigger: First occurrence of error
3. Slow Transactions - Trigger: P95 latency > 500ms

## Privacy and Data Scrubbing

Sentry is configured to scrub sensitive data automatically:

- Authorization headers
- Cookie values
- Bearer tokens
- API keys in URLs

## Slack Integration

1. Go to Sentry Settings Integrations Slack
2. Connect your Slack workspace
3. Configure alert routing

