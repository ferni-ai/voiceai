# Concierge Feature Design

> **Better Than Human**: An AI that actually reaches out on your behalf - something no friend has time to do consistently.

## Vision

Ferni's Concierge capability enables real-world outreach via phone, email, and SMS. Instead of giving users information and leaving them to act, Ferni takes action directly - calling hotels, emailing doctors' offices, texting service providers.

---

## Why This Is "Better Than Human"

| What Friends Do | What Concierge Does |
|-----------------|---------------------|
| "You should call that hotel" | Calls 5 hotels, compares rates, reports back |
| "Try emailing them" | Drafts and sends email, follows up if no response |
| "Their number is..." | Makes the call, handles hold times, gets answers |
| Forgets to follow up | Tracks every request to completion |

---

## Supported Domains

### Tier 1: High Value, Ready Now
| Domain | Channel | Use Cases |
|--------|---------|-----------|
| **Hotels** | Phone, Email | Rate quotes, availability, special requests, booking |
| **Restaurants** | Phone | Reservations, dietary accommodations, large party requests |
| **Healthcare** | Phone, Email | Appointment scheduling, prescription refills, test results |
| **Local Services** | Phone, SMS | Quotes from plumbers, electricians, cleaners |

### Tier 2: Medium Complexity
| Domain | Channel | Use Cases |
|--------|---------|-----------|
| **Airlines** | Phone | Flight changes, upgrade requests, special assistance |
| **Car Rental** | Phone, Email | Quotes, upgrades, pickup/dropoff changes |
| **Insurance** | Phone | Claims status, coverage questions, policy changes |
| **Utilities** | Phone | Setup, transfers, billing disputes |

### Tier 3: Future Expansion
| Domain | Channel | Use Cases |
|--------|---------|-----------|
| **Government** | Phone | DMV appointments, passport status, permit questions |
| **Real Estate** | Phone, Email | Viewing appointments, landlord communication |
| **Auto Service** | Phone | Appointment scheduling, repair quotes |
| **Veterinary** | Phone | Pet appointments, prescription refills |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER REQUEST                            │
│        "Find me a hotel in Miami and get the best rate"     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CONCIERGE ROUTER                          │
│  • Determines domain (travel/hotel)                          │
│  • Identifies required action (outbound calls)               │
│  • Checks user permissions                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   CONTACT DISCOVERY                          │
│  • Google Places API → Hotels + phone numbers                │
│  • Business directories → Additional options                 │
│  • User's contacts → Known preferences                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   OUTREACH EXECUTOR                          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  PHONE   │  │  EMAIL   │  │   SMS    │                   │
│  │ (Twilio) │  │(SendGrid)│  │ (Twilio) │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
│                                                              │
│  • LiveKit agent for outbound calls                          │
│  • Persona-appropriate voice (Alex for communication)        │
│  • Templated emails with personalization                     │
│  • SMS for quick confirmations                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TASK TRACKER                              │
│  • Request ID + status (pending, in_progress, completed)     │
│  • Results from each outreach attempt                        │
│  • Follow-up scheduling if needed                            │
│  • User notification on completion                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   USER CONFIRMATION                          │
│  "I called 4 hotels. The Fontainebleau has the best rate    │
│   at $245/night with a AAA discount. Want me to book it?"   │
└─────────────────────────────────────────────────────────────┘
```

---

## Outreach Channels

### 1. Phone Calls (Primary)

**Technology**: LiveKit outbound calling + Twilio SIP

**Flow**:
```
1. Concierge dials business via Twilio
2. LiveKit agent handles the conversation
3. Agent uses domain-specific script
4. Transcription captured for parsing
5. Results extracted and stored
```

**Script Example (Hotel)**:
```
Agent: "Hi, I'm calling on behalf of [User Name]. I'm looking for
        room availability for [dates]. Could you tell me your best
        available rate? And are there any promotions or discounts
        I should know about - AAA, senior, or corporate rates?"

[Handles responses, asks follow-ups]

Agent: "Great, thank you. Can I get your name for reference?
        And is there a confirmation number for this quote?"
```

**Persona**: Alex (communication specialist) handles all outbound calls

### 2. Email

**Technology**: SendGrid or existing email infrastructure

**Use Cases**:
- Formal requests (doctor's offices, insurance)
- Requests requiring documentation
- Follow-up after phone calls
- Businesses preferring email

**Template Structure**:
```
Subject: [Request Type] for [User Name] - [Date/Details]

Dear [Business Name],

I'm reaching out on behalf of [User Name] regarding [specific request].

[Specific details: dates, requirements, questions]

Please respond to this email or call [callback number] at your
earliest convenience.

Best regards,
Alex
Ferni AI Assistant
[Callback number]
```

### 3. SMS

**Technology**: Twilio SMS

**Use Cases**:
- Quick confirmations
- Appointment reminders
- Status checks with known contacts
- Local service providers who prefer text

---

## Permission & Confirmation Model

### Before Outreach
```
User: "Get me hotel prices for Miami next weekend"

Ferni: "I found 5 hotels in Miami Beach. I can call them to get
        their best rates - often better than what's online.
        Should I make those calls now?"

User: "Yes, go ahead"
```

### After Outreach
```
Ferni: "I've called 4 hotels. Here's what I found:

        1. Fontainebleau - $245/night (AAA discount)
        2. The Setai - $380/night (no discounts available)
        3. Faena - $320/night (10% off for booking direct)
        4. W South Beach - $275/night (standard rate)

        The Fontainebleau has the best value. Want me to call
        back and book it? I'll need your credit card details."
