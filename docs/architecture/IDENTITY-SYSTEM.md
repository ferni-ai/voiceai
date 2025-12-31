# Ferni Identity System - Complete Architecture

> **"Better than Human" - We never forget a face, a name, or a conversation.**

This document defines the complete end-to-end identity system for Ferni.

---

## 🎯 Design Principles

1. **Every interaction creates identity** - First visit creates a profile
2. **Name comes from anywhere** - Voice, chat, onboarding, auth, API
3. **Cross-device by default** - Firebase UID is the source of truth
4. **Voice is a signal** - VoiceSketch helps recognition across devices
5. **Graceful degradation** - System works even with partial identity

---

## 🔄 Identity Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER TOUCHPOINTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  🌐 FIRST WEB VISIT                                                          │
│  ├─ Generate deviceId (UUID) → localStorage                                  │
│  ├─ Firebase anonymous auth → firebaseUid                                    │
│  └─ POST /api/user/profile → Create Firestore profile                        │
│                                                                              │
│  📝 ONBOARDING (Web)                                                         │
│  ├─ User enters name → localStorage                                          │
│  ├─ POST /api/user/onboarding → Update profile.name                          │
│  └─ POST /api/user/profile → Sync onboarding state                           │
│                                                                              │
│  🔐 FIREBASE AUTH (Google/Email)                                             │
│  ├─ Firebase auth flow → firebaseUid                                         │
│  ├─ POST /api/user/migrate → Merge device profile → Firebase profile         │
│  └─ Update appState.firebaseUid                                              │
│                                                                              │
│  🎤 VOICE SESSION                                                            │
│  ├─ TokenRequest { deviceId, firebaseUid, username }                         │
│  ├─ Backend: identifyFromMetadata() → userId                                 │
│  ├─ createSessionServices({ userId, userName })                              │
│  ├─ Voice: "My name is Seth" → extractSmallDetails() → profile.name          │
│  ├─ Agent asks name → rememberName tool → profile.name + saveProfile()       │
│  └─ Session end → voiceSketch update, profile save                           │
│                                                                              │
│  📱 CROSS-DEVICE (Same Firebase Account)                                     │
│  ├─ Firebase auth → same firebaseUid                                         │
│  └─ Profile loads from Firestore → same name, history, onboarding            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Data Model

### UserProfile (Firestore: `bogle_users/{userId}`)

```typescript
interface UserProfile {
  // Identity
  id: string;                      // Firebase UID or device:${deviceId}
  name?: string;                   // User's name (from any source)
  preferredName?: string;          // What Ferni calls them
  linkedIdentifiers?: string[];    // ["device:xxx", "phone:+1xxx"]
  
  // Voice Recognition
  voiceSketch?: VoiceSketch;       // Compact voice characteristics
  
  // Onboarding State (cross-device sync)
  onboarding?: {
    completedSteps: ('welcome' | 'name' | 'preferences' | 'first_conversation')[];
    userName?: string;
    startedAt?: string;
    completedAt?: string;
    hasHadFirstConversation?: boolean;
  };
  
  // Timestamps
  firstContact: Date;
  lastContact: Date;
  totalConversations: number;
  
  // ... other profile fields
}
```

### VoiceSketch (Compact Voice Fingerprint)

