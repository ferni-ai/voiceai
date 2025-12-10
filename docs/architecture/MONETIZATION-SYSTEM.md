# Ferni Monetization System

> "Get to Know Ferni First" - A human-centered approach to monetization

## Philosophy

Unlike traditional SaaS paywalls, Ferni's monetization feels like a natural part of the relationship journey. Team members unlock as your friendship with Ferni deepens, making upgrades feel like milestones rather than transactions.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (TypeScript)                       │
├─────────────────────────────────────────────────────────────────┤
│  team-unlock.service.ts    → Manages unlock state               │
│  subscription.ui.ts        → Upgrade/limit modals               │
│  team.ui.ts                → Lock badges on team roster         │
│  team-unlock-celebration.ui.ts → Celebration when unlocked      │
│  dev-panel.ui.ts           → Testing tools (dev mode only)      │
│  relationship-stage.service.ts → Tracks conversation metrics    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js)                           │
├─────────────────────────────────────────────────────────────────┤
│  token-server.js           → Subscription checks before connect │
│  team-unlocks.ts           → Backend unlock verification        │
│  executor.ts               → Blocks handoff to locked personas  │
│  stripe-subscription.ts    → Stripe integration (optional)      │
│  subscription-routes.ts    → API endpoints                      │
└─────────────────────────────────────────────────────────────────┘
```

## Subscription Tiers

| Tier        | Price     | Conversation Limit | Team Members                  |
| ----------- | --------- | ------------------ | ----------------------------- |
| **Free**    | $0        | 5/month            | Ferni only (+ earned unlocks) |
| **Friend**  | $9.99/mo  | Unlimited          | All core team                 |
| **Partner** | $19.99/mo | Unlimited          | All team + premium            |

## Team Member Unlock System

### How It Works

1. **Free Users** earn team members through relationship progression
2. **Subscribers** get instant access to all team members in their tier
3. **Unlocks feel natural** - Ferni introduces teammates as your relationship deepens

### Relationship Stages & Unlocks

| Stage                | Requirements       | Unlocks                                            |
| -------------------- | ------------------ | -------------------------------------------------- |
| **First Meeting**    | New user           | Ferni                                              |
| **Getting Started**  | 2 conversations    | Maya Santos (Habits Coach)                         |
| **Building Trust**   | 7 convos, 3 days   | Peter John (Research)                              |
| **Established**      | 20 convos, 7 days  | Alex Chen (Communications), Jordan Taylor (Events) |
| **Deep Partnership** | 50 convos, 30 days | Nayan Patel (Premium - Partner tier only)          |

### Key Files

```
frontend-typescript/src/services/team-unlock.service.ts
├── TEAM_MEMBERS           → Team member definitions
├── STAGE_THRESHOLDS       → Unlock requirements per stage
├── getMemberStatus()      → Check if member is unlocked
├── getTeamMember()        → Get member config
└── onMemberUnlock()       → Subscribe to unlock events

src/services/team-unlocks.ts (Backend)
├── isTeamMemberAvailable() → Server-side unlock check
├── getLockedTeaser()       → Message for locked member
└── RELATIONSHIP_UNLOCKS    → Stage → persona mapping
```

## Dev Mode Testing

### Activation

```javascript
// Via URL parameter
//localhost:3004/?dev

// Via localStorage
http: localStorage.setItem('ferni_dev_mode', 'true');

// Via environment
// Automatically enabled when import.meta.env.DEV === true
```

### Keyboard Shortcuts

| Shortcut               | Action                        |
| ---------------------- | ----------------------------- |
| `Cmd/Ctrl + Shift + D` | Toggle dev panel              |
| `Cmd/Ctrl + Shift + U` | Quick unlock all team members |
| `Cmd/Ctrl + Shift + R` | Reset to free tier            |

### Dev Panel Features

- **Tier Switcher**: Instantly change subscription tier
- **Stage Override**: Jump to any relationship stage
- **Team Status**: See lock/unlock state for all members
- **Celebration Test**: Trigger unlock celebration for any member
- **Handoff Tester**: Test switching to any persona
- **Usage Controls**: Add conversations, reset usage

### Admin API Endpoints

```bash
# Upgrade user (dev mode)
curl -X POST http://localhost:3000/subscription/upgrade \
  -H "Content-Type: application/json" \
  -d '{"device_id": "abc123", "tier": "partner", "admin_key": "dev-mode"}'

