# HomeKit & Vibe Capabilities Audit

> **Audit Date:** December 29, 2024  
> **Author:** Engineering Team  
> **Status:** Living Document

---

## Executive Summary

Ferni has **comprehensive vibe/home automation capabilities** across iOS native (HomeKit) and backend services (Home Assistant, Hue, LIFX, Ecobee). This audit identifies integration points, gaps, and creates a testing strategy.

### Overall Assessment: 🟡 Partial Coverage

| Component | Status | Notes |
|-----------|--------|-------|
| iOS HomeKit | ✅ Complete | Native integration with ambient scenes |
| Backend Smart Home | ✅ Complete | Home Assistant, Hue, LIFX with circuit breakers |
| Vibe Service | ✅ Complete | 15 presets coordinating music + lights + temp |
| Ecobee Thermostat | ✅ Complete | Full API with OAuth |
| Voice Commands | ✅ Complete | Semantic routing for vibe commands |
| E2E Testing | ⚠️ Gap | No synthetic integration tests |
| HomeKit ↔ Backend Bridge | ⚠️ Gap | No bidirectional sync |

---

## 1. Current Capabilities

### 1.1 iOS Native HomeKit (`apps/ios-native/Sources/Services/HomeKitService.swift`)

**Ambient Scenes:**
| Scene | Brightness | Color Temp | Use Case |
|-------|------------|------------|----------|
| `calming` | 40% | 2700K | Stress relief |
| `energizing` | 100% | 5000K | Morning energy |
| `focusing` | 70% | 4000K | Deep work |
| `sleepy` | 10% | 2200K | Bedtime |
| `cozy` | 50% | 2700K | Relaxation |
| `neutral` | 80% | 4000K | Default |

**Voice Agent Integration:**
```swift
// Mood-to-scene mapping
func onMoodDetected(_ moodString: String) async {
    switch moodString.lowercased() {
    case "stressed", "anxious", "overwhelmed": scene = .calming
    case "tired", "sleepy", "exhausted": scene = .sleepy
    case "motivated", "excited", "energetic": scene = .energizing
    case "focused", "working", "studying": scene = .focusing
    case "relaxed", "content", "peaceful": scene = .cozy
    default: scene = .neutral
    }
}
```

**Capabilities:**
- ✅ Request HomeKit access
- ✅ Set ambient scenes based on mood
- ✅ Control individual light brightness/temperature
- ✅ Get home context (room count, light count)
- ✅ Multi-room support

### 1.2 Backend Smart Home (`src/tools/domains/smart-home/smart-home.ts`)

**Supported Platforms:**
| Platform | Status | Auth Method |
|----------|--------|-------------|
| Home Assistant | ✅ Full | Bearer token |
| Philips Hue | ✅ Full | Bridge API |
| LIFX | ✅ Full | API token |
| SmartThings | 🔲 Planned | OAuth |
| Nest | 🔲 Planned | OAuth |

**Self-Healing Features:**
- Circuit breakers per platform
- Automatic retry with exponential backoff
- Graceful degradation when offline

**Device Types:**
- Lights (on/off, brightness, color temp)
- Switches/plugs
- Thermostats
- Locks
- Covers (blinds, garage doors)
- Media players
- Sensors

**Built-in Scenes:**
```typescript
{
  'good morning': { lights: bedroom@50%, kitchen@100% },
  'good night': { lights: all@off, thermostat: 68° },
  'movie': { living@15%, tv@on }
}
```

### 1.3 Vibe Service (`src/services/vibe/vibe-service.ts`)

**Philosophy:** "Users think in vibes, not devices"

**15 Vibe Presets:**
| Preset | Music | Lights | Temperature |
|--------|-------|--------|-------------|
| `focus` | Ambient, low energy, 30% vol | 80%, 5000K | 68°F |
| `relax` | Jazz, low energy, 40% vol | 40%, 2700K | 72°F |
| `energize` | Pop, high energy, 60% vol | 100%, 6500K | 66°F |
| `sleep` | Sleep, low energy, 15% vol | 5%, 2200K | 67°F |
| `social` | Indie, medium, 50% vol | 70%, 3000K | 70°F |
| `morning` | Acoustic, medium, 35% vol | 90%, 4500K | 70°F |
| `romantic` | Soul, low, 35% vol | 25%, 2400K | 72°F |
| `workout` | Electronic, high, 70% vol | 100%, 6000K | 64°F |
| `movie` | Cinematic, low, 20% vol | 10%, 2400K | 71°F |
| `cooking` | World, medium, 45% vol | 100%, 4000K | 68°F |
| `reading` | Classical, low, 20% vol | 60%, 3000K | 71°F |
| `creative` | Lo-fi, medium, 35% vol | 85%, 5500K | 69°F |
| `meditation` | Nature, low, 15% vol | 20%, 2700K | 72°F |
| `gaming` | Electronic, medium, 40% vol | 30%, 4500K, teal accent | 68°F |
| `dinner` | Jazz, low, 30% vol | 50%, 2800K | 71°F |

