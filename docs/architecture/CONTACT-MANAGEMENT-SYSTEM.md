# Contact Management System

> **"Send season's greetings to my whole family in deeply personalized ways."**

A comprehensive contact management and personalized outreach system that makes Ferni "better than human" at maintaining relationships.

---

## What Makes This "Better Than Human"

| Human Limitation | Ferni's Superpower |
|------------------|-------------------|
| Forgets when they last talked to someone | **Perfect recency tracking** - knows exactly when you last contacted each person |
| Can't remember everyone's details | **Total recall** - remembers everything mentioned about each contact |
| Sends generic holiday cards | **Deep personalization** - each message reflects your unique relationship |
| Misses important dates | **Proactive awareness** - alerts you before birthdays, anniversaries |
| Doesn't know preferred contact method | **Channel intelligence** - knows who prefers texts vs calls vs email |
| Can't scale personal touches | **Batch personalization** - send 50 personalized messages as easily as 1 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONTACT MANAGEMENT SYSTEM                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Contact Store   │  │ Relationship    │  │ Seasonal        │      │
│  │                 │  │ Network         │  │ Awareness       │      │
│  │ - Basic info    │  │ - Sentiment     │  │ - Holidays      │      │
│  │ - Channels      │  │ - Themes        │  │ - Personal dates│      │
│  │ - Groups        │  │ - Pain points   │  │ - Patterns      │      │
│  │ - Important     │  │ - Connection    │  │                 │      │
│  │   dates         │  │   opportunities │  │                 │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └──────────┬─────────┴────────────────────┘                │
│                      │                                               │
│           ┌──────────▼──────────┐                                    │
│           │  PERSONALIZED       │                                    │
│           │  OUTREACH SERVICE   │                                    │
│           │                     │                                    │
│           │  - Context builder  │                                    │
│           │  - Message generator│                                    │
│           │  - Batch sender     │                                    │
│           │  - Timing optimizer │                                    │
│           └──────────┬──────────┘                                    │
│                      │                                               │
│           ┌──────────▼──────────┐                                    │
│           │  COMMUNICATION      │                                    │
│           │  CHANNELS           │                                    │
│           │                     │                                    │
│           │  📧 Email (SendGrid)│                                    │
│           │  📱 SMS (Twilio)    │                                    │
│           │  📞 Voice (Twilio)  │                                    │
│           │  💬 Voice msg (TTS) │                                    │
│           └─────────────────────┘                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Enhanced Contact

```typescript
interface Contact {
  // Identity
  id: string;
  userId: string;
  name: string;
  aliases: string[];           // "mom", "mother", "mama"
  
  // Communication Channels (ranked by preference)
  channels: ContactChannel[];
  preferredChannel: 'email' | 'sms' | 'phone' | 'voice_message';
  
  // Relationship
  relationship: ContactRelationship;
  groups: string[];            // "family", "close_friends", "work"
  
  // Important Dates
  importantDates: ImportantDate[];
  
  // Context (from conversations)
  interests: string[];         // Things they care about
  recentTopics: string[];      // What you've discussed lately
  sharedMemories: string[];    // Inside jokes, shared experiences
  sensitiveTopics: string[];   // Things to avoid
  
  // Communication Patterns
  lastContactDate: Date;
  lastContactMethod: string;
  avgResponseTime?: number;    // Hours
  preferredTimes?: string[];   // "mornings", "weekends"
  
  // Relationship Health
  strengthScore: number;       // 0-100
  sentiment: 'warm' | 'neutral' | 'strained' | 'complicated';
  needsAttention: boolean;
}

interface ContactChannel {
  type: 'email' | 'phone' | 'sms';
  value: string;               // Email address or phone number
  label?: string;              // "work", "personal", "mobile"
  verified: boolean;
  preferenceRank: number;      // 1 = most preferred
}

interface ImportantDate {
  date: string;                // MM-DD format
  type: 'birthday' | 'anniversary' | 'memorial' | 'custom';
  label: string;               // "Birthday", "Wedding anniversary"
  yearsKnown?: number;         // For "Happy 40th!"
  sentiment: 'celebratory' | 'reflective' | 'sensitive';
}
```

### Contact Groups

```typescript
interface ContactGroup {
  id: string;
  userId: string;
  name: string;                // "Family", "Close Friends"
  description?: string;
  members: string[];           // Contact IDs
  defaultChannel?: 'email' | 'sms';
  
  // Group-wide settings
  occasionPreferences: {
    christmas?: boolean;       // Send Christmas greetings
    newYear?: boolean;
    birthdays?: boolean;
    thanksgivings?: boolean;
  };
}
```

---

## Personalized Outreach Flow

### 1. User Request
```
"Send season's greetings to my family"
"Wish everyone a happy new year"
"Send birthday wishes to Mom"
```

