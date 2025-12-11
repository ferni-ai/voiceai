# 📅 Google Calendar Integration Setup Guide

> Enable smart timing so Ferni knows when you're busy

## Overview

The Google Calendar integration allows Ferni to:

- **Know when you're busy** - Don't call during meetings
- **See your schedule** - Proactively mention upcoming events
- **Create appointments** - Schedule events after booking confirmations
- **Smart outreach timing** - Reach out when you're free

## Prerequisites

- Google Cloud account
- Access to Ferni's deployment environment (Cloud Run secrets or `.env`)

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your **Project ID**

---

## Step 2: Enable the Google Calendar API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click **Enable**

---

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace organization)
3. Fill in the required fields:
   - **App name**: `Ferni`
   - **User support email**: Your email
   - **App logo**: (optional) Upload Ferni logo
   - **Developer contact email**: Your email
4. Click **Save and Continue**

### Scopes

Add these scopes:

- `https://www.googleapis.com/auth/calendar` (See, edit, share, and permanently delete all calendars)
- `https://www.googleapis.com/auth/calendar.events` (View and edit events on all calendars)

> **Note**: For production, you may want read-only scopes:
>
> - `https://www.googleapis.com/auth/calendar.readonly`
> - `https://www.googleapis.com/auth/calendar.events.readonly`

### Test Users (While in Testing Mode)

Add email addresses of users who can test the integration while your app is in "Testing" mode.

---

## Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Fill in:
   - **Name**: `Ferni Calendar Integration`
   - **Authorized JavaScript origins**:
     ```
     https://app.ferni.ai
     http://localhost:3001
     http://localhost:3003
     ```
   - **Authorized redirect URIs**:
     ```
     https://app.ferni.ai/auth/google/callback
     http://localhost:3001/auth/google/callback
     http://localhost:3003/auth/google/callback
     ```
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

---

## Step 5: Add Environment Variables

### Local Development (`.env`)

```bash
# Google Calendar OAuth
GOOGLE_CALENDAR_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=your-client-secret
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3001/auth/google/callback
```

### Production (Cloud Run)

Add these secrets via Google Cloud Console or CLI:

```bash
# Using gcloud CLI
gcloud run services update bogle-ui \
  --update-secrets=GOOGLE_CALENDAR_CLIENT_ID=google-calendar-client-id:latest \
  --update-secrets=GOOGLE_CALENDAR_CLIENT_SECRET=google-calendar-client-secret:latest \
  --region=us-central1

# Set the redirect URI
gcloud run services update bogle-ui \
  --update-env-vars=GOOGLE_CALENDAR_REDIRECT_URI=https://app.ferni.ai/auth/google/callback \
  --region=us-central1
```

Or add to Secret Manager:

```bash
echo -n "your-client-id" | gcloud secrets create google-calendar-client-id --data-file=-
echo -n "your-client-secret" | gcloud secrets create google-calendar-client-secret --data-file=-
```

---

## Step 6: Deploy

```bash
# Deploy the UI server with new environment
npm run deploy:ui
```

---

## Step 7: Test the Integration

### Check Status

```bash
curl "https://app.ferni.ai/auth/google/status?user_id=test-user"
```

Expected response:

```json
{
  "google_calendar_configured": true,
  "linked": false,
  "expires_at": null,
  "login_url": "/auth/google/login?user_id=test-user"
}
```

### Test OAuth Flow

1. Open https://app.ferni.ai
2. Click Settings → Calendar
3. Click "Connect Google Calendar"
4. Complete Google OAuth
5. Verify redirect back with `?calendar_linked=true`

### Verify Connection

```bash
curl "https://app.ferni.ai/api/calendar/status?userId=your-user-id"
```

---

## API Endpoints Reference

### Token Server (OAuth Flow)

