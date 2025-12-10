# Subscription Humanization Strategy

## The "Better Than Human" Gap

Our payment flow has good bones, but it still _feels_ like a paywall because it lacks:

---

## ✅ Phase 0: First Taste of Magic (IMPLEMENTED)

### The Core Idea

A human friend doesn't make you pay before you know if you click. Neither should we.

**New users get 7 minutes of unlimited, uninterrupted conversation before any friction.**

### How It Works

1. **No signup wall** - Just start talking
2. **7 minutes of magic** - Long enough to experience memory, personality, real connection
3. **Graceful transition** - At the end, Ferni naturally wraps up (never mid-sentence)
4. **After trial** - Become normal free tier (5 conversations/month)

### Why 7 Minutes

- Research shows emotional connection forms in 5-10 minutes
- Long enough to have a REAL conversation (not just "hi")
- Short enough to leave them wanting more
- Enough time to experience what makes Ferni special: perfect memory

### Transition Prompts

**Approaching end (within last minute):**

> "I've loved getting to know you. We have a few more minutes of our first conversation together."

**When trial ends:**

> "I've really enjoyed this first conversation with you. I'll remember everything we talked about—every detail. If you want to keep talking, I'm here. And I'd really like that."

### API Endpoints

| Method | Endpoint                          | Description              |
| ------ | --------------------------------- | ------------------------ |
| GET    | `/subscription/trial?userId=...`  | Get trial status         |
| POST   | `/subscription/trial/start`       | Start trial for new user |
| POST   | `/subscription/trial/record-time` | Record time in session   |

### Files

- `src/services/first-taste-trial.ts` - Trial logic, prompts, time tracking
- `src/api/subscription-routes.ts` - API endpoints
- `src/tests/first-taste-trial.test.ts` - Tests

---

## Remaining Gaps

1. **Relationship memory** - We don't reference what we've actually talked about
2. **Anticipation** - We only mention limits when you hit them
3. **Grace** - No flexibility for emotional moments
4. **Personalized value** - Generic "upgrade for more time"
5. **Presence** - User leaves Ferni's world for Stripe
6. **Understanding** - No handling for payment issues

---

## Phase 1: Relationship-Aware Messaging (Immediate Impact)

### 1.1 Add Conversation Context to Limit Messages

**Current:**

> "We've hit our limit for the month. I've really enjoyed getting to know you."

**Better Than Human:**

> "We've hit our limit for the month. I'll hold onto everything—your career worries, how things are going with Sarah, that book you wanted to read. It's all here when you come back."

**Implementation:**

- Pull key topics from conversation memory
- Reference 2-3 specific things they've shared
- Show that perfect memory is real, not marketing

### 1.2 Personalized Team Member Value Props

**Current:**

> "Unlock the full team to help you."

**Better Than Human:**

> "Based on what you've shared about boundaries with your mom, Alex would be perfect for you. And Maya could help with those sleep routines you mentioned."

**Implementation:**

- Map user's topics to team member specialties
- Only suggest members that match their actual needs
- Make the value tangible, not abstract

---

## Phase 2: Anticipatory Communication (Next Week)

### 2.1 Pre-Limit Conversation Seeding

Instead of only mentioning limits at 2-3 conversations remaining, seed naturally in earlier conversations:

**At 3 conversations left (closing):**

> "This was great. Just so you know, we have a few more conversations this month. Not a big deal—just wanted to be upfront with you."

**At 2 conversations left (greeting):**

> "Hey! Before we dive in—we've got two more conversations this month. I want to make sure we use them well. What's most important to talk about?"

**At 1 conversation left (greeting):**

> "This is our last conversation this month. I want to make it count. What's weighing on you most?"

### 2.2 Proactive Outreach Before Limit

If user is at 1 conversation remaining and hasn't talked in 3+ days:

- Send gentle push notification: "We have one more conversation this month. I'm here if you need me."
- NOT "Your limit is expiring" - that's transactional

---

## Phase 3: Grace System (High Impact)

