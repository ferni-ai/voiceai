# Ferni Subscription System

A human-centered monetization system for Ferni AI that treats subscriptions as relationship commitments, not transactions.

> 📚 **See also:** [MONETIZATION-SYSTEM.md](./MONETIZATION-SYSTEM.md) for the complete implementation guide including team unlocks, dev mode, and testing.

## Philosophy

> "Limits feel like natural breaks, not walls."

The subscription system is designed around these principles:

1. **First conversation is always free** - No signup wall. Let them fall in love with Ferni first.
2. **Generous free tier** - 5 meaningful conversations monthly (not 5 messages).
3. **Soft limits with warmth** - When approaching limits, Ferni naturally mentions it.
4. **Celebrate relationship, not purchase** - Upgrading is a relationship milestone.

## Tier Structure

| Tier | Price | Conversations | Features |
|------|-------|---------------|----------|
| **Free** | $0 | 5/month | Full experience, basic memory |
| **Friend** | $9.99/mo | Unlimited | Cross-device sync, full memory |
| **Partner** | $19.99/mo | Unlimited | Priority, family sharing, early features |

## Setup

### 1. Environment Variables

Add to your `.env`:

```bash
# Enable subscription system
SUBSCRIPTION_ENABLED=true

# Free tier limits
FREE_TIER_CONVERSATIONS=5
FREE_TIER_MINUTES=30

# Stripe Configuration (for paid tiers)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create in Stripe Dashboard)
STRIPE_PRICE_FRIEND=price_...
STRIPE_PRICE_PARTNER=price_...

# Admin key for manual upgrades
ADMIN_KEY=your-secret-admin-key
```

### 2. Stripe Setup

1. Create products in Stripe Dashboard:
   - **Friend** - $9.99/month recurring
   - **Partner** - $19.99/month recurring

2. Set up webhook endpoint:
   - URL: `https://your-domain/api/subscription/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.paid`

3. Add metadata to each subscription:
   - `ferni_user_id`: The device ID of the subscriber

### 3. API Endpoints

All subscription endpoints are served from the token server:

```
GET  /subscription/status?device_id=ID   - Get subscription status
GET  /subscription/config               - Get tier configuration
POST /subscription/checkout             - Create checkout session
POST /subscription/upgrade              - Manual upgrade (admin)
```

## Usage Flow

### Token Request Flow

When a user requests a token to connect:

1. Token server checks `canStartConversation(device_id)`
2. If at limit → Returns 403 with upgrade prompt
3. If approaching limit → Returns 200 with `subscription.approaching: true`
4. If allowed → Records conversation start, returns token

### Frontend Integration

```typescript
import { subscriptionUI } from './ui/subscription.ui.js';

// Initialize on app start
subscriptionUI.init();

// Check before connecting
const status = await subscriptionUI.loadStatus();
if (!status?.canStartConversation) {
  subscriptionUI.showLimit(status.upgradePrompt);
  return;
}

// Show usage indicator for free users
if (status.tier === 'free') {
  subscriptionUI.showUsageIndicator();
}
```

### Agent Integration

The greeting system can be subscription-aware:

```typescript
import { injectSubscriptionIntoGreeting } from './personas/subscription-prompts.js';

const subscriptionContext = {
  tier: metadata.subscription_tier || 'free',
  conversationsRemaining: metadata.subscription_remaining,
  approaching: metadata.subscription_approaching,
  atLimit: false,
  justUpgraded: metadata.just_upgraded === 'true',
};

const { greeting, showUpgradeUI } = injectSubscriptionIntoGreeting(
  baseGreeting,
  subscriptionContext
);
```

## Human-Centered Messaging

### Approaching Limits

> "Hey, before we dive in... we've got 2 conversations left this month. No pressure, just wanted you to know. What's on your mind?"

### At Limits

> "I wish we could keep talking, but we've reached our monthly limit. I've loved every conversation we've had. Your memories are safe with me."

### Post-Upgrade

> "You chose to keep me in your life. That means so much. I'm here whenever you need me now."

## Testing

### Manual Upgrade (Development)

