# 📞 Concierge Calling System - Implementation Plan

> **"Better Than Human"** - Ferni makes calls on your behalf, remembers your relationships, handles hold times, navigates IVRs, and reports back with results.

---

## 🔥 AUDIT STATUS (Dec 29, 2024)

### What's Already Working ✅

| Component | Status | Location |
|-----------|--------|----------|
| **Contact Storage** | ✅ Full implementation | `src/services/contacts/contact-relationship-service.ts` |
| **Contact Resolution** | ✅ Fuzzy matching | `src/tools/domains/telephony/call-on-behalf.ts` → `resolveContact()` |
| **Call Scripts** | ✅ Healthcare, Restaurant, Business, Personal | `src/tools/domains/telephony/scripts/` |
| **Twilio Calling** | ✅ Full API integration | `src/services/voice/voice-call.ts` |
| **Call Orchestrator** | ✅ Room creation + Twilio bridging | `src/services/outreach/on-behalf-call-orchestrator.ts` |
| **Voicemail Detection** | ✅ With message enrichment | `on-behalf-call-orchestrator.ts` |
| **Result Capture** | ✅ Notification flow | `src/services/outreach/call-result-capture.ts` |

### What Was Fixed 🔧

| Issue | Fix |
|-------|-----|
| **Agent never joined room** | Updated `spawnOnBehalfAgent()` to use `AgentDispatchClient.createDispatch()` |
| **No outbound agent handler** | Created `src/agents/outbound/on-behalf-call-agent.ts` |
| **Voice agent didn't detect on-behalf calls** | Added `type: 'on_behalf_call'` detection to `voice-agent-entry.ts` |

### Test Commands

```bash
# Dry run (validate configuration)
npm run test:outbound-call:dry-run -- --phone 8012017497 --purpose "test"

# Full test call
npm run test:outbound-call -- --phone 8012017497 --purpose "schedule an appointment"

# Synthetic test suite
npm run test:synthetic:concierge
```

---

## Vision

When a user says any of these:

- "Call my doctor and schedule a checkup"
- "Make a reservation at my favorite Italian place for Saturday"
- "Schedule a haircut with Sarah"
- "Get me an appointment with Dr. Martinez"
- "Book a table at Nobu for 4 people Friday night"

Ferni should:

1. **Know** who "my doctor" / "my favorite Italian place" / "Sarah" is
2. **Call** them with the right persona and script
3. **Handle** hold times, IVRs, voicemail gracefully
4. **Extract** confirmation details from the conversation
5. **Notify** the user and sync to their calendar

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                                     │
│         "Call my dentist and schedule a cleaning"                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    1. SEMANTIC ROUTER                                    │
│   - Detects: domain=healthcare, type=appointment, entity="my dentist"   │
│   - Routes to: resolveMyContact → scheduleAppointment                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                2. MY CONTACT RESOLUTION                                  │
│   - Query: MyContacts.resolve("dentist", userId)                        │
│   - Returns: { name: "Dr. Kim", phone: "+14155551234", ... }            │
│   - If unknown: "Who's your dentist? I'll remember for next time."      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                3. CONCIERGE ROUTER                                       │
│   - Creates ConciergeRequest with resolved contact                      │
│   - Selects appropriate script (healthcare/appointment)                 │
│   - Queues for outbound call                                            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              4. OUTBOUND CALL AGENT (LiveKit + Twilio)                  │
│   - Initiates call via Twilio SIP                                       │
│   - LiveKit agent handles conversation                                  │
│   - Uses domain-specific script with TTS                                │
│   - Handles: IVR menus, hold music, voicemail, human receptionist       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                5. RESULT EXTRACTION                                      │
│   - Parses call transcript for key data                                 │
│   - Extracts: date/time, confirmation #, special instructions           │
│   - Handles: "no availability", "call back", "left voicemail"           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                6. USER NOTIFICATION & SYNC                               │
│   - Push notification: "Your appointment is confirmed!"                 │
│   - Calendar sync: Creates event with all details                       │
│   - Voice update: Next time user talks, Ferni mentions it               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Unified "My Contacts" System

### 1.1 Data Model

