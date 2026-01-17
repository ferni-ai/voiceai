---
layout: layouts/docs.njk
title: OAuth API
description: Connect to external services using OAuth 2.0
order: 7
---

# OAuth API

Connect your integrations to external services using OAuth 2.0. Users authorize once, and Ferni securely stores and refreshes tokens automatically.

**Base URL:** `https://api.ferni.ai/api/v2/developers/oauth`

---

## Register OAuth Provider

Register an OAuth provider configuration.

```http
POST /oauth/providers
```

### Request Body

{% raw %}
```json
{
  "name": "google-calendar",
  "displayName": "Google Calendar",
  "description": "Access user's Google Calendar",
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth",
  "tokenUrl": "https://oauth2.googleapis.com/token",
  "clientId": "your-client-id.apps.googleusercontent.com",
  "clientSecret": "{{secrets.GOOGLE_CLIENT_SECRET}}",
  "scopes": [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
  ],
  "secrets": {
    "GOOGLE_CLIENT_SECRET": "your-client-secret"
  }
}
```
{% endraw %}

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (kebab-case) |
| `displayName` | string | Yes | Name shown to users |
| `description` | string | Yes | What this connection provides |
| `authorizationUrl` | string | Yes | OAuth authorization endpoint |
| `tokenUrl` | string | Yes | OAuth token endpoint |
| `clientId` | string | Yes | Your OAuth client ID |
| `clientSecret` | string | Yes | Your client secret (use {% raw %}`{{secrets.X}}`{% endraw %}) |
| `scopes` | string[] | Yes | Required OAuth scopes |
| `secrets` | object | No | Secret values (encrypted at rest) |
| `additionalParams` | object | No | Extra params for authorization URL |

### Response

```json
{
  "success": true,
  "data": {
    "id": "oauth_abc123xyz",
    "name": "google-calendar",
    "displayName": "Google Calendar",
    "description": "Access user's Google Calendar",
    "scopes": ["calendar.readonly", "calendar.events"],
    "status": "active",
    "connectionCount": 0,
    "createdAt": "2026-01-11T10:00:00Z"
  }
}
```

---

## List Providers

Get all registered OAuth providers.

```http
GET /oauth/providers
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "oauth_abc123xyz",
      "name": "google-calendar",
      "displayName": "Google Calendar",
      "scopes": ["calendar.readonly", "calendar.events"],
      "status": "active",
      "connectionCount": 45,
      "createdAt": "2026-01-11T10:00:00Z"
    }
  ]
}
```

---

## Get Provider

Get a specific provider.

```http
GET /oauth/providers/:id
```

---

## Update Provider

Update provider configuration.

```http
PUT /oauth/providers/:id
```

**Note:** Changing scopes requires users to re-authorize.

---

## Delete Provider

Remove a provider and all associated tokens.

```http
DELETE /oauth/providers/:id
```

**Warning:** This revokes all user connections.

---

## Start Authorization

Generate an authorization URL for a user.

```http
POST /oauth/authorize
```

### Request Body

```json
{
  "providerId": "oauth_abc123xyz",
  "userId": "usr_456",
  "redirectUri": "https://yourapp.com/oauth/callback",
  "state": "optional-custom-state"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=xxx&redirect_uri=xxx&scope=xxx&state=xxx&response_type=code",
    "state": "ferni_oauth_abc123_usr456_1704985200"
  }
}
```

Redirect the user to `authorizationUrl`. After authorization, they'll be redirected to your `redirectUri` with a `code` parameter.

---

## Handle Callback

Exchange the authorization code for tokens.

```http
POST /oauth/callback
```

### Request Body

```json
{
  "providerId": "oauth_abc123xyz",
  "code": "authorization-code-from-callback",
  "state": "ferni_oauth_abc123_usr456_1704985200",
  "redirectUri": "https://yourapp.com/oauth/callback"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "tokenId": "tok_xyz789",
    "providerId": "oauth_abc123xyz",
    "userId": "usr_456",
    "scopes": ["calendar.readonly", "calendar.events"],
    "expiresAt": "2026-01-11T11:00:00Z",
    "createdAt": "2026-01-11T10:00:00Z"
  }
}
```

Tokens are stored encrypted. Ferni automatically refreshes them before expiry.

---

## List User Tokens

Get all OAuth connections for a user.

