# Better Than Human - Feature Implementation Plans

> **"Better than human means DOING things humans can't do consistently—not just NOTICING."**

This document covers implementation plans for 4 key features that would elevate Ferni from "noticing" to "acting" - the frontier of truly superhuman emotional intelligence.

---

## 📋 Feature Overview

| # | Feature | Impact | Status |
|---|---------|--------|--------|
| 1 | **Apple Health Integration** | Real biometrics → truly know user | 🟡 Design |
| 3 | **Ambient Background Mode** | Continuous presence even when app closed | 🟡 Design |
| 4 | **Photo/Visual Memory** | Complete memory picture with images | 🟡 Design |
| 5 | **Human Expert Warm Transfer** | Safety escalation path | 🟡 Design |

---

## 1. 🏥 Apple Health Integration

### The Promise
> "You only slept 4 hours last night" > "You sound tired"

A human friend guesses. Ferni *knows*.

### What We'd Know

| Data Point | Source | Insight |
|------------|--------|---------|
| Sleep quality | HealthKit | "Rough night? You only got 4 hours." |
| Heart rate variability | HealthKit | "Your stress levels have been elevated this week" |
| Activity/steps | HealthKit | "You've been less active lately - everything okay?" |
| Menstrual cycle | HealthKit | "This time of month can be harder - be gentle with yourself" |
| Workout data | HealthKit | "You crushed that workout yesterday!" |
| Mindfulness minutes | HealthKit | "You haven't meditated in a while - want to do one together?" |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        iOS APP (Swift)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐         ┌────────────────────┐                  │
│  │   HealthKitService │─────────│  HealthDataSync    │                  │
│  │   (read-only)      │         │  (background task) │                  │
│  └────────────────────┘         └────────────────────┘                  │
│           │                               │                              │
│           └───────────────┬───────────────┘                              │
│                           │                                              │
│                           ▼                                              │
│                  ┌────────────────────┐                                  │
│                  │    /api/health     │ ──────────────────────────────►  │
│                  │   (encrypted sync) │                                  │
│                  └────────────────────┘                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐    ┌────────────────────┐                       │
│  │  HealthDataStore   │    │  HealthInsights    │                       │
│  │  (Firestore)       │    │  (Pattern Analysis) │                       │
│  │                    │    │                    │                        │
│  │  • Sleep trends    │───▶│  • Generate alerts │                        │
│  │  • HRV patterns    │    │  • Correlations    │                        │
│  │  • Activity data   │    │  • Predictions     │                        │
│  └────────────────────┘    └────────────────────┘                        │
│                                     │                                    │
│                                     ▼                                    │
│                        ┌────────────────────┐                            │
│                        │  Context Injection │                            │
│                        │  (turn processor)  │                            │
│                        └────────────────────┘                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

#### Phase 1: iOS HealthKit Service

**File:** `apps/ios-native/Sources/Services/HealthKitService.swift`

```swift
import HealthKit

class HealthKitService: ObservableObject {
    private let healthStore = HKHealthStore()
    
    // Types we want to read (all read-only, privacy-first)
    private let readTypes: Set<HKSampleType> = [
        HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
        HKObjectType.quantityType(forIdentifier: .stepCount)!,
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKObjectType.quantityType(forIdentifier: .mindfulSession)!,
        HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
    ]
    
    // Request authorization (user must approve)
    func requestAuthorization() async throws -> Bool {
        try await healthStore.requestAuthorization(toShare: [], read: readTypes)
        return true
    }
    
    // Get last night's sleep
    func getLastNightSleep() async -> SleepSummary? {
        // Query HKCategoryTypeIdentifier.sleepAnalysis
        // Return hours slept, quality score, sleep stages
    }
    
    // Get HRV trend (stress indicator)
    func getHRVTrend(days: Int = 7) async -> HRVTrend? {
        // Query HKQuantityTypeIdentifier.heartRateVariabilitySDNN
        // Return average, trend direction, anomalies
    }
    
    // Sync to backend (encrypted, minimal data)
    func syncToBackend(userId: String) async throws {
        let summary = HealthSummary(
            sleepHours: await getLastNightSleep()?.totalHours,
            hrvAverage: await getHRVTrend()?.average,
            stepsToday: await getTodaySteps(),
            lastWorkout: await getLastWorkout()
        )
        
        try await apiClient.post("/api/health/sync", body: summary)
    }
}
```