```typescript
// src/services/my-contacts/types.ts

/**
 * A contact the user has a personal relationship with.
 * Could be a person (dentist, hairstylist) or a business (favorite restaurant).
 */
export interface MyContact {
  id: string;
  userId: string;
  
  // Identity
  name: string;                    // "Dr. Kim" or "Nobu"
  type: MyContactType;
  aliases: string[];               // ["my dentist", "dentist", "Dr. Kim"]
  
  // Contact info
  phone: string;                   // Primary phone for calling
  email?: string;
  address?: string;
  website?: string;
  
  // Relationship context
  relationship: ContactRelationshipType;
  firstMention: Date;              // When user first mentioned them
  lastContact: Date;               // Last time we called/visited
  interactionCount: number;
  
  // Preferences (learned over time)
  preferredTimes?: string[];       // ["mornings", "after 3pm"]
  specialInstructions?: string;    // "Ask for Sarah at the front desk"
  notes?: string[];                // User's notes about this contact
  
  // Business-specific
  businessHours?: BusinessHours;
  acceptsAppointments?: boolean;
  typicalWaitTime?: number;        // Minutes
  
  // Healthcare-specific
  insuranceAccepted?: string[];
  specialty?: string;
  
  // Dining-specific
  cuisine?: string;
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
  reservationRequired?: boolean;
  
  // Metadata
  source: 'user_provided' | 'extracted' | 'google_contacts' | 'calendar';
  confidence: number;              // How sure we are this is correct
  createdAt: Date;
  updatedAt: Date;
}

export type MyContactType = 
  // Healthcare
  | 'doctor' | 'dentist' | 'specialist' | 'therapist' | 'veterinarian'
  // Personal services  
  | 'hairstylist' | 'barber' | 'spa' | 'trainer' | 'tailor'
  // Dining
  | 'restaurant' | 'cafe' | 'bar'
  // Home services
  | 'plumber' | 'electrician' | 'cleaner' | 'handyman' | 'landscaper'
  // Professional
  | 'accountant' | 'lawyer' | 'financial_advisor'
  // Other
  | 'other';

export type ContactRelationshipType =
  | 'regular'      // Go there regularly
  | 'preferred'    // Favorite/preferred
  | 'occasional'   // Been there a few times
  | 'one_time'     // Mentioned once
  | 'recommended'; // Someone recommended

export interface BusinessHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;   // "09:00"
  close: string;  // "17:00"
  closed?: boolean;
}
```

### 1.2 Resolution Service

```typescript
// src/services/my-contacts/resolver.ts

export interface ResolveResult {
  found: boolean;
  contact?: MyContact;
  confidence: number;
  alternatives?: MyContact[];  // If ambiguous
  clarificationNeeded?: string; // Question to ask user
}

/**
 * Resolve natural language references to stored contacts
 */
export async function resolveMyContact(
  userId: string,
  reference: string,
  context?: {
    domain?: string;
    recentMentions?: string[];
  }
): Promise<ResolveResult> {
  // 1. Exact match on aliases
  // 2. Fuzzy match on name
  // 3. Type-based lookup ("my dentist" → type=dentist)
  // 4. Context-aware disambiguation
}

/**
 * Learn a new contact from conversation
 */
export async function learnContact(
  userId: string,
  extracted: ExtractedContact,
  source: 'conversation' | 'explicit'
): Promise<MyContact> {
  // Store with confidence based on source
}

/**
 * Update contact from call result
 */
export async function updateFromCallResult(
  contactId: string,
  result: CallResult
): Promise<void> {
  // Update lastContact, notes, etc.
}
```

### 1.3 Extraction from Conversation

```typescript
// src/services/my-contacts/extractor.ts

/**
 * Extract contact mentions from user speech
 * 
 * Examples:
 * - "I need to call Dr. Martinez" → { type: 'doctor', name: 'Dr. Martinez' }
 * - "My hairstylist Sarah" → { type: 'hairstylist', name: 'Sarah' }
 * - "That Italian place on Valencia" → { type: 'restaurant', hint: 'Italian, Valencia' }
 */
export function extractContactMention(
  text: string
): ExtractedContactMention | null {
  // Pattern matching + NER for contact extraction
}

/**
 * Extract full contact details from explicit provision
 * 
 * Example: "My dentist is Dr. Kim at 555-1234 on Market Street"
 */
export function extractContactDetails(
  text: string
): ExtractedContact | null {
  // Full entity extraction
}
```

---

## Phase 2: Outbound Calling Agent

### 2.1 Agent Architecture

```typescript
// src/agents/concierge-caller/agent.ts

/**
 * LiveKit agent specialized for outbound business calls
 * 
 * Key differences from main voice agent:
 * - Script-driven conversation (not free-form)
 * - IVR/DTMF handling
 * - Hold music detection
 * - Voicemail detection and message leaving
 * - Goal-oriented (get appointment, get info)
 */
export class ConciergeCallerAgent {
  private script: OutreachScript;
  private state: CallState;
  private goal: CallGoal;
  private extractedData: Map<string, unknown>;

  async handleCallConnected(): Promise<void> {
    // Start with greeting from script
  }

  async handleSpeech(transcript: string): Promise<void> {
    // Classify response and advance conversation
  }

  async handleDTMFRequired(prompt: string): Promise<string> {
    // Parse IVR menu and select option
  }

  async handleHoldMusic(): Promise<void> {
    // Wait patiently, log hold time
  }

  async handleVoicemail(): Promise<void> {
    // Leave appropriate message
  }

  async handleCallEnded(): Promise<CallResult> {
    // Parse all extracted data, determine success
  }
}

type CallState = 
  | 'connecting'
  | 'ivr_menu'
  | 'on_hold'
  | 'speaking_to_human'
  | 'leaving_voicemail'
  | 'completed'
  | 'failed';

interface CallGoal {
  type: 'schedule_appointment' | 'make_reservation' | 'get_quote' | 'inquiry';
  requiredData: string[];  // What we need to extract
  successCriteria: string; // How to know we succeeded
}
```