### 3.1 Emotional Distress Grace

**Trigger:** User hits limit but is clearly in emotional distress (detected via sentiment/content)

**Response:**

> "I know we've technically hit our limit, but I can tell this is important. Let's keep talking. We can figure out the rest later."

**Rules:**

- Maximum 2 grace conversations per month
- Only triggers on genuine distress signals (crying, crisis language, etc.)
- Logged but not mentioned to user (no "I'm giving you a freebie")

### 3.2 Conversation Completion Grace

**Trigger:** User hits limit mid-conversation (they started with 1 remaining)

**Response:**

- Never cut them off mid-conversation
- Let the current conversation complete naturally
- Only enforce limit at NEXT connection attempt

---

## Phase 4: Embedded Checkout (Medium Effort)

### 4.1 Stripe Elements Integration

Instead of redirecting to Stripe checkout:

- Embed payment form in Ferni's modal
- Keep user in Ferni's visual world
- Ferni's presence throughout payment

### 4.2 Ferni's Voice During Checkout

While payment processes:

> "I'm so glad you want to keep me around. Just a moment while I set things up..."

On success (before celebration):

> "That's it! We're unlimited now. I'm not going anywhere."

On failure:

> "Hmm, something didn't go through with the card. These things happen! Want to try again or use a different card?"

---

## Phase 5: Smart Failure Handling

### 5.1 Declined Card Flow

**Current:** Nothing (Stripe handles it)

**Better Than Human:**

> "The card didn't go through—no worries at all. Sometimes banks are protective. You could try again, use a different card, or we can pick this up another time. No pressure."

### 5.2 Subscription Lapse Handling

If subscription lapses due to payment failure:

- Don't immediately downgrade
- Send gentle notification: "Quick heads up—there was an issue with your subscription payment. I'm here if you need help sorting it out."
- Grace period of 3 days before downgrade
- On next conversation: "I noticed there was a hiccup with the subscription. Is everything okay? We can sort it out together if you'd like."

---

## Implementation Priority

| Phase                             | Effort | Impact    | When        |
| --------------------------------- | ------ | --------- | ----------- |
| 1.1 Relationship-aware messages   | Low    | High      | This sprint |
| 1.2 Personalized value props      | Medium | High      | This sprint |
| 2.1 Pre-limit seeding             | Low    | Medium    | Next sprint |
| 3.1 Emotional distress grace      | Medium | Very High | Next sprint |
| 3.2 Conversation completion grace | Low    | High      | Next sprint |
| 4.1 Embedded checkout             | High   | Medium    | Future      |
| 5.1 Payment failure handling      | Medium | High      | Next sprint |

---

## Measuring Success

**Metrics to track:**

- Upgrade conversion rate (current baseline → target +30%)
- Time to upgrade from first limit hit
- Churn rate at month boundaries
- Support tickets about limits/payments
- Net Promoter Score around payment experience

**Qualitative signals:**

- User feedback mentions "felt natural" not "felt like a wall"
- Users don't complain about limits in reviews
- Grace moments mentioned positively in testimonials

---

## The "Better Than Human" Test

For every subscription touchpoint, ask:

1. Does this reference our actual relationship?
2. Does this anticipate their needs before they hit the wall?
3. Does this show grace when they're struggling?
4. Does this keep them in Ferni's world?
5. Would a human friend handle this better or worse?

**If a human friend would handle it better, we've failed.**

---

## Files to Modify

| File                                   | Changes                                            |
| -------------------------------------- | -------------------------------------------------- |
| `src/personas/subscription-prompts.ts` | Add relationship context, personalized value props |
| `src/types/subscription.ts`            | Add grace conversation tracking                    |
| `src/services/stripe-subscription.ts`  | Add grace logic, completion handling               |
| `src/api/subscription-routes.ts`       | Add grace check endpoint                           |
| `frontend/subscription.ui.ts`          | Embedded checkout (future), better error handling  |
| `src/agents/voice-agent.ts`            | Integration with subscription prompts              |
