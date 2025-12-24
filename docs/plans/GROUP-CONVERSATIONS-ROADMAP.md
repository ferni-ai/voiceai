# Group Conversations Roadmap

> **"What if Ferni could be in your real conversations?"**

## 🎯 The Vision

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   "Hey Ferni, let's do a team brainstorm about my career change.    │
│    And actually, can you call my partner too? We should all         │
│    discuss this together."                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        🏠 LiveKit Room                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │    😊    │  │    🌿    │  │    🔬    │  │    📱    │            │
│  │   You    │  │  Ferni   │  │  Peter   │  │  Sarah   │            │
│  │ (WebRTC) │  │ (Coach)  │  │(Research)│  │ (Phone)  │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│       │              │              │              │                 │
│       └──────────────┴──────────────┴──────────────┘                 │
│                         Everyone hears everyone                       │
│                         Smart turn-taking                             │
│                         Attributed transcript                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Two Flavors

### 🎭 Team Roundtable (You + Multiple Agents)

```
You: "I'm thinking about leaving my job..."

Ferni: "That's a big decision. What's drawing you toward change?"

Peter: "I can research the market for your skills if that would help."

Maya: "Let's also look at your energy patterns - you've been 
       mentioning burnout in our habit check-ins."

You: "All of that, yes! Let's dig in."
```

**Key Features:**
- Multiple agents active simultaneously
- Intelligent turn-taking (no cross-talk)
- Each contributes their expertise
- Natural back-and-forth between agents
- Ferni moderates by default

### 📞 Conference Call (You + Agent + External People)

```
You: "Ferni, add my partner to this call."

Ferni: "Of course. What's their number?"

You: "555-123-4567"

Ferni: "Calling now..."

[Phone rings, Sarah picks up]

Sarah: "Hello?"

Ferni: "Hi Sarah! It's Ferni. Your partner wanted to 
        have a conversation together about the move. 
        I'll be here to help facilitate. You're both 
        on the line now."

You: "Hey babe! So I was talking to Ferni about..."
```

**Key Features:**
- Dial out to any phone number
- External person joins the same room
- Ferni acts as facilitator/coach/note-taker
- Takes notes, tracks action items
- Can mediate difficult conversations

---

## Use Cases

### Team Roundtable Use Cases

| Scenario | Agents Involved | Value |
|----------|-----------------|-------|
| Career brainstorm | Ferni + Peter + Maya | Life coaching + market research + energy patterns |
| Weekly review | Ferni + Maya + Jordan | Reflection + habits + planning |
| Big decision | All team | Multiple perspectives at once |
| Research deep-dive | Peter + Ferni | Research + context |
| Event planning | Jordan + Alex | Planning + communications |

### Conference Call Use Cases

| Scenario | Who's on the call | Agent Role |
|----------|-------------------|------------|
| Relationship check-in | You + Partner + Ferni | Mediator, note-taker |
| Family decision | You + Parents + Ferni | Facilitator, action tracker |
| Friend support | You + Friend + Ferni | Coach, prompter |
| Accountability partner | You + Friend + Maya | Habit coach, progress tracker |
| Therapist bridge | You + Therapist VM + Ferni | Summary deliverer |

---

## Implementation Phases

```
Phase 1                    Phase 2                    Phase 3
Team Roundtable           Conference Calls           Advanced
────────────────          ────────────────          ────────────────
Week 1-4                  Week 5-7                  Week 8-9

┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│ Multi-Agent │           │ SIP Bridge  │           │ Intelligence│
│ Activation  │           │ Extension   │           │ & Polish    │
├─────────────┤           ├─────────────┤           ├─────────────┤
│ Turn-Taking │           │ Add to Room │           │ Summarize   │
│ Engine      │           │ Function    │           │ Meetings    │
├─────────────┤           ├─────────────┤           ├─────────────┤
│ Agent-Agent │           │ Conference  │           │ Action      │
│ Protocol    │           │ Agent Mode  │           │ Items       │
├─────────────┤           ├─────────────┤           ├─────────────┤
│ Team UI     │           │ Add Modal   │           │ Follow-up   │
│ Components  │           │ Components  │           │ System      │
└─────────────┘           └─────────────┘           └─────────────┘
```

---

## Voice Commands

### Starting Group Sessions

```
"Let's talk to the whole team"
"I want Peter and Maya both"
"Team meeting time"
"Get everyone's perspective"
```

### Adding External People

```
"Call my partner"
"Add Sarah to this call"
"Conference in my mom"
"Can you call [name] at [number]?"
```

### During Session

```
"Peter, what do you think?"
"Everyone's thoughts on this?"
"Just me and Ferni now"
"End the group call"
```

---

## Technical Requirements

### For Team Roundtable

| Requirement | Existing? | Status |
|-------------|-----------|--------|
| Multi-agent orchestrator | ✅ Yes | Needs extension |
| Multiple Gemini sessions | ✅ Yes | Works |
| Multiple TTS voices | ✅ Yes | Works |
| Turn-taking | ❌ New | Needs implementation |
| Agent-to-agent comms | ❌ New | Needs implementation |

### For Conference Calls

| Requirement | Existing? | Status |
|-------------|-----------|--------|
| SIP Bridge | ✅ Yes | Needs extension |
| Twilio outbound | ✅ Yes | Works |
| LiveKit rooms | ✅ Yes | Works |
| Add to existing room | ❌ New | Needs implementation |
| Multi-speaker detection | ❌ New | Needs implementation |

---

## Pricing Considerations

### Team Roundtable
- No additional cost (all agents are software)
- Slightly higher LLM token usage (multiple agents)
- Included in existing subscription

### Conference Calls
- Phone costs: ~$0.02-0.05/min per external person
- Options:
  - Pass-through billing
  - Include X minutes in subscription
  - Premium feature add-on

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Session completion | > 90% | Tech reliability |
| Turn-taking latency | < 1.5s | Natural feeling |
| Agent balance | σ < 20% | No agent dominance |
| Call connection | > 95% | Phone reliability |
| NPS for feature | > 50 | User satisfaction |

---

## Brand Alignment

This feature embodies our core principles:

> **"Making AI human"**

- Ferni isn't just a 1:1 tool - she's part of your life
- She can be present in your real relationships
- The team feels like actual people collaborating

> **"Better than human"**

- Perfect memory of what everyone said
- Unbiased facilitation
- Never tired, never impatient
- Tracks action items automatically

> **"Serves relationships, not transactions"**

- Conference calls help real relationships
- Agent collaboration models healthy communication
- Focus is on outcomes, not features

---

## Next Steps

1. **Review**: Get feedback on architecture
2. **Prototype**: Build minimal team roundtable (2 agents)
3. **Test**: Internal testing of turn-taking
4. **Iterate**: Tune natural-feeling timing
5. **Expand**: Add conference call capability
6. **Ship**: Beta with power users

---

## Full Architecture

See `docs/architecture/GROUP-CONVERSATIONS.md` for complete technical details.