**API Functions:**
- `getVibeState(userId)` - Get current music/lights/temp state
- `activateVibe(userId, presetId)` - Activate a preset
- `setLights(brightness, colorTemp)` - Direct light control
- `getAvailablePresets()` - List all presets
- `getPreset(id)` - Get specific preset details

### 1.4 Ecobee Thermostat (`src/services/identity/ecobee-api.ts`)

**Capabilities:**
- ✅ OAuth authentication flow
- ✅ Get thermostat status (current temp, target, humidity)
- ✅ Set temperature hold
- ✅ Set climate mode (home/away/sleep)
- ✅ Get sensor readings
- ✅ Circuit breaker protection

### 1.5 Voice Commands (`src/tools/semantic-router/tool-definitions/vibe.semantic.ts`)

**Trigger Phrases:**
```
"set the vibe to focus"
"set the mood to romantic"
"I need to relax"
"time to focus"
"make it cozy"
"set up for movie night"
"help me concentrate"
"getting ready for bed"
"set the vibe for a party"
"wind down time"
"meditation mode"
"workout vibe"
```

**Semantic Patterns:**
- `/^(?:set|change)\s+(?:the\s+)?(?:vibe|mood|atmosphere)\s+(?:to\s+)?(.+)/i`
- `/^(?:i\s+)?(?:need|want)\s+(?:to\s+)?(?:relax|focus|energize|sleep|work)/i`
- `/^(?:time\s+to|let's)\s+(?:relax|focus|work|sleep|party|cook|read)/i`

---

## 2. Architecture Analysis

### 2.1 Current Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER VOICE                                │
│                "Set the vibe to focus"                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SEMANTIC ROUTER                               │
│  vibe.semantic.ts → Matches setVibe tool                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VIBE SERVICE                                  │
│  activateVibe(userId, 'focus')                                  │
│  ├── Music: ambient, low, 30% vol                               │
│  ├── Lights: getAllDevices() → controlDevice() each @ 80%       │
│  └── Temp: setTemperature(68°F)                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   SMART HOME     │ │   ECOBEE API     │ │   SPOTIFY API    │
│ Home Assistant   │ │ Thermostat ctrl  │ │ (Future)         │
│ Hue / LIFX       │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 2.2 iOS Native Flow (Separate)

