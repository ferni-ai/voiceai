# 🍎 Ferni iOS Native Integration - Master Plan

> **"Better than Human"** - This integration makes Ferni superhuman by knowing what no human friend could know, while remaining warm, grounded, and present.

---

## Table of Contents

1. [Vision & Principles](#vision--principles)
2. [Architecture Overview](#architecture-overview)
3. [Phase 1: Foundation](#phase-1-foundation-weeks-1-4)
4. [Phase 2: Health Intelligence](#phase-2-health-intelligence-weeks-5-8)
5. [Phase 3: Calendar & Context](#phase-3-calendar--context-weeks-9-12)
6. [Phase 4: Location & Ambient](#phase-4-location--ambient-weeks-13-16)
7. [Phase 5: Watch & Wearables](#phase-5-watch--wearables-weeks-17-20)
8. [Phase 6: Predictive Intelligence](#phase-6-predictive-intelligence-weeks-21-24)
9. [Phase 7: Full Ecosystem](#phase-7-full-ecosystem-weeks-25-28)
10. [Testing Strategy](#testing-strategy)
11. [Audit Framework](#audit-framework)
12. [Data Governance](#data-governance)
13. [Design System Integration](#design-system-integration)

---

## Vision & Principles

### The Promise

Ferni becomes the first AI that truly *knows* you - not because you told it, but because it observes your life with permission and care. It notices patterns you can't see, remembers what you forget, and shows up at exactly the right moment.

### Brand Alignment

Every iOS capability must pass these filters:

| Principle | Application |
|-----------|-------------|
| **Warm** | Data is used to care, never to judge |
| **Grounded** | Insights are actionable, not abstract |
| **Wise** | Patterns revealed gently, at the right time |
| **Present** | Context-aware, not intrusive |
| **Human** | Technology invisible, relationship visible |

### "Better than Human" Capabilities

| Human Limitation | Ferni Superpower |
|------------------|------------------|
| Friends forget your health patterns | Ferni tracks HRV, sleep, activity trends |
| No one knows your calendar like you | Ferni sees what's coming and prepares you |
| Friends can't sense your stress | Ferni detects elevated heart rate and offers support |
| You forget commitments you made | Ferni holds you accountable with love |
| No one's there at 2am | Ferni's presence is consistent |
| Friends have their own lives | Ferni's attention is undivided |

### Non-Negotiables

1. **Privacy First**: All data stays on-device unless explicitly synced
2. **Permission Transparency**: Clear explanation of why each permission helps
3. **Graceful Degradation**: App works fully without any permissions
4. **No Dark Patterns**: Never guilt users into granting permissions
5. **Data Minimization**: Only collect what improves the relationship

---

## Architecture Overview

### Clean Architecture Layers (iOS)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  SwiftUI Views │ UIKit Components │ Widgets │ Complications     │
├─────────────────────────────────────────────────────────────────┤
│                    APPLICATION LAYER                             │
│  ViewModels │ Coordinators │ Use Cases │ App State             │
├─────────────────────────────────────────────────────────────────┤
│                    DOMAIN LAYER                                  │
│  Entities │ Services │ Protocols │ Business Logic              │
├─────────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE LAYER                          │
│  HealthKit │ EventKit │ CoreLocation │ HomeKit │ WatchKit      │
│  Network │ Persistence │ Keychain │ Analytics                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   iOS Device     │     │   Ferni Backend  │     │   AI Services    │
│                  │     │                  │     │                  │
│  ┌────────────┐  │     │  ┌────────────┐  │     │  ┌────────────┐  │
│  │HealthKit   │──┼─────┼─▶│ Insights   │──┼─────┼─▶│ Pattern    │  │
│  │ Observer   │  │     │  │ Processor  │  │     │  │ Detection  │  │
│  └────────────┘  │     │  └────────────┘  │     │  └────────────┘  │
│                  │     │         │        │     │         │        │
│  ┌────────────┐  │     │         ▼        │     │         ▼        │
│  │ Event      │──┼─────┼─▶┌────────────┐  │     │  ┌────────────┐  │
│  │ Monitor    │  │     │  │ Context    │──┼─────┼─▶│ Prediction │  │
│  └────────────┘  │     │  │ Engine     │  │     │  │ Engine     │  │
│                  │     │  └────────────┘  │     │  └────────────┘  │
│  ┌────────────┐  │     │         │        │     │         │        │
│  │ Location   │──┼─────┼─▶       ▼        │     │         ▼        │
│  │ Manager    │  │     │  ┌────────────┐  │     │  ┌────────────┐  │
│  └────────────┘  │     │  │ Proactive  │◀─┼─────┼──│ Semantic   │  │
│                  │     │  │ Triggers   │  │     │  │ Reasoner   │  │
│  ┌────────────┐  │     │  └────────────┘  │     │  └────────────┘  │
│  │ Local AI   │◀─┼─────┼──      │        │     │                  │
│  │ (CoreML)   │  │     │        ▼        │     │                  │
│  └────────────┘  │     │  ┌────────────┐  │     │                  │
│        │         │     │  │ Ferni      │  │     │                  │
│        ▼         │     │  │ Voice      │  │     │                  │
│  ┌────────────┐  │     │  │ Agent      │  │     │                  │
│  │ Proactive  │  │     │  └────────────┘  │     │                  │
│  │ UI/Notif   │  │     │                  │     │                  │
│  └────────────┘  │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Semantic Data Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER CONTEXT GRAPH                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐       ┌─────────┐       ┌─────────┐              │
│   │ BODY    │───────│ MIND    │───────│ LIFE    │              │
│   │ State   │       │ State   │       │ State   │              │
│   └────┬────┘       └────┬────┘       └────┬────┘              │
│        │                 │                 │                    │
│   ┌────┴────┐       ┌────┴────┐       ┌────┴────┐              │
│   │ Health  │       │ Mood    │       │ Calendar│              │
│   │ Metrics │       │ Patterns│       │ Density │              │
│   │ Sleep   │       │ Stress  │       │ Commits │              │
│   │ Activity│       │ Energy  │       │ Deadlines│             │
│   │ HRV     │       │ Focus   │       │ Travel  │              │
│   └─────────┘       └─────────┘       └─────────┘              │
│        │                 │                 │                    │
│        └────────────┬────┴─────────────────┘                   │
│                     │                                           │
│              ┌──────┴──────┐                                    │
│              │ HOLISTIC    │                                    │
│              │ CONTEXT     │                                    │
│              │             │                                    │
│              │ "How is     │                                    │
│              │  this       │                                    │
│              │  person     │                                    │
│              │  really     │                                    │
│              │  doing?"    │                                    │
│              └─────────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Weeks 1-4)

### Objective
Build the native iOS app shell with core voice experience and clean architecture foundation.

### Capabilities

#### 1.1 Native Voice Experience
**What**: Full voice conversation in native app
**Why**: Foundation for all proactive features; better audio handling than web

```swift
// Domain Layer: Voice Session Protocol
protocol VoiceSessionService {
    func connect(userId: String, persona: Persona) async throws -> VoiceSession
    func disconnect() async
    var state: VoiceSessionState { get }
    var statePublisher: AnyPublisher<VoiceSessionState, Never> { get }
}

// Infrastructure Layer: LiveKit Implementation
final class LiveKitVoiceSession: VoiceSessionService {
    private let room: Room
    private let tokenProvider: TokenProvider
    
    func connect(userId: String, persona: Persona) async throws -> VoiceSession {
        let token = try await tokenProvider.getToken(userId: userId, persona: persona)
        try await room.connect(url: Config.livekitURL, token: token)
        return VoiceSession(room: room)
    }
}
```

**UI Components**:
- `FerniAvatarView` - Animated avatar with voice pulse (port from web)
- `VoiceWaveformView` - Audio visualization
- `TranscriptView` - Optional live transcription
- `ConnectionStateView` - Status indicator

**Data Flow**:
```
User Tap → VoiceSessionService.connect() → LiveKit Room
         → Audio Stream → Avatar Animation
         → Transcript Events → TranscriptView
```

#### 1.2 Permission Framework
**What**: Unified permission request system with educational onboarding
**Why**: Trust-building through transparency

```swift
// Domain Layer: Permission Types
enum FerniPermission: CaseIterable {
    case health(HealthPermissionScope)
    case calendar
    case reminders
    case location(LocationPermissionScope)
    case notifications
    case contacts
    case siri
    case homeKit
    
    var explanation: LocalizedStringKey { ... }
    var benefit: LocalizedStringKey { ... }
    var icon: Image { ... }
}

// Application Layer: Permission Manager
@MainActor
final class PermissionManager: ObservableObject {
    @Published private(set) var grantedPermissions: Set<FerniPermission> = []
    
    func request(_ permission: FerniPermission) async -> PermissionResult {
        // Show educational sheet first
        // Then request system permission
        // Store result
    }
    
    func checkStatus(_ permission: FerniPermission) -> PermissionStatus
}
```

**UI Flow**:
```
┌─────────────────────────────────────────┐
│         "What Ferni Could Know"         │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 💚 Your Body                    │    │
│  │                                 │    │
│  │ With health access, I could    │    │
│  │ notice when you're stressed    │    │
│  │ before you do.                 │    │
│  │                                 │    │
│  │ [See How]  [Enable]  [Skip]   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📅 Your Calendar               │    │
│  │                                 │    │
│  │ With calendar access, I could  │    │
│  │ help you prepare for what's    │    │
│  │ coming.                        │    │
│  │                                 │    │
│  │ [See How]  [Enable]  [Skip]   │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

#### 1.3 Secure Data Sync
**What**: End-to-end encrypted sync of iOS data to Ferni backend
**Why**: Enable AI processing while maintaining privacy

```swift
// Infrastructure Layer: Secure Sync
final class SecureSyncService {
    private let encryptionKey: SymmetricKey
    private let apiClient: FerniAPIClient
    
    func sync<T: Encodable>(_ data: T, type: SyncDataType) async throws {
        let encrypted = try encrypt(data)
        try await apiClient.post("/sync/\(type.rawValue)", body: encrypted)
    }
    
    private func encrypt<T: Encodable>(_ data: T) throws -> Data {
        let plaintext = try JSONEncoder().encode(data)
        let sealedBox = try AES.GCM.seal(plaintext, using: encryptionKey)
        return sealedBox.combined!
    }
}
```

### Testing (Phase 1)

#### Unit Tests
```swift
final class VoiceSessionTests: XCTestCase {
    func testConnectSuccessfully() async throws {
        let sut = MockVoiceSession()
        let session = try await sut.connect(userId: "test", persona: .ferni)
        XCTAssertEqual(sut.state, .connected)
    }
    
    func testReconnectAfterNetworkLoss() async throws { ... }
    func testGracefulDisconnect() async throws { ... }
}

final class PermissionManagerTests: XCTestCase {
    func testRequestHealthPermission() async { ... }
    func testDeniedPermissionHandling() async { ... }
    func testPermissionPersistence() { ... }
}
```

#### Integration Tests
```swift
final class VoiceIntegrationTests: XCTestCase {
    func testFullVoiceConversationFlow() async throws {
        // Connect → Speak → Receive Response → Disconnect
    }
    
    func testVoiceSessionWithHealthContext() async throws {
        // Grant health → Connect → Verify context injected
    }
}
```

#### UI Tests
```swift
final class VoiceUITests: XCTestCase {
    func testAvatarAnimationDuringSpeaking() {
        // Assert avatar pulses when audio detected
    }
    
    func testPermissionOnboardingFlow() {
        // Navigate through all permission screens
    }
}
```

### Audit Criteria (Phase 1)

| Criterion | Pass Condition |
|-----------|----------------|
| Voice Latency | < 500ms from tap to first audio |
| Connection Reliability | > 99% successful connections |
| Permission UX | Users understand benefit before granting |
| Architecture Compliance | No layer violations in dependency graph |
| Brand Alignment | Avatar feels warm, not robotic |
| Accessibility | VoiceOver fully supported |
| Memory Usage | < 100MB during active conversation |
| Battery Impact | < 5% battery per 10 min conversation |

---

## Phase 2: Health Intelligence (Weeks 5-8)

### Objective
Integrate HealthKit to give Ferni awareness of user's physical state.

### Capabilities

#### 2.1 Health Data Ingestion
**What**: Read health metrics from HealthKit
**Why**: Body state informs emotional state

```swift
// Domain Layer: Health Types
struct HealthSnapshot {
    let heartRate: HeartRateReading?
    let hrv: HRVReading?
    let sleepAnalysis: SleepAnalysis?
    let activitySummary: ActivitySummary?
    let mindfulMinutes: Int?
    let timestamp: Date
}

struct SleepAnalysis {
    let totalDuration: TimeInterval
    let deepSleep: TimeInterval
    let remSleep: TimeInterval
    let awakenings: Int
    let sleepScore: Double // 0-100
    let trend: Trend // improving, declining, stable
}

// Infrastructure Layer: HealthKit Repository
final class HealthKitRepository {
    private let healthStore = HKHealthStore()
    
    func requestAuthorization(for types: Set<HKSampleType>) async throws {
        try await healthStore.requestAuthorization(toShare: [], read: types)
    }
    
    func observeHeartRate() -> AsyncStream<HeartRateReading> {
        AsyncStream { continuation in
            let query = HKObserverQuery(sampleType: heartRateType, predicate: nil) { _, _, _ in
                Task {
                    let reading = await self.fetchLatestHeartRate()
                    continuation.yield(reading)
                }
            }
            healthStore.execute(query)
        }
    }
    
    func fetchSleepAnalysis(for date: Date) async throws -> SleepAnalysis {
        // Query sleep samples, categorize, calculate score
    }
    
    func fetchHRV(last hours: Int) async throws -> [HRVReading] {
        // HRV is key stress indicator
    }
}
```

#### 2.2 Health Context Builder
**What**: Transform raw health data into conversational context
**Why**: AI needs semantic meaning, not raw numbers

```swift
// Domain Layer: Health Context
struct HealthContext {
    let stressLevel: StressLevel // calm, mild, elevated, high
    let energyLevel: EnergyLevel // low, moderate, high
    let sleepQuality: SleepQuality // poor, fair, good, excellent
    let activityStatus: ActivityStatus // sedentary, light, active, very_active
    let insights: [HealthInsight]
    
    var conversationalContext: String {
        """
        BODY STATE:
        - Stress: \(stressLevel.description) (based on HRV trends)
        - Energy: \(energyLevel.description) (based on activity + sleep)
        - Sleep: \(sleepQuality.description) (\(sleepHours) hours last night)
        
        NOTABLE PATTERNS:
        \(insights.map { "- \($0.description)" }.joined(separator: "\n"))
        
        SENSITIVITY NOTES:
        \(sensitivityNotes)
        """
    }
}

enum HealthInsight {
    case sleepDebtAccumulating(days: Int, avgDeficit: TimeInterval)
    case hrvDeclineDetected(percentDrop: Double, overDays: Int)
    case activityDropOff(fromAvg: Int, toRecent: Int)
    case consistentSleepSchedule(bedtimeVariance: TimeInterval)
    case morningHRVSpike(possibleCause: String?)
}
```

#### 2.3 Proactive Health Triggers
**What**: Ferni initiates based on health signals
**Why**: "Better than human" - notice before being told

```swift
// Domain Layer: Proactive Trigger System
final class HealthTriggerService {
    private let healthRepo: HealthKitRepository
    private let notificationService: NotificationService
    
    func startMonitoring() {
        // HRV Spike Detection
        healthRepo.observeHRV()
            .filter { $0.isSignificantDrop }
            .debounce(for: .minutes(5), scheduler: DispatchQueue.main)
            .sink { [weak self] hrv in
                self?.triggerStressCheckIn(hrv: hrv)
            }
        
        // Sleep Debt Accumulation
        // Activity Drop-off
        // etc.
    }
    
    private func triggerStressCheckIn(hrv: HRVReading) {
        let notification = ProactiveNotification(
            type: .stressDetected,
            message: "I noticed your stress levels might be elevated. Want to talk?",
            action: .startConversation(topic: .stressSupport)
        )
        notificationService.scheduleProactive(notification)
    }
}
```

**Proactive Triggers**:

| Trigger | Condition | Ferni Action |
|---------|-----------|--------------|
| Stress Spike | HRV drops >20% from baseline | "I noticed you might be stressed. Want to talk?" |
| Sleep Debt | <6h average over 3+ days | "You've been running on fumes. What's keeping you up?" |
| Activity Drop | Steps down >50% from average | "You've been still lately. Everything okay?" |
| Morning HRV Spike | Unusual morning HRV pattern | "Rough night? I'm here if you need to process." |
| Cycle Awareness | PMS phase detected | Add context to mood discussions |

#### 2.4 AI Integration

**Context Injection**:
```typescript
// Backend: health-context-builder.ts
export async function buildHealthContext(userId: string): Promise<HealthContext> {
  const healthData = await getHealthData(userId);
  
  return {
    systemPrompt: `
      USER'S BODY STATE (from their wearables - they gave permission):
      
      Sleep: ${healthData.sleepQuality} (${healthData.sleepHours}h last night)
      - Pattern: ${healthData.sleepTrend}
      - ${healthData.sleepInsight}
      
      Stress Indicators:
      - HRV: ${healthData.hrvStatus} (${healthData.hrvTrend})
      - Resting HR: ${healthData.restingHR} bpm
      
      Activity: ${healthData.activityLevel}
      - ${healthData.activityInsight}
      
      GUIDANCE FOR CONVERSATION:
      ${healthData.conversationalGuidance}
      
      IMPORTANT: Never say "your wearable shows" or mention data directly.
      Instead, use phrases like "I sense you might be..." or "Something tells me..."
    `,
    proactiveSuggestions: healthData.suggestions
  };
}
```

**Semantic Meaning Extraction**:
```typescript
// AI reasoning about health data
const healthSemantics = {
  hrvDrop: {
    meaning: "elevated stress or insufficient recovery",
    responseGuidance: "approach gently, validate feelings, offer grounding",
    topicsToAvoid: "demanding tasks, complex decisions",
  },
  sleepDebt: {
    meaning: "cognitive impairment, emotional volatility likely",
    responseGuidance: "shorter sentences, more empathy, practical advice only",
    topicsToAvoid: "deep philosophical discussions",
  },
  highActivity: {
    meaning: "possibly using exercise to cope OR feeling energetic",
    responseGuidance: "explore motivation - healthy or escape?",
    topicsToAvoid: "none",
  }
};
```

### Testing (Phase 2)

#### Unit Tests
```swift
final class HealthContextBuilderTests: XCTestCase {
    func testLowHRVMapsToHighStress() {
        let hrv = HRVReading(value: 25, timestamp: Date()) // Low HRV
        let context = HealthContextBuilder.build(hrv: hrv)
        XCTAssertEqual(context.stressLevel, .high)
    }
    
    func testSleepDebtCalculation() {
        let sleepData = [4.5, 5.0, 5.5, 4.0] // Hours over 4 nights
        let analysis = SleepAnalyzer.analyze(sleepData)
        XCTAssertEqual(analysis.debtLevel, .significant)
    }
}
```

#### Integration Tests
```swift
final class HealthIntegrationTests: XCTestCase {
    func testHealthContextInjectedIntoConversation() async throws {
        // 1. Mock HealthKit with stress indicators
        // 2. Start conversation
        // 3. Verify Ferni's response acknowledges stress
    }
    
    func testProactiveTriggerFires() async throws {
        // 1. Simulate HRV drop
        // 2. Verify notification scheduled
        // 3. Verify notification content is warm
    }
}
```

### Audit Criteria (Phase 2)

| Criterion | Pass Condition |
|-----------|----------------|
| Health Data Accuracy | 100% match with Health app |
| Privacy Compliance | No raw health data leaves device unencrypted |
| Proactive Relevance | >80% of triggered check-ins rated helpful |
| Response Appropriateness | Ferni's tone matches health context |
| False Positive Rate | <10% proactive triggers are unwanted |
| User Control | Can disable any proactive trigger type |
| Brand Voice | Health insights feel caring, not clinical |

---

## Phase 3: Calendar & Context (Weeks 9-12)

### Objective
Give Ferni awareness of user's schedule, commitments, and life events.

### Capabilities

#### 3.1 Calendar Intelligence
**What**: Read and understand calendar events
**Why**: Know what's coming without being told

```swift
// Domain Layer: Calendar Types
struct CalendarContext {
    let today: [CalendarEvent]
    let upcoming: [CalendarEvent] // Next 7 days
    let density: CalendarDensity // light, moderate, packed
    let stressfulEvents: [CalendarEvent] // Detected high-stakes
    let opportunities: [ConversationOpportunity]
}

struct CalendarEvent {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let location: String?
    let attendees: [String]
    let isAllDay: Bool
    let calendar: CalendarSource
    let semanticType: EventSemanticType
}

enum EventSemanticType {
    case meeting(importance: Importance)
    case deadline
    case personal(type: PersonalEventType)
    case travel
    case health
    case social
    case unknown
}

// Infrastructure Layer: EventKit Repository
final class CalendarRepository {
    private let eventStore = EKEventStore()
    
    func fetchEvents(from: Date, to: Date) async throws -> [CalendarEvent] {
        let predicate = eventStore.predicateForEvents(
            withStart: from,
            end: to,
            calendars: nil
        )
        return eventStore.events(matching: predicate)
            .map { CalendarEvent(from: $0) }
    }
    
    func classifyEvent(_ event: EKEvent) -> EventSemanticType {
        // NLP classification of event title + context
        // "Doctor's appointment" → .health
        // "Q3 Board Review" → .meeting(.high)
        // "Sarah's Birthday" → .personal(.birthday)
    }
}
```

#### 3.2 Semantic Event Understanding
**What**: Extract meaning from calendar entries
**Why**: "Meeting" vs "Board Presentation" require different support

```swift
// Domain Layer: Event Semantics
struct EventSemantics {
    let originalTitle: String
    let inferredType: EventSemanticType
    let stressLevel: StressLevel // estimated
    let preparationNeeded: PreparationLevel
    let emotionalValence: EmotionalValence // positive, neutral, negative, anxious
    let relatedPeople: [Person]
    let suggestedTopics: [ConversationTopic]
}

final class EventSemanticAnalyzer {
    private let nlpModel: NLModel
    private let contactsRepo: ContactsRepository
    
    func analyze(_ event: CalendarEvent) -> EventSemantics {
        // 1. NLP classification of title
        let classification = nlpModel.classify(event.title)
        
        // 2. Context from attendees
        let people = event.attendees.compactMap { contactsRepo.find($0) }
        
        // 3. Historical patterns
        let history = getEventHistory(similar: event)
        
        // 4. Combine into semantics
        return EventSemantics(
            originalTitle: event.title,
            inferredType: classification.type,
            stressLevel: estimateStress(classification, history),
            preparationNeeded: estimatePrep(classification),
            emotionalValence: inferValence(classification, people),
            relatedPeople: people,
            suggestedTopics: generateTopics(event, classification)
        )
    }
}
```

**Event Classification Examples**:

| Event Title | Inferred Type | Stress Est. | Ferni Might Say |
|-------------|---------------|-------------|-----------------|
| "Q3 Board Review" | meeting(high) | high | "Big presentation tomorrow. How are you feeling about it?" |
| "Coffee with Sarah" | social | low | "Seeing Sarah today! How's that friendship going?" |
| "Doctor - Annual" | health | moderate | "Doctor's appointment tomorrow. Anything on your mind about it?" |
| "Flight to NYC" | travel | moderate | "You're traveling tomorrow. Need help preparing?" |
| "Mom's Birthday" | personal(birthday) | low | "Your mom's birthday! Want to plan something special?" |

#### 3.3 Proactive Calendar Triggers
**What**: Ferni reaches out based on calendar
**Why**: Preparation and follow-up are superhuman

```swift
// Domain Layer: Calendar Triggers
final class CalendarTriggerService {
    func evaluateTriggers(for context: CalendarContext) -> [ProactiveTrigger] {
        var triggers: [ProactiveTrigger] = []
        
        // Pre-event preparation
        for event in context.upcoming where event.semanticType.isHighStakes {
            let prepTime = event.startDate.addingTimeInterval(-hours(12))
            triggers.append(.preparation(event: event, triggerAt: prepTime))
        }
        
        // Post-event follow-up
        for event in context.today where event.endDate < Date() {
            if event.semanticType.warrantsFollowUp {
                let followUpTime = event.endDate.addingTimeInterval(hours(2))
                triggers.append(.followUp(event: event, triggerAt: followUpTime))
            }
        }
        
        // Busy week warning
        if context.density == .packed {
            triggers.append(.busyWeekAwareness(eventCount: context.upcoming.count))
        }
        
        return triggers
    }
}
```

**Trigger Types**:

| Trigger | Timing | Message Template |
|---------|--------|------------------|
| Preparation | 12h before high-stakes | "You have [event] tomorrow. Want to talk through it?" |
| Follow-up | 2h after important | "How did [event] go?" |
| Busy Week | Monday morning | "This week looks packed. Let's make sure you have breathing room." |
| Travel Prep | Day before trip | "You're leaving tomorrow. Anything we should sort out first?" |
| Birthday Reminder | 3 days before | "[Person]'s birthday is Friday. Want to plan something?" |

#### 3.4 Reminder Integration
**What**: Create and track reminders from conversations
**Why**: Commitments made to Ferni should be tracked

```swift
// Domain Layer: Commitment Tracking
struct Commitment {
    let id: String
    let description: String
    let createdAt: Date
    let dueDate: Date?
    let context: String // What conversation led to this
    let status: CommitmentStatus
}

final class CommitmentService {
    private let reminderStore = EKEventStore()
    
    func createCommitment(from conversation: String, due: Date?) async throws -> Commitment {
        // 1. Create in Ferni's memory
        let commitment = Commitment(
            description: conversation,
            createdAt: Date(),
            dueDate: due
        )
        
        // 2. Optionally create iOS Reminder
        if let due = due {
            let reminder = EKReminder(eventStore: reminderStore)
            reminder.title = commitment.description
            reminder.dueDateComponents = Calendar.current.dateComponents(from: due)
            reminder.notes = "Created during Ferni conversation"
            try reminderStore.save(reminder, commit: true)
        }
        
        return commitment
    }
    
    func trackCommitments() -> [Commitment] {
        // Return all active commitments for context
    }
}
```

### Testing (Phase 3)

#### Unit Tests
```swift
final class EventSemanticTests: XCTestCase {
    func testBoardMeetingClassifiedAsHighStakes() {
        let event = CalendarEvent(title: "Q3 Board Review", ...)
        let semantics = analyzer.analyze(event)
        XCTAssertEqual(semantics.inferredType, .meeting(.high))
        XCTAssertEqual(semantics.stressLevel, .high)
    }
    
    func testBirthdayClassifiedAsSocial() { ... }
    func testDoctorAppointmentClassifiedAsHealth() { ... }
}

final class CalendarTriggerTests: XCTestCase {
    func testPreparationTriggerForHighStakesEvent() { ... }
    func testFollowUpTriggerAfterImportantMeeting() { ... }
    func testBusyWeekWarning() { ... }
}
```

### Audit Criteria (Phase 3)

| Criterion | Pass Condition |
|-----------|----------------|
| Event Classification | >90% accuracy on test set |
| Proactive Relevance | >85% of triggers rated helpful |
| False Positive Rate | <15% unwanted notifications |
| Privacy | Event titles never sent to third parties |
| Sync Latency | Calendar changes reflected <5 min |
| Brand Voice | Preparation feels supportive, not nagging |

---

## Phase 4: Location & Ambient (Weeks 13-16)

### Objective
Enable location-aware features and smart home integration.

### Capabilities

#### 4.1 Significant Location Monitoring
**What**: Detect meaningful locations without constant tracking
**Why**: Context-aware support without battery drain

```swift
// Domain Layer: Location Context
struct LocationContext {
    let currentLocation: SemanticLocation?
    let recentTransitions: [LocationTransition]
    let homeStatus: HomeStatus // home, away, returning
    let workStatus: WorkStatus // atWork, commuting, remote
}

enum SemanticLocation {
    case home
    case work
    case gym
    case commute(direction: CommuteDirection)
    case travel(destination: String?)
    case unknown(coordinates: CLLocationCoordinate2D)
}

// Infrastructure Layer: Location Service
final class LocationService: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var significantLocations: [String: CLCircularRegion] = [:]
    
    func startMonitoring() {
        manager.startMonitoringSignificantLocationChanges()
        
        // Monitor known significant places
        for (name, region) in significantLocations {
            manager.startMonitoring(for: region)
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        let location = SemanticLocation(from: region)
        NotificationCenter.default.post(
            name: .locationDidChange,
            object: LocationTransition(to: location)
        )
    }
    
    func classifyLocation(_ coordinate: CLLocationCoordinate2D) -> SemanticLocation {
        // Check against known locations
        // Use reverse geocoding for context
        // Apply ML classification
    }
}
```

#### 4.2 Geofenced Habits
**What**: Trigger habits based on location
**Why**: "You're home now - ready for your evening routine?"

```swift
// Domain Layer: Location-Based Triggers
final class LocationTriggerService {
    func evaluate(_ transition: LocationTransition) -> [ProactiveTrigger] {
        var triggers: [ProactiveTrigger] = []
        
        switch transition.to {
        case .home:
            if transition.timeOfDay == .evening {
                triggers.append(.habitReminder(
                    habit: "Evening wind-down",
                    message: "You're home. Ready for your evening routine?"
                ))
            }
            
        case .gym:
            triggers.append(.encouragement(
                message: "Nice! You made it to the gym. That's dedication."
            ))
            
        case .work:
            if transition.timeOfDay == .morning {
                triggers.append(.dailyIntention(
                    message: "You're at work. What's your top priority today?"
                ))
            }
            
        case .commute(let direction):
            if direction == .toWork {
                triggers.append(.commuteCompanion(
                    message: "Morning commute. Want to talk through your day?"
                ))
            }
        }
        
        return triggers
    }
}
```

#### 4.3 HomeKit Integration
**What**: Control smart home based on Ferni context
**Why**: Ambient support through environment

```swift
// Domain Layer: Home Automation
protocol HomeAutomationService {
    func setScene(_ scene: HomeScene) async throws
    func adjustLighting(_ config: LightingConfig) async throws
    func setThermostat(_ temp: Double) async throws
}

enum HomeScene {
    case goodMorning
    case focusTime
    case relaxation
    case windDown
    case goodNight
    
    var actions: [HomeAction] {
        switch self {
        case .windDown:
            return [
                .setLighting(brightness: 0.3, warmth: 0.8),
                .setThermostat(68),
                .playAmbientSound(.rain)
            ]
        // ...
        }
    }
}

// Infrastructure Layer: HomeKit
final class HomeKitService: HomeAutomationService {
    private let homeManager = HMHomeManager()
    
    func setScene(_ scene: HomeScene) async throws {
        guard let home = homeManager.primaryHome else { return }
        
        for action in scene.actions {
            try await execute(action, in: home)
        }
    }
}
```

**Ferni-Triggered Scenes**:

| Conversation Context | Scene Triggered |
|---------------------|-----------------|
| Evening wind-down discussion | Dim lights, warm color temperature |
| Stress support conversation | Calming lights, lower thermostat |
| Morning motivation | Bright, energizing lights |
| Bedtime routine | Gradual dim to off |

#### 4.4 Travel Awareness
**What**: Detect travel and adapt accordingly
**Why**: Different support needs when traveling

```swift
// Domain Layer: Travel Detection
struct TravelContext {
    let isCurrentlyTraveling: Bool
    let travelType: TravelType? // business, personal, unknown
    let destination: String?
    let timezone: TimeZone
    let dayOfTrip: Int
    let returnDate: Date?
}

final class TravelDetectionService {
    func detectTravel() -> TravelContext? {
        // Combine signals:
        // 1. Calendar events (flights, hotel bookings)
        // 2. Location (far from home)
        // 3. Timezone change
        // 4. User explicitly mentioned travel
    }
    
    func adjustForTravel(_ context: TravelContext) -> ConversationAdjustments {
        return ConversationAdjustments(
            timezoneAware: true,
            topicsToSuggest: [.jetlagTips, .travelCheckin],
            checkInFrequency: .reduced // Don't overwhelm during travel
        )
    }
}
```

### Testing (Phase 4)

#### Unit Tests
```swift
final class LocationClassificationTests: XCTestCase {
    func testHomeLocationDetection() { ... }
    func testCommuteDetection() { ... }
    func testGymVisitRecognition() { ... }
}

final class GeofenceTests: XCTestCase {
    func testEveningHomeArrivalTrigger() { ... }
    func testGymEncouragementTrigger() { ... }
}
```

#### Integration Tests
```swift
final class HomeKitIntegrationTests: XCTestCase {
    func testWindDownSceneActivation() async throws { ... }
    func testSceneRollbackOnError() async throws { ... }
}
```

### Audit Criteria (Phase 4)

| Criterion | Pass Condition |
|-----------|----------------|
| Battery Impact | <2% battery per day for location |
| Location Accuracy | >95% correct significant location detection |
| Privacy | No location data sent to cloud by default |
| HomeKit Reliability | >99% successful scene activations |
| User Control | All location triggers can be disabled |
| Brand Alignment | Location awareness feels helpful, not creepy |

---

## Phase 5: Watch & Wearables (Weeks 17-20)

### Objective
Extend Ferni to Apple Watch for intimate, always-there support.

### Capabilities

#### 5.1 Watch App Core
**What**: Standalone watch app with voice and haptics
**Why**: Most intimate, always-present form factor

```swift
// WatchOS App Structure
@main
struct FerniWatchApp: App {
    var body: some Scene {
        WindowGroup {
            FerniWatchView()
        }
    }
}

struct FerniWatchView: View {
    @StateObject private var voiceSession = WatchVoiceSession()
    @StateObject private var healthMonitor = WatchHealthMonitor()
    
    var body: some View {
        ZStack {
            // Ambient avatar background
            FerniAvatarWatch()
            
            VStack {
                // Quick check-in button
                QuickCheckInButton(onTap: startConversation)
                
                // Current mood/energy display
                MoodRingView(mood: healthMonitor.currentMood)
                
                // Streak/commitment display
                CommitmentBadge()
            }
        }
    }
}
```

#### 5.2 Haptic Check-ins
**What**: Gentle haptic taps for quick mood check-ins
**Why**: Intimate, non-intrusive touchpoint

```swift
// Domain Layer: Haptic Communication
enum FerniHaptic {
    case gentleCheckIn
    case encouragement
    case celebration
    case grounding
    
    func play() {
        switch self {
        case .gentleCheckIn:
            WKInterfaceDevice.current().play(.notification)
        case .encouragement:
            WKInterfaceDevice.current().play(.success)
        case .celebration:
            // Custom haptic pattern
            playCustomPattern([.start, .stop, .start, .stop, .start])
        case .grounding:
            // Slow, calming pattern
            playCustomPattern([.start, .pause(0.5), .stop])
        }
    }
}

// Quick Check-in Flow
final class WatchCheckInService {
    func initiateCheckIn() {
        // 1. Play gentle haptic
        FerniHaptic.gentleCheckIn.play()
        
        // 2. Show simple UI
        // "How's your energy right now?"
        // [1] [2] [3] [4] [5]
        
        // 3. Record response
        // 4. Optional: "Want to talk about it?"
    }
}
```

**Check-in Types**:

| Check-in | Trigger | UI | Duration |
|----------|---------|-----|----------|
| Energy | 3x daily at user's preferred times | 1-5 scale | 2 seconds |
| Mood | After significant events | Emoji selection | 3 seconds |
| Quick Note | On demand | Voice or scribble | 10 seconds |
| Gratitude | Evening | "One good thing today" | 15 seconds |

#### 5.3 Complications
**What**: Watch face complications for at-a-glance Ferni presence
**Why**: Constant ambient presence without active engagement

```swift
// Complication Types
struct FerniComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: "FerniComplication",
            provider: FerniComplicationProvider()
        ) { entry in
            FerniComplicationView(entry: entry)
        }
        .supportedFamilies([
            .circularSmall,
            .graphicCircular,
            .graphicCorner,
            .graphicRectangular
        ])
    }
}

struct FerniComplicationEntry: TimelineEntry {
    let date: Date
    let streakCount: Int
    let nextCheckIn: Date?
    let currentMood: Mood?
    let motivationalMessage: String?
}
```

**Complication Variants**:

| Family | Display |
|--------|---------|
| Circular Small | Ferni avatar + streak number |
| Graphic Circular | Mood ring with avatar center |
| Graphic Corner | "Day 14" streak badge |
| Graphic Rectangular | Today's intention + avatar |

#### 5.4 Real-time Health Monitoring
**What**: Use watch sensors for immediate health awareness
**Why**: Real-time stress detection

```swift
// Watch-specific Health Monitoring
final class WatchHealthMonitor: ObservableObject {
    private let healthStore = HKHealthStore()
    private var heartRateQuery: HKAnchoredObjectQuery?
    
    @Published var currentHeartRate: Double?
    @Published var isStressElevated: Bool = false
    
    func startRealTimeMonitoring() {
        // Heart rate observation
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
        
        heartRateQuery = HKAnchoredObjectQuery(
            type: heartRateType,
            predicate: nil,
            anchor: nil,
            limit: HKObjectQueryNoLimit
        ) { [weak self] query, samples, deletedObjects, anchor, error in
            self?.processHeartRateSamples(samples)
        }
        
        heartRateQuery?.updateHandler = { [weak self] query, samples, deleted, anchor, error in
            self?.processHeartRateSamples(samples)
        }
        
        healthStore.execute(heartRateQuery!)
    }
    
    private func processHeartRateSamples(_ samples: [HKSample]?) {
        guard let sample = samples?.last as? HKQuantitySample else { return }
        
        let heartRate = sample.quantity.doubleValue(for: .count().unitDivided(by: .minute()))
        
        DispatchQueue.main.async {
            self.currentHeartRate = heartRate
            self.evaluateStress(heartRate: heartRate)
        }
    }
    
    private func evaluateStress(heartRate: Double) {
        // Compare to baseline, detect elevation
        let baseline = getUserBaseline()
        isStressElevated = heartRate > baseline * 1.3
        
        if isStressElevated {
            triggerStressSupport()
        }
    }
    
    private func triggerStressSupport() {
        FerniHaptic.grounding.play()
        // Show grounding exercise option
    }
}
```

### Testing (Phase 5)

#### Unit Tests
```swift
final class WatchHealthMonitorTests: XCTestCase {
    func testStressDetectionFromElevatedHR() { ... }
    func testBaselineCalculation() { ... }
}

final class ComplicationTests: XCTestCase {
    func testStreakDisplay() { ... }
    func testMoodRingRendering() { ... }
}
```

#### Integration Tests
```swift
final class WatchPhoneIntegrationTests: XCTestCase {
    func testCheckInSyncsToPhone() async throws { ... }
    func testConversationHandoffFromWatch() async throws { ... }
}
```

### Audit Criteria (Phase 5)

| Criterion | Pass Condition |
|-----------|----------------|
| Battery Impact | <10% watch battery per day |
| Complication Accuracy | Real-time data within 5 min |
| Haptic Appropriateness | >90% of haptics well-received |
| Check-in Completion | >70% of check-ins answered |
| Voice Quality | Clear audio in 10sec bursts |
| Sync Reliability | <1% data loss between devices |

---

## Phase 6: Predictive Intelligence (Weeks 21-24)

### Objective
Build AI systems that predict user needs before they arise.

### Capabilities

#### 6.1 Pattern Recognition Engine
**What**: Identify patterns across all data sources
**Why**: "Better than human" means seeing what humans miss

```typescript
// Backend: pattern-recognition.service.ts

interface UserPattern {
  type: PatternType;
  confidence: number;
  evidence: PatternEvidence[];
  actionableInsight: string;
  suggestedIntervention?: Intervention;
}

enum PatternType {
  // Temporal patterns
  SUNDAY_SCARIES = 'sunday_scaries',
  MONDAY_MOTIVATION_DIP = 'monday_motivation_dip',
  FRIDAY_ENERGY_SURGE = 'friday_energy_surge',
  
  // Behavioral patterns
  STRESS_EATING = 'stress_eating',
  EXERCISE_MOOD_CORRELATION = 'exercise_mood_correlation',
  SLEEP_ANXIETY_CYCLE = 'sleep_anxiety_cycle',
  
  // Social patterns
  POST_FAMILY_CALL_MOOD = 'post_family_call_mood',
  WORK_MEETING_RECOVERY = 'work_meeting_recovery',
  
  // Seasonal patterns
  SEASONAL_MOOD_SHIFT = 'seasonal_mood_shift',
  ANNIVERSARY_REACTIONS = 'anniversary_reactions',
}

class PatternRecognitionService {
  async analyzePatterns(userId: string): Promise<UserPattern[]> {
    const data = await this.aggregateUserData(userId);
    const patterns: UserPattern[] = [];
    
    // Temporal analysis
    patterns.push(...this.detectTemporalPatterns(data));
    
    // Correlation analysis
    patterns.push(...this.detectCorrelations(data));
    
    // Anomaly detection
    patterns.push(...this.detectAnomalies(data));
    
    // Predictive modeling
    patterns.push(...this.predictUpcoming(data));
    
    return patterns.filter(p => p.confidence > 0.7);
  }
  
  private detectTemporalPatterns(data: UserData): UserPattern[] {
    // Example: Sunday Scaries Detection
    const sundayMoods = data.moodCheckins
      .filter(m => m.timestamp.getDay() === 0)
      .filter(m => m.timestamp.getHours() >= 16); // Sunday evening
    
    const avgSundayMood = average(sundayMoods.map(m => m.value));
    const avgWeekdayMood = average(data.moodCheckins.filter(m => 
      m.timestamp.getDay() >= 1 && m.timestamp.getDay() <= 5
    ).map(m => m.value));
    
    if (avgSundayMood < avgWeekdayMood * 0.8) {
      return [{
        type: PatternType.SUNDAY_SCARIES,
        confidence: 0.85,
        evidence: [{ type: 'mood_data', samples: sundayMoods.length }],
        actionableInsight: "Sunday evenings tend to be tough. Let's build a ritual.",
        suggestedIntervention: {
          type: 'proactive_checkin',
          timing: 'sunday_4pm',
          message: "Sunday evening coming up. Want to talk through the week ahead?"
        }
      }];
    }
    return [];
  }
}
```

#### 6.2 Predictive Conversation Starters
**What**: AI generates conversation starters based on predicted needs
**Why**: Proactive support feels magical

```typescript
// Backend: predictive-conversation.service.ts

interface PredictedConversationNeed {
  topic: string;
  urgency: 'low' | 'medium' | 'high';
  confidence: number;
  reasoning: string;
  suggestedOpener: string;
  bestTime: Date;
}

class PredictiveConversationService {
  async predictNeeds(userId: string): Promise<PredictedConversationNeed[]> {
    const context = await this.buildFullContext(userId);
    const needs: PredictedConversationNeed[] = [];
    
    // Calendar-based predictions
    if (context.calendar.hasHighStakesEventTomorrow) {
      needs.push({
        topic: 'preparation',
        urgency: 'high',
        confidence: 0.9,
        reasoning: 'Board presentation tomorrow',
        suggestedOpener: "Big day tomorrow. How are you feeling about the presentation?",
        bestTime: this.calculateBestTime(context, 'evening_before')
      });
    }
    
    // Pattern-based predictions
    if (context.patterns.includes(PatternType.SUNDAY_SCARIES)) {
      const nextSunday = this.getNextSunday();
      needs.push({
        topic: 'weekly_transition',
        urgency: 'medium',
        confidence: 0.8,
        reasoning: 'Historical Sunday anxiety pattern',
        suggestedOpener: "Sunday's here. Want to talk through what's on your mind about the week?",
        bestTime: new Date(nextSunday.setHours(16, 0, 0, 0))
      });
    }
    
    // Health-based predictions
    if (context.health.sleepDebtAccumulating) {
      needs.push({
        topic: 'sleep_support',
        urgency: 'medium',
        confidence: 0.85,
        reasoning: '3 nights of <6 hours sleep',
        suggestedOpener: "You've been burning the candle. What's keeping you up?",
        bestTime: this.calculateBestTime(context, 'evening')
      });
    }
    
    // Anniversary/significant date predictions
    const upcomingSignificant = await this.getSignificantDates(userId);
    for (const date of upcomingSignificant) {
      needs.push({
        topic: 'significant_date',
        urgency: date.emotionalWeight > 0.7 ? 'high' : 'medium',
        confidence: 0.95,
        reasoning: `${date.description} in ${date.daysUntil} days`,
        suggestedOpener: this.generateDateOpener(date),
        bestTime: new Date(date.date.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 days before
      });
    }
    
    return needs;
  }
}
```

#### 6.3 Semantic Reasoner
**What**: Deep understanding of user's life narrative
**Why**: Connect dots across conversations and data

```typescript
// Backend: semantic-reasoner.service.ts

interface LifeNarrative {
  currentChapter: string;
  activeThemes: Theme[];
  unresolved: UnresolvedThread[];
  growthAreas: GrowthArea[];
  relationships: RelationshipMap;
  values: ValueProfile;
  goals: Goal[];
}

class SemanticReasonerService {
  async buildNarrative(userId: string): Promise<LifeNarrative> {
    const conversations = await this.getConversationHistory(userId);
    const memories = await this.getMemories(userId);
    const contextData = await this.getContextData(userId);
    
    // LLM-powered narrative extraction
    const narrative = await this.llm.complete({
      systemPrompt: NARRATIVE_EXTRACTION_PROMPT,
      userContext: {
        conversations: this.summarizeConversations(conversations),
        memories: memories,
        healthTrends: contextData.health,
        calendarPatterns: contextData.calendar,
        locationPatterns: contextData.location
      }
    });
    
    return narrative;
  }
  
  async generateContextualResponse(
    userId: string,
    currentMessage: string,
    narrative: LifeNarrative
  ): Promise<ConversationContext> {
    // Identify what from the narrative is relevant NOW
    const relevantThemes = this.findRelevantThemes(currentMessage, narrative);
    const relevantHistory = this.findRelevantHistory(currentMessage, narrative);
    
    return {
      systemContext: `
        LIFE NARRATIVE CONTEXT:
        
        Current Chapter: ${narrative.currentChapter}
        Active Themes: ${relevantThemes.map(t => t.description).join(', ')}
        
        RELEVANT HISTORY:
        ${relevantHistory.map(h => `- ${h.summary}`).join('\n')}
        
        UNRESOLVED THREADS (mention if naturally relevant):
        ${narrative.unresolved.map(u => `- ${u.topic}: ${u.lastMentioned}`).join('\n')}
        
        GROWTH AREAS (celebrate progress, support struggles):
        ${narrative.growthAreas.map(g => `- ${g.area}: ${g.status}`).join('\n')}
        
        RELATIONSHIP CONTEXT:
        ${this.summarizeRelevantRelationships(currentMessage, narrative.relationships)}
      `,
      suggestedConnections: this.suggestNarrativeConnections(currentMessage, narrative)
    };
  }
}
```

#### 6.4 Anticipatory UI
**What**: UI that shows predicted needs before user asks
**Why**: Feel understood without having to explain

```swift
// iOS: Anticipatory Home Screen
struct FerniHomeView: View {
    @StateObject private var predictions = PredictionService()
    
    var body: some View {
        VStack {
            // Avatar with current state
            FerniAvatarView()
            
            // Predicted needs cards (swipeable)
            ScrollView(.horizontal) {
                HStack(spacing: 16) {
                    ForEach(predictions.current) { prediction in
                        PredictedNeedCard(prediction: prediction)
                    }
                }
            }
            
            // Quick actions based on predictions
            if let topPrediction = predictions.current.first {
                Button(topPrediction.suggestedAction) {
                    startConversation(with: topPrediction.topic)
                }
                .buttonStyle(FerniPrimaryButton())
            }
            
            // Always available
            Button("Just talk") {
                startConversation()
            }
            .buttonStyle(FerniSecondaryButton())
        }
    }
}

struct PredictedNeedCard: View {
    let prediction: PredictedNeed
    
    var body: some View {
        VStack(alignment: .leading) {
            Text(prediction.category)
                .font(.caption)
                .foregroundColor(.secondary)
            
            Text(prediction.suggestedOpener)
                .font(.body)
            
            HStack {
                Image(systemName: prediction.icon)
                Text(prediction.timing)
                    .font(.caption2)
            }
            .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 2)
    }
}
```

### Testing (Phase 6)

#### Unit Tests
```typescript
describe('PatternRecognitionService', () => {
  it('should detect Sunday Scaries pattern', async () => {
    const mockData = generateMockMoodData({
      sundayEveningMood: 3, // Low
      weekdayMood: 7 // Higher
    });
    
    const patterns = await service.analyzePatterns(mockData);
    
    expect(patterns).toContainEqual(
      expect.objectContaining({ type: PatternType.SUNDAY_SCARIES })
    );
  });
  
  it('should not false positive on one bad Sunday', async () => { ... });
});

describe('PredictiveConversationService', () => {
  it('should predict preparation need before high-stakes event', async () => { ... });
  it('should respect quiet hours for predictions', async () => { ... });
});
```

### Audit Criteria (Phase 6)

| Criterion | Pass Condition |
|-----------|----------------|
| Pattern Accuracy | >75% of detected patterns validated by user |
| Prediction Relevance | >80% of proactive suggestions rated helpful |
| False Positive Rate | <20% of predictions are unwanted |
| Narrative Coherence | User confirms narrative understanding |
| Response Latency | Predictions computed <100ms |
| Privacy | Predictions computed without external data sharing |

---

## Phase 7: Full Ecosystem (Weeks 25-28)

### Objective
Complete integration with remaining iOS capabilities.

### Capabilities

#### 7.1 Siri & Shortcuts Integration
**What**: "Hey Siri, talk to Ferni"
**Why**: Instant access, system-level integration

```swift
// App Intents Framework (iOS 16+)
struct TalkToFerniIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to Ferni"
    static var description = IntentDescription("Start a conversation with Ferni")
    
    @Parameter(title: "Topic")
    var topic: String?
    
    static var openAppWhenRun: Bool = true
    
    func perform() async throws -> some IntentResult {
        FerniApp.shared.startConversation(topic: topic)
        return .result()
    }
}

struct FerniShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TalkToFerniIntent(),
            phrases: [
                "Talk to \(.applicationName)",
                "Hey \(.applicationName)",
                "Start a conversation with \(.applicationName)"
            ],
            shortTitle: "Talk to Ferni",
            systemImageName: "person.wave.2"
        )
        
        AppShortcut(
            intent: CheckInWithFerniIntent(),
            phrases: [
                "Check in with \(.applicationName)",
                "How am I doing \(.applicationName)"
            ],
            shortTitle: "Quick Check-in",
            systemImageName: "heart.text.square"
        )
        
        AppShortcut(
            intent: MorningRitualIntent(),
            phrases: [
                "Start my morning with \(.applicationName)",
                "Morning ritual with \(.applicationName)"
            ],
            shortTitle: "Morning Ritual",
            systemImageName: "sunrise"
        )
    }
}
```

#### 7.2 Live Activities & Dynamic Island
**What**: Persistent presence during conversations
**Why**: Native, unobtrusive ambient awareness

```swift
// Live Activity for Active Conversation
struct FerniConversationAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var state: ConversationState
        var duration: TimeInterval
        var personaName: String
    }
    
    var sessionId: String
}

struct FerniLiveActivityView: View {
    let context: ActivityViewContext<FerniConversationAttributes>
    
    var body: some View {
        HStack {
            // Compact avatar
            Circle()
                .fill(Color.green)
                .frame(width: 40, height: 40)
                .overlay(
                    Image("ferni-avatar")
                        .resizable()
                        .scaledToFit()
                )
            
            VStack(alignment: .leading) {
                Text("Talking with \(context.state.personaName)")
                    .font(.caption)
                Text(formatDuration(context.state.duration))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Button(action: { /* End conversation */ }) {
                Image(systemName: "xmark.circle.fill")
            }
        }
        .padding()
    }
}

// Dynamic Island (Compact)
struct FerniDynamicIslandCompact: View {
    @Environment(\.isLuminanceReduced) var isLuminanceReduced
    
    var body: some View {
        HStack {
            Image("ferni-avatar-small")
                .frame(width: 24, height: 24)
            
            // Pulsing indicator during active listening
            Circle()
                .fill(Color.green)
                .frame(width: 8, height: 8)
                .opacity(isLuminanceReduced ? 0.5 : 1)
        }
    }
}
```

#### 7.3 CarPlay Integration
**What**: Full voice experience in the car
**Why**: Commute is prime conversation time

```swift
// CarPlay Scene
class FerniCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    var interfaceController: CPInterfaceController?
    
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        
        let template = createMainTemplate()
        interfaceController.setRootTemplate(template, animated: true)
    }
    
    private func createMainTemplate() -> CPTemplate {
        let voiceItem = CPListItem(
            text: "Talk to Ferni",
            detailText: "Start a conversation"
        )
        voiceItem.handler = { [weak self] _, completion in
            self?.startCarConversation()
            completion()
        }
        
        let checkInItem = CPListItem(
            text: "Quick Check-in",
            detailText: "How are you feeling?"
        )
        
        let section = CPListSection(items: [voiceItem, checkInItem])
        return CPListTemplate(title: "Ferni", sections: [section])
    }
    
    private func startCarConversation() {
        // Optimized for driving:
        // - Shorter responses
        // - No complex UI
        // - Voice-only interaction
        VoiceSessionManager.shared.startCarPlaySession()
    }
}
```

#### 7.4 Focus Mode Integration
**What**: Respect and adapt to user's Focus modes
**Why**: Don't interrupt during focus time

```swift
// Focus Mode Awareness
final class FocusModeService {
    func getCurrentFocusStatus() async -> FocusStatus {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        
        // Determine focus mode from notification settings
        // and adjust Ferni's behavior accordingly
    }
    
    func adjustBehavior(for focus: FocusStatus) -> BehaviorAdjustments {
        switch focus {
        case .doNotDisturb:
            return BehaviorAdjustments(
                proactiveNotifications: false,
                checkIns: .paused,
                urgentOnly: true
            )
        case .work:
            return BehaviorAdjustments(
                proactiveNotifications: .workRelatedOnly,
                checkIns: .reduced,
                urgentOnly: false
            )
        case .personal:
            return BehaviorAdjustments(
                proactiveNotifications: true,
                checkIns: .normal,
                urgentOnly: false
            )
        case .sleep:
            return BehaviorAdjustments(
                proactiveNotifications: false,
                checkIns: .paused,
                urgentOnly: true,
                morningGreeting: true // Queue for morning
            )
        }
    }
}
```

#### 7.5 Contacts & Communication Intelligence
**What**: Know user's important people and communication patterns
**Why**: Relationship context without asking

```swift
// Contacts Integration
final class ContactsService {
    private let store = CNContactStore()
    
    func getImportantPeople() async throws -> [ImportantPerson] {
        let keys = [
            CNContactGivenNameKey,
            CNContactFamilyNameKey,
            CNContactPhoneNumbersKey,
            CNContactEmailAddressesKey,
            CNContactBirthdayKey,
            CNContactRelationshipsKey
        ] as [CNKeyDescriptor]
        
        let request = CNContactFetchRequest(keysToFetch: keys)
        
        var people: [ImportantPerson] = []
        try store.enumerateContacts(with: request) { contact, _ in
            let person = ImportantPerson(
                name: "\(contact.givenName) \(contact.familyName)",
                relationship: self.inferRelationship(contact),
                birthday: contact.birthday?.date,
                communicationFrequency: self.getCommunicationFrequency(contact)
            )
            people.append(person)
        }
        
        return people.sorted { $0.importance > $1.importance }
    }
    
    private func inferRelationship(_ contact: CNContact) -> Relationship {
        // Use CNLabeledValue relationships
        // Plus ML inference from communication patterns
    }
}
```

### Testing (Phase 7)

#### Unit Tests
```swift
final class SiriIntegrationTests: XCTestCase {
    func testTalkToFerniIntent() async throws { ... }
    func testMorningRitualShortcut() async throws { ... }
}

final class LiveActivityTests: XCTestCase {
    func testActivityStartsOnConversation() { ... }
    func testActivityEndsGracefully() { ... }
}

final class CarPlayTests: XCTestCase {
    func testVoiceSessionInCarMode() async throws { ... }
    func testShortResponsesInCarMode() { ... }
}
```

### Audit Criteria (Phase 7)

| Criterion | Pass Condition |
|-----------|----------------|
| Siri Reliability | >95% successful intent execution |
| Live Activity Accuracy | State always matches conversation |
| CarPlay Safety | No visual attention required |
| Focus Mode Respect | 100% compliance with user settings |
| Contacts Privacy | No contact data sent to server |
| System Integration | Feels like native iOS experience |

---

## Testing Strategy

### Test Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │ ← Full user journeys
                    │   (10%)         │   Cross-device
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │     Integration Tests       │ ← Service boundaries
              │          (20%)              │   API contracts
              └──────────────┬──────────────┘
                             │
       ┌─────────────────────┴─────────────────────┐
       │              Unit Tests                   │ ← Business logic
       │                (70%)                      │   Pure functions
       └───────────────────────────────────────────┘
```

### Critical E2E Test Scenarios

#### Scenario 1: Morning Routine
```gherkin
Feature: Morning Routine with Health Context

Scenario: User wakes up after poor sleep
  Given the user slept 4.5 hours last night
  And their HRV is 20% below baseline
  When they open Ferni in the morning
  Then Ferni should acknowledge the rough night
  And offer gentle support, not demanding tasks
  And suggest a simplified day if calendar is flexible
```

#### Scenario 2: Pre-Event Support
```gherkin
Feature: High-Stakes Event Preparation

Scenario: User has board presentation tomorrow
  Given the user has "Q3 Board Review" on calendar tomorrow
  And the event is classified as high-stakes
  When it's 6pm the day before
  Then Ferni should proactively reach out
  And offer to talk through preparation
  And remember previous presentation conversations
```

#### Scenario 3: Watch to Phone Handoff
```gherkin
Feature: Device Handoff

Scenario: Start on watch, continue on phone
  Given the user starts a conversation on Apple Watch
  And they speak for 30 seconds
  When they open Ferni on their iPhone
  Then the conversation should continue seamlessly
  And context from watch interaction is preserved
  And the full voice experience activates
```

### Performance Benchmarks

| Metric | Target | Critical |
|--------|--------|----------|
| App Launch | <1s | <2s |
| Voice Connection | <500ms | <1s |
| First Response | <2s | <3s |
| Health Data Refresh | <5s | <10s |
| Calendar Sync | <3s | <5s |
| Prediction Compute | <100ms | <250ms |
| Memory Usage | <100MB | <150MB |
| Battery (10min conv) | <5% | <8% |

### Security Testing

| Test | Method | Pass Criteria |
|------|--------|---------------|
| Data at Rest | Static analysis | All sensitive data encrypted |
| Data in Transit | Network inspection | TLS 1.3, cert pinning |
| Authentication | Penetration testing | No auth bypass possible |
| API Security | OWASP testing | No critical vulnerabilities |
| Health Data | Privacy audit | HIPAA-adjacent compliance |
| Keychain Usage | Code review | Proper keychain attributes |

---

## Audit Framework

### Phase Gate Audits

Each phase must pass these audits before proceeding:

#### Technical Audit
- [ ] Architecture compliance (clean architecture layers)
- [ ] Test coverage >80%
- [ ] No critical/high security vulnerabilities
- [ ] Performance within benchmarks
- [ ] Memory leak testing passed
- [ ] Crash-free rate >99.5%

#### Privacy Audit
- [ ] Data minimization verified
- [ ] Consent flows documented
- [ ] Data retention policies implemented
- [ ] Right to deletion functional
- [ ] No unauthorized data sharing
- [ ] Privacy policy updated

#### Brand Audit
- [ ] Voice/tone matches brand guidelines
- [ ] UI follows design system
- [ ] Interactions feel warm, not cold
- [ ] Proactive features feel helpful, not creepy
- [ ] Error states are graceful and human
- [ ] Celebration moments feel genuine

#### Accessibility Audit
- [ ] VoiceOver full support
- [ ] Dynamic Type support
- [ ] Color contrast compliant
- [ ] Reduce Motion respected
- [ ] Voice control compatible
- [ ] Cognitive load appropriate

### Continuous Audit Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Crash-free sessions | Crashlytics | <99% |
| ANR rate | Performance monitoring | >0.5% |
| Proactive acceptance rate | Analytics | <60% |
| Permission grant rate | Analytics | <40% |
| Conversation completion | Analytics | <70% |
| NPS score | In-app survey | <50 |
| Privacy complaints | Support tickets | >0.1% |

---

## Data Governance

### Data Classification

| Classification | Examples | Storage | Retention | Encryption |
|---------------|----------|---------|-----------|------------|
| **Sensitive Health** | HRV, sleep, heart rate | On-device only | User controlled | AES-256 |
| **Personal Context** | Calendar, contacts | On-device, sync optional | 1 year | AES-256 |
| **Conversation** | Transcripts, memories | Cloud (user controlled) | User controlled | E2E encrypted |
| **Analytics** | Usage patterns, crashes | Cloud | 90 days | TLS |
| **Predictions** | AI-generated insights | On-device | 30 days | AES-256 |

### Privacy Controls

```swift
// User-facing privacy controls
struct PrivacySettings: View {
    @AppStorage("healthSyncEnabled") var healthSync = false
    @AppStorage("calendarSyncEnabled") var calendarSync = false
    @AppStorage("locationEnabled") var location = false
    @AppStorage("proactiveNotifications") var proactive = true
    
    var body: some View {
        List {
            Section("What Ferni Knows") {
                Toggle("Health & Wellness", isOn: $healthSync)
                Toggle("Calendar & Schedule", isOn: $calendarSync)
                Toggle("Location Context", isOn: $location)
            }
            
            Section("How Ferni Reaches Out") {
                Toggle("Proactive Check-ins", isOn: $proactive)
            }
            
            Section("Your Data") {
                Button("Download My Data") { ... }
                Button("Delete All Data", role: .destructive) { ... }
            }
        }
    }
}
```

### Compliance Checklist

- [ ] GDPR compliant (EU users)
- [ ] CCPA compliant (California users)
- [ ] App Store privacy nutrition labels accurate
- [ ] Health data handling follows Apple guidelines
- [ ] No third-party health data sharing
- [ ] Data portability implemented
- [ ] Right to erasure implemented

---

## Design System Integration

### iOS Design Tokens

```swift
// Design tokens from design-system/tokens
enum FerniColors {
    // From colors.json
    static let ferniPrimary = Color(hex: "#4a6741")
    static let ferniSecondary = Color(hex: "#3d5a35")
    static let accent = Color(hex: "#3D5A45")
    
    // Personas
    static let peter = Color(hex: "#3a6b73")
    static let maya = Color(hex: "#a67a6a")
    static let jordan = Color(hex: "#c4856a")
    static let alex = Color(hex: "#5a6b8a")
    static let nayan = Color(hex: "#b8956a")
    
    // Semantic
    static let textPrimary = Color(hex: "#2C2520")
    static let backgroundElevated = Color(hex: "#FFFDFB")
}

enum FerniTypography {
    // From typography tokens
    static let displayFont = Font.custom("Plus Jakarta Sans", size: 28).weight(.semibold)
    static let bodyFont = Font.custom("Inter", size: 16)
    static let captionFont = Font.custom("Inter", size: 12)
}

enum FerniAnimation {
    // From animation.json
    static let durationFast: Double = 0.1
    static let durationNormal: Double = 0.2
    static let durationSlow: Double = 0.3
    static let durationDramatic: Double = 0.6
    
    static let easingSpring = Animation.spring(response: 0.4, dampingFraction: 0.7)
    static let easingGentle = Animation.easeInOut(duration: durationSlow)
}
```

### Component Library

```swift
// Reusable components matching web design system

struct FerniButton: View {
    let title: String
    let action: () -> Void
    var style: ButtonStyle = .primary
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(FerniTypography.bodyFont)
                .fontWeight(.medium)
                .foregroundColor(style.foregroundColor)
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(style.backgroundColor)
                .cornerRadius(12)
        }
    }
}

struct FerniCard: View {
    let content: () -> AnyView
    
    var body: some View {
        content()
            .padding(20)
            .background(FerniColors.backgroundElevated)
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
    }
}

struct FerniAvatar: View {
    let persona: Persona
    let size: AvatarSize
    @Binding var isAnimating: Bool
    
    var body: some View {
        ZStack {
            // Glow ring
            Circle()
                .stroke(persona.color, lineWidth: 3)
                .blur(radius: isAnimating ? 8 : 4)
                .opacity(isAnimating ? 0.8 : 0.4)
                .animation(FerniAnimation.easingSpring, value: isAnimating)
            
            // Avatar image
            Image(persona.avatarName)
                .resizable()
                .scaledToFit()
                .clipShape(Circle())
                .scaleEffect(isAnimating ? 1.05 : 1.0)
                .animation(
                    Animation.easeInOut(duration: 0.8)
                        .repeatForever(autoreverses: true),
                    value: isAnimating
                )
        }
        .frame(width: size.dimension, height: size.dimension)
    }
}
```

### Animation Principles (iOS)

```swift
// Pixar principles applied to iOS

extension View {
    // Squash and stretch for buttons
    func ferniButtonPress() -> some View {
        self.modifier(SquashStretchModifier())
    }
    
    // Anticipation before major transitions
    func ferniAnticipate() -> some View {
        self.modifier(AnticipationModifier())
    }
    
    // Follow-through with overshoot
    func ferniSpring() -> some View {
        self.animation(
            .spring(response: 0.4, dampingFraction: 0.65, blendDuration: 0),
            value: UUID()
        )
    }
}

struct SquashStretchModifier: ViewModifier {
    @State private var isPressed = false
    
    func body(content: Content) -> some View {
        content
            .scaleEffect(x: isPressed ? 1.05 : 1.0, y: isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.5), value: isPressed)
            .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
                isPressed = pressing
            }, perform: {})
    }
}
```

---

## Success Metrics

### North Star Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Daily Active Conversations** | Users who have 1+ voice conversation/day | 40% of MAU |
| **Proactive Engagement Rate** | Users who respond to proactive check-ins | 60% |
| **Native Feature Adoption** | Users with 3+ iOS permissions granted | 50% |
| **Retention (D30)** | Users returning 30 days after install | 35% |
| **NPS** | Net Promoter Score | >60 |

### Phase-Specific Goals

| Phase | Key Result | Target |
|-------|------------|--------|
| Phase 1 | Voice conversation completion rate | >85% |
| Phase 2 | Health permission grant rate | >40% |
| Phase 3 | Calendar-triggered conversations | 2/week avg |
| Phase 4 | Location-triggered habits | 1/day avg |
| Phase 5 | Watch check-in completion | >70% |
| Phase 6 | Prediction acceptance rate | >60% |
| Phase 7 | Siri activation success | >95% |

---

## Appendix

### A. Technology Stack

| Layer | Technology |
|-------|------------|
| UI Framework | SwiftUI + UIKit (where needed) |
| Architecture | Clean Architecture + MVVM |
| Networking | URLSession + async/await |
| Persistence | Core Data + Keychain |
| Health | HealthKit |
| Calendar | EventKit |
| Location | CoreLocation |
| Home | HomeKit |
| Watch | WatchKit + WatchConnectivity |
| ML | CoreML + Create ML |
| Voice | LiveKit iOS SDK |
| Analytics | Firebase Analytics |
| Crash Reporting | Firebase Crashlytics |
| Push | APNS |

### B. Team Requirements

| Role | Count | Responsibility |
|------|-------|----------------|
| iOS Lead | 1 | Architecture, code review |
| iOS Engineers | 2-3 | Feature development |
| Backend Engineer | 1 | API support, sync infrastructure |
| AI/ML Engineer | 1 | On-device ML, predictions |
| Designer | 1 | iOS-native design, components |
| QA Engineer | 1 | Testing, automation |
| Product Manager | 1 | Roadmap, prioritization |

### C. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| HealthKit rejection | Medium | High | Pre-submission consultation with Apple |
| Battery drain complaints | Medium | Medium | Aggressive optimization, user controls |
| Privacy concerns | Medium | High | Transparency-first design, education |
| Voice quality on cellular | Low | Medium | Quality indicators, fallback options |
| Watch memory limits | Medium | Low | Lean watch app, phone offloading |
| Siri reliability | Low | Low | Manual fallback always available |

### D. References

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [HealthKit Documentation](https://developer.apple.com/documentation/healthkit)
- [EventKit Documentation](https://developer.apple.com/documentation/eventkit)
- [CoreLocation Documentation](https://developer.apple.com/documentation/corelocation)
- [WatchKit Documentation](https://developer.apple.com/documentation/watchkit)
- [App Intents Documentation](https://developer.apple.com/documentation/appintents)
- [LiveKit iOS SDK](https://docs.livekit.io/client-sdk-ios/)
- [Ferni Design System](../../design-system/README.md)
- [Ferni Brand Guidelines](../../design-system/brand/FERNI-BRAND-GUIDELINES.md)

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Owner: Ferni Engineering Team*