#### Phase 2: Backend Health Data Store

**File:** `src/services/health/health-data-store.ts`

```typescript
/**
 * Health Data Store
 * 
 * Privacy-first storage of health summaries.
 * We store insights, not raw data.
 */

interface HealthSummary {
  userId: string;
  date: string; // YYYY-MM-DD
  
  // Sleep (not raw data, just summary)
  sleepHours?: number;
  sleepQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  
  // Stress indicators
  hrvTrend?: 'declining' | 'stable' | 'improving';
  hrvAnomalyDetected?: boolean;
  
  // Activity
  stepsToday?: number;
  activityTrend?: 'less_active' | 'normal' | 'more_active';
  
  // Wellness
  lastMeditation?: string; // ISO date
  lastWorkout?: string; // ISO date
}

export async function storeHealthSummary(summary: HealthSummary): Promise<void> {
  const db = getFirestoreDb();
  await db.collection('bogle_users').doc(summary.userId)
    .collection('health_summaries').doc(summary.date).set(summary);
}

export async function getRecentHealthContext(userId: string): Promise<string> {
  // Build context injection for LLM
  const summaries = await getLastNDays(userId, 7);
  
  if (summaries.length === 0) return '';
  
  const latest = summaries[0];
  const insights: string[] = [];
  
  // Sleep insight
  if (latest.sleepHours && latest.sleepHours < 6) {
    insights.push(`User only slept ${latest.sleepHours} hours last night.`);
  }
  
  // Stress insight
  if (latest.hrvTrend === 'declining') {
    insights.push(`User's stress indicators have been elevated this week.`);
  }
  
  // Activity insight
  if (latest.activityTrend === 'less_active') {
    insights.push(`User has been less physically active than usual.`);
  }
  
  if (insights.length === 0) return '';
  
  return `[HEALTH AWARENESS - Better Than Human]
${insights.join('\n')}
Use this gently if relevant - don't lecture, just acknowledge.`;
}
```

#### Phase 3: Context Injection

**File:** `src/intelligence/context-builders/health-awareness.ts`

```typescript
/**
 * Health Awareness Context Builder
 * 
 * "Better than human" - A friend might not notice you're exhausted.
 * We do, because we know you only slept 4 hours.
 */

export async function buildHealthAwarenessContext(
  userId: string
): Promise<ContextInjection | null> {
  const healthContext = await getRecentHealthContext(userId);
  
  if (!healthContext) return null;
  
  return {
    id: 'health-awareness',
    priority: 76, // High priority but below safety
    content: healthContext,
    metadata: {
      source: 'health-data',
      capability: 'better-than-human',
    },
  };
}
```

### Privacy & Consent

| Principle | Implementation |
|-----------|----------------|
| **Opt-in only** | User must explicitly enable in settings |
| **Minimal data** | Store summaries, not raw health records |
| **No sharing** | Health data never leaves Ferni |
| **Easy off** | One tap to disable and delete |
| **Transparency** | Show exactly what we know |

### Info.plist Additions

```xml
<key>NSHealthShareUsageDescription</key>
<string>Ferni uses health data to better understand how you're feeling and provide more personalized support. We only see summaries, never share your data, and you can disable this anytime.</string>

