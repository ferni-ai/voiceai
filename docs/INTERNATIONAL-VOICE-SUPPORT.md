# 🌍 International Voice Support Strategy

> Making Ferni accessible to English speakers worldwide, and eventually multilingual users.

---

## ✅ Implementation Status (Phase 1 Complete!)

| Feature                         | Status  | Location                                                |
| ------------------------------- | ------- | ------------------------------------------------------- |
| Accent Configuration            | ✅ Done | `src/config/voice-accents.ts`                           |
| Locale Auto-Detection           | ✅ Done | `detectAccentFromLocale()`, `detectAccentFromLocales()` |
| **Cartesia Voice Localization** | ✅ Done | `src/services/cartesia-voice-localization.ts`           |
| PersonaAwareTTS Accent Support  | ✅ Done | `src/speech/voice-manager/persona-aware-tts.ts`         |
| Voice Agent Integration         | ✅ Done | `src/agents/voice-agent.ts`                             |
| UserData Preference Storage     | ✅ Done | `src/agents/shared/types.ts`                            |
| Geo Detection Service           | ✅ Done | `src/services/geo-detection.ts`                         |
| IP Geolocation Lookup           | ✅ Done | Enabled in `/token` and `/demo-token` endpoints         |
| User Profile Persistence        | ✅ Done | `src/types/user-profile.ts` + `/api/user/accent`        |
| Test Coverage                   | ✅ Done | **145 tests** across 5 test files                       |

### 🔧 Key Implementation Details

**Cartesia Voice Localization API:**

- We use Cartesia's `/voices/localize` API with `dialect` param (`uk`, `au`, `in`)
- This creates accent-specific voice IDs from our base persona voices
- Voice IDs are cached in memory to avoid repeated API calls

**Accent Detection Priority:**

1. Frontend override (`?accent=british`)
2. Accept-Language header (`en-GB` → british)
3. Cloud geo headers (Google, Cloudflare, AWS, Vercel)
4. IP geolocation (ip-api.com, 2s timeout)
5. Default: american

### How to Use

**Option 1: Explicit user preference (from frontend metadata):**

```json
{
  "preferredAccent": "british"
}
```

**Option 2: Auto-detect from locale:**

```json
{
  "locale": "en-GB"
}
```

**Option 3: Auto-detect from browser locales array:**

```json
{
  "locales": ["en-AU", "en-US", "en"]
}
```

### 🌐 Automatic Server-Side Detection (NEW)

The new `geo-detection.ts` service can automatically detect accent from HTTP headers:

**Detection Sources (in priority order):**

1. **`Accept-Language` header** - Browser language preferences (most accurate)
2. **Cloud Provider Headers** - Google Cloud, Cloudflare, AWS CloudFront, Vercel
3. **IP Geolocation API** - Free ip-api.com lookup (optional)

**Supported Headers:**

| Provider     | Header                      | Example Value    |
| ------------ | --------------------------- | ---------------- |
| Browser      | `Accept-Language`           | `en-GB,en;q=0.9` |
| Google Cloud | `X-Appengine-Country`       | `AU`             |
| Cloudflare   | `CF-IPCountry`              | `IN`             |
| AWS          | `CloudFront-Viewer-Country` | `GB`             |
| Vercel       | `X-Vercel-IP-Country`       | `NZ`             |

**Usage in Token Endpoint:**

```typescript
import { buildMetadataWithGeo } from './dist/services/geo-detection.js';

// In /token handler:
const metadata = await buildMetadataWithGeo(req, {
  user_name: username,
  persona_id: selectedPersona,
});

// metadata now includes:
// - locale: "en-GB"
// - locales: ["en-GB", "en"]
// - detectedAccent: "british"
// - countryCode: "GB"
// - geoSource: "accept-language"
// - geoConfidence: "high"
```

**Enable IP Lookup (for maximum accuracy):**

```typescript
const metadata = await buildMetadataWithGeo(req, baseMetadata, {
  enableIpLookup: true,
  ipLookupTimeout: 2000,
});
```

---