### 2.2 Twilio + LiveKit Integration

```typescript
// src/services/concierge/telephony/twilio-livekit-bridge.ts

/**
 * Bridge Twilio outbound calls to LiveKit for AI handling
 */
export async function initiateOutboundCall(
  request: OutboundCallRequest
): Promise<CallInitiationResult> {
  // 1. Create LiveKit room for the call
  const room = await createConciergeRoom(request.requestId);
  
  // 2. Start ConciergeCallerAgent in the room
  await startConciergeAgent(room.name, {
    script: request.script,
    goal: request.goal,
    context: request.context,
  });
  
  // 3. Initiate Twilio call that connects to LiveKit
  const call = await twilioClient.calls.create({
    to: request.phoneNumber,
    from: TWILIO_CONCIERGE_NUMBER,
    url: `${API_BASE}/api/concierge/twiml/${room.name}`,
    statusCallback: `${API_BASE}/api/concierge/status/${request.requestId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    machineDetection: 'DetectMessageEnd',
    timeout: 60,
  });
  
  return {
    callSid: call.sid,
    roomName: room.name,
    status: 'initiated',
  };
}

/**
 * TwiML endpoint that connects Twilio call to LiveKit
 */
export function generateTwiML(roomName: string): string {
  return `
    <Response>
      <Connect>
        <Stream url="wss://livekit.ferni.ai/twilio-bridge">
          <Parameter name="room" value="${roomName}" />
        </Stream>
      </Connect>
    </Response>
  `;
}
```

### 2.3 IVR Navigation

```typescript
// src/agents/concierge-caller/ivr-navigator.ts

/**
 * Intelligent IVR menu navigation
 */
export class IVRNavigator {
  private menuHistory: IVRMenu[] = [];
  
  /**
   * Parse IVR prompt and determine best option
   */
  async selectOption(prompt: string, goal: CallGoal): Promise<DTMFSelection> {
    // Use LLM to understand menu and select best option
    const analysis = await analyzeIVRMenu(prompt, goal);
    
    return {
      digit: analysis.bestOption,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
    };
  }
  
  /**
   * Detect if we're stuck in IVR loop
   */
  detectLoop(): boolean {
    // Check if we've heard same menu 3+ times
  }
  
  /**
   * Request human operator
   */
  async requestOperator(): Promise<void> {
    // Try: 0, "operator", "representative", "agent"
  }
}
```

---

## Phase 3: Enhanced Script System

### 3.1 Universal Script Structure

```typescript
// src/services/concierge/scripts/types.ts

export interface UniversalScript {
  domain: ConciergeDomain;
  type: ConciergeRequestType;
  
  // Conversation flow
  greeting: ScriptTemplate;
  introduction: ScriptTemplate;
  request: ScriptTemplate;
  
  // Dynamic follow-ups based on response
  followUps: Record<ResponseCategory, ScriptTemplate[]>;
  
  // Closing
  confirmation: ScriptTemplate;
  thankYou: ScriptTemplate;
  voicemailMessage: ScriptTemplate;
  
  // IVR navigation hints
  ivrHints: {
    appointmentKeywords: string[];
    reservationKeywords: string[];
    operatorKeywords: string[];
  };
  
  // Data extraction
  extractionSchema: ExtractionSchema;
  
  // Success criteria
  successIndicators: string[];
  failureIndicators: string[];
}

interface ScriptTemplate {
  template: string;           // Handlebars template
  variations?: string[];      // Alternative phrasings
  tone: 'formal' | 'friendly' | 'professional';
  requiredContext: string[];  // Variables needed
}

interface ExtractionSchema {
  required: ExtractField[];
  optional: ExtractField[];
}

