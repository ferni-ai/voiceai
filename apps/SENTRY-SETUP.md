# Sentry Error Tracking Setup

This guide explains how to configure Sentry for Voice AI desktop and mobile apps.

## Prerequisites

1. Create a free Sentry account at https://sentry.io
2. Create two projects:
   - `voiceai-desktop` (Electron)
   - `voiceai-ios` (Apple iOS / Capacitor)

## Getting Your DSN

1. Go to your Sentry project
2. Navigate to **Settings → Client Keys (DSN)**
3. Copy the DSN (looks like `https://xxx@xxx.ingest.sentry.io/xxx`)

## Configuration

### Electron (Desktop)

Set the environment variable before running:

```bash
# Development
export SENTRY_DSN="https://your-dsn@sentry.io/project-id"
npm start

# Production build
SENTRY_DSN="https://your-dsn@sentry.io/project-id" npm run build
```

Or add to your `.env` file:
```
SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

### iOS (Capacitor)

Add to your Vite environment:

```bash
# .env.production
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

Then initialize in your app entry:

```typescript
import { initSentry } from './sentry';

// Call early in app initialization
initSentry();
```

## What Gets Tracked

### Automatic
- JavaScript errors and exceptions
- Unhandled promise rejections
- Performance metrics (page loads, API calls)
- User sessions

### Manual (Optional)
```typescript
// Report custom errors
Sentry.captureException(new Error('Something went wrong'));

// Add context breadcrumbs
Sentry.addBreadcrumb({
  message: 'User clicked connect',
  category: 'ui',
});

// Set user context
Sentry.setUser({ id: 'user-123', email: 'user@example.com' });
```

## Privacy Considerations

- Sentry does NOT capture personal data by default
- IP addresses can be disabled in Sentry settings
- Enable "Data Scrubbing" in Sentry to remove sensitive data
- Consider adding a privacy policy disclosure about error tracking

## Viewing Errors

1. Go to https://sentry.io
2. Select your project
3. View **Issues** for error reports
4. View **Performance** for metrics

## Troubleshooting

### Errors not appearing
- Check that DSN is correctly set
- Verify `enabled: true` in production
- Check browser console for Sentry init messages

### Too many events
- Adjust `tracesSampleRate` (0.0 to 1.0)
- Add `ignoreErrors` for known/expected errors
- Use `beforeSend` hook to filter events