## 📊 Current State

### Cartesia Sonic-3 Capabilities

**42 Languages Supported:**
English, French, German, Spanish, Portuguese, Chinese, Japanese, Hindi, Italian, Korean, Dutch, Polish, Russian, Swedish, Turkish, Tagalog, Bulgarian, Romanian, Arabic, Czech, Greek, Finnish, Croatian, Malay, Slovak, Danish, Tamil, Ukrainian, Hungarian, Norwegian, Vietnamese, Bengali, Thai, Hebrew, Georgian, Indonesian, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi

**Regional English Accents Available:**
| Accent | Cartesia Voice Examples |
|--------|------------------------|
| American | Katie, Kiefer, Tessa, Kyle (default) |
| British | British Reading Lady, The Oracle, Benedict, Claire |
| Australian | Australian Customer Support Man, Australian Narrator Lady |
| Indian | Indian Lady, Indian Man, Hinglish Speaking Woman |

**Localization Feature:**
Cartesia can adapt ANY voice to different languages/accents dynamically.

---

## 🎯 Strategy: Three Phases

### Phase 1: English Accent Diversity (Quick Win)

**Goal:** Let users choose their preferred English accent for Ferni.

**Implementation:**

```typescript
// New: Accent configuration per user
interface UserVoicePreference {
  locale: 'en-US' | 'en-GB' | 'en-AU' | 'en-IN' | 'en-ZA';
  preferredAccent: 'american' | 'british' | 'australian' | 'indian' | 'neutral';
}

// Accent-specific voice mappings
const ACCENT_VOICES: Record<string, Record<string, string>> = {
  ferni: {
    american: 'current-ferni-voice-id', // Default
    british: 'british-warm-female',
    australian: 'australian-friendly-female',
    indian: 'indian-warm-female',
  },
  // ... other personas
};
```

**User Experience:**

- Settings → Voice Preferences → "Ferni speaks with..."
- Options: American, British, Australian, Indian, Auto (detect from device locale)

**Effort:** Medium (voice selection + UI)

---

### Phase 2: Multilingual Support (High Impact)

**Goal:** Ferni can speak in the user's native language.

**Languages to Prioritize (by market size):**

1. Spanish (500M speakers)
2. Hindi (600M speakers)
3. Portuguese (250M speakers)
4. French (275M speakers)
5. German (100M speakers)
6. Japanese (125M speakers)
7. Chinese (Mandarin, 1B speakers)

**Implementation Options:**

#### Option A: Language-Specific Voices

```typescript
const LANGUAGE_VOICES: Record<string, Record<string, string>> = {
  ferni: {
    en: 'ferni-english',
    es: 'spanish-warm-female',
    hi: 'hindi-warm-female',
    pt: 'portuguese-warm-female',
    // ...
  },
};
```

#### Option B: Cartesia Localization (Recommended)

Use Cartesia's localization feature to adapt Ferni's voice to other languages while maintaining character:

```typescript
// Use same voice ID but specify target language
const tts = new cartesia.TTS({
  model: 'sonic-3',
  voice: 'ferni-voice-id',
  language: 'es', // Spanish output
});
```

**Content Translation:**

- System prompts need translation
- Persona personality should be culturally adapted
- Idioms and expressions need localization

**Effort:** High (content translation + testing)

---

### Phase 3: Code-Switching & Multilingual Conversations

**Goal:** Ferni can switch languages mid-conversation naturally.

**Use Cases:**

- User speaks Spanglish → Ferni responds naturally
- User switches to native language when emotional
- Technical terms in English, feelings in native language

**Implementation:**

```typescript
// Detect language switches in user speech
interface LanguageDetection {
  primary: string; // 'en'
  secondary?: string; // 'es' (if code-switching)
  confidence: number;
}

// Respond in appropriate language
function selectResponseLanguage(detection: LanguageDetection, userPreference: string): string {
  // If user code-switched, mirror their language
  if (detection.secondary && detection.confidence > 0.7) {
    return detection.secondary;
  }
  return userPreference;
}
```