# Reset usage (dev mode)
curl -X POST http://localhost:3000/subscription/reset-usage \
  -H "Content-Type: application/json" \
  -d '{"device_id": "abc123", "admin_key": "dev-mode"}'
```

## UI Components

### Lock Badge on Team Roster

Team members show a small lock icon when not yet unlocked:

```typescript
// In team.ui.ts
const isLocked = !teamUnlockService.getMemberStatus(agent.id).unlocked;

element.className = `team-member ${isLocked ? 'team-member--locked' : ''}`;
```

CSS classes:

- `.team-member--locked` - Grayed out, 65% opacity
- `.team-avatar--locked` - Grayscale filter
- `.team-avatar-lock-badge` - Small lock icon overlay

### Upgrade Modal

Triggered when:

- User clicks a locked team member
- User reaches conversation limit
- Programmatically via `showUpgradeModal()`

```typescript
import { showUpgradeModal } from './subscription.ui.js';

// Show upgrade prompt
showUpgradeModal('Peter is excited to meet you!');
```

### Unlock Celebration

Beautiful modal when a team member unlocks:

```typescript
import { teamUnlockCelebration } from './team-unlock-celebration.ui.js';

// Show celebration for a member
teamUnlockCelebration.show(memberConfig);
```

## Backend Handoff Blocking

The handoff executor checks unlock status before allowing switches:

```typescript
// In src/tools/handoff/executor.ts
if (!isTeamMemberAvailable(targetId, userProfile, subscriptionTier)) {
  return {
    success: false,
    error: "Maya isn't available yet. Keep talking to Ferni!",
  };
}
```

## Stripe Integration (Optional)

Stripe is an optional dependency. Install it when ready:

```bash
npm install stripe
```

### Environment Variables

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FRIEND=price_...
STRIPE_PRICE_PARTNER=price_...
```

### Webhook Events Handled

- `checkout.session.completed` - New subscription
- `customer.subscription.updated` - Plan change
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_failed` - Payment issue
- `invoice.paid` - Successful payment

## Testing Checklist

### Free Tier Flow

- [ ] Only Ferni available initially
- [ ] Lock badges show on other team members
- [ ] Clicking locked member shows upgrade modal
- [ ] After 2 conversations, Maya unlocks
- [ ] Celebration modal appears for Maya

### Subscriber Flow

- [ ] Upgrade to Friend tier via dev panel
- [ ] All core team members unlock immediately
- [ ] No lock badges visible
- [ ] Handoffs work to all personas

### Edge Cases

- [ ] Downgrade removes access to premium members
- [ ] Usage resets when upgrading
- [ ] Backend blocks handoff to locked personas
- [ ] Graceful handling when Stripe not installed

## Natural Language Prompts

The system includes human-centered messaging:

```typescript
// Approaching limit
"We've had some wonderful conversations this month...";

// Limit reached
"We've reached our monthly limit. I'd love to keep talking...";

// Team member teaser
'Maya is looking forward to helping you with habits...';

// Unlock celebration
"I'd love for you to meet someone special...";
```

## File Reference

| File                                                          | Purpose                       |
| ------------------------------------------------------------- | ----------------------------- |
| `frontend-typescript/src/ui/dev-panel.ui.ts`                  | Dev testing panel             |
| `frontend-typescript/src/services/team-unlock.service.ts`     | Frontend unlock logic         |
| `frontend-typescript/src/ui/subscription.ui.ts`               | Upgrade/limit modals          |
| `frontend-typescript/src/ui/team-unlock-celebration.ui.ts`    | Celebration UI                |
| `frontend-typescript/src/ui/team.ui.ts`                       | Lock state on roster          |
| `frontend-typescript/public/design-system/app-components.css` | Lock badge styles             |
| `src/services/team-unlocks.ts`                                | Backend unlock logic          |
| `src/services/stripe-subscription.ts`                         | Stripe integration            |
| `src/tools/handoff/executor.ts`                               | Handoff blocking              |
| `src/api/subscription-routes.ts`                              | API endpoints                 |
| `src/types/subscription.ts`                                   | Type definitions              |
| `token-server.js`                                             | Token generation + sub checks |

## Brand Compliance

All monetization UI follows Ferni brand guidelines:

- ✅ Warm, human language (not corporate)
- ✅ Lucide SVG icons (no emoji)
- ✅ Earthy color palette (sage green, warm browns)
- ✅ Centered modals with backdrop blur
- ✅ Pixar-inspired animations
- ✅ Typography hierarchy (eyebrow → title → body)