```http
GET /oauth/tokens
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Filter by user ID |
| `providerId` | string | Filter by provider |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "tok_xyz789",
      "providerId": "oauth_abc123xyz",
      "providerName": "google-calendar",
      "userId": "usr_456",
      "scopes": ["calendar.readonly", "calendar.events"],
      "status": "active",
      "expiresAt": "2026-01-11T11:00:00Z",
      "lastUsedAt": "2026-01-11T10:30:00Z",
      "createdAt": "2026-01-11T10:00:00Z"
    }
  ]
}
```

---

## Get Token

Get a specific token (for debugging).

```http
GET /oauth/tokens/:id
```

**Note:** Actual token values are never returned. Only metadata.

---

## Revoke Token

Disconnect a user's OAuth connection.

```http
DELETE /oauth/tokens/:id
```

### Response

```json
{
  "success": true,
  "data": {
    "revoked": true,
    "tokenId": "tok_xyz789"
  }
}
```

---

## Refresh Token

Manually refresh a token (usually automatic).

```http
POST /oauth/tokens/:id/refresh
```

### Response

```json
{
  "success": true,
  "data": {
    "tokenId": "tok_xyz789",
    "refreshed": true,
    "expiresAt": "2026-01-11T12:00:00Z"
  }
}
```

---

## Check Connection Status

Verify a user has a valid connection.

```http
GET /oauth/tokens/:userId/:providerId/status
```

### Response

```json
{
  "success": true,
  "data": {
    "connected": true,
    "providerId": "oauth_abc123xyz",
    "providerName": "google-calendar",
    "scopes": ["calendar.readonly", "calendar.events"],
    "expiresAt": "2026-01-11T11:00:00Z",
    "needsReauthorization": false
  }
}
```

---

## Using Tokens in Tools

When you have a user's OAuth token, use it in MCP servers or tools:

### In MCP Server Headers

{% raw %}
```json
{
  "headers": {
    "Authorization": "Bearer {{oauth.google-calendar.access_token}}"
  }
}
```
{% endraw %}

### In Webhook Tools

{% raw %}
```json
{
  "config": {
    "url": "https://api.example.com/data",
    "headers": {
      "Authorization": "Bearer {{oauth.your-provider.access_token}}"
    }
  }
}
```
{% endraw %}

Ferni automatically:
1. Retrieves the user's token
2. Refreshes if expired
3. Injects into the request

---

## Common OAuth Providers

### Google

```json
{
  "name": "google",
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth",
  "tokenUrl": "https://oauth2.googleapis.com/token",
  "additionalParams": {
    "access_type": "offline",
    "prompt": "consent"
  }
}
```

### Microsoft

```json
{
  "name": "microsoft",
  "authorizationUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  "tokenUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/token"
}
```

### Salesforce

```json
{
  "name": "salesforce",
  "authorizationUrl": "https://login.salesforce.com/services/oauth2/authorize",
  "tokenUrl": "https://login.salesforce.com/services/oauth2/token"
}
```

### Slack

```json
{
  "name": "slack",
  "authorizationUrl": "https://slack.com/oauth/v2/authorize",
  "tokenUrl": "https://slack.com/api/oauth.v2.access"
}
```

---

## Token Status Values

| Status | Description |
|--------|-------------|
| `active` | Token is valid and usable |
| `expired` | Token expired, needs refresh |
| `revoked` | User or provider revoked access |
| `error` | Refresh failed, needs re-authorization |

---

## Security

- Client secrets are encrypted at rest (AES-256-GCM)
- Access tokens are encrypted in transit and at rest
- Refresh tokens are never exposed via API
- Automatic token rotation on refresh
- All OAuth state includes CSRF protection

---

## Error Codes

| Code | Description |
|------|-------------|
| `OAUTH_INVALID_STATE` | State parameter mismatch (CSRF protection) |
| `OAUTH_CODE_EXPIRED` | Authorization code expired |
| `OAUTH_REFRESH_FAILED` | Could not refresh token |
| `OAUTH_REVOKED` | User revoked access |
| `OAUTH_INVALID_SCOPE` | Requested scope not allowed |

---

## Best Practices

1. **Request minimal scopes** — Only ask for what you need
2. **Handle revocation** — Users can revoke anytime
3. **Check connection before use** — Verify token status
4. **Use refresh tokens** — Always request `offline_access` for Google
5. **Provide clear consent** — Explain why you need access

---

## Related

- [MCP Servers API](/developers/api/mcp-servers/) — Use OAuth tokens in MCP calls
- [Custom Tools API](/developers/api/tools/) — Use OAuth in webhook tools