**Effort:** Very High (requires language detection + multi-model output)

---

## 🛠️ Quick Implementation: Accent Selection

Here's what we can implement immediately:

### 1. Add Accent Configuration

```typescript
// src/config/voice-accents.ts

export type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';

export const ACCENT_VOICE_MAP: Record<string, Record<EnglishAccent, string>> = {
  ferni: {
    american: 'a0e99841-438c-4a64-b679-ae501e7d6091', // Current voice
    british: 'british-reading-lady-id', // Replace with actual ID
    australian: 'australian-narrator-id', // Replace with actual ID
    indian: 'indian-lady-id', // Replace with actual ID
  },
  // Add other personas...
};

export function getVoiceForAccent(personaId: string, accent: EnglishAccent): string {
  return (
    ACCENT_VOICE_MAP[personaId]?.[accent] ??
    ACCENT_VOICE_MAP[personaId]?.american ??
    getDefaultVoiceId(personaId)
  );
}
```

### 2. User Preference Storage

```typescript
// Add to user profile
interface UserProfile {
  // ... existing fields
  voicePreferences: {
    preferredAccent: EnglishAccent;
    preferredLanguage: string; // For future
  };
}
```

### 3. Voice Selection at Session Start

```typescript
// In voice-agent.ts, when creating TTS
const userAccent = userData.voicePreferences?.preferredAccent ?? 'american';
const voiceId = getVoiceForAccent(sessionPersona.id, userAccent);

const tts = new cartesia.TTS({
  model: 'sonic-3',
  voice: voiceId,
});
```

---

## 🔬 Research: Accent-Aware Speech Recognition

For better understanding of international users, we should also consider:

### Input Side (Speech Recognition)

**Current:** Using default ASR model (assumes American English)

**Improvement Options:**

1. **Speechmatics Global English** - Trained on 40+ country accents
2. **Whisper Large** - Better multilingual/accent handling
3. **Accent detection** - Identify user's accent and adapt

### Pronunciation Adaptation

Different accents pronounce words differently:

- "Schedule" - American: /ˈskedʒuːl/, British: /ˈʃedjuːl/
- "Privacy" - American: /ˈpraɪvəsi/, British: /ˈprɪvəsi/
- "Data" - American: /ˈdeɪtə/, British: /ˈdɑːtə/

```typescript
// Accent-aware pronunciation dictionary
const ACCENT_PRONUNCIATIONS: Record<EnglishAccent, Record<string, string>> = {
  british: {
    schedule: '<phoneme alphabet="ipa" ph="ʃedjuːl">schedule</phoneme>',
    privacy: '<phoneme alphabet="ipa" ph="prɪvəsi">privacy</phoneme>',
  },
  // ...
};
```

---

## 📈 Metrics to Track

| Metric                   | Description                                   |
| ------------------------ | --------------------------------------------- |
| Accent Selection Rate    | % of users who customize accent               |
| Retention by Locale      | Do users from different regions stick around? |
| ASR Error Rate by Accent | Are we understanding all users equally?       |
| NPS by Region            | Satisfaction across different markets         |

---

## 🚀 Recommended Next Steps

1. **Immediate (This Week):**
   - Audit Cartesia voice library for accent options
   - Document voice IDs for British, Australian, Indian accents

2. **Short Term (This Month):**
   - Implement accent selection in settings
   - Add locale detection from device
   - Test with users from different regions

3. **Medium Term (This Quarter):**
   - Add Spanish language support
   - Translate system prompts
   - Test with Spanish-speaking users

4. **Long Term (This Year):**
   - Full multilingual support (top 5 languages)
   - Code-switching detection
   - Regional cultural adaptation

---

## 📚 Resources

- [Cartesia Voice Library](https://cartesia.ai/voices)
- [Cartesia Localization Docs](https://docs.cartesia.ai/build-with-cartesia/localization)
- [Speechmatics Global English](https://www.speechmatics.com/language-packs/global-english)
- [Accent Classification Research](https://arxiv.org/abs/2305.04816)

---

_Last updated: December 2024_
