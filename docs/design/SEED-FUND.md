# The Ferni Seed Fund

> "Ferni doesn't have a paywall. It has a community."

## Philosophy

Ferni is free because people choose to support it. When enough seeds are planted, everyone benefits. No tiers, no locked features, no "upgrade to premium." Just a community keeping something good alive.

This is inspired by:
- **Wikipedia** - "If everyone gave $3..."
- **Public Radio** - Community-funded, free to all
- **Patreon** - Patron-supported creators
- **Open Source** - Many small contributions sustain big things

---

## Core Concepts

### Seeds
A "seed" is any contribution to Ferni. One seed = $1 equivalent (for counting purposes).
- Plant 5 seeds = $5 contribution
- Plant a seed = any contribution

### The Garden
The collective fund that keeps Ferni running. Shows:
- Monthly goal (what we need to stay free)
- Current progress (seeds planted this month)
- Community stats (how many gardeners)

### Gardeners
Anyone who has ever planted a seed. Types:
- **Seedling** - Planted 1-10 seeds total
- **Gardener** - Planted 11-50 seeds OR monthly supporter
- **Grove Keeper** - Planted 50+ seeds OR $25+/month supporter

---

## UI Components

### 1. Garden Status Widget (Compact)

Appears in settings/menu. Small, non-intrusive.

```
┌────────────────────────────────────┐
│  Ferni's Garden                    │
│  ████████████░░░░░  78% funded     │
│  247 gardeners this month          │
│                    [Plant a Seed]  │
└────────────────────────────────────┘
```

**States:**
- **Thriving** (100%+): Green, celebratory
- **Growing** (50-99%): Warm amber, encouraging
- **Needs Water** (<50%): Soft appeal, not guilt

### 2. Garden Status Widget (Expanded)

Full view when tapped/clicked:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│           Ferni's Garden                        │
│                                                 │
│    ████████████████░░░░  $2,847 / $3,500       │
│                                                 │
│    "Ferni is free because 247 people           │
│     planted seeds this month."                  │
│                                                 │
│    ┌─────────────────────────────────────┐     │
│    │                                     │     │
│    │     🌱  Plant a Seed               │     │
│    │         Give any amount             │     │
│    │                                     │     │
│    └─────────────────────────────────────┘     │
│                                                 │
│    ┌─────────────────────────────────────┐     │
│    │                                     │     │
│    │     🌿  Become a Gardener          │     │
│    │         $5+/month · Cancel anytime  │     │
│    │                                     │     │
│    └─────────────────────────────────────┘     │
│                                                 │
│    ┌─────────────────────────────────────┐     │
│    │                                     │     │
│    │     🌳  Grove Keeper               │     │
│    │         $25+/month · Shape Ferni    │     │
│    │                                     │     │
│    └─────────────────────────────────────┘     │
│                                                 │
│    ─────────────────────────────────────────   │
│                                                 │
│    Your seeds: 12 total                         │
│    Status: Gardener                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3. Plant a Seed Flow

**Step 1: Choose Amount**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│           Plant a Seed                          │
│                                                 │
│    Every seed helps Ferni grow.                 │
│                                                 │
│    ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │
│    │  $3   │ │  $5   │ │  $10  │ │  $25  │    │
│    │ 3🌱   │ │ 5🌱   │ │ 10🌱  │ │ 25🌱  │    │
│    └───────┘ └───────┘ └───────┘ └───────┘    │
│                                                 │
│    ┌─────────────────────────────────────┐     │
│    │  Other amount: $____                │     │
│    └─────────────────────────────────────┘     │
│                                                 │
│    ☐ Make this monthly (become a Gardener)     │
│                                                 │
│              [Continue to Payment]              │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Step 2: Payment**
- Stripe checkout (cards, Apple Pay, Google Pay)
- Simple, fast, secure

**Step 3: Confirmation**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│                    🌱                           │
│                                                 │
│           Your seed is planted.                 │
│                                                 │
│    Thanks for helping Ferni grow.               │
│    You're now one of 248 gardeners              │
│    keeping Ferni free for everyone.             │
│                                                 │
│    Your total seeds: 17                         │
│    Status: Gardener                             │
│                                                 │
│              [Back to Ferni]                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4. Contributor Recognition

