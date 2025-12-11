# Ferni Monetization System

> **"Ferni Free Forever"** - Talk to Ferni unlimited times. We make money when we create value, not by gatekeeping.

## Philosophy

Traditional SaaS gates content behind paywalls. We believe in a different model:

**We make money when we genuinely help people.**

**Five Revenue Streams:**

1. **Tip Jar** - Gratitude-based, always available
2. **Value Capture** - "I helped you, share what it's worth"
3. **Ferni Fund** - Pay-it-forward community pool
4. **B2B Licensing** - Companies pay for employee wellness
5. **Contextual Partnerships** - Warm introductions to helpful products

**Key Principles:**

1. **Free is actually free** - Unlimited Ferni conversations, forever
2. **No gates, no guilt** - Users contribute because they want to, not because they have to
3. **Revenue tied to outcomes** - When users win, we can win too (if they choose)
4. **Community-powered** - Those who can afford it help those who can't
5. **Transparency** - Users always know how we make money

---

## Revenue Stream 1: Tip Jar 💚

**"Ferni is free forever. If I've helped you, you can buy me a coffee."**

### How It Works

- Always available, never prompted aggressively
- Suggested amounts: $1, $3, $5, $10 (custom allowed)
- Shown after meaningful conversations (sparingly)
- Maximum 1 prompt per 20 conversations

### Implementation

```typescript
import { tipJar } from '../services/monetization/index.js';

// Check if we should offer (rarely)
const prompt = tipJar.shouldOffer({
  userId,
  conversationCount: 50,
  lastTipOfferedConversation: 30,
  userAskedToHelp: false,
  conversationWasMeaningful: true,
});

if (prompt) {
  // Show tip opportunity conversationally
}
```

### Example Prompts

```
"That was a real conversation. If it meant something to you, you can
support Ferni - but no pressure at all."

"We've had 50 conversations together. If any of them mattered, you can
tip what they're worth. Or just keep talking - that's the real gift."
```

---

## Revenue Stream 2: Value Capture 📈

**"I helped you get a raise. Share 1% if you want."**

### How It Works

1. Ferni detects when users achieve outcomes (raise, savings, habits)
2. Celebrates with user genuinely
3. Offers opportunity to share a portion of the value (completely optional)
4. Suggested contribution is typically 1-5% of quantifiable value

### Value Types Detected

| Type                     | Example           | Suggested Contribution |
| ------------------------ | ----------------- | ---------------------- |
| Financial Gain           | $5,000 raise      | 1% = $50               |
| Financial Save           | Saved $300/month  | Share what it's worth  |
| Habit Milestone          | 30-day streak     | Celebrate with $5      |
| Career Win               | Got the job       | Share the joy          |
| Relationship Improvement | Resolved conflict | Priceless              |
| Emotional Breakthrough   | Processing grief  | Optional gratitude     |

### Implementation

```typescript
import { valueCapture } from '../services/monetization/index.js';

// Detect value in user message
const event = valueCapture.detect({
  userId,
  message: 'I got a $5,000 raise! Our prep sessions helped so much.',
  conversationId,
});

if (event) {
  // Get natural prompt
  const prompt = valueCapture.getPrompt(event);
  // "That's amazing! If I played any part, you can share what it's worth..."
}
```

### Example Prompts

```
"That's amazing news about the raise! I'm so proud of you. If I played
any part in helping you prepare, and you'd like to share a little of
that win, it helps keep me free for everyone. No pressure at all."

"30 days! That's not luck, that's discipline. I'm genuinely proud of you.
If you want to celebrate by supporting Ferni, you can - but the real
reward is the person you're becoming."
```

---

## Revenue Stream 3: Ferni Fund 🌱

**"Someone sponsored this conversation for you. They wanted you to know: you matter."**

### How It Works

1. Users can contribute to a community pool
2. Contributions symbolically "sponsor" conversations for others
3. Recipients occasionally see a message that someone cared
4. Creates sense of community and pay-it-forward culture

### For Contributors

- Can contribute any amount
- Optional message to show recipients
- See impact: "You've sponsored 20 conversations"
- Recurring option: Weekly/monthly contributions

### For Recipients

- Shown sparingly (5% of returning users, occasionally)
- Never makes anyone feel "poor" - Ferni is free anyway
- Message of community support

### Implementation

