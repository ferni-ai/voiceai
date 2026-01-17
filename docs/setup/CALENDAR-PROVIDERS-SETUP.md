# Calendar Providers Setup

Ferni supports multiple calendar providers, allowing users to sync their calendars from various services.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Ferni Calendar System                    │
├─────────────────────────────────────────────────────────────┤
│                  ┌────────────────────┐                     │
│                  │  Unified Calendar  │  ← Source of Truth  │
│                  │     (Firestore)    │                     │
│                  └─────────┬──────────┘                     │
│                            │                                │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐         │
│  │   Google   │    │   Apple    │    │  Outlook   │         │
│  │  Calendar  │    │  Calendar  │    │  Calendar  │         │
│  │  (OAuth)   │    │  (CalDAV)  │    │ (MS Graph) │         │
│  └────────────┘    └────────────┘    └────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Provider Comparison

| Feature | Google | Apple | Outlook |
|---------|--------|-------|---------|
| Auth Type | OAuth 2.0 | App-Specific Password | OAuth 2.0 |
| Setup Location | Console | appleid.apple.com | Azure Portal |
| Two-Way Sync | ✅ | ✅ | ✅ |
| Teams Meetings | ❌ | ❌ | ✅ |

## Google Calendar Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Google Calendar API**:
   - Go to APIs & Services → Library
   - Search for "Google Calendar API"
   - Click Enable

### 2. Configure OAuth Consent Screen

1. Go to APIs & Services → OAuth consent screen
2. Select "External" user type
3. Fill in app information:
   - App name: Ferni
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add test users during development

### 3. Create OAuth Credentials

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: Web application
4. Add authorized redirect URIs:
   - Development: `http://localhost:3002/auth/google/callback`
   - Production: `https://app.ferni.ai/auth/google/callback`

### 4. Set Environment Variables

```bash
GOOGLE_CALENDAR_CLIENT_ID=your_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
GOOGLE_CALENDAR_REDIRECT_URI=https://app.ferni.ai/auth/google/callback
```

## Apple Calendar Setup

Apple Calendar uses **CalDAV** with app-specific passwords. No app-level setup required!

### User Setup Flow

