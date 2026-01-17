# Group Conference & Concierge: Better Than Human Design

> **"We believe in making AI human, and the decisions we make will reflect that."**

This document outlines how Group Conference (Team Roundtables, Conference Calls) and Concierge features should be designed to align with Ferni's core principles.

---

## The Problem We're Solving

Traditional group calls and personal assistant services feel:
- **Transactional** - "Schedule this", "Call them"
- **Cold** - Robotic voices, sterile interfaces
- **Disconnected** - No context, no relationship, no care

Ferni should make these feel like:
- **Having wise friends in the room** who know your story
- **A thoughtful ally** who remembers what matters to you
- **Natural extension** of your relationship with Ferni

---

## Part 1: Team Roundtable (You + Ferni Team)

### What It Is
A conversation with multiple Ferni personas simultaneously—like having your personal board of advisors in the room.

### The "Better Than Human" Difference

| Human Limitation | Ferni Advantage |
|------------------|-----------------|
| Friends have conflicting schedules | Your whole team, anytime |
| Experts have narrow perspectives | Six integrated viewpoints |
| Advisors forget your context | Perfect memory across all personas |
| Group dynamics can be awkward | Orchestrated, supportive flow |
| Someone always dominates | Turn-taking that ensures all voices heard |

### Design Principles

1. **Not a Conference Call**
   - Don't use conference call UI patterns (grids of faces, mute buttons)
   - Feel like: friends gathered around a fire, each offering their perspective
   - Visual: Personas appear as warm presences, not video tiles

2. **Intelligent Orchestration**
   - Ferni (coordinator) facilitates naturally: "Maya, what do you notice about the habit patterns here?"
   - Personas build on each other's insights, not compete
   - Conversation flows like a good dinner party, not a business meeting

3. **Context is King**
   - Each persona arrives "briefed" on what you've shared with the others
   - No awkward "let me fill you in"—they already know
   - But they also know boundaries (what not to bring up)

4. **One Voice at a Time**
   - Clear turn-taking with natural transitions
   - Visual indicators of who's speaking that feel warm, not clinical
   - Breathing room between speakers

### Use Cases That Feel Right

- **Life Decision**: "I'm considering a career change. Can I talk to the team about it?"
- **Relationship Complexity**: "I need perspectives on this situation with my partner"
- **Stuck Point**: "I keep hitting the same wall. What does everyone notice?"
- **Celebration**: "I hit a big milestone. I wanted to share it with everyone."

### Use Cases to Avoid (For Now)