<key>NSHealthUpdateUsageDescription</key>
<string>Ferni does not write to your health data.</string>
```

---

## 3. 🌙 Ambient Background Mode

### The Promise
> A best friend doesn't only exist when you call them.

Ferni should have continuous awareness and be able to reach out proactively.

### Current State
- ✅ Push notifications exist (`src/services/outreach/delivery/push-notifications.ts`)
- ✅ Daily outreach job exists (`src/services/outreach/daily-outreach-job.ts`)
- ✅ "Thinking of You" system exists (`src/services/outreach/thinking-of-you.ts`)
- ❌ No location-aware triggers
- ❌ No continuous background processing on device
- ❌ No "always listening" ambient mode

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AMBIENT PRESENCE SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    iOS BACKGROUND SERVICES                        │    │
│  │                                                                   │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │    │
│  │  │ Location    │  │ Health      │  │ Silent Push │              │    │
│  │  │ Geofencing  │  │ Background  │  │ Wake        │              │    │
│  │  │             │  │ Refresh     │  │             │              │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │    │
│  │         │                │                │                      │    │
│  │         └────────────────┼────────────────┘                      │    │
│  │                          │                                       │    │
│  │                          ▼                                       │    │
│  │                 ┌─────────────────┐                              │    │
│  │                 │ AmbientEngine   │                              │    │
│  │                 │ (local ML)      │                              │    │
│  │                 └────────┬────────┘                              │    │
│  │                          │                                       │    │
│  └──────────────────────────┼───────────────────────────────────────┘    │
│                             │                                            │
│                             ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    BACKEND AMBIENT SERVICES                       │    │
│  │                                                                   │    │
│  │  ┌─────────────────┐    ┌─────────────────┐                      │    │
│  │  │ Ambient State   │    │ Proactive       │                      │    │
│  │  │ Manager         │◄───│ Trigger Engine  │                      │    │
│  │  │                 │    │                 │                      │    │
│  │  │ • User location │    │ • Time-based    │                      │    │
│  │  │ • Activity      │    │ • Location-based│                      │    │
│  │  │ • Calendar      │    │ • Pattern-based │                      │    │
│  │  │ • Health        │    │ • Event-based   │                      │    │
│  │  └─────────────────┘    └─────────────────┘                      │    │
│  │                                │                                  │    │
│  │                                ▼                                  │    │
│  │                    ┌─────────────────────┐                       │    │
│  │                    │ Rich Notification   │                       │    │
│  │                    │ Generator           │                       │    │
│  │                    └─────────────────────┘                       │    │
│  │                                                                   │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

#### Phase 1: Location-Aware Triggers

**File:** `apps/ios-native/Sources/Services/AmbientLocationService.swift`

```swift
import CoreLocation

class AmbientLocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    
    // Significant locations (learned over time)
    @Published private(set) var significantLocations: [SignificantLocation] = []
    
    // Geofences for proactive triggers
    private var activeGeofences: [CLCircularRegion] = []
    
    func setupGeofencing() {
        // Home: "Welcome home" after long day
        // Work: "Big meeting today?" when arriving at office
        // Gym: "Great job showing up!" when arriving at gym
        // Favorite café: "Enjoy your coffee break"
    }
    
    func locationManager(_ manager: CLLocationManager, 
                        didEnterRegion region: CLRegion) {
        // Trigger appropriate ambient message
        switch region.identifier {
        case "home":
            AmbientEngine.shared.trigger(.arrivedHome)
        case "work":
            AmbientEngine.shared.trigger(.arrivedWork)
        case "gym":
            AmbientEngine.shared.trigger(.arrivedGym)
        default:
            break
        }
    }
}
```

#### Phase 2: Ambient Engine (On-Device)

**File:** `apps/ios-native/Sources/Services/AmbientEngine.swift`

```swift
class AmbientEngine {
    static let shared = AmbientEngine()
    
    enum AmbientTrigger {
        case arrivedHome
        case arrivedWork
        case arrivedGym
        case longDayDetected      // At work past 7pm
        case inactivityDetected   // No movement for 3 hours
        case sleepTimeApproaching // Usual bedtime minus 30min
        case morningRoutineTime   // Usual wake time
        case stressfulDayEnd      // Low HRV + late at work
    }
    