1. Users go to [appleid.apple.com](https://appleid.apple.com/account/manage)
2. Sign in with their Apple ID
3. Navigate to Sign-In and Security → App-Specific Passwords
4. Generate a new password named "Ferni Calendar"
5. Enter their Apple ID and app-specific password in Ferni

### Technical Details

- **Protocol**: CalDAV (RFC 4791)
- **Server**: `caldav.icloud.com`
- **Auth**: Basic authentication with Apple ID + app-specific password
- **Storage**: Credentials stored encrypted in Firestore

### Security Considerations

- App-specific passwords are revocable by users
- Passwords are one-way (stored encrypted)
- Users maintain full control via Apple ID settings

## Outlook Calendar Setup

### 1. Register Application in Azure Portal

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to Azure Active Directory → App registrations
3. Click "New registration"
4. Configure:
   - Name: Ferni Calendar
   - Supported account types: Accounts in any organizational directory and personal Microsoft accounts
   - Redirect URI: `https://app.ferni.ai/auth/microsoft/callback` (Web)

### 2. Configure API Permissions

1. Go to API permissions
2. Add Microsoft Graph permissions:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access` (for refresh tokens)
3. Grant admin consent if required

### 3. Create Client Secret

1. Go to Certificates & secrets
2. Click "New client secret"
3. Set expiration (recommend 24 months)
4. Copy the secret value immediately (shown only once)

### 4. Set Environment Variables

```bash
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_REDIRECT_URI=https://app.ferni.ai/auth/microsoft/callback
```

## Testing Providers

### Development Environment

```bash
# Start the UI server
pnpm run ui-server

# The calendar settings UI will show available providers
# Navigate to http://localhost:3004 → Settings → Calendar
```

### Testing Google Calendar

1. Click "Connect" on Google Calendar
2. Complete OAuth flow
3. Verify sync by checking `/api/calendar/providers/status`

### Testing Apple Calendar

1. Generate an app-specific password at appleid.apple.com
2. Click "Connect" on Apple Calendar
3. Enter credentials
4. Verify connection

### Testing Outlook Calendar

1. Ensure `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` are set
2. Click "Connect" on Outlook
3. Complete Microsoft OAuth flow
4. Verify sync

## API Endpoints

### Provider Status

```bash
# Get all providers status
GET /api/calendar/providers/status?user_id=xxx
```

Response:
```json
{
  "success": true,
  "providers": {
    "google": { "provider": "google", "connected": true, "configured": true },
    "apple": { "provider": "apple", "connected": false, "configured": true },
    "outlook": { "provider": "outlook", "connected": false, "configured": true }
  }
}
```

### Google Calendar

```bash
# Connect (redirects to OAuth)
GET /auth/google/login?user_id=xxx

# Callback (automatic)
GET /auth/google/callback

# Disconnect
POST /api/calendar/google/disconnect
{ "user_id": "xxx" }

# Sync
POST /api/calendar/google/sync
{ "user_id": "xxx" }
```

### Apple Calendar

```bash
# Connect with credentials
POST /calendar/apple/connect
{
  "user_id": "xxx",
  "apple_id": "user@icloud.com",
  "app_password": "xxxx-xxxx-xxxx-xxxx"
}

# Disconnect
POST /calendar/apple/disconnect
{ "user_id": "xxx" }

# Sync
POST /calendar/apple/sync
{ "user_id": "xxx" }
```

### Outlook Calendar

```bash
# Connect (redirects to Microsoft OAuth)
GET /auth/microsoft/login?user_id=xxx

# Callback (automatic)
GET /auth/microsoft/callback

# Disconnect
POST /calendar/outlook/disconnect
{ "user_id": "xxx" }

# Sync
POST /calendar/outlook/sync
{ "user_id": "xxx" }
```

## Firestore Structure

Calendar provider data is stored in Firestore:

```
users/{userId}/
  calendar_providers/
    google/
      provider: "google"
      connected: true
      email: "user@gmail.com"
      tokens: { access_token, refresh_token, expires_at }
      syncEnabled: true
      lastSyncedAt: Timestamp
    apple/
      provider: "apple"
      connected: true
      email: "user@icloud.com"
      credentials: { appleId, appSpecificPassword, calendars[] }
      syncEnabled: true
      lastSyncedAt: Timestamp
    outlook/
      provider: "outlook"
      connected: true
      email: "user@outlook.com"
      tokens: { accessToken, refreshToken, expiresAt }
      syncEnabled: true
      lastSyncedAt: Timestamp
```

## Troubleshooting

### Google Calendar

**"OAuth not configured" error**
- Ensure `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` are set
- Verify redirect URI matches exactly

**"Token exchange failed"**
- Check client secret hasn't expired
- Verify OAuth consent screen is configured

### Apple Calendar

**"Invalid credentials" error**
- Verify using an app-specific password, not Apple ID password
- Check the password hasn't been revoked
- Ensure using correct Apple ID email

**"Could not discover principal" error**
- Check internet connectivity
- Verify Apple ID is active

### Outlook Calendar

**"Microsoft OAuth not configured" error**
- Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`
- Verify app registration in Azure Portal

**"Token refresh failed"**
- Check client secret hasn't expired
- Verify API permissions are granted

## Security Best Practices

1. **Never log credentials** - All sensitive data is redacted in logs
2. **Use HTTPS in production** - All OAuth redirects require HTTPS
3. **Implement token rotation** - Refresh tokens are rotated on use
4. **Store encrypted** - Credentials are encrypted at rest in Firestore
5. **Rate limit API calls** - Prevent abuse of provider APIs
6. **User consent** - Always show what data will be accessed

## Environment Variables Summary

All required environment variables for calendar integrations:

```bash
# Google Calendar (OAuth)
GOOGLE_CALENDAR_CLIENT_ID=your_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
GOOGLE_CALENDAR_REDIRECT_URI=https://app.ferni.ai/auth/google/callback

# Microsoft/Outlook Calendar (OAuth via MS Graph)
MICROSOFT_CLIENT_ID=your_azure_app_client_id
MICROSOFT_CLIENT_SECRET=your_azure_client_secret
MICROSOFT_REDIRECT_URI=https://app.ferni.ai/auth/microsoft/callback

# Encryption (for storing credentials securely)
CALENDAR_ENCRYPTION_KEY=64_char_hex_string_for_aes256

# Webhooks (for real-time sync)
PUBLIC_URL=https://app.ferni.ai

# Optional: Google Cloud Project (for Firestore)
GOOGLE_CLOUD_PROJECT=your-project-id
```

### Generating an Encryption Key

```bash
# Generate a secure 32-byte (64 hex char) key:
openssl rand -hex 32
```

## Real-Time Sync Architecture

The calendar system supports real-time synchronization:

### Google Calendar Webhooks
- Push notifications via Google Calendar API watch channels
- Channels expire after 7 days and auto-renew
- Webhook endpoint: `POST /webhooks/calendar/google`

### Microsoft Graph Subscriptions  
- Push notifications via Graph API subscriptions
- Subscriptions expire and auto-renew hourly
- Webhook endpoint: `POST /webhooks/calendar/outlook`

### Apple Calendar Polling
- CalDAV doesn't support push notifications
- Periodic polling: 5 min (active) / 30 min (inactive)
- Polling service starts automatically with UI server

## Conflict Resolution

When events differ between Ferni and provider:

1. **Auto-resolve strategies:**
   - `ferni-wins`: Ferni's version takes precedence
   - `provider-wins`: External calendar wins
   - `newest-wins`: Most recently updated wins
   - `manual`: User decides each conflict

2. **Conflict UI:**
   - Settings → Calendar → "View Sync Conflicts"
   - Side-by-side comparison
   - Per-provider preference setting

## Selective Calendar Sync

Users can choose which calendars to sync:

1. Click the ⚙️ (settings) icon next to a connected provider
2. Select which calendars to include in sync
3. Changes apply on next sync

## Implemented Features ✅

- [x] CalDAV support for Apple Calendar
- [x] Microsoft Graph for Outlook
- [x] Conflict resolution UI
- [x] Selective calendar sync
- [x] Real-time sync via webhooks/push
- [x] Rate limiting
- [x] Credential encryption

## Future Improvements

- [ ] CalDAV support for generic servers (FastMail, etc.)
- [ ] Microsoft Exchange on-premises support
- [ ] Sync frequency customization
- [ ] Calendar color sync

