# Identity Services

> **Managing user identity, accounts, and external integrations.**

## Overview

Identity services handle:
- User authentication (Apple Sign-In, Spotify)
- Account linking (smart home, health devices)
- Contact management
- Sponsored identity (family members)

---

## Key Components

### Authentication
| File | Purpose |
|------|---------|
| `apple-signin-oauth.ts` | Apple Sign-In flow |
| `spotify-auth.ts` | Spotify OAuth |
| `google-calendar-oauth.ts` | Google Calendar OAuth + Calendar API calls |
| `google-calendar-token-store.ts` | The ONE Google Calendar token store (encrypted, `bogle_users/{uid}/google_calendar_tokens/data`). The old root collection `google_calendar_tokens/{uid}` is no longer read or written. |
| `link-state.ts` | The ONE connection-status reader: `getLinkState(uid, provider)` → `connected` / `needs_reauth` / `not_connected` / `unconfigured` (+ `scopesOk` for Google Calendar), read from the stored doc (Google's shared store, `oura_tokens`, `wearable_{whoop,garmin}_tokens`), never a per-process memory. Behind `LINK_STATUS_V2` (off) the model's service-availability note (`agents/processors/injection-builders/service-availability.ts`, Calendar line) and the link `/status` routes (`/auth/google/status`, `/calendar/status`, `/calendar/providers/status`, `/calendar/sync-status`, `/wearables/status`, v1 `/integrations/status` and `/calendar/status`) use it per caller; off, they read IntegrationHub / the legacy checks as before. |
| `firebase-auth.ts` | Firebase authentication |
| `natural-auth.ts` | Natural/conversational auth |
| `identity-linking.ts` | Link multiple accounts |
| `identity-error-handler.ts` | Auth error handling |

### External Integrations
| File | Purpose |
|------|---------|
| `apple-health-sync.ts` | Apple Health data sync |
| `apple-health-types.ts` | Apple Health type definitions |
| `ecobee-api.ts`, `ecobee-auth.ts`, `ecobee-types.ts` | Ecobee thermostat |
| `oura-api.ts`, `oura-auth.ts`, `oura-types.ts` | Oura Ring (`oura-auth.ts` owns the sealed per-user grant: refresh, `needs_reauth`, revoke; connect is the wearables flow) |
| `spotify-room-service.ts`, `spotify-room-config-store.ts`, `spotify-room-types.ts` | Spotify Room integration |

### Contact & User Management
| File | Purpose |
|------|---------|
| `contacts.ts` | Contact CRUD |
| `contact-onboarding.ts` | New contact flow |
| `user-identification.ts` | Identify callers by voice |
| `user-migration.ts` | User data migration |
| `geo-detection.ts` | Geographic location detection |

### Family/Sponsor
| File | Purpose |
|------|---------|
| `sponsored-identity.ts` | Family member accounts |
| `sponsor-notifications.ts` | Notify sponsors |

### Security & Privacy
| File | Purpose |
|------|---------|
| `privacy-crypto.ts` | Privacy-preserving encryption |
| `security-events.ts` | Security event logging |

---

## Usage

```typescript
import { linkAccount, getLinkedAccounts } from './identity-linking.js';

await linkAccount(userId, {
  provider: 'spotify',
  accessToken,
  refreshToken,
});

const accounts = await getLinkedAccounts(userId);
```

---

## Security Notes

- OAuth tokens stored in Firestore with encryption
- Refresh tokens rotated automatically
- Health data requires explicit permission
- Voice identification is probabilistic (not secure auth)

---

*Last updated: January 2026*