**In Profile/Settings:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│    Your Garden                                  │
│                                                 │
│    🌿 Gardener                                  │
│    17 seeds planted                             │
│    Supporting since Oct 2024                    │
│                                                 │
│    ─────────────────────────────────────────   │
│                                                 │
│    Monthly: $10/month                           │
│    [Manage] [Plant More Seeds]                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Grove Keepers get:**
- Name in credits (optional)
- Direct feedback channel
- Early access to new features
- Input on roadmap priorities

### 5. Gentle Prompts (Non-Annoying)

**When to show:**
- After first week of use (one-time)
- In settings (always available)
- When fund is low (<50%) - subtle banner

**Never:**
- Interrupt conversations
- Pop up during emotional moments
- Guilt trip
- Block features

**Example gentle prompt:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Ferni is free because of people like you.     │
│                                                 │
│  If Ferni has helped you, consider planting    │
│  a seed to keep it growing for everyone.       │
│                                                 │
│  [Maybe Later]           [Plant a Seed]        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Data Model

### Firestore Collections

```typescript
// Fund status (updated in real-time)
interface GardenStatus {
  monthlyGoal: number;        // e.g., 3500
  currentMonth: number;       // e.g., 2847
  totalGardeners: number;     // e.g., 247
  monthlyGardeners: number;   // recurring supporters
  lastUpdated: Timestamp;
}

// User's contribution history
interface UserGarden {
  userId: string;
  totalSeeds: number;         // lifetime total
  status: 'seedling' | 'gardener' | 'grove-keeper';
  isMonthly: boolean;
  monthlyAmount?: number;
  stripeCustomerId?: string;
  firstSeedDate: Timestamp;
  lastSeedDate: Timestamp;
}

// Individual contributions
interface Seed {
  id: string;
  userId: string;
  amount: number;
  seedCount: number;          // amount in seeds
  isRecurring: boolean;
  stripePaymentId: string;
  plantedAt: Timestamp;
}
```

### API Endpoints

```
GET  /api/garden/status         - Get current fund status
GET  /api/garden/user           - Get user's contribution history
POST /api/garden/plant          - Create one-time contribution
POST /api/garden/subscribe      - Create recurring contribution
PUT  /api/garden/subscription   - Update recurring amount
DELETE /api/garden/subscription - Cancel recurring
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Stripe integration for one-time payments
- [ ] Basic "Plant a Seed" flow
- [ ] Garden status widget (compact)
- [ ] Seed tracking in Firestore

### Phase 2: Recurring
- [ ] Stripe subscriptions for monthly
- [ ] Gardener/Grove Keeper status
- [ ] Subscription management UI
- [ ] Email receipts

### Phase 3: Community
- [ ] Real-time fund progress
- [ ] Grove Keeper benefits
- [ ] Credits page
- [ ] Public garden stats

### Phase 4: Polish
- [ ] Animations (seed planting)
- [ ] Thank you moments from Ferni
- [ ] Year-end summaries
- [ ] Milestone celebrations

---

## Copy & Messaging

### Taglines
- "Ferni doesn't have a paywall. It has a community."
- "Plant a seed. Watch Ferni grow."
- "When enough people give, everyone benefits."
- "Free because of people like you."

### Status Messages
- **Thriving:** "The garden is flourishing! Thanks to 300+ gardeners, Ferni is free for everyone this month."
- **Growing:** "We're 78% of the way there. 53 more seeds and Ferni stays free for everyone."
- **Needs Water:** "The garden needs some love. Can you help keep Ferni free?"

### Thank You Messages
- "Your seed is planted. You're part of something good."
- "Thanks for being a gardener. Ferni grows because of you."
- "You just helped someone you'll never meet use Ferni for free."

---

## Technical Notes

### Stripe Products
- `seed_single` - One-time contribution (any amount)
- `gardener_monthly` - $5-24/month recurring
- `grove_keeper_monthly` - $25+/month recurring

### Webhooks
- `payment_intent.succeeded` - Record seed
- `customer.subscription.created` - Update to recurring
- `customer.subscription.deleted` - Handle cancellation
- `invoice.paid` - Monthly seed recording

### Security
- All payment handling via Stripe
- No card data stored
- Webhook signature verification
- Rate limiting on contribution endpoints

---

## Success Metrics

- **Primary:** Monthly fund goal met (100%+)
- **Secondary:**
  - Number of gardeners
  - Retention of monthly supporters
  - Average seed size
  - Time to first contribution

---

## Open Questions

1. Should Grove Keepers be listed publicly? (opt-in?)
2. Corporate/business sponsorship tier?
3. One-time large donations (>$100) - special recognition?
4. International pricing (PPP)?
5. Non-profit status timeline?
