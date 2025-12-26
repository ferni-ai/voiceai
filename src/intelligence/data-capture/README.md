# Semantic Data Capture Router

> **We believe in making AI human, and the decisions we make will reflect that.**

The Data Capture Router extracts and routes personal information mentioned during conversation to the appropriate storage systems - **in real-time**, not just at session end.

## The Problem

When a user says "my mom's number is 555-123-4567", we need to:
1. **Detect** that contact info is being shared
2. **Extract** the entities (relationship: "mom", phone: "555-123-4567")  
3. **Route** to the right storage (Contacts service, not generic Memory)
4. **Confirm** naturally ("Got it, I'll remember Mom's number")

Previously, this only happened:
- Via explicit tool calls ("Add a contact")
- At session end (signal extraction)
- NOT during natural conversation

## Architecture

```
User Speech: "my mom's number is 555-123-4567"
    ↓
┌─────────────────────────────────────────────────────────────┐
│                  DATA CAPTURE ROUTER                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 1. ENTITY EXTRACTION                                    ││
│  │    - Contact info (phone, email)                        ││
│  │    - People (name, relationship)                        ││
│  │    - Dates (birthdays, anniversaries)                   ││
│  │    - Places (address, locations)                        ││
│  │    - Preferences (likes, dislikes)                      ││
│  └─────────────────────────────────────────────────────────┘│
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 2. INTENT CLASSIFICATION                                ││
│  │    - explicit_save: "Save my mom's number..."           ││
│  │    - implicit_share: "my mom's number is..."            ││
│  │    - reference_only: "I called my mom"                  ││
│  │    - correction: "Actually, mom's number changed to..." ││
│  └─────────────────────────────────────────────────────────┘│
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 3. STORAGE ROUTING                                      ││
│  │    - Contacts Service: phone numbers, emails, people    ││
│  │    - Memory Service: facts, preferences, stories        ││
│  │    - Profile Service: personal details, communication   ││
│  │    - Relationship Network: people and connections       ││
│  │    - Calendar Service: dates and events                 ││
│  └─────────────────────────────────────────────────────────┘│
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 4. CONFIRMATION GENERATION                              ││
│  │    - Natural acknowledgment for the LLM to include     ││
│  │    - "I've saved Mom's number" OR silent save          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Integration Point

The Data Capture Router runs **before the LLM** in the turn processing pipeline:

```typescript
// In transcript-handler.ts or turn-processor.ts
const captureResult = await dataCaptureRouter.process(transcript, {
  userId,
  sessionId,
  existingContacts, // For deduplication
  existingPeople,   // For relationship linking
});

if (captureResult.captured.length > 0) {
  // Inject acknowledgment into LLM context
  contextInjections.push({
    type: 'data_captured',
    items: captureResult.captured,
    acknowledgment: captureResult.suggestedAcknowledgment,
  });
}
```

## Entity Types

### Contacts (→ Contacts Service)
- Phone numbers with relationship context
- Email addresses
- Mailing addresses

### People (→ Relationship Network)  
- Names and relationships
- Roles (boss, doctor, friend)
- Sentiment and context

### Dates (→ Calendar/Profile)
- Birthdays
- Anniversaries
- Appointments mentioned

### Facts (→ Memory Service)
- Preferences
- History
- Stories

## Intent Classification

| Pattern | Intent | Action |
|---------|--------|--------|
| "my mom's number is X" | implicit_share | Save + acknowledge |
| "save my mom's number" | explicit_save | Save + confirm |
| "I called my mom" | reference_only | Track interaction, don't save |
| "mom's new number is X" | correction | Update existing |
| "John's number at work" | contextual | Save with context |

## Deduplication

Before saving, check:
1. Does this contact already exist? → Update instead
2. Is this a known person? → Link to existing
3. Is this conflicting info? → Ask for clarification

## Privacy & Consent

- All data captured is associated with userId
- Users can see/delete via data export
- Sensitive data (health, financial) flagged for extra care

## Files

```
src/intelligence/data-capture/
├── index.ts              # Main router
├── extractors/
│   ├── contact-extractor.ts    # Phone, email, address
│   ├── person-extractor.ts     # Names, relationships
│   ├── date-extractor.ts       # Dates, events
│   └── fact-extractor.ts       # General facts
├── classifiers/
│   └── intent-classifier.ts    # Explicit vs implicit vs reference
├── routers/
│   └── storage-router.ts       # Route to correct service
└── types.ts              # Type definitions
```

## Usage

```typescript
import { processDataCapture } from './intelligence/data-capture';

// In turn processing
const captureResult = await processDataCapture({
  transcript: "My mom's number is 555-123-4567",
  userId: 'user_123',
  sessionId: 'session_456',
});

// Result:
// {
//   captured: [{
//     type: 'contact',
//     entity: { name: 'Mom', relationship: 'mother', phone: '555-123-4567' },
//     intent: 'implicit_share',
//     confidence: 0.95,
//     action: 'created',
//     storage: 'contacts'
//   }],
//   suggestedAcknowledgment: "Got it, I've saved Mom's number."
// }
```

## Related Systems

- **Semantic Router**: Routes to tools (action-oriented)
- **Human Signal Extractor**: Extracts at session end
- **Relationship Network**: Tracks people over time
- **Contact Service**: Stores contact info

The Data Capture Router BRIDGES these systems for real-time extraction.