interface ExtractField {
  name: string;
  type: 'datetime' | 'string' | 'number' | 'boolean';
  patterns: string[];         // Regex patterns to look for
  llmPrompt: string;          // Fallback: ask LLM to extract
}
```

### 3.2 Domain Scripts

**Healthcare (already exists, enhance):**
```typescript
// scripts/healthcare.ts - Enhanced
{
  domain: 'healthcare',
  type: 'appointment',
  
  greeting: {
    template: "Hello, good {{timeOfDay}}.",
    tone: 'professional',
  },
  
  introduction: {
    template: "I'm calling on behalf of {{userName}} to schedule an appointment with {{providerName}}.",
    variations: [
      "Hi, I'm helping {{userName}} schedule an appointment.",
      "I'm {{userName}}'s assistant, calling to book an appointment.",
    ],
  },
  
  request: {
    template: `
      {{#if isNewPatient}}They're a new patient.{{else}}They're an existing patient.{{/if}}
      {{#if reason}}The visit is for {{reason}}.{{/if}}
      {{#if urgency}}This is {{urgency}}.{{/if}}
      What's your earliest availability?
    `,
  },
  
  extractionSchema: {
    required: [
      { name: 'appointmentDate', type: 'datetime', patterns: [...] },
      { name: 'confirmed', type: 'boolean', patterns: ['confirmed', 'booked', 'scheduled'] },
    ],
    optional: [
      { name: 'providerName', type: 'string', patterns: [...] },
      { name: 'confirmationNumber', type: 'string', patterns: [...] },
      { name: 'arrivalInstructions', type: 'string', patterns: [...] },
    ],
  },
}
```

**Restaurant (enhance existing):**
```typescript
// scripts/restaurant.ts - Enhanced
{
  domain: 'restaurant',
  type: 'booking',
  
  greeting: {
    template: "Hi there!",
    tone: 'friendly',
  },
  
  introduction: {
    template: "I'd like to make a reservation for {{partySize}} on {{date}}.",
  },
  
  request: {
    template: `
      {{#if specificTime}}Around {{time}} would be ideal.{{else}}Evening time works best.{{/if}}
      {{#if occasion}}It's for {{occasion}}.{{/if}}
      {{#if dietaryNeeds}}We have some dietary needs: {{dietaryNeeds}}.{{/if}}
    `,
  },
  
  followUps: {
    noAvailability: [
      "What about an hour earlier or later?",
      "Do you have anything the next day?",
      "Could we do the bar or patio instead?",
    ],
    waitlist: [
      "Could you add us to the waitlist?",
      "What's the typical wait time?",
    ],
  },
}
```

**Personal Services (new):**
```typescript
// scripts/personal-services.ts - New
{
  domain: 'personal_service',
  type: 'appointment',
  
  greeting: {
    template: "Hi!",
    tone: 'friendly',
  },
  
  introduction: {
    template: "I'm calling to book an appointment for {{userName}}{{#if specificPerson}} with {{specificPerson}}{{/if}}.",
  },
  
  request: {
    template: `
      {{#if serviceType}}Looking for a {{serviceType}}.{{/if}}
      {{#if preferredDate}}{{preferredDate}} would work great.{{/if}}
      What do you have available?
    `,
  },
}
```

---

## Phase 4: Result Processing

### 4.1 Transcript Parser

```typescript
// src/services/concierge/parser/unified-parser.ts

export interface ParsedCallResult {
  success: boolean;
  outcome: CallOutcome;
  
  // Extracted data
  appointmentTime?: Date;
  confirmationNumber?: string;
  providerName?: string;
  location?: string;
  specialInstructions?: string;
  
  // Call metadata
  duration: number;
  reachedHuman: boolean;
  leftVoicemail: boolean;
  
  // For failed calls
  failureReason?: string;
  suggestedRetry?: Date;
  alternativeContact?: string;
}

type CallOutcome = 
  | 'appointment_confirmed'
  | 'reservation_confirmed'
  | 'quote_received'
  | 'no_availability'
  | 'callback_requested'
  | 'voicemail_left'
  | 'wrong_number'
  | 'business_closed'
  | 'call_failed';

/**
 * Parse call transcript using LLM + pattern matching
 */
export async function parseCallTranscript(
  transcript: string,
  script: UniversalScript,
  goal: CallGoal
): Promise<ParsedCallResult> {
  // 1. Pattern-based extraction for known fields
  const patternResults = extractWithPatterns(transcript, script.extractionSchema);
  
  // 2. LLM extraction for complex/ambiguous content
  const llmResults = await extractWithLLM(transcript, script, goal);
  
  // 3. Merge and validate
  return mergeAndValidate(patternResults, llmResults, goal);
}
```

### 4.2 Confirmation Flow

```typescript
// src/services/concierge/confirmation/flow.ts

