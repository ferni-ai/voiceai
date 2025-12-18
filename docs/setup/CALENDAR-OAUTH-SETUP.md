# Calendar Integration Setup Guide

This guide walks through setting up Google Calendar OAuth for the Ferni calendar integration.

## Overview

Ferni's calendar integration enables:

- **Smart scheduling**: Book appointments and reminders through voice
- **Context-aware coaching**: Ferni knows when you have busy days ahead
- **Proactive outreach timing**: Outreach respects your calendar
- **Meeting prep**: Brief summaries before important meetings

## Prerequisites

1. Google Cloud Console access
2. Firebase project (already configured for Ferni)
3. Domain verification for `app.ferni.ai`

## Step 1: Enable Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select the Ferni project (`ferni-prod` or your project)
3. Navigate to **APIs & Services > Library**
4. Search for "Google Calendar API"
5. Click **Enable**

## Step 2: Create OAuth Credentials

1. In Cloud Console, go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name**: `Ferni Calendar Integration`
   - **Authorized JavaScript origins**:
     - `https://app.ferni.ai`
     - `http://localhost:3001` (for development)
     - `http://localhost:3003` (token server)
   - **Authorized redirect URIs**:
     - `https://app.ferni.ai/auth/google/callback`
     - `http://localhost:3001/auth/google/callback`
     - `http://localhost:3003/auth/google/callback`
5. Click **Create**
6. Save the **Client ID** and **Client Secret**

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** (or Internal if G Suite)
3. Fill in:
   - **App name**: Ferni
   - **User support email**: support@ferni.ai
   - **App logo**: Upload Ferni logo
   - **App domain**: ferni.ai
   - **Developer contact**: team@ferni.ai
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add test users (for development)
6. Submit for verification (for production)

## Step 4: Set Environment Variables

Add to your `.env` file and deployment secrets:

```bash
# Google Calendar OAuth
GOOGLE_CALENDAR_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=your-client-secret
GOOGLE_CALENDAR_REDIRECT_URI=https://app.ferni.ai/auth/google/callback
```

For Cloud Run deployment, add these to Secret Manager:

```bash
gcloud secrets create GOOGLE_CALENDAR_CLIENT_ID --data-file=-
gcloud secrets create GOOGLE_CALENDAR_CLIENT_SECRET --data-file=-
```

## Step 5: Verify Backend Integration

The calendar integration is already implemented in:

- `src/services/google-calendar-oauth.ts` - OAuth flow handling
- `src/api/calendar-routes.ts` - API endpoints
- `src/tools/domains/calendar/**` - Calendar tools for agents

Test the OAuth flow:

```bash
# Start local server
npm run dev

# Visit OAuth initiation (note: uses snake_case user_id)
open http://localhost:3001/auth/google/login?user_id=test-user
```

## Step 6: Wire Frontend UI

The calendar settings UI needs to be connected. Update the settings menu to include:

```typescript
// In apps/web/src/ui/settings-menu.ui.ts
{
  id: 'calendar',
  label: 'Calendar',
  icon: ICONS.calendar,
  action: 'calendar-settings',
}
```

Add calendar connection status UI component that:

1. Shows connection status (connected/disconnected)
2. Provides "Connect Calendar" button that opens OAuth flow
3. Shows which calendar is connected
4. Allows disconnection

## API Endpoints

### OAuth Flow (handled by ui-server.js)

| Endpoint                         | Method | Description                |
| -------------------------------- | ------ | -------------------------- |
| `/auth/google/login?user_id=ID`  | GET    | Start OAuth flow           |
| `/auth/google/callback`          | GET    | OAuth callback (automatic) |
| `/auth/google/status?user_id=ID` | GET    | Check connection status    |
| `/auth/google/token?user_id=ID`  | GET    | Get access token           |
| `/auth/google/unlink?user_id=ID` | GET    | Disconnect calendar        |

### Calendar Operations

| Endpoint                   | Method | Description                      |
| -------------------------- | ------ | -------------------------------- |
| `/api/calendar/status`     | GET    | Get calendar status + busy info  |
| `/api/calendar/sync`       | POST   | Sync calendar to outreach timing |
| `/api/calendar/disconnect` | POST   | Disconnect calendar              |

## Security Considerations

1. **Token storage**: OAuth tokens are stored encrypted in Firestore
2. **Scope minimization**: Only request necessary scopes
3. **Token refresh**: Tokens are automatically refreshed before expiration
4. **Revocation**: Users can disconnect at any time

## Testing

Run the E2E tests:

```bash
npx playwright test e2e/calendar.spec.ts
```

## Troubleshooting

### "Access blocked" error

- Ensure OAuth consent screen is published or user is added as test user

### "Redirect URI mismatch"

- Verify redirect URI in Cloud Console matches exactly

### "Invalid grant"

- Auth code may have expired - restart OAuth flow

### Calendar not syncing

- Check token validity in Firebase
- Verify Calendar API is enabled
- Check user has granted calendar access

## Production Checklist

- [ ] OAuth consent screen verified by Google
- [ ] Production credentials created (not test)
- [ ] Environment variables set in Cloud Run
- [ ] Redirect URIs include production domain
- [ ] Frontend UI wired for calendar settings
- [ ] E2E tests passing
- [ ] Monitoring set up for OAuth failures

## Related Files

- `ui-server.js` - OAuth flow handler (lines 1662-1848)
- `src/services/google-calendar-oauth.ts` - Token storage and calendar operations
- `src/api/calendar-routes.ts` - Calendar status/sync/disconnect API
- `src/tools/domains/calendar/` - Calendar tools for agents
- `e2e/calendar.spec.ts` - E2E tests
- `apps/web/src/ui/calendar-settings.ui.ts` - Settings UI
- `docs/guides/GOOGLE-CALENDAR-SETUP.md` - Detailed setup guide