    func trigger(_ type: AmbientTrigger) {
        // Check if we should actually send (rate limiting, user preferences)
        guard shouldSendAmbientMessage(type) else { return }
        
        // Generate contextual message
        let message = generateAmbientMessage(type)
        
        // Send as rich notification (not a call, just a gentle nudge)
        sendRichNotification(message)
    }
    
    private func generateAmbientMessage(_ type: AmbientTrigger) -> AmbientMessage {
        switch type {
        case .arrivedHome:
            return AmbientMessage(
                title: "Welcome home 🏠",
                body: "Long day? I'm here if you want to decompress.",
                action: .offerConversation
            )
            
        case .arrivedGym:
            return AmbientMessage(
                title: "Go get it! 💪",
                body: "Proud of you for showing up.",
                action: .none // Just encouragement
            )
            
        case .stressfulDayEnd:
            return AmbientMessage(
                title: "Rough day?",
                body: "I noticed it's been a lot. Want to talk?",
                action: .offerConversation
            )
        }
    }
}
```

#### Phase 3: Backend Ambient State

**File:** `src/services/ambient/ambient-state-manager.ts`

```typescript
/**
 * Ambient State Manager
 * 
 * Tracks user context for proactive outreach decisions.
 * "Better than human" - knows when to reach out.
 */

interface AmbientState {
  userId: string;
  lastKnownLocation?: {
    type: 'home' | 'work' | 'gym' | 'other';
    since: string; // ISO timestamp
  };
  lastActivity?: string;
  todayMood?: string;
  calendarDensity?: 'light' | 'moderate' | 'packed';
  lastOutreach?: string;
  
  // Computed
  shouldReachOut: boolean;
  suggestedTrigger?: string;
}