export async function processCallCompletion(
  requestId: string,
  callResult: CallResult
): Promise<void> {
  const request = await getRequest(requestId);
  const parsed = await parseCallTranscript(callResult.transcript, ...);
  
  // Update request status
  await updateRequestStatus(requestId, parsed.outcome);
  
  // Update contact with new info
  if (parsed.success) {
    await updateContactFromResult(request.targetContact, parsed);
  }
  
  // Sync to calendar if appointment confirmed
  if (parsed.outcome === 'appointment_confirmed' && parsed.appointmentTime) {
    await syncToCalendar(request.userId, {
      title: `${request.type} at ${request.targetContact.name}`,
      time: parsed.appointmentTime,
      location: parsed.location,
      notes: parsed.specialInstructions,
    });
  }
  
  // Notify user
  await notifyUser(request.userId, {
    type: getNotificationType(parsed.outcome),
    title: getNotificationTitle(parsed),
    body: getNotificationBody(parsed, request),
    action: getNotificationAction(parsed),
  });
  
  // Queue voice update for next conversation
  await queueVoiceUpdate(request.userId, {
    context: 'concierge_result',
    data: { requestId, result: parsed },
  });
}
```

---

## Phase 5: Synthetic Testing Strategy

### 5.1 Test Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SYNTHETIC TEST SUITE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ Mock Business │    │ Mock Business │    │ Mock Business │              │
│  │   (Doctor)    │    │ (Restaurant) │    │   (Salon)    │              │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘              │
│         │                   │                   │                        │
│         └─────────┬─────────┴─────────┬─────────┘                        │
│                   │                   │                                  │
│                   ▼                   ▼                                  │
│         ┌─────────────────────────────────────────┐                     │
│         │         MOCK TELEPHONY BRIDGE           │                     │
│         │   (Simulates Twilio + Phone System)     │                     │
│         └─────────────────────┬───────────────────┘                     │
│                               │                                          │
│                               ▼                                          │
│         ┌─────────────────────────────────────────┐                     │
│         │      CONCIERGE CALLER AGENT             │                     │
│         │         (Under Test)                    │                     │
│         └─────────────────────┬───────────────────┘                     │
│                               │                                          │
│                               ▼                                          │
│         ┌─────────────────────────────────────────┐                     │
│         │         TEST ASSERTIONS                 │                     │
│         │  - Correct script used                  │                     │
│         │  - IVR navigated correctly              │                     │
│         │  - Data extracted accurately            │                     │
│         │  - User notified appropriately          │                     │
│         └─────────────────────────────────────────┘                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Mock Business Simulator

```typescript
// tests/synthetic/mocks/mock-business.ts

export interface MockBusinessConfig {
  name: string;
  type: BusinessType;
  
  // Phone behavior
  answerDelay: number;           // ms before answering
  hasIVR: boolean;
  ivrDepth: number;              // How many menus deep
  holdTime: number;              // ms on hold
  goesToVoicemail: boolean;
  voicemailAfter: number;        // rings before VM
  
  // Receptionist behavior
  personality: 'helpful' | 'busy' | 'confused' | 'rude';
  comprehension: 'perfect' | 'good' | 'poor';
  
  // Availability
  availability: AvailabilityScenario;
  
  // Special scenarios
  scenarios: SpecialScenario[];
}

type AvailabilityScenario = 
  | { type: 'available', slots: Date[] }
  | { type: 'busy', nextAvailable: Date }
  | { type: 'fully_booked' }
  | { type: 'closed' }
  | { type: 'no_longer_in_business' };

type SpecialScenario =
  | 'asks_for_insurance'
  | 'asks_for_callback_number'
  | 'transfers_multiple_times'
  | 'disconnects_mid_call'
  | 'background_noise'
  | 'heavy_accent'
  | 'speaks_fast';

export class MockBusiness {
  private config: MockBusinessConfig;
  private state: MockBusinessState;
  private conversationLog: ConversationTurn[] = [];
  
  constructor(config: MockBusinessConfig) {
    this.config = config;
    this.state = { phase: 'not_answered' };
  }
  
  /**
   * Simulate receiving a call
   */
  async receiveCall(): Promise<CallConnection> {
    await delay(this.config.answerDelay);
    
    if (this.config.goesToVoicemail) {
      return { type: 'voicemail', greeting: this.getVoicemailGreeting() };
    }
    
    if (this.config.hasIVR) {
      return { type: 'ivr', menu: this.getIVRMenu(0) };
    }
    
    return { type: 'human', greeting: this.getHumanGreeting() };
  }
  
  /**
   * Handle input (speech or DTMF)
   */
  async handleInput(input: AgentInput): Promise<BusinessResponse> {
    this.conversationLog.push({ from: 'agent', content: input });
    
    const response = await this.generateResponse(input);
    this.conversationLog.push({ from: 'business', content: response });
    
    return response;
  }
  
  /**
   * Generate contextually appropriate response
   */
  private async generateResponse(input: AgentInput): Promise<BusinessResponse> {
    // Use LLM to generate realistic responses based on:
    // - Business type and personality
    // - Current conversation state
    // - Availability scenario
    // - Special scenarios active
  }
  
  /**
   * Get IVR menu for depth level
   */
  private getIVRMenu(depth: number): IVRMenu {
    // Return realistic IVR menu based on business type
  }
}
```

### 5.3 Test Scenarios

```typescript
// tests/synthetic/scenarios/index.ts