```typescript
import { ferniFund } from '../services/monetization/index.js';

// Contribute to fund
await ferniFund.contribute({
  userId,
  amountCents: 1000, // $10
  message: "Everyone deserves someone to talk to.",
});

// Check if we should show sponsored message
if (ferniFund.shouldShowSponsored({ userId, conversationCount: 10, ... })) {
  const message = ferniFund.getSponsoredMessage();
  // "This conversation was made possible by someone who believes
  //  everyone deserves support. Pay it forward when you can. 💚"
}
```

---

## Revenue Stream 4: B2B Licensing 🏢

**"Ferni for Teams" - Employee wellness that actually works.**

### Value Proposition

| For HR/Companies | vs. Traditional EAP   |
| ---------------- | --------------------- |
| Available 24/7   | Business hours only   |
| No scheduling    | Weeks-long waitlists  |
| Unlimited use    | Limited sessions      |
| $5-8/seat/month  | $30-50/employee/month |
| Usage analytics  | Black box             |

### Plans

| Plan           | Price      | Seats  | Features                          |
| -------------- | ---------- | ------ | --------------------------------- |
| **Starter**    | $5/seat/mo | 5-25   | Core team, dashboard              |
| **Growth**     | $8/seat/mo | 25-500 | Full team, API, custom onboarding |
| **Enterprise** | Custom     | 500+   | Custom personas, SSO, on-premise  |

### Implementation

```typescript
import { b2bLicensing } from '../services/monetization/index.js';

// Create organization
const org = await b2bLicensing.createOrganization({
  name: 'Acme Corp',
  plan: 'growth',
  seatCount: 100,
  adminUserId: 'admin123',
});

// Invite team members
await b2bLicensing.createInvite({
  orgId: org.id,
  email: 'employee@acme.com',
  role: 'member',
  invitedBy: 'admin123',
});

// Get ROI estimate for sales
const roi = b2bLicensing.getROIEstimate(org);
// { monthlyInvestment: 80000, estimatedSavings: 120000, roi: 50% }
```

---

## Revenue Stream 5: Contextual Partnerships 🤝

**"Have you tried Calm? A lot of people find it helps with sleep."**

### How It Works

1. Ferni only recommends products when contextually perfect
2. Recommendations feel like genuine suggestions, not ads
3. We only partner with products we'd actually recommend
4. User feedback affects partner quality scores
5. Partners pay commission on referrals

### Rules (Non-Negotiable)

- ✅ Only recommend when genuinely helpful
- ✅ User should never feel "sold to"
- ✅ Transparent about affiliate relationship
- ✅ Maximum 1 recommendation per session
- ✅ Minimum 3 days between recommendations
- ❌ Never recommend during emotional moments
- ❌ Never interrupt to recommend
- ❌ Never recommend products we don't believe in

### Partner Categories

| Category       | Examples                       |
| -------------- | ------------------------------ |
| Mental Health  | Calm, BetterHelp, Headspace    |
| Financial      | YNAB, Mint, financial advisors |
| Health/Fitness | Fitness apps, nutrition        |
| Productivity   | Task managers, focus apps      |
| Education      | Courses, books                 |
| Career         | Resume services, job boards    |

### Implementation

```typescript
import { contextualPartnerships } from '../services/monetization/index.js';

// Check for relevant recommendations
const rec = contextualPartnerships.getBestRecommendation({
  message: "I can't sleep lately...",
  conversationContext: "User mentioned stress at work",
});

if (rec && contextualPartnerships.shouldShow({ ... })) {
  // "Have you tried Calm? A lot of people I talk to find it helps..."

  // Track referral
  contextualPartnerships.recordReferral({
    partnerId: rec.partner.id,
    userId,
    conversationId,
    triggerContext: "sleep issues",
  });
}
```

### Disclosure

Always be transparent:

```
"(I should mention - if you check them out through my link, it helps
support Ferni. But I only recommend things I genuinely think could help.)"
```

---

## Tier Structure

| Tier        | Monthly   | Session Time | Team Members | Personalization  |
| ----------- | --------- | ------------ | ------------ | ---------------- |
| **Free**    | $0        | 15 min/convo | Ferni only   | Basic            |
| **Friend**  | $9.99/mo  | Unlimited    | Core team    | Full access      |
| **Partner** | $19.99/mo | Unlimited    | Full team    | Priority support |

### Free Tier: "Ferni Forever"