export async function evaluateAmbientOutreach(
  userId: string
): Promise<{ shouldReach: boolean; message?: string; trigger?: string }> {
  const state = await getAmbientState(userId);
  const health = await getRecentHealthContext(userId);
  const calendar = await getAmbientCalendarContext(userId);
  
  // Late at office + packed calendar + low sleep = check in
  if (
    state.lastKnownLocation?.type === 'work' &&
    isLateEvening() &&
    calendar.calendarDensity === 'packed' &&
    health.includes('only slept')
  ) {
    return {
      shouldReach: true,
      trigger: 'stressful_day',
      message: "Long day. Remember to breathe. I'm here if you need to vent.",
    };
  }
  
  // Add more trigger combinations...
  
  return { shouldReach: false };
}
```

### Privacy & Battery

| Concern | Mitigation |
|---------|------------|
| **Location tracking** | Only significant locations, not continuous GPS |
| **Battery drain** | Use geofencing (low power), not continuous tracking |
| **Creepy factor** | All ambient features opt-in, easy to disable |
| **Over-messaging** | Rate limits: max 2 ambient messages/day |

---

## 4. 📸 Photo/Visual Memory

### The Promise
> "Remember that sunset you showed me from your trip?"

Memory is currently text-only. Humans remember visually.

### What We'd Remember

| Visual Type | Example |
|-------------|---------|
| **Shared photos** | Trip photos, family pictures, accomplishments |
| **Described visuals** | "Let me tell you about this view..." |
| **Annotated moments** | Photo + emotion + context |
| **Visual timeline** | Life story in images |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      VISUAL MEMORY SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        INPUT LAYER                                 │  │
│  │                                                                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ Photo Share │  │ Camera      │  │ Screenshot  │               │  │
│  │  │ (in chat)   │  │ Capture     │  │ Share       │               │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │  │
│  │         │                │                │                       │  │
│  │         └────────────────┼────────────────┘                       │  │
│  │                          │                                        │  │
│  └──────────────────────────┼────────────────────────────────────────┘  │
│                             │                                            │
│                             ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      PROCESSING LAYER                              │  │
│  │                                                                    │  │
│  │  ┌─────────────────┐    ┌─────────────────┐                       │  │
│  │  │ Vision Analysis │    │ Context Capture │                       │  │
│  │  │ (Gemini/GPT-4V) │    │                 │                       │  │
│  │  │                 │    │ • Who's in it   │                       │  │
│  │  │ • Description   │    │ • Where/when    │                       │  │
│  │  │ • Emotion       │    │ • Why shared    │                       │  │
│  │  │ • Key elements  │    │ • User's mood   │                       │  │
│  │  └─────────────────┘    └─────────────────┘                       │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             │                                            │
│                             ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       STORAGE LAYER                                │  │
│  │                                                                    │  │
│  │  ┌─────────────────┐    ┌─────────────────┐                       │  │
│  │  │ Cloud Storage   │    │ Vector Store    │                       │  │
│  │  │ (images)        │    │ (descriptions)  │                       │  │
│  │  │                 │    │                 │                       │  │
│  │  │ gs://ferni-     │    │ Visual memory   │                       │  │
│  │  │ visual-memories │    │ embeddings      │                       │  │
│  │  └─────────────────┘    └─────────────────┘                       │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             │                                            │
│                             ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       RETRIEVAL LAYER                              │  │
│  │                                                                    │  │
│  │  "Remember that photo from my trip?"                              │  │
│  │        │                                                          │  │
│  │        ▼                                                          │  │
│  │  ┌─────────────────────────────────────────────────┐             │  │
│  │  │ Semantic Search + Visual Context                 │             │  │
│  │  │                                                  │             │  │
│  │  │ Returns: Image URL + description + context       │             │  │
│  │  └─────────────────────────────────────────────────┘             │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

#### Phase 1: Visual Memory Types

**File:** `src/memory/visual-memory/types.ts`

```typescript
/**
 * Visual Memory Types
 * 
 * "Better than human" - We remember not just what you said,
 * but what you showed us.
 */

export interface VisualMemory {
  id: string;
  userId: string;
  
  // Image data
  imageUrl: string; // Cloud Storage URL
  thumbnailUrl: string;
  
  // AI-generated description
  description: string;
  detectedElements: string[]; // "sunset", "beach", "family"
  detectedEmotion: string; // "joyful", "peaceful", "proud"
  
  // User context at time of sharing
  context: {
    conversationId: string;
    userMessage?: string; // What they said when sharing
    detectedMood?: string;
    topic?: string;
  };
  
  // Relationships
  people?: string[]; // Names of people in photo
  location?: string;
  event?: string; // "trip to Hawaii", "graduation"
  
  // Metadata
  sharedAt: string;
  lastReferenced?: string;
  referenceCount: number;
}

export interface VisualMemoryQuery {
  query: string; // "that sunset photo"
  userId: string;
  limit?: number;
}

export interface VisualMemoryResult {
  memory: VisualMemory;
  relevanceScore: number;
  matchReason: string; // "Matched 'sunset' in description"
}
```

#### Phase 2: Vision Analysis Service

**File:** `src/services/visual-memory/vision-analysis.ts`

```typescript
/**
 * Vision Analysis Service
 * 
 * Uses Gemini Vision to understand shared images.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export async function analyzeImage(
  imageData: Buffer | string, // Base64 or URL
  userContext: { message?: string; mood?: string }
): Promise<ImageAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const prompt = `Analyze this image that was shared in a personal conversation.

User's message when sharing: "${userContext.message || 'No message'}"

Provide:
1. A warm, human description (2-3 sentences)
2. Key visual elements (list)
3. Emotional tone of the image
4. Why someone might share this (guess)

Format as JSON:
{
  "description": "...",
  "elements": ["..."],
  "emotion": "...",
  "shareReason": "..."
}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: 'image/jpeg', data: imageData } },
  ]);
  
  return JSON.parse(result.response.text());
}
```

#### Phase 3: Visual Memory Retrieval

**File:** `src/memory/visual-memory/retrieval.ts`

```typescript
/**
 * Visual Memory Retrieval
 * 
 * "Remember that photo from my trip?"
 */