```
┌─────────────────────────────────────────────────────────────────┐
│                    iOS VOICE AGENT                               │
│  Detects mood: "stressed"                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 HomeKitService.swift                             │
│  onMoodDetected("stressed") → setAmbientScene(.calming)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HOMEKIT FRAMEWORK                             │
│  HMHomeManager → HMHome → HMRoom → HMAccessory                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Integration Gaps

### 3.1 🔴 Critical Gaps

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **No HomeKit ↔ Backend sync** | iOS and backend operate independently | Create bridging service |
| **No E2E synthetic tests** | Can't validate vibe flows | Create test suite (this audit) |
| **Music not connected** | Vibe presets set music but don't control Spotify | Connect to existing Spotify tools |

### 3.2 🟡 Medium Gaps

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **No vibe history** | Can't recall "what vibe did I use last night?" | Add Firestore persistence |
| **No vibe scheduling** | Can't set "focus vibe at 9am" | Integrate with scheduler |
| **No ambient sensors** | Can't auto-adjust based on light/motion | Future HomeKit sensor support |
| **SmartThings not implemented** | Limited device support | Add SmartThings OAuth |

### 3.3 🟢 Nice-to-Haves

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **No custom presets** | Users can't create "my evening" | Add user preset creation |
| **No preset suggestions** | No "you usually use focus at this time" | ML-based suggestions |
| **No cross-device sync** | Vibe doesn't follow user room-to-room | Future multi-room support |

---

## 4. Test Coverage Analysis

### 4.1 Existing Tests

| Test File | Coverage | Status |
|-----------|----------|--------|
| `src/services/vibe/__tests__/vibe.test.ts` | Preset validation, state, activation | ✅ Good |
| `src/tests/vibe-api.test.ts` | API functions | ✅ Good |
| `src/agents/shared/tool-executors/__tests__/home-executor.test.ts` | Home tools | ✅ Good |

### 4.2 Missing Tests

| Test Type | Priority | Status |
|-----------|----------|--------|
| **Synthetic E2E vibe scenarios** | 🔴 High | ⚠️ Missing |
| **HomeKit mock integration** | 🔴 High | ⚠️ Missing |
| **Multi-device coordination** | 🟡 Medium | ⚠️ Missing |
| **Circuit breaker behavior** | 🟡 Medium | ⚠️ Missing |
| **Ecobee OAuth flow** | 🟢 Low | ⚠️ Missing |

---

## 5. Testing Strategy

### 5.1 Dynamic Synthetic Tests (Recommended)

Following the pattern of `tests/synthetic/concierge-scenarios.ts`, create:

1. **Mock Smart Home Simulator** (`tests/synthetic/mocks/mock-smart-home.ts`)
   - Simulate Home Assistant, Hue, LIFX responses
   - Configurable device states
   - Failure scenarios (timeout, circuit open, device offline)

2. **Vibe Test Scenarios** (`tests/synthetic/scenarios/vibe-scenarios.ts`)
   - Happy path: All devices respond
   - Partial success: Some devices offline
   - Error handling: All devices fail
   - Edge cases: Empty home, single device

3. **Test Runner** (`tests/synthetic/runner/vibe-test-runner.ts`)
   - Execute scenarios
   - Validate expected outcomes
   - Generate coverage report

### 5.2 Test Scenario Categories

| Category | Scenarios | Priority |
|----------|-----------|----------|
| Vibe Activation | 15 presets × 3 device configs | 🔴 High |
| Voice Commands | 20+ trigger phrases | 🔴 High |
| Graceful Degradation | Lights fail, temp fail, music fail | 🔴 High |
| Multi-device | 2-10 light coordination | 🟡 Medium |
| Time-based | Morning vs night behavior | 🟡 Medium |
| User Preferences | Metric/imperial temp | 🟢 Low |

---

## 6. Recommendations

### 6.1 Immediate Actions

1. **Create synthetic test suite** (This PR)
   - Mock smart home devices
   - Vibe activation scenarios
   - Voice command coverage

2. **Connect music to Spotify**
   - Vibe service currently logs music intent but doesn't play
   - Integrate with existing Spotify tools

3. **Add vibe state persistence**
   - Store active vibe in Firestore
   - Enable "what vibe am I on?" queries

### 6.2 Short-term (Next Sprint)

1. **HomeKit ↔ Backend bridge**
   - WebSocket sync for real-time state
   - Unified device registry

2. **Vibe scheduling**
   - "Set focus vibe every weekday at 9am"
   - Integrate with reminder system

3. **SmartThings integration**
   - OAuth flow
   - Device discovery

### 6.3 Long-term (Roadmap)

1. **ML-based vibe suggestions**
   - Learn from usage patterns
   - Time-of-day recommendations

2. **Custom user presets**
   - "Create my evening routine vibe"
   - Shareable presets

3. **Ambient sensing**
   - Auto-adjust based on light sensors
   - Motion-triggered scenes

---

## 7. Files Reference

### Core Implementation
- `apps/ios-native/Sources/Services/HomeKitService.swift`
- `src/services/vibe/vibe-service.ts`
- `src/tools/domains/smart-home/smart-home.ts`
- `src/services/identity/ecobee-api.ts`
- `src/tools/domains/vibe/vibe-tools.ts`
- `src/tools/semantic-router/tool-definitions/vibe.semantic.ts`
- `src/agents/shared/tool-executors/home-executor.ts`

### Existing Tests
- `src/services/vibe/__tests__/vibe.test.ts`
- `src/tests/vibe-api.test.ts`
- `src/agents/shared/tool-executors/__tests__/home-executor.test.ts`

### New Test Files (This Audit)
- `tests/synthetic/mocks/mock-smart-home.ts`
- `tests/synthetic/scenarios/vibe-scenarios.ts`
- `tests/synthetic/runner/vibe-test-runner.ts`

---

## 8. Appendix: Voice Command Coverage

### Vibe Commands (High Confidence)
```
✅ "set the vibe to focus"
✅ "set the mood to romantic"
✅ "I need to relax"
✅ "time to focus"
✅ "make it cozy"
✅ "set up for movie night"
✅ "help me concentrate"
✅ "getting ready for bed"
✅ "wind down time"
✅ "meditation mode"
✅ "workout vibe"
```

### Smart Home Commands (Direct)
```
✅ "turn on the lights"
✅ "dim the bedroom lights to 50%"
✅ "set temperature to 72"
✅ "lock the front door"
✅ "turn off all lights"
✅ "what's the temperature?"
```

### Commands That Need Vibe Routing
```
⚠️ "I'm feeling stressed" → Should trigger calming vibe
⚠️ "It's bedtime" → Should trigger sleep vibe
⚠️ "Let's party" → Should trigger social vibe
⚠️ "I need to work" → Should trigger focus vibe
```

---

*Last Updated: December 29, 2024*