```

### Booking Confirmation
```
User: "Book the Fontainebleau"

Ferni: "I'll call them back to book. Before I do:
        - 2 nights: March 15-17
        - 1 king room
        - $490 total ($245 x 2)

        I'll need to provide a credit card to hold the reservation.
        Should I use the Visa ending in 4242?"
```

---

## Data Model

### ConciergeRequest
```typescript
interface ConciergeRequest {
  id: string;
  userId: string;

  // Request details
  domain: 'hotel' | 'restaurant' | 'healthcare' | 'service' | 'travel' | 'other';
  type: 'quote' | 'booking' | 'appointment' | 'inquiry' | 'complaint';
  description: string;

  // Targets
  targets: ConciergeTarget[];

  // Status
  status: 'pending' | 'in_progress' | 'awaiting_user' | 'completed' | 'failed';

  // Results
  results: ConciergeResult[];
  recommendation?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface ConciergeTarget {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  source: 'google_places' | 'user_contacts' | 'manual';

  // Outreach status
  status: 'pending' | 'calling' | 'emailed' | 'completed' | 'failed' | 'no_answer';
  attempts: number;
}

interface ConciergeResult {
  targetId: string;
  channel: 'phone' | 'email' | 'sms';

  // Outcome
  success: boolean;
  summary: string;

  // Extracted data (domain-specific)
  data: {
    price?: number;
    availability?: boolean;
    notes?: string;
    contactName?: string;
    referenceNumber?: string;
    expiresAt?: Date;
  };

  // Raw data
  transcriptUrl?: string;
  emailThreadId?: string;

  timestamp: Date;
}
```

---

## Implementation Phases

### Phase 1: Hotel Concierge (MVP)
- [ ] Google Places integration for hotel discovery
- [ ] Outbound calling via Twilio + LiveKit
- [ ] Hotel-specific conversation script
- [ ] Result parsing and comparison
- [ ] User confirmation flow
- [ ] Basic task tracking

**Timeline**: 2-3 weeks

### Phase 2: Restaurant Reservations
- [ ] OpenTable/Resy API check first
- [ ] Phone fallback for non-partnered restaurants
- [ ] Dietary accommodation requests
- [ ] Large party handling
- [ ] Calendar integration for reminders

**Timeline**: 1-2 weeks (builds on Phase 1)

### Phase 3: Healthcare Appointments
- [ ] Doctor/dentist/specialist finding
- [ ] Appointment scheduling calls
- [ ] Insurance verification questions
- [ ] Prescription refill requests
- [ ] HIPAA-aware data handling

**Timeline**: 2-3 weeks

### Phase 4: Local Services
- [ ] Service provider discovery
- [ ] Quote collection from multiple providers
- [ ] Availability coordination
- [ ] SMS for tradesperson communication

**Timeline**: 1-2 weeks

---

## Key Components to Build

### 1. ConciergeService (`src/services/concierge/`)
```
concierge/
├── index.ts                 # Main exports
├── router.ts                # Domain routing
├── discovery/
│   ├── google-places.ts     # Business discovery
│   └── contact-lookup.ts    # User's contacts
├── outreach/
│   ├── phone-caller.ts      # Outbound call handling
│   ├── email-sender.ts      # Email composition/sending
│   └── sms-sender.ts        # SMS handling
├── scripts/
│   ├── hotel.ts             # Hotel conversation script
│   ├── restaurant.ts        # Restaurant script
│   └── healthcare.ts        # Healthcare script
├── parser/
│   └── result-extractor.ts  # Extract structured data from calls
└── tracker/
    └── task-tracker.ts      # Request lifecycle management
```

### 2. Concierge Tools (`src/tools/domains/concierge/`)
```typescript
// Tools exposed to personas
- requestHotelQuotes(destination, dates, preferences)
- makeRestaurantReservation(restaurant, date, party_size, requests)
- scheduleAppointment(provider_type, preferences, urgency)
- getServiceQuotes(service_type, description, location)
- checkConciergeStatus(request_id)
```

### 3. Alex Concierge Persona Extension
```
Alex gains:
- Outbound calling capability
- Concierge script library
- Multi-call orchestration
- Result aggregation and recommendation
```

---

## Security & Privacy

### User Data
- Credit card info: Never stored, passed directly to business
- Call recordings: Stored encrypted, auto-deleted after 30 days
- Personal info: Only shared with explicit user consent

### Permissions
- Outbound calls require explicit user opt-in
- Each domain (hotels, healthcare, etc.) has separate permission
- Users can revoke permission anytime

### Audit Trail
- All outreach attempts logged
- Transcripts available for user review
- Clear record of what was said on their behalf

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Call completion rate | >80% |
| User satisfaction (post-task) | >4.5/5 |
| Time saved vs. DIY | >70% reduction |
| Successful bookings/appointments | >60% of requests |
| User opt-in rate | >40% of eligible users |

---

## Open Questions

1. **Booking payments**: Handle in-call or redirect to business website?
2. **Failed calls**: How many retry attempts before giving up?
3. **Business hours**: Queue calls for business hours or inform user?
4. **International**: Support for non-US businesses?
5. **Language**: Handle non-English speaking businesses?

---

*Design created: December 2024*
*Status: Design phase*