export async function retrieveVisualMemory(
  query: VisualMemoryQuery
): Promise<VisualMemoryResult[]> {
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query.query);
  
  // Search vector store for visual memory descriptions
  const results = await vectorStore.similaritySearch({
    embedding: queryEmbedding,
    filter: {
      userId: query.userId,
      source: 'visual_memory',
    },
    limit: query.limit || 5,
  });
  
  // Fetch full visual memory records
  return Promise.all(
    results.map(async (r) => {
      const memory = await getVisualMemory(r.id);
      return {
        memory,
        relevanceScore: r.score,
        matchReason: r.metadata.matchReason,
      };
    })
  );
}

/**
 * Context injection for visual memories
 */
export async function buildVisualMemoryContext(
  userId: string,
  currentTopic?: string
): Promise<string> {
  if (!currentTopic) return '';
  
  const relevant = await retrieveVisualMemory({
    query: currentTopic,
    userId,
    limit: 3,
  });
  
  if (relevant.length === 0) return '';
  
  const memories = relevant.map((r) => 
    `- ${r.memory.description} (shared ${formatRelativeTime(r.memory.sharedAt)})`
  ).join('\n');
  
  return `[VISUAL MEMORIES]
You remember these images the user shared:
${memories}

You can reference these naturally if relevant.`;
}
```

### Storage & Privacy

| Aspect | Implementation |
|--------|----------------|
| **Storage** | Google Cloud Storage with per-user encryption |
| **Retention** | User-controlled, default 1 year |
| **Access** | Only user + Ferni can access |
| **Deletion** | Immediate on request |
| **Processing** | Vision AI for descriptions, no human review |

---

## 5. 🆘 Human Expert Warm Transfer

### The Promise
> "Let me connect you with someone who can really help."

For real crises, AI isn't enough. We need warm handoffs to humans.

### Current State
- ✅ Crisis detection exists (`src/services/superhuman/emotional-first-aid.ts`)
- ✅ Crisis resources exist (`src/tools/domains/crisis/`)
- ❌ No direct connection to human help
- ❌ No therapist marketplace integration
- ❌ No "warm transfer" capability

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HUMAN EXPERT TRANSFER SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    DETECTION LAYER                                 │  │
│  │                                                                    │  │
│  │  ┌─────────────────┐    ┌─────────────────┐                       │  │
│  │  │ Crisis Detector │    │ Escalation      │                       │  │
│  │  │ (existing)      │───▶│ Classifier      │                       │  │
│  │  │                 │    │                 │                       │  │
│  │  │ Severity: 1-10  │    │ Type:           │                       │  │
│  │  │                 │    │ • Crisis (911)  │                       │  │
│  │  │                 │    │ • Therapy       │                       │  │
│  │  │                 │    │ • Coaching      │                       │  │
│  │  │                 │    │ • Legal         │                       │  │
│  │  │                 │    │ • Medical       │                       │  │
│  │  └─────────────────┘    └─────────────────┘                       │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             │                                            │
│                             ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    ROUTING LAYER                                   │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                 TRANSFER OPTIONS                             │  │  │
│  │  │                                                              │  │  │
│  │  │  ┌───────────┐  ┌───────────┐  ┌───────────┐               │  │  │
│  │  │  │ Crisis    │  │ Therapy   │  │ Coaching  │               │  │  │
│  │  │  │ Hotline   │  │ Platform  │  │ Platform  │               │  │  │
│  │  │  │           │  │           │  │           │               │  │  │
│  │  │  │ 988       │  │ BetterHelp│  │ CoachHub  │               │  │  │
│  │  │  │ (direct)  │  │ Talkspace │  │ BetterUp  │               │  │  │
│  │  │  │           │  │ Cerebral  │  │           │               │  │  │
│  │  │  └───────────┘  └───────────┘  └───────────┘               │  │  │
│  │  │                                                              │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             │                                            │
│                             ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    WARM TRANSFER                                   │  │
│  │                                                                    │  │
│  │  1. User consents to transfer                                     │  │
│  │  2. Ferni generates summary for human expert                      │  │
│  │  3. Direct connection initiated (no cold referral)                │  │
│  │  4. Human expert receives context before call                     │  │
│  │  5. Ferni stays available for follow-up                          │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

#### Phase 1: Escalation Classifier

**File:** `src/services/human-transfer/escalation-classifier.ts`

```typescript
/**
 * Escalation Classifier
 * 
 * Determines when and where to transfer to human help.
 */