| Endpoint                         | Method | Description                |
| -------------------------------- | ------ | -------------------------- |
| `/auth/google/login?user_id=ID`  | GET    | Start OAuth flow           |
| `/auth/google/callback`          | GET    | OAuth callback (automatic) |
| `/auth/google/token?user_id=ID`  | GET    | Get access token           |
| `/auth/google/status?user_id=ID` | GET    | Check connection status    |
| `/auth/google/unlink?user_id=ID` | GET    | Disconnect calendar        |

### API Routes (Calendar Operations)

| Endpoint                   | Method | Description                      |
| -------------------------- | ------ | -------------------------------- |
| `/api/calendar/status`     | GET    | Get calendar status + busy info  |
| `/api/calendar/sync`       | POST   | Sync calendar to outreach timing |
| `/api/calendar/disconnect` | POST   | Disconnect calendar              |

### V1 Integration Routes

| Endpoint                                   | Method | Description         |
| ------------------------------------------ | ------ | ------------------- |
| `/api/v1/integrations/calendar/status`     | GET    | Check connection    |
| `/api/v1/integrations/calendar/connect`    | GET    | Get auth URL        |
| `/api/v1/integrations/calendar/events`     | GET    | Get upcoming events |
| `/api/v1/integrations/calendar/disconnect` | DELETE | Disconnect          |

---

## How It Works

### Flow Diagram

```
User clicks "Connect Calendar"
         │
         ▼
Frontend redirects to /auth/google/login?user_id=ID
         │
         ▼
Token Server generates OAuth URL with state
         │
         ▼
User authenticates with Google
         │
         ▼
Google redirects to /auth/google/callback?code=XXX&state=YYY
         │
         ▼
Token Server exchanges code for tokens
         │
         ▼
Tokens stored in Firestore (google_calendar_tokens collection)
         │
         ▼
User redirected to app with ?calendar_linked=true
         │
         ▼
Frontend shows "Connected" status
```

### Token Storage

Tokens are stored in:

1. **In-memory cache** for fast access
2. **Firestore** (`google_calendar_tokens` collection) for persistence

### Token Refresh

When access tokens expire:

1. Service checks `expiry_date`
2. If expired, uses `refresh_token` to get new access token
3. New tokens saved to both cache and Firestore

---

## Troubleshooting

### "Google Calendar OAuth not configured"

Missing environment variables. Check:

```bash
echo $GOOGLE_CALENDAR_CLIENT_ID
echo $GOOGLE_CALENDAR_CLIENT_SECRET
```

### "redirect_uri_mismatch"

The redirect URI in your Google Cloud Console doesn't match. Add:

- `https://app.ferni.ai/auth/google/callback` for production
- `http://localhost:3001/auth/google/callback` for local

### "Token exchange failed"

1. Check client secret is correct
2. Ensure code hasn't expired (10-minute window)
3. Check server logs for detailed error

### "Access denied" or "This app isn't verified"

Your OAuth app is in "Testing" mode. Either:

1. Add the test user to "Test users" in OAuth consent screen
2. Submit app for verification (production)

---

## Security Notes

1. **Scopes**: We only request calendar scopes, not email or profile
2. **Token Storage**: Refresh tokens encrypted at rest in Firestore
3. **Privacy**: We read event times, not content (free/busy only by default)
4. **Revocation**: Users can disconnect anytime via app or Google account

---

## What Ferni Can Do With Calendar Access

### Smart Timing

- Knows when you're in meetings
- Schedules outreach during free time
- Respects focus/busy periods

### Proactive Awareness

- "I see you have a big presentation tomorrow..."
- "You're free this afternoon if you want to talk"
- "Looks like a busy week ahead"

### Appointment Integration

- Creates calendar events when appointments are confirmed
- Sets reminders before important events
- Syncs with appointment scheduling service

---

## Next Steps

After setting up:

1. **Test with your account** - Connect your calendar and verify
2. **Publish OAuth app** - When ready for users, submit for verification
3. **Monitor usage** - Check Google Cloud Console for API usage
4. **Enable for users** - Feature flag: `CALENDAR_INTEGRATION_ENABLED=true`

---

_Last updated: December 2024_