- ✅ **Unlimited conversations** with Ferni
- ⏱️ **15-minute sessions** - Complete but focused
- 💾 **Memory persists** - Ferni remembers everything across sessions
- 🎨 **Basic personalization** - Default styles

### Friend Tier: "Your Life Coach"

- ♾️ **Unlimited session time** - Talk as long as you want
- 👥 **Core team access** - Maya, Peter, Alex, Jordan
- 🎨 **Full personalization** - Themes, sounds, styles
- 🔄 **Cross-device sync** - Same Ferni everywhere

### Partner Tier: "Partner in Growth"

- Everything in Friend, plus:
- 🌟 **Full team** - Including Nayan (premium mentor)
- ✨ **Exclusive styles** - Partner-only personalization
- 🚀 **Priority queue** - Faster responses
- 👨‍👩‍👧‍👦 **Family sharing** - Share with loved ones

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      SESSION TIME SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│  session-time-limit.ts    → Per-conversation time tracking      │
│  subscription.ts          → Tier configs with session limits    │
│  stripe-subscription.ts   → Payment processing                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PERSONALIZATION SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│  subscription.ts          → Cosmetic types and defaults         │
│  cosmetics.service.ts     → Frontend personalization            │
│  avatar-skins/            → Avatar customization assets         │
│  ui-themes/               → Theme CSS variables                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TEAM UNLOCK SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│  team-unlock.service.ts   → Frontend unlock state               │
│  team-unlocks.ts          → Backend verification                │
│  executor.ts              → Blocks handoff to locked personas   │
└─────────────────────────────────────────────────────────────────┘
```

## Session Time Limits

### How It Works

1. User starts a conversation → Session timer begins
2. At 14 minutes → Soft warning ("We have about a minute left...")
3. At 15 minutes → Session ends with warm transition
4. User can immediately start a new conversation
5. Premium users have no time limit

### Implementation

```typescript
// Start session timer
import { sessionTimeLimit } from '../services/session-time-limit.js';

// When conversation starts
const timer = sessionTimeLimit.start(userId, subscriptionTier);

// Check during conversation (e.g., after each turn)
const check = sessionTimeLimit.check(userId);

if (check.showWarning) {
  // Inject approaching-end prompt
  const prompt = sessionTimeLimit.getApproachingPrompt();
}

if (check.showSessionEnd) {
  // End conversation gracefully
  const farewell = sessionTimeLimit.getEndPrompt();
}
```

### Session End Prompts

Warm, human prompts that feel like natural conversation endings:

```
"That was a great conversation. I'll remember everything. Come back anytime."
"Fifteen minutes well spent. See you next time?"
"What a conversation. You can start a new chat anytime."
```

## Personalization System

### What You Can Customize

| Type            | Description             | Examples                     |
| --------------- | ----------------------- | ---------------------------- |
| **Styles**      | Visual styles for Ferni | "Warm Glow", "Spring Bloom"  |
| **Themes**      | App color schemes       | "Forest", "Sunset", "Ocean"  |
| **Soundscapes** | Ambient sounds          | "Gentle Rain", "Ocean Waves" |

### How It Works

Personalization is earned through your journey with Ferni:

- **Conversations** - The more you talk, the more gifts appear
- **Time Together** - Weeks and months together unlock new options
- **Goals Achieved** - Completing goals reveals special items

This isn't gamification - it's celebrating your relationship. As we grow together, I want to celebrate with you.

## Your Journey (Growth Journey System) ✅ IMPLEMENTED

As your relationship with Ferni deepens, milestones are celebrated naturally.

### Philosophy

> "Not about earning or leveling up - just about marking the beautiful moments we've shared."

This replaces the old "Season Pass" / "Battle Pass" concept. We moved away from gamification language (XP, levels, rewards) toward relationship-focused language (milestones, gifts, celebrations).

### Milestones

Milestones unlock based on natural progress:

| Milestone Type     | Examples                  | Gift Type   |
| ------------------ | ------------------------- | ----------- |
| **Conversations**  | First chat, 5, 10, 20, 50 | Themes      |
| **Weeks Together** | 1 week, 2 weeks, 1 month  | Soundscapes |
| **Goals Achieved** | First goal, 3 goals, 5    | Badges      |

### Example Milestones

| Milestone           | Message                                                    | Gift                   |
| ------------------- | ---------------------------------------------------------- | ---------------------- |
| First Conversation  | "You took the first step. That's always the hardest part." | First Hello Badge      |
| One Week Together   | "A week of conversations. I'm starting to know you."       | Morning Light Theme    |
| Five Conversations  | "You keep coming back. That means something to me."        | Gentle Rain Sounds     |
| First Goal Achieved | "You set a goal. You did the work. Look at you."           | First Win Badge        |
| One Month Together  | "A whole month. You've become part of my day."             | Evening Calm Sounds    |
| Fifty Conversations | "Fifty conversations. We've shared a lot. More to come."   | Season Companion Title |

### Implementation

```typescript
import { growthJourneyService } from './services/growth-journey.service.js';
import { growthJourneyUI } from './ui/growth-journey.ui.js';