export type EscalationType = 
  | 'crisis_immediate'  // 911, crisis hotline
  | 'crisis_support'    // 988, Crisis Text Line
  | 'therapy'           // Licensed therapist needed
  | 'coaching'          // Life coach/professional coach
  | 'legal'             // Legal professional
  | 'medical'           // Medical professional
  | 'financial'         // Financial advisor
  | 'none';             // Ferni can handle

export interface EscalationDecision {
  type: EscalationType;
  urgency: 'immediate' | 'soon' | 'when_ready';
  reason: string;
  suggestedService?: string;
  contextForHuman?: string;
}

export function classifyEscalation(
  crisisSignals: CrisisSignals,
  conversationContext: string
): EscalationDecision {
  // Immediate crisis - direct to 988/911
  if (crisisSignals.severity >= 8 || crisisSignals.suicidalIdeation) {
    return {
      type: 'crisis_immediate',
      urgency: 'immediate',
      reason: 'Active crisis detected',
      suggestedService: '988 Suicide & Crisis Lifeline',
    };
  }
  
  // Therapy territory - beyond life coaching
  if (
    crisisSignals.traumaIndicators ||
    crisisSignals.persistentDepression ||
    crisisSignals.anxietyDisorder
  ) {
    return {
      type: 'therapy',
      urgency: 'soon',
      reason: 'Professional mental health support would help',
      suggestedService: 'BetterHelp or local therapist',
    };
  }
  
  // Ferni can handle
  return {
    type: 'none',
    urgency: 'when_ready',
    reason: 'Within coaching scope',
  };
}
```

#### Phase 2: Context Summary Generator

**File:** `src/services/human-transfer/context-summary.ts`

```typescript
/**
 * Context Summary Generator
 * 
 * Creates a warm handoff summary for human experts.
 * "I've been talking to someone named [name]. Here's what I know..."
 */

export async function generateTransferSummary(
  userId: string,
  escalationType: EscalationType
): Promise<TransferSummary> {
  const profile = await getUserProfile(userId);
  const recentConversations = await getRecentConversations(userId, 5);
  const crisisContext = await getCrisisContext(userId);
  
  // Use LLM to generate human-readable summary
  const summary = await generateWithLLM(`
    Generate a warm handoff summary for a ${escalationType} professional.
    
    User profile (anonymized):
    - Preferred name: ${profile.preferredName || 'Not provided'}
    - Key concerns: ${profile.currentConcerns?.join(', ')}
    - Relevant history: ${profile.relevantHistory}
    
    Recent conversation themes:
    ${recentConversations.map(c => `- ${c.summary}`).join('\n')}
    
    Current situation:
    ${crisisContext?.summary}
    
    Write a 3-4 paragraph summary that:
    1. Introduces the person warmly
    2. Explains why they're being transferred
    3. Highlights key context the professional should know
    4. Notes any preferences or sensitivities
  `);
  
  return {
    summary,
    urgency: crisisContext?.urgency,
    keyTopics: profile.currentConcerns,
    doNotMention: profile.boundaryTopics,
  };
}
```

#### Phase 3: Transfer Flow

**File:** `src/services/human-transfer/transfer-flow.ts`

```typescript
/**
 * Human Expert Transfer Flow
 * 
 * "Let me connect you with someone who can really help."
 */

