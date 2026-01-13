---
title: "Authentication Deep Dive: OAuth, API Keys, and JWTs"
excerpt: "A comprehensive guide to securing your Ferni integration - from simple API keys to enterprise SSO."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: 2026-01-13
category: "Deep Dives"
image: "auth-deep-dive.png"
readTime: 12
---

Authentication in voice AI has unique challenges. Users can't type passwords mid-conversation. Sessions may span hours. Multiple devices need seamless handoff.

This guide covers everything you need to secure your Ferni integration.

## Authentication Methods Overview

| Method | Best For | Security Level | Complexity |
|--------|----------|----------------|------------|
| API Keys | Server-to-server | Medium | Low |
| OAuth 2.0 | User-facing apps | High | Medium |
| JWT | Microservices | High | Medium |
| SAML/SSO | Enterprise | Highest | High |

## API Keys: Simple but Effective

For server-side integrations, API keys are straightforward:

```typescript
import { FerniClient } from '@ferni/sdk';

const client = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
});
```

### Security Best Practices

**Never expose API keys client-side.** Use a backend proxy:

```typescript
// ❌ Bad: API key in browser
const client = new FerniClient({ apiKey: 'sk_live_...' });

// ✅ Good: Proxy through your backend
const client = new FerniClient({
  endpoint: '/api/ferni-proxy',
  // Your backend adds the API key
});
```

**Rotate keys regularly:**

```bash
# Generate new key
ferni keys:create --name "production-v2"

# Update your environment
export FERNI_API_KEY=sk_live_new_key

# Revoke old key after deployment
ferni keys:revoke sk_live_old_key
```

**Use key scopes:**

```typescript
// Create a key with limited permissions
const key = await ferni.keys.create({
  name: 'mobile-app',
  scopes: ['conversations:read', 'conversations:write'],
  // Restrict to specific IP ranges
  allowedIps: ['203.0.113.0/24'],
  // Auto-expire
  expiresAt: new Date('2026-06-01'),
});
```

---

## OAuth 2.0: For User-Facing Apps

When users log into your app with Ferni, use OAuth 2.0.

### Authorization Code Flow

```typescript
// 1. Redirect user to Ferni auth
const authUrl = client.getAuthorizationUrl({
  clientId: process.env.FERNI_CLIENT_ID,
  redirectUri: 'https://yourapp.com/callback',
  scopes: ['profile', 'conversations', 'insights'],
  state: generateSecureState(),
});

// 2. Handle callback
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state to prevent CSRF
  if (!verifyState(state)) {
    return res.status(400).send('Invalid state');
  }

  // Exchange code for tokens
  const tokens = await client.exchangeCode({
    code,
    redirectUri: 'https://yourapp.com/callback',
  });

  // Store tokens securely
  await storeTokens(userId, tokens);

  res.redirect('/dashboard');
});
```

### Token Refresh

Access tokens expire. Handle refresh automatically:

```typescript
const client = new FerniClient({
  clientId: process.env.FERNI_CLIENT_ID,
  clientSecret: process.env.FERNI_CLIENT_SECRET,
  tokens: await getStoredTokens(userId),
  // Refresh 5 minutes before expiry
  refreshThreshold: 300,
  onTokenRefresh: async (newTokens) => {
    await storeTokens(userId, newTokens);
  },
});
```

---

## JWTs: For Microservices

When your backend services talk to Ferni, JWTs provide secure, stateless authentication.

### Generating JWTs

```typescript
import jwt from 'jsonwebtoken';

function generateFerniToken(userId: string, claims: object) {
  return jwt.sign(
    {
      sub: userId,
      iss: 'your-app',
      aud: 'ferni-api',
      ...claims,
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'RS256',
      expiresIn: '1h',
    }
  );
}

// Use with client
const client = new FerniClient({
  auth: {
    type: 'jwt',
    token: generateFerniToken(userId, { tier: 'premium' }),
  },
});
```

### JWT Best Practices

1. **Use RS256, not HS256** - Asymmetric keys allow verification without exposing secrets
2. **Keep tokens short-lived** - 1 hour max for access tokens
3. **Include minimal claims** - Only what's needed for authorization
4. **Validate on every request** - Never cache JWT validation results

---

## Multi-Tenant Authentication

For SaaS apps serving multiple organizations:

```typescript
const client = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
  // Isolate data per tenant
  tenantId: user.organizationId,
  // Tenant-specific settings
  tenantConfig: {
    // Custom persona for this tenant
    defaultPersona: tenant.ferniPersonaId,
    // Tenant's webhook endpoint
    webhookUrl: tenant.webhookUrl,
  },
});
```

### Data Isolation

Ferni automatically isolates tenant data:

```typescript
// User from Org A
const clientA = new FerniClient({ tenantId: 'org-a', ... });
await clientA.memory.store({ key: 'preference', value: 'blue' });

// User from Org B
const clientB = new FerniClient({ tenantId: 'org-b', ... });
await clientB.memory.get('preference'); // Returns null, not 'blue'
```

---

## Enterprise SSO (SAML)

For enterprise customers requiring SAML:

```typescript
// Configure SAML provider
await ferni.sso.configure({
  tenantId: 'enterprise-customer',
  provider: 'saml',
  samlConfig: {
    entryPoint: 'https://idp.customer.com/sso/saml',
    issuer: 'ferni-app',
    cert: process.env.SAML_CERT,
    // Map SAML attributes to Ferni user
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
    },
  },
});
```

---

## Voice-Specific Auth Challenges

### Challenge 1: No Keyboard Input

Users can't type passwords during voice sessions. Solutions:

```typescript
// Use voice biometrics for re-auth
const verificationResult = await client.verifyVoice({
  audio: voiceSample,
  userId: currentUser.id,
});

if (verificationResult.confidence > 0.95) {
  // Proceed with sensitive operation
}
```

### Challenge 2: Shared Devices

Multiple family members might use the same smart speaker:

```typescript
// Voice identification before sensitive actions
client.on('sensitive_action', async (action, context) => {
  const speaker = await context.identifySpeaker();

  if (speaker.confidence < 0.8) {
    return {
      response: "I want to make sure I'm talking to the right person. " +
                "Can you verify with your PIN?",
      waitForPin: true,
    };
  }

  return { proceed: true };
});
```

### Challenge 3: Long Sessions

Voice sessions can last hours. Keep auth fresh:

```typescript
const client = new FerniClient({
  // Silently refresh tokens during natural pauses
  auth: {
    type: 'oauth',
    tokens: userTokens,
    refreshStrategy: 'opportunistic',
    // Refresh when user pauses for 3+ seconds
    refreshOnPause: 3000,
  },
});
```

---

## Security Checklist

Before going to production:

- [ ] API keys stored in environment variables, not code
- [ ] HTTPS only for all endpoints
- [ ] Webhook signatures verified on every request
- [ ] Tokens refreshed before expiry
- [ ] Sensitive actions require re-authentication
- [ ] Rate limiting on auth endpoints
- [ ] Audit logging for auth events
- [ ] Key rotation procedure documented

---

## Next Steps

- [Webhook Security Guide](/developers/blog/webhook-security/)
- [Multi-Tenant Architecture](/developers/docs/multi-tenant/)
- [Voice Biometrics API](/developers/docs/voice-auth/)

Questions? Join us on [Discord](https://discord.gg/ferni).
