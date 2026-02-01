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
| `google-calendar-oauth.ts` | Google Calendar OAuth |
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
| `eight-sleep-api.ts`, `eight-sleep-auth.ts`, `eight-sleep-types.ts` | Eight Sleep mattress |
| `oura-api.ts`, `oura-auth.ts`, `oura-types.ts` | Oura Ring |
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