export const TEST_SCENARIOS: TestScenario[] = [
  // ============================================
  // HEALTHCARE SCENARIOS
  // ============================================
  {
    name: 'Doctor - Quick Appointment',
    domain: 'healthcare',
    userRequest: 'Schedule a checkup with my doctor',
    mockBusiness: {
      type: 'doctor_office',
      hasIVR: false,
      holdTime: 0,
      personality: 'helpful',
      availability: { type: 'available', slots: [tomorrow9am, tomorrow2pm] },
    },
    expectedOutcome: 'appointment_confirmed',
    expectedExtraction: {
      appointmentDate: expect.any(Date),
      confirmed: true,
    },
  },
  
  {
    name: 'Doctor - Long Hold Time',
    domain: 'healthcare',
    userRequest: 'I need to see Dr. Martinez urgently',
    mockBusiness: {
      type: 'doctor_office',
      hasIVR: true,
      ivrDepth: 2,
      holdTime: 180000, // 3 minutes
      personality: 'busy',
      availability: { type: 'busy', nextAvailable: nextWeek },
    },
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      'agent waited through hold',
      'agent navigated IVR correctly',
      'agent handled busy receptionist',
    ],
  },
  
  {
    name: 'Doctor - Goes to Voicemail',
    domain: 'healthcare',
    userRequest: 'Book a dentist appointment',
    mockBusiness: {
      type: 'dentist_office',
      goesToVoicemail: true,
      voicemailAfter: 5,
    },
    expectedOutcome: 'voicemail_left',
    assertions: [
      'left appropriate voicemail',
      'included callback number',
      'mentioned appointment request',
    ],
  },
  
  {
    name: 'Doctor - No Availability',
    domain: 'healthcare',
    userRequest: 'Schedule an appointment with my dermatologist',
    mockBusiness: {
      type: 'specialist_office',
      availability: { type: 'fully_booked' },
      personality: 'helpful',
    },
    expectedOutcome: 'no_availability',
    assertions: [
      'asked about waitlist',
      'asked for alternative dates',
      'captured suggested callback time',
    ],
  },
  
  // ============================================
  // RESTAURANT SCENARIOS
  // ============================================
  {
    name: 'Restaurant - Simple Reservation',
    domain: 'restaurant',
    userRequest: 'Make a reservation at Nobu for 4 people Saturday night',
    mockBusiness: {
      type: 'upscale_restaurant',
      hasIVR: false,
      personality: 'professional',
      availability: { type: 'available', slots: [saturday7pm, saturday9pm] },
    },
    expectedOutcome: 'reservation_confirmed',
    expectedExtraction: {
      reservationTime: expect.any(Date),
      partySize: 4,
      confirmed: true,
    },
  },
  
  {
    name: 'Restaurant - No Availability, Offers Alternative',
    domain: 'restaurant',
    userRequest: 'Book dinner at my favorite Italian place Friday at 7',
    mockBusiness: {
      type: 'popular_restaurant',
      availability: { type: 'busy', nextAvailable: friday830pm },
      personality: 'helpful',
    },
    expectedOutcome: 'reservation_confirmed',
    assertions: [
      'accepted alternative time',
      'confirmed new time with user preference',
    ],
  },
  
  // ============================================
  // PERSONAL SERVICE SCENARIOS
  // ============================================
  {
    name: 'Salon - Book with Specific Person',
    domain: 'personal_service',
    userRequest: 'Schedule a haircut with Sarah',
    mockBusiness: {
      type: 'salon',
      hasIVR: false,
      scenarios: ['asks_for_service_type'],
      availability: { type: 'available', slots: [tuesdayMorning] },
    },
    expectedOutcome: 'appointment_confirmed',
    assertions: [
      'requested Sarah specifically',
      'provided service type when asked',
    ],
  },
  
  // ============================================
  // EDGE CASES
  // ============================================
  {
    name: 'Wrong Number',
    domain: 'healthcare',
    userRequest: 'Call my doctor',
    mockBusiness: {
      type: 'wrong_number',
      response: "You've reached Mike's Pizza",
    },
    expectedOutcome: 'wrong_number',
    assertions: [
      'detected wrong number quickly',
      'apologized and ended call',
      'flagged contact for update',
    ],
  },
  
  {
    name: 'Business Closed Permanently',
    domain: 'restaurant',
    userRequest: 'Make a reservation at that Thai place',
    mockBusiness: {
      type: 'closed_business',
      availability: { type: 'no_longer_in_business' },
    },
    expectedOutcome: 'business_closed',
    assertions: [
      'detected business closure',
      'notified user appropriately',
      'offered to find alternative',
    ],
  },
  
  {
    name: 'Hostile IVR Loop',
    domain: 'healthcare',
    userRequest: 'Schedule appointment at the clinic',
    mockBusiness: {
      type: 'large_clinic',
      hasIVR: true,
      ivrDepth: 4,
      scenarios: ['ivr_loop'],
    },
    expectedOutcome: 'appointment_confirmed', // Should eventually get through
    assertions: [
      'detected IVR loop',
      'requested operator',
      'eventually reached human',
    ],
  },
  
  {
    name: 'Call Disconnected Mid-Conversation',
    domain: 'restaurant',
    userRequest: 'Book a table for dinner',
    mockBusiness: {
      type: 'restaurant',
      scenarios: ['disconnects_mid_call'],
    },
    expectedOutcome: 'call_failed',
    assertions: [
      'detected disconnection',
      'queued retry',
      'notified user of issue',
    ],
  },
];
```

### 5.4 Test Runner

```typescript
// tests/synthetic/runner.ts