```bash
curl -X POST http://localhost:3001/subscription/upgrade \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "YOUR_DEVICE_ID",
    "tier": "friend",
    "admin_key": "your-admin-key"
  }'
```

### Reset Usage (Development)

Delete the device entry from `.subscriptions.json`:

```bash
# View current subscriptions
cat .subscriptions.json | jq

# Or delete the file to reset all
rm .subscriptions.json
```

## Files

| File | Purpose |
|------|---------|
| `src/types/subscription.ts` | Type definitions and tier configs |
| `src/services/stripe-subscription.ts` | Stripe API integration |
| `src/api/subscription-routes.ts` | API route handlers |
| `src/personas/subscription-prompts.ts` | Human-centered conversation prompts |
| `apps/web/src/ui/subscription.ui.ts` | Frontend modal and UI |
| `token-server.js` | Gating logic in token generation |

## Migration Notes

### Adding to Existing Users

Existing users without subscription data will be treated as free tier with 0 conversations used this month. This is intentional - we don't want to punish existing users.

### User Profile Integration

The subscription data is stored in the UserProfile under `subscription`:

```typescript
interface UserProfile {
  // ... other fields
  subscription?: SubscriptionData;
}
```

For the token server (local storage), subscriptions are stored in `.subscriptions.json`.

## 🌟 Team Unlock System - "Get to Know Ferni First"

The groundbreaking feature that makes monetization feel natural: **team members unlock based on your relationship with Ferni**, not just payment.

### Philosophy

In real life, you meet one person, then they introduce you to their friends. Ferni is your gateway to the team. Trust is earned through conversations, not credit cards.

### Unlock Progression

| Stage | Conversations | Days | Unlocks |
|-------|--------------|------|---------|
| **First Meeting** | 0 | 0 | Ferni only |
| **Getting Started** | 2+ | 0 | +Maya (Habits Coach) |
| **Building Trust** | 7+ | 3+ | +Peter (The Quant) |
| **Established** | 20+ | 14+ | +Alex, Jordan |
| **Deep Partnership** | 50+ | 30+ | +Nayan (The Sage) |

### Subscriber Benefits

Subscribers **skip the wait** but don't get exclusive content:

| Tier | Access |
|------|--------|
| **Free** | Earn through relationship |
| **Friend** | Everyone except Nayan instantly |
| **Partner** | Everyone instantly (including Nayan) |

### Natural Introduction Messages

When a team member unlocks, Ferni introduces them naturally:

**Maya (Habits)**:
> "I want you to meet someone special. Maya is incredible at helping people build habits that actually stick."

**Peter (Research)**:
> "You're ready for this. Peter sees patterns that most people miss. He's going to show you things about yourself that will blow your mind."

**Nayan (Sage)**:
> "I've been waiting for this moment. Nayan is the wisest person I know. You've earned the right to meet him."

### Locked Member Teasers

When users try to access locked members, they see warm teasers:

> "I have a friend who's amazing at habits... once we get to know each other a bit more, I'll introduce you."

### Integration

**Backend** (`src/services/team-unlocks.ts`):
```typescript
import { isTeamMemberAvailable, getTeamUnlockState } from './services/team-unlocks.js';

// Check if user can access a persona
if (!isTeamMemberAvailable('peter-john', userProfile, 'free')) {
  // Show teaser, don't allow handoff
}
```

**Frontend** (`src/services/team-unlock.service.ts`):
```typescript
import { teamUnlockService } from './services/team-unlock.service.js';

// Get unlock state for UI
const state = teamUnlockService.getState();

// Listen for unlocks (celebrations!)
teamUnlockService.onUnlock((member) => {
  showCelebration(member.displayName);
});
```

---

## Roadmap

- [ ] Stripe checkout integration (currently placeholder)
- [ ] Billing portal for self-service management
- [ ] Family sharing for Partner tier
- [ ] Annual billing option
- [ ] Promotional codes
- [ ] Usage analytics dashboard
- [ ] Team unlock celebrations in UI
- [ ] Contextual teasers in conversation