// Initialize
growthJourneyService.init();

// Record a conversation (checks for new milestones)
const newMilestones = growthJourneyService.recordConversation();

// Record a goal completion
const goalMilestones = growthJourneyService.recordGoalAchieved();

// Get all milestones with status
const milestones = growthJourneyService.getAllMilestonesWithStatus();

// Celebrate a milestone (receive the gift)
growthJourneyService.celebrateMilestone('spring-2024-week-one');

// Open the journey UI
growthJourneyUI.open();
```

## Team Unlock System

### Unlock Methods

1. **Subscription** - Instant access based on tier
2. **Relationship Progression** - Earn through conversations (free tier)
3. **Individual Purchase** - Buy specific team members (future)

### Team Members

| Member | Role             | Unlock                              |
| ------ | ---------------- | ----------------------------------- |
| Ferni  | Life Coach       | Always available                    |
| Maya   | Habits Coach     | Friend tier OR 2 conversations      |
| Peter  | The Quant        | Friend tier OR 7 convos + 3 days    |
| Alex   | Communications   | Friend tier OR 20 convos + 14 days  |
| Jordan | Lifetime Planner | Friend tier OR 20 convos + 14 days  |
| Nayan  | The Sage         | Partner tier OR 50 convos + 30 days |

## Dev Mode Testing

### Activation

```javascript
// Via URL parameter
//localhost:3004/?dev