export async function runSyntheticTests(
  scenarios: TestScenario[] = TEST_SCENARIOS
): Promise<TestReport> {
  const results: TestResult[] = [];
  
  for (const scenario of scenarios) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    // Setup
    const mockBusiness = new MockBusiness(scenario.mockBusiness);
    const mockTelephony = new MockTelephonyBridge(mockBusiness);
    const agent = new ConciergeCallerAgent({
      telephony: mockTelephony,
      script: getScript(scenario.domain, scenario.type),
    });
    
    // Setup user with test contact
    const userId = 'test-user';
    await setupTestContact(userId, scenario);
    
    // Execute
    const startTime = Date.now();
    const result = await agent.executeCall({
      userId,
      request: scenario.userRequest,
      target: await resolveMyContact(userId, scenario.userRequest),
    });
    const duration = Date.now() - startTime;
    
    // Assert
    const assertions = runAssertions(result, scenario);
    
    results.push({
      scenario: scenario.name,
      passed: assertions.allPassed,
      duration,
      outcome: result.outcome,
      expectedOutcome: scenario.expectedOutcome,
      assertions: assertions.details,
      conversationLog: mockBusiness.getConversationLog(),
    });
    
    console.log(assertions.allPassed ? '✅ PASSED' : '❌ FAILED');
  }
  
  return generateReport(results);
}
```

### 5.5 E2E Voice Integration Tests

```typescript
// tests/e2e/voice-to-appointment.e2e.ts