```typescript
interface VoiceSketch {
  // Pitch (Hz)
  pitchMean: number;
  pitchMin: number;
  pitchMax: number;
  pitchStdDev: number;
  
  // Timing
  speakingRateMean: number;
  pauseFrequency: number;
  avgPauseDuration: number;
  
  // Spectral
  spectralCentroidMean: number;
  spectralCentroidStdDev: number;
  spectralRolloffMean: number;
  
  // Energy
  energyMean: number;
  energyStdDev: number;
  
  // Metadata
  samplesAnalyzed: number;
  totalDurationMs: number;
  confidence: number;  // 0-1
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 📍 Name Capture Points

| Source | Trigger | Handler | Persisted? |
|--------|---------|---------|------------|
| **Greeting (Better Than Human!)** | Ferni asks: "What's your name?" | User responds → `extractSmallDetails()` | ✅ Yes |
| Onboarding form | User types name | `POST /api/user/profile` | ✅ Yes |
| Voice: "My name is X" | `extractSmallDetails()` | `persistExtractedDetails()` | ✅ Yes |
| Agent asks name | `rememberName` tool | `saveProfile()` | ✅ Yes |
| Firebase auth | Google sign-in | `migrateUserData()` | ✅ Yes |
| API update | `POST /api/user/profile` | Route handler | ✅ Yes |

---

## 🚀 Better Than Human: Proactive Name Asking

**A real human friend ALWAYS asks your name when meeting you.**

Unlike most AI assistants that wait for users to volunteer their name, Ferni proactively asks in greetings:

### New User Greetings (~50% ask for name)

```
"Hey. I'm Ferni. What's your name?"
"Hey there. I'm Ferni. What should I call you?"
"Hey. I'm Ferni. And you are...?"
```

### Returning User (No Name Known)

```
"Oh, hey. You're back. I don't think I got your name last time—what should I call you?"
"Hey. Good to see you again. What's your name?"
"Hey. I realized I never asked—what should I call you?"
```

### Why This Matters

| Typical AI | Ferni (Better Than Human) |
|------------|---------------------------|
| Waits for user to say "My name is..." | Asks proactively like a real friend |
| May never learn user's name | Always tries to learn name |
| Cold, transactional | Warm, relationship-building |

### Implementation

See `src/personas/greetings.ts`:
- `newUser` templates include name-asking variants
- `returningNoName` templates include gentle name prompts
- All greeting styles (`warm-friend`, `professional`, `enthusiastic`, etc.) have these variants

---

## 🔐 Identity Priority Order

```typescript
// src/services/identity/user-identification.ts
// Priority Order:
// 1. Explicit user ID (from authenticated context)
// 2. Firebase UID (primary for web users)
// 3. Phone number (from SIP/telephony)
// 4. Auth token (legacy)
// 5. Device ID (fallback, for migration)
// 6. Anonymous session (truly unknown users)
```

---

## 📁 Key Files

### Frontend
| File | Purpose |
|------|---------|
| `apps/web/src/state/app.state.ts` | Device ID, Firebase UID state |
| `apps/web/src/services/connection.service.ts` | TokenRequest construction |
| `apps/web/src/services/auth-init.service.ts` | Firebase auth initialization |
| `apps/web/src/app.ts` | `ensureProfileExists()` call |

### Backend - Identity
| File | Purpose |
|------|---------|
| `src/services/identity/user-identification.ts` | `identifyFromMetadata()` |
| `src/services/identity/natural-auth.ts` | `authenticateNaturally()`, `enrollVoice()` |
| `src/services/user-migration.ts` | `migrateUserData()` |
| `src/api/user-routes.ts` | Profile/onboarding API endpoints |

### Backend - Session
| File | Purpose |
|------|---------|
| `src/services/session-manager.ts` | `createSessionServices()`, profile loading, userName integration |
| `src/services/session-manager/end-session.ts` | Profile save on session end, voice sketch update |

### Backend - Name Capture
| File | Purpose |
|------|---------|
| `src/tools/domains/conversation/conversation-tools.ts` | `rememberName` tool |
| `src/intelligence/conversation-quality.ts` | `extractSmallDetails()` |
| `src/services/realtime-persistence.ts` | `persistExtractedDetails()` |

### Backend - Voice
| File | Purpose |
|------|---------|
| `src/services/trust-and-identity/identity-orchestrator.ts` | Voice sample collection |
| `src/services/voice/voice-enrollment.ts` | Voice profile creation |
| `src/services/voice/voice-profile-store.ts` | Voice profile persistence |

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] `extractSmallDetails()` extracts names correctly
- [ ] `persistExtractedDetails()` updates `profile.name`
- [ ] `rememberName` tool calls `saveProfile()`
- [ ] `createSessionServices()` passes `userName`
- [ ] `identifyFromMetadata()` priority order works
- [ ] `migrateUserData()` merges profiles correctly

### Integration Tests
- [ ] Onboarding form → Firestore profile.name
- [ ] Voice "My name is X" → Firestore profile.name
- [ ] TokenRequest → agent receives userName
- [ ] Cross-device: same Firebase UID → same profile

### E2E Tests
- [ ] New user: first visit → profile created
- [ ] Name in onboarding → remembered in voice session
- [ ] Firebase auth → device data migrated
- [ ] Multiple devices → same profile

---

## 🔧 Debug Commands

```bash
# Check profile in Firestore
firebase firestore:get bogle_users/{userId}

# Check logs for identity
pnpm ops:logs | grep "identifyFromMetadata\|profile\|name"

# Test profile API
curl -H "Authorization: Bearer $TOKEN" https://app.ferni.ai/api/user/profile

# Test onboarding API
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"step":"name","userName":"Seth"}' \
  https://app.ferni.ai/api/user/onboarding
```

---

## 📊 Metrics to Track

| Metric | Description |
|--------|-------------|
| `identity.profile_created` | New profiles created |
| `identity.name_captured` | Names captured (by source) |
| `identity.migration_success` | Device → Firebase migrations |
| `identity.voice_enrolled` | Voice profiles created |
| `identity.cross_device_match` | Same user on multiple devices |

---

*Last updated: December 2024*