- "Add my friend to this call" (that's Conference Call, different feature)
- "Let me talk to Peter and Maya separately" (use handoffs instead)
- "Record this for later" (feels surveillance-y)

---

## Part 2: Conference Call (You + Ferni + External People)

### What It Is
Ferni joins a call with real people in your life—family, partner, therapist—to help facilitate.

### ⚠️ Why This Needs Careful Design

This is sensitive. We're introducing AI into human relationships. Get it wrong and it feels:
- **Intrusive** - "Why is there a robot in our conversation?"
- **Judgy** - "Is Ferni analyzing me?"
- **Replacing** - "Are you talking to AI instead of me?"

### The "Better Than Human" Difference

| Human Limitation | Ferni Advantage |
|------------------|-----------------|
| Hard conversations escalate | Gentle de-escalation |
| We forget what we wanted to say | Ferni remembers your goals |
| Misunderstandings compound | Clarifying reframes |
| One person dominates | Equitable facilitation |
| Context gets lost | Ferni bridges understanding |

### Design Principles

1. **Invited, Not Imposed**
   - The other person must explicitly consent
   - Ferni introduces itself warmly: "Hi, I'm Ferni. [Name] invited me to help facilitate today."
   - Clear opt-out at any moment

2. **Facilitation, Not Participation**
   - Ferni's role: gentle guide, not third participant
   - Mostly quiet, speaks only when helpful
   - "Can I offer a reframe?" rather than jumping in

3. **Transparency**
   - Others know Ferni has context from you
   - But Ferni respects confidentiality: "I know [Name] has been thinking about this, but I'll let them share what they're comfortable with"

4. **Human First**
   - Ferni fades to background when conversation flows well
   - Never takes over
   - Goal: help humans connect, then step back

### Use Cases That Feel Right

- **Couples Coaching**: Partner wants help having a difficult conversation
- **Family Mediation**: Multiple family members with Ferni as neutral facilitator
- **Professional Coaching**: With therapist's permission, Ferni provides context

### Use Cases to Avoid (For Now)

- Surprise adding Ferni to someone's call
- Business negotiations or legal matters
- Situations where the other person hasn't agreed

---

## Part 3: Concierge (Real-World Actions)

### What It Is
Ferni takes action in the real world on your behalf—making calls, sending messages, booking reservations.

### The "Better Than Human" Difference

| Human Limitation | Ferni Advantage |
|------------------|-----------------|
| Personal assistants expensive | Always available |
| Forget preferences over time | Perfect memory of your tastes |
| Limited availability | 24/7 presence |
| Inconsistent quality | Reliable, thoughtful execution |
| No context | Knows your full story |

### Design Principles

1. **Permission-Based**
   - Clear consent before each action type
   - "Should I call the restaurant, or would you prefer to?"
   - Never acts without explicit approval

2. **Transparency in Action**
   - Shows what Ferni will say before calling
   - Real-time updates: "I'm on hold with the hotel..."
   - Clear summary after: "Here's what we agreed on"

3. **Your Voice, Not Ferni's Voice**
   - When making calls, Ferni represents YOU, not itself
   - "Hi, I'm calling on behalf of [Name]..."
   - Captures your preferences and style

4. **Thoughtful, Not Robotic**
   - Remembers preferences: "You mentioned you prefer window seats"
   - Anticipates: "Should I also ask about their vegetarian options?"
   - Human touches: "I noticed their anniversary is coming up—should I mention it?"

### Use Cases That Feel Right

- **Restaurant Reservations**: "Can you book us something nice for date night?"
- **Travel Coordination**: "I need to reschedule my flight—can you handle it?"
- **Professional Inquiries**: "Can you get quotes from a few contractors?"
- **Care Coordination**: "Can you check in with my mom's doctor's office?"

### Use Cases to Avoid (For Now)

- Financial transactions without explicit approval flow
- Medical decisions
- Legal matters
- Anything requiring your literal voice/signature

---

## Implementation Priorities

### Phase 1: Team Roundtable (Near-term)
- [ ] Design warm "gathering" UI (not conference call)
- [ ] Implement turn-taking orchestration
- [ ] Cross-persona context briefing
- [ ] Test with 2-3 persona combinations first

### Phase 2: Concierge Foundations (Medium-term)
- [ ] Permission/consent framework
- [ ] Action preview system ("Here's what I'll say...")
- [ ] Real-time status updates
- [ ] Post-action summaries
- [ ] Start with restaurant reservations (low-stakes, high-value)

### Phase 3: Conference Calls (Long-term)
- [ ] Consent flow for external participants
- [ ] Facilitation mode (quiet unless needed)
- [ ] Privacy boundaries (what Ferni can/can't share)
- [ ] Couples coaching pilot

---

## Questions to Answer Before Building

### Team Roundtable
1. How do we visualize multiple personas without feeling like a Zoom grid?
2. What's the right balance of orchestration vs. natural flow?
3. How do personas "build on" each other's insights?

### Conference Call
1. How does the other person consent? (Link? Voice confirmation?)
2. What does Ferni's "quiet facilitation" actually sound like?
3. How do we handle if someone wants Ferni to leave?

### Concierge
1. What's the approval flow that feels light but safe?
2. How do we handle errors? ("The restaurant is fully booked...")
3. What's the right level of initiative? (Suggest vs. wait to be asked)

---

## Measuring Success

### It Feels Right When:
- Users say "It was like having wise friends in the room"
- External participants say "That was actually helpful"
- Actions completed feel "like I did it, but better"

### Red Flags:
- "It felt robotic/cold"
- "I felt surveilled/analyzed"
- "It took over the conversation"
- "I wasn't sure what Ferni did"

---

## References

- `CORE-PRINCIPLES.md` - Ferni's foundational philosophy
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - EQ principles
- `docs/architecture/GROUP-CONVERSATIONS.md` - Technical architecture
- `docs/design/CONCIERGE-FEATURE.md` - Existing concierge design

---

*This is a living document. Update as we learn from user feedback.*