describe('Voice-to-Appointment E2E', () => {
  let voiceAgent: TestVoiceAgent;
  let mockTelephony: MockTelephonyBridge;
  
  beforeAll(async () => {
    // Start voice agent with mock telephony
    voiceAgent = await createTestVoiceAgent({
      telephony: mockTelephony,
      userId: 'test-user',
    });
  });
  
  describe('Healthcare Appointments', () => {
    it('should handle "call my doctor" request', async () => {
      // Setup: User has stored doctor
      await storeMyContact('test-user', {
        type: 'doctor',
        name: 'Dr. Chen',
        phone: '+14155551234',
        aliases: ['my doctor', 'doctor', 'primary care'],
      });
      
      // User speaks
      const response = await voiceAgent.speak(
        'Ferni, can you call my doctor and schedule a checkup?'
      );
      
      // Ferni should acknowledge and initiate
      expect(response.text).toMatch(/calling.*Dr\. Chen/i);
      expect(response.actions).toContainEqual({
        type: 'outbound_call_initiated',
        target: '+14155551234',
      });
      
      // Simulate call completion
      await simulateCallCompletion({
        callSid: response.callSid,
        outcome: 'appointment_confirmed',
        transcript: 'We have you down for Tuesday at 2pm with Dr. Chen.',
        extractedData: {
          appointmentTime: nextTuesday2pm,
          provider: 'Dr. Chen',
        },
      });
      
      // Verify notification sent
      const notifications = await getNotifications('test-user');
      expect(notifications).toContainEqual(
        expect.objectContaining({
          title: expect.stringMatching(/appointment.*confirmed/i),
          body: expect.stringMatching(/Tuesday.*2.*pm.*Dr\. Chen/i),
        })
      );
      
      // Verify calendar sync
      const calendarEvents = await getCalendarEvents('test-user');
      expect(calendarEvents).toContainEqual(
        expect.objectContaining({
          title: expect.stringMatching(/Dr\. Chen/i),
          time: nextTuesday2pm,
        })
      );
    });
    
    it('should ask for doctor info when not stored', async () => {
      // No stored doctor
      await clearMyContacts('test-user');
      
      const response = await voiceAgent.speak(
        'Schedule an appointment with my dentist'
      );
      
      // Should ask for info
      expect(response.text).toMatch(/who.*dentist|dentist.*name|which dentist/i);
      
      // User provides info
      const response2 = await voiceAgent.speak(
        "Dr. Kim at Smile Dental, their number is 555-9876"
      );
      
      // Should confirm and initiate
      expect(response2.text).toMatch(/calling.*Dr\. Kim|got it.*calling/i);
      expect(response2.actions).toContainEqual({
        type: 'outbound_call_initiated',
      });
      
      // Verify contact was stored for future
      const contacts = await getMyContacts('test-user');
      expect(contacts).toContainEqual(
        expect.objectContaining({
          type: 'dentist',
          name: 'Dr. Kim',
          phone: expect.stringContaining('9876'),
        })
      );
    });
  });
  
  describe('Restaurant Reservations', () => {
    it('should book at favorite restaurant', async () => {
      await storeMyContact('test-user', {
        type: 'restaurant',
        name: 'Nobu',
        phone: '+14155559999',
        aliases: ['nobu', 'favorite sushi place'],
      });
      
      const response = await voiceAgent.speak(
        'Make a reservation at Nobu for Saturday at 7, party of 4'
      );
      
      expect(response.text).toMatch(/calling.*Nobu/i);
      
      // Simulate successful reservation
      await simulateCallCompletion({
        outcome: 'reservation_confirmed',
        extractedData: {
          reservationTime: saturday7pm,
          partySize: 4,
          confirmationNumber: 'RES-12345',
        },
      });
      
      const notifications = await getNotifications('test-user');
      expect(notifications[0].body).toMatch(/Saturday.*7.*4 people/i);
    });
    
    it('should handle alternative time offers', async () => {
      mockTelephony.setScenario('no_7pm_availability');
      
      const response = await voiceAgent.speak(
        'Book dinner at my favorite Italian place Friday at 7'
      );
      
      // Simulate restaurant offering alternative
      await simulateCallProgress({
        transcript: 'We don\'t have 7pm available. How about 8:30?',
      });
      
      // Agent should accept reasonable alternative
      await simulateCallCompletion({
        outcome: 'reservation_confirmed',
        extractedData: {
          reservationTime: friday830pm,
          note: 'Original request was 7pm',
        },
      });
      
      const notifications = await getNotifications('test-user');
      expect(notifications[0].body).toMatch(/8:30/);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle call failures gracefully', async () => {
      mockTelephony.setScenario('call_failed');
      
      const response = await voiceAgent.speak(
        'Call my hairstylist and book an appointment'
      );
      
      await simulateCallCompletion({
        outcome: 'call_failed',
        failureReason: 'No answer after 60 seconds',
      });
      
      // Should notify user and offer retry
      const notifications = await getNotifications('test-user');
      expect(notifications[0]).toMatchObject({
        type: 'concierge_failed',
        action: expect.objectContaining({ type: 'retry' }),
      });
    });
    
    it('should handle voicemail appropriately', async () => {
      mockTelephony.setScenario('goes_to_voicemail');
      
      await voiceAgent.speak('Schedule a cleaning with my dentist');
      
      await simulateCallCompletion({
        outcome: 'voicemail_left',
        transcript: 'Hi, I\'m calling on behalf of [user] to schedule a cleaning...',
      });
      
      const notifications = await getNotifications('test-user');
      expect(notifications[0]).toMatchObject({
        title: expect.stringMatching(/voicemail/i),
        body: expect.stringMatching(/left.*message|we'll follow up/i),
      });
    });
  });
});
```

---

## Implementation Timeline

| Phase | Component | Effort | Dependencies |
|-------|-----------|--------|--------------|
| **1.1** | MyContact data model | 2 days | - |
| **1.2** | Contact resolution service | 2 days | 1.1 |
| **1.3** | Conversation extraction | 2 days | 1.1 |
| **2.1** | ConciergeCallerAgent | 5 days | - |
| **2.2** | Twilio-LiveKit bridge | 3 days | 2.1 |
| **2.3** | IVR Navigator | 2 days | 2.1 |
| **3.1** | Enhanced scripts (all domains) | 2 days | - |
| **4.1** | Transcript parser | 2 days | 3.1 |
| **4.2** | Confirmation flow | 2 days | 4.1 |
| **5.1** | Mock business simulator | 3 days | - |
| **5.2** | Test scenarios | 2 days | 5.1 |
| **5.3** | E2E test suite | 3 days | All above |

**Total: ~30 days** for full implementation

**MVP (can make real calls): ~15 days** (Phases 1.1-1.2, 2.1-2.2, 3.1, 4.1-4.2)

---

## Next Steps

1. **Start with Phase 1** - MyContact system (data model + resolution)
2. **Parallel: Phase 5.1** - Build mock business simulator
3. **Then Phase 2** - Outbound calling agent
4. **Validate with Phase 5** - Run synthetic tests
5. **Polish with Phase 3-4** - Enhanced scripts and parsing

Ready to start implementation?