### 2. Contact Resolution
- Resolve "my family" → Contact group → Individual contacts
- For each contact, gather:
  - Communication channels
  - Relationship context
  - Recent conversation topics
  - Important dates
  - Sentiment/tone preferences

### 3. Context Building (Per Contact)
```typescript
interface OutreachContext {
  contact: Contact;
  
  // Relationship context
  lastContactedDays: number;
  recentTopicsDiscussed: string[];
  sharedExperiences: string[];
  
  // Seasonal context
  occasion: string;            // "Christmas", "New Year"
  upcomingDates: ImportantDate[];
  
  // Personalization signals
  theirInterests: string[];
  theirChallenges: string[];
  insideJokes: string[];
  
  // Tone guidance
  formalityLevel: 'casual' | 'warm' | 'formal';
  emotionalTone: 'celebratory' | 'reflective' | 'supportive';
}
```

### 4. Message Generation
LLM generates unique message for each contact using:
- Occasion template
- Personal context
- User's voice/style
- Relationship depth

### 5. User Review (Optional)
- Show all messages before sending
- Allow edits per message
- Batch approve or individual approve

### 6. Multi-Channel Delivery
- Route to preferred channel per contact
- Track delivery status
- Record interaction in contact history

---

## Better Than Human Features

### 1. Recency Intelligence
```
"You haven't talked to Aunt Mary in 3 months. 
She mentioned her knee surgery last time. 
Maybe check in on how she's recovering?"
```

### 2. Proximity Awareness
```
"Your cousin Jake lives in Austin - you'll be 
there next week. Want me to suggest meeting up?"
```

### 3. Date Intelligence
```
"Mom's birthday is in 5 days. Last year you 
sent flowers - should I draft a card and remind 
you to order something?"
```

### 4. Holiday Context
```
"It's almost Christmas. Here's who you usually 
send greetings to: [list]. Anyone missing?"
```

### 5. Deep Personalization
Instead of: "Merry Christmas!"

Generate: "Merry Christmas, Sarah! Hope you and 
the kids are enjoying the snow in Colorado. Still 
thinking about that hiking story from Thanksgiving - 
maybe we can do a trip together next summer?"

---

## LLM Tools

### For Alex (Communication Specialist)

| Tool | Description |
|------|-------------|
| `sendPersonalizedMessage` | Send single personalized message to contact |
| `sendBatchMessages` | Send personalized messages to a group |
| `previewBatchMessages` | Generate and show all messages before sending |
| `addContactChannel` | Add email/phone to existing contact |
| `createContactGroup` | Create a group like "Family" or "Work Friends" |
| `getContactsNeedingAttention` | Who haven't you talked to in a while? |
| `getUpcomingOccasions` | Birthdays, anniversaries coming up |
| `suggestOutreach` | Proactive suggestions for who to contact |

### Example Tool Call Flow

```
User: "Send Christmas greetings to my family"

1. Alex calls `getContactGroup("family")`
   → Returns 12 family members

2. Alex calls `previewBatchMessages({
     group: "family",
     occasion: "christmas",
     tone: "warm"
   })`
   → Returns 12 personalized drafts

3. User reviews: "These look great, send them"

4. Alex calls `sendBatchMessages({
     messages: [previewed messages],
     channel: "preferred"  // Uses each person's preferred channel
   })`
   → Sends via email/SMS based on each contact's preference
```

---

## Integration Points

### 1. Conversation Analysis
When user talks about someone, automatically:
- Create/update contact
- Extract interests, challenges, recent topics
- Update relationship sentiment
- Record important dates mentioned

### 2. Seasonal Awareness Service
- Inject upcoming holidays into context
- Track personal dates (birthdays, anniversaries)
- Trigger proactive outreach suggestions

### 3. Relationship Network
- Map connections between contacts
- Understand family trees, friend groups
- Use for smarter group suggestions

### 4. Communication History
- Log every outreach
- Track response rates
- Learn optimal timing per contact

---

## Implementation Phases

### Phase 1: Foundation (Current Sprint)
- [x] Contact relationship service (exists)
- [x] Communication service (email, SMS)
- [ ] Enhanced contact type with channels
- [ ] Contact groups

### Phase 2: Personalization Engine
- [ ] Context builder for outreach
- [ ] LLM message generation
- [ ] Batch message preview

### Phase 3: Intelligence Layer
- [ ] Proactive outreach suggestions
- [ ] Optimal timing predictions
- [ ] Relationship health monitoring

### Phase 4: Multi-Channel Excellence
- [ ] Voice message generation
- [ ] Rich email templates
- [ ] Card/gift suggestions

---

## Privacy & Security

- All contact data encrypted at rest
- User controls what Ferni remembers about each contact
- Easy export/delete of contact data
- No sharing of contact information

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Messages sent per user/month | 20+ |
| Personalization quality (user rating) | 4.5+/5 |
| Time saved vs manual | 80%+ |
| Relationship strength improvement | +10% after 3 months |

---

*Last updated: December 2024*