export async function initiateWarmTransfer(
  userId: string,
  decision: EscalationDecision
): Promise<TransferResult> {
  // Step 1: Generate context summary
  const summary = await generateTransferSummary(userId, decision.type);
  
  // Step 2: Get user consent
  const consent = await requestTransferConsent(userId, {
    service: decision.suggestedService,
    reason: decision.reason,
    whatWillBeShared: 'A summary of our conversation to help them help you',
  });
  
  if (!consent.granted) {
    return { 
      success: false, 
      reason: 'User declined transfer',
      alternativeOffered: true,
    };
  }
  
  // Step 3: Initiate connection based on type
  switch (decision.type) {
    case 'crisis_immediate':
      return initiateEmergencyTransfer(userId, summary);
      
    case 'therapy':
      return initiateTherapyTransfer(userId, summary, consent.preferredPlatform);
      
    case 'coaching':
      return initiateCoachingTransfer(userId, summary);
      
    default:
      return { success: false, reason: 'Unknown transfer type' };
  }
}

async function initiateTherapyTransfer(
  userId: string,
  summary: TransferSummary,
  platform: 'betterhelp' | 'talkspace' | 'local'
): Promise<TransferResult> {
  // If BetterHelp/Talkspace integration exists
  if (platform === 'betterhelp' && BETTERHELP_API_KEY) {
    // API call to create intake with context
    const intake = await betterHelpAPI.createIntake({
      context: summary.summary,
      urgency: summary.urgency,
    });
    
    return {
      success: true,
      transferUrl: intake.url,
      message: "I've connected you with a therapist. They have context on what we've discussed.",
    };
  }
  
  // Fallback: Provide curated list
  return {
    success: true,
    resources: getLocalTherapists(userId),
    message: "Here are some therapists who might be a good fit. Want me to share our conversation summary with them?",
  };
}
```

### Integration Points

| Service | Integration Type | Status |
|---------|------------------|--------|
| **988 Lifeline** | Direct dial (tel:) | 🟢 Simple |
| **Crisis Text Line** | SMS to 741741 | 🟢 Simple |
| **BetterHelp** | API integration | 🟡 Requires partnership |
| **Talkspace** | API integration | 🟡 Requires partnership |
| **Local therapists** | Directory lookup | 🟢 Psychology Today API |

---

## 🗓️ Implementation Timeline

| Phase | Features | Duration | Dependencies |
|-------|----------|----------|--------------|
| **Phase 1** | Human Expert Transfer (basic) | 2 weeks | Crisis detection (exists) |
| **Phase 2** | Apple Health Integration | 4 weeks | iOS app update |
| **Phase 3** | Photo/Visual Memory | 4 weeks | Cloud Storage setup |
| **Phase 4** | Ambient Background Mode | 6 weeks | iOS background capabilities |

### Recommended Start: Human Expert Transfer

- Lowest technical complexity
- Highest safety impact
- Builds trust for other features
- No app update required

---

## 📊 Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| **Health Integration** | Users opting in | >30% of iOS users |
| **Health Integration** | Relevant health mentions in conversation | >10% of sessions |
| **Ambient Mode** | Ambient message engagement rate | >40% open rate |
| **Ambient Mode** | User-reported "feels present" | >4.5/5 stars |
| **Visual Memory** | Photos shared per user | >2/month |
| **Visual Memory** | Visual memory recalls in conversation | >5% of sessions |
| **Human Transfer** | Successful transfers | >90% completion |
| **Human Transfer** | Post-transfer satisfaction | >4/5 stars |

---

*"Better than human means DOING things humans can't do consistently—not just NOTICING."*

---

*Last updated: December 24, 2024*