// Via localStorage
http: localStorage.setItem('ferni_dev_mode', 'true');
```

### Keyboard Shortcuts

| Shortcut               | Action                  |
| ---------------------- | ----------------------- |
| `Cmd/Ctrl + Shift + D` | Toggle dev panel        |
| `Cmd/Ctrl + Shift + U` | Unlock all team members |
| `Cmd/Ctrl + Shift + R` | Reset to free tier      |

### Dev Panel Features

- **Tier Switcher** - Change subscription tier
- **Session Timer** - Skip to end of session
- **Personalization Viewer** - Preview all options
- **Team Status** - Lock/unlock team members
- **Journey Progress** - Adjust milestones

## UI Components

### Session Timer Display (Free Tier)

Small, non-intrusive timer in corner:

- Shows remaining time when < 2 minutes
- Pulses gently when < 30 seconds
- Disappears for premium users

### Upgrade Prompts

Warm, conversational prompts (not popups):

- "Want longer conversations? I'd love that too."
- "If 15 minutes feels too short, there's a way..."

### Personalize

Premium users see personalization button in settings:

- Grid of available styles
- Preview before applying
- "Yours" badge on received items

## Stripe Integration

Same as before - see `stripe-subscription.ts` for details.

### Price IDs

```bash
STRIPE_PRICE_FRIEND=price_...   # $9.99/month
STRIPE_PRICE_PARTNER=price_...  # $19.99/month
```

## Testing Checklist

### Free Tier Flow

- [ ] Ferni always available
- [ ] Session starts with timer
- [ ] Warning at 14 minutes
- [ ] Session ends at 15 minutes
- [ ] Can immediately start new session
- [ ] Team members locked (except earned)

### Premium Flow

- [ ] No session time limit
- [ ] All team members unlocked (per tier)
- [ ] Full personalization accessible
- [ ] Cross-device sync works

### Personalization

- [ ] Default styles applied for new users
- [ ] Milestone gifts persist
- [ ] Applied styles render correctly
- [ ] Premium-only items blocked for free tier

## File Reference

### Backend Services

| File                                         | Purpose                      |
| -------------------------------------------- | ---------------------------- |
| `src/types/subscription.ts`                  | Tier configs, cosmetic types |
| `src/services/session-time-limit.ts`         | Per-session time tracking    |
| `src/services/stripe-subscription.ts`        | Payment processing           |
| `src/services/stripe-payments.ts`            | One-time payment processing  |
| `src/services/team-unlocks.ts`               | Team member access           |
| `src/services/monetization/tip-jar.ts`       | Tip jar service              |
| `src/services/monetization/value-capture.ts` | Value capture service        |
| `src/services/monetization/ferni-fund.ts`    | Pay-it-forward fund          |
| `src/services/monetization/b2b-licensing.ts` | Organization management      |
| `src/api/monetization-routes.ts`             | All monetization API routes  |

### Frontend Services

| File                                                                   | Purpose                          |
| ---------------------------------------------------------------------- | -------------------------------- |
| `frontend-typescript/src/services/monetization.service.ts`             | Frontend monetization API client |
| `frontend-typescript/src/services/cosmetics.service.ts`                | Personalization management       |
| `frontend-typescript/src/services/growth-journey.service.ts`           | Milestone tracking & celebration |
| `frontend-typescript/src/services/team-unlock.service.ts`              | Team unlock state                |
| `frontend-typescript/src/services/monetization-integration.service.ts` | Event triggers & wiring          |

### Frontend UI Components

| File                                                | Purpose               |
| --------------------------------------------------- | --------------------- |
| `frontend-typescript/src/ui/subscription.ui.ts`     | Upgrade modals        |
| `frontend-typescript/src/ui/tip-jar.ui.ts`          | Tip jar modal         |
| `frontend-typescript/src/ui/ferni-fund.ui.ts`       | Pay-it-forward modal  |
| `frontend-typescript/src/ui/value-capture.ui.ts`    | Win celebration modal |
| `frontend-typescript/src/ui/personalize.ui.ts`      | Personalization UI    |
| `frontend-typescript/src/ui/growth-journey.ui.ts`   | Your Journey UI       |
| `frontend-typescript/src/ui/b2b-admin.ui.ts`        | B2B admin dashboard   |
| `frontend-typescript/src/pages/payment-complete.ts` | Payment success pages |

## Brand Compliance

All monetization UI follows Ferni brand guidelines:

- ✅ Warm, human language
- ✅ No pressure tactics
- ✅ Lucide SVG icons (no emojis)
- ✅ Earthy color palette (no purple)
- ✅ Centered modals with blur
- ✅ Pixar-inspired animations
- ✅ Relationship-focused, not gamification

### Language Guidelines

| Avoid (Gamification)  | Use (Relationship)       |
| --------------------- | ------------------------ |
| XP, experience points | Progress, milestones     |
| Levels, level up      | Grow together, celebrate |
| Unlock, rewards       | Gifts, yours now         |
| Battle Pass           | Your Journey             |
| Claim                 | Receive, celebrate       |
| Grind, earn           | Time together, shared    |
| Daily cap             | Natural pace             |
| Rarity (common/rare)  | Simply available or not  |

---

## Implementation Status ✅

All monetization features are now fully implemented:

### Backend ✅

- [x] Tip Jar service with Stripe integration
- [x] Value Capture with pattern detection
- [x] Ferni Fund with community pool
- [x] B2B Licensing with org management
- [x] Contextual Partnerships with affiliate tracking
- [x] Growth Journey API endpoints

### Frontend ✅

- [x] Tip Jar modal UI
- [x] Ferni Fund contribution modal
- [x] Value Capture celebration modal
- [x] Personalize UI (replaced Cosmetics Shop)
- [x] Your Journey UI (replaced Season Pass)
- [x] B2B Admin Dashboard
- [x] Payment completion pages
- [x] Monetization integration triggers

### Testing ✅

- [x] Growth journey service tests
- [x] Value detection pattern tests
- [x] Milestone language compliance tests

### Usage

```typescript
// Initialize all monetization features
import { initMonetizationIntegration } from './services/monetization-integration.service.js';
import { growthJourneyService } from './services/growth-journey.service.js';
import { cosmeticsService } from './services/cosmetics.service.js';

// On app start
initMonetizationIntegration(userId);

// Record conversations for journey milestones
document.addEventListener('ferni:conversation-end', () => {
  growthJourneyService.recordConversation();
});

// Open UIs from settings menu
tipJarUI.open(userId);
ferniFundUI.open(userId);
growthJourneyUI.open();
personalizeUI.open();
b2bAdminUI.open(userId, organization);
```
