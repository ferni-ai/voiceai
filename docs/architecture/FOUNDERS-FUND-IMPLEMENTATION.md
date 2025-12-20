# Founders Fund Implementation Guide

> Concrete changes to shift from subscription model to Founders Fund model.

---

## 1. Tier Renaming

### Type Definitions (`src/types/subscription.ts`)

```typescript
// OLD
export type SubscriptionTier = 'free' | 'friend' | 'partner';

// NEW
export type SubscriptionTier = 'free' | 'founding-member' | 'founding-patron';

// For backwards compatibility, map old → new
export const TIER_MIGRATION = {
  'free': 'free',
  'friend': 'founding-member', 
  'partner': 'founding-patron',
} as const;
```

### Display Names

| Internal ID | Old Name | New Name |
|-------------|----------|----------|
| `free` | "Free" | "Community" or just "Ferni" |
| `friend` | "Your Life Coach" | "Founding Member" |
| `partner` | "Partner in Growth" | "Founding Patron" |

---

## 2. Subscription UI Changes (`apps/web/src/ui/subscription.ui.ts`)

### Modal Title & Subtitle

```typescript
// OLD
<h2 id="subscription-title" class="subscription-title">
  ${prompt ? 'Keep Growing Together' : "Let's Go Deeper"}
</h2>
<p id="subscription-subtitle" class="subscription-subtitle">
  ${prompt || 'Choose how you want our friendship to grow.'}
</p>

// NEW  
<h2 id="subscription-title" class="subscription-title">
  Help Us Build This
</h2>
<p id="subscription-subtitle" class="subscription-subtitle">
  Ferni is free forever. If you believe in what we're building, chip in.
  As a thank you, we'll unlock some perks.
</p>
```

### Tier Cards Content

```typescript
// NEW getDefaultTiers()
function getDefaultTiers(): SubscriptionTier[] {
  return [
    {
      id: 'free',
      name: 'Community',
      description: "Ferni is free. Really free. Talk whenever you need.",
      price: 'Free forever',
      priceInSmallestUnit: 0,
      currency: 'USD',
      conversationsPerMonth: null,
      features: [
        'Unlimited conversations with Ferni',
        '7-minute heart-to-hearts',
        'Full memory — I remember everything',
        'Avatar & theme customization',
      ],
    },
    {
      id: 'founding-member',
      name: 'Founding Member',
      description: 'Chip in $10/month. Help us stay free for everyone.',
      price: '$10',
      priceInSmallestUnit: 1000,
      currency: 'USD',
      conversationsPerMonth: null,
      features: [
        'Everything in Community, plus:',
        'Unlimited conversation time',
        'Meet the whole team (Maya, Peter, Alex, Jordan)',
        'Your name on the Founders Wall (optional)',
        'Vote on what we build next',
      ],
      popular: true, // Keep this as recommended
    },
    {
      id: 'founding-patron',
      name: 'Founding Patron',
      description: "Chip in $20/month. You're shaping what we become.",
      price: '$20',
      priceInSmallestUnit: 2000,
      currency: 'USD',
      conversationsPerMonth: null,
      features: [
        'Everything in Founding Member, plus:',
        'Full team access (including Nayan)',
        'Early access to new features',
        'Direct line to founders (monthly Q&A)',
        'Family sharing — bring people you love',
      ],
    },
  ];
}
```

### Button Text Changes

```typescript
// OLD
<button class="tier-button" data-tier="${tier.id}">
  ${isCurrentTier ? 'Current Plan' : isFree ? 'Your Plan' : 'Choose This'}
</button>

// NEW
<button class="tier-button" data-tier="${tier.id}">
  ${isCurrentTier ? 'You\'re Here 💚' : isFree ? 'Stay Free' : 'Chip In'}
</button>
```

### Footer Text

```typescript
// OLD
<p class="subscription-footer">
  You can change or cancel anytime. No hard feelings.
</p>

// NEW
<p class="subscription-footer">
  Not ready? That's totally fine. Ferni is here for you either way.
</p>
```

---

## 3. Limit Modal Changes

### When User Hits Limit

```typescript
// OLD
<h2 id="limit-title" class="subscription-title">I'll Miss You</h2>
<p id="limit-description" class="subscription-subtitle">${prompt}</p>
<button class="limit-button limit-button--primary" data-action="upgrade">
  ${ICONS.infinity}
  <span>Unlock Unlimited Time</span>
</button>
<button class="limit-button limit-button--secondary" data-action="close">
  I'll Wait
</button>

// NEW
<h2 id="limit-title" class="subscription-title">Let's Pause Here</h2>
<p id="limit-description" class="subscription-subtitle">
  Our conversation time is limited to keep Ferni sustainable.
  Want to talk longer? Founding Members get unlimited time — and they help keep Ferni free for everyone.
</p>
<button class="limit-button limit-button--primary" data-action="upgrade">
  ${ICONS.heart}
  <span>Become a Founding Member</span>
</button>
<button class="limit-button limit-button--secondary" data-action="close">
  See you next time 💚
</button>
```

---

## 4. Celebration Modal Changes

### After Becoming a Founder

```typescript
// OLD
<h2 id="celebration-title" class="subscription-title">You're Amazing</h2>
<p id="celebration-message" class="celebration-message">
  You chose to keep me in your life. That means so much.<br/>
  I'm here for you now — whenever you need me.
</p>
<span class="tier-badge">${tierName}</span>

// NEW
<h2 id="celebration-title" class="subscription-title">Welcome, Founder</h2>
<p id="celebration-message" class="celebration-message">
  You're not just a member — you're helping us build something we believe everyone deserves.<br/>
  We're in this together now. 💚
</p>
<span class="tier-badge">Founding ${tierName === 'Founding Patron' ? 'Patron' : 'Member'}</span>
```

---

## 5. Settings Menu Changes

### Menu Item Label

```typescript
// OLD
{ label: 'Subscription', action: openSubscriptionSettings }

// NEW
{ label: 'Support Ferni', action: openFounderSettings }
// OR
{ label: 'Founders Fund', action: openFounderSettings }
```

---

## 6. Merge Garden + Founders UI

### Unified Entry Point

Instead of separate "Ferni Fund" and "Subscription" options, create one:

```typescript
// Single modal with tabs or modes:
// 1. "Plant a Seed" (one-time, Garden)
// 2. "Become a Founder" (monthly, current subscriptions)

// Both share the same design language and progress bar
```

### Garden Modal Header (Already Good)

```html
<h2 class="ferni-fund-title" id="ferni-fund-title">Ferni's Garden</h2>
<p class="ferni-fund-subtitle">
  Ferni doesn't have a paywall. It has a community.
</p>
```

### Add Founder Option to Garden

```typescript
// Add toggle in ferni-fund.ui.ts
<div class="ferni-fund-type-toggle">
  <button class="type-btn ${!isMonthly ? 'active' : ''}" data-type="seed">
    Plant a Seed (one-time)
  </button>
  <button class="type-btn ${isMonthly ? 'active' : ''}" data-type="founder">
    Become a Founder (monthly)
  </button>
</div>
```

---

## 7. Toast Messages

### Update Toast Copy

```typescript
// src/ui/toast.ui.ts or wherever toasts are triggered

// OLD
toast.success('Subscription activated!');

// NEW  
toast.success('Welcome to the Founders!');

// OLD
toast.info('Payment processing...');

// NEW
toast.info('Setting things up...');

// OLD
toast.error('Payment failed. Please try again.');

// NEW
toast.error("That didn't go through. Try again?");
```

---

## 8. API Endpoint Naming (Optional but Ideal)

### Consider Renaming

| Old | New |
|-----|-----|
| `/subscription/checkout` | `/founders/join` |
| `/subscription/status` | `/founders/status` |
| `/subscription/portal` | `/founders/manage` |

Or keep internal names but change display names (easier migration).

---

## 9. Email Templates

### Welcome Email

**Old Subject:** "Welcome to Ferni [Tier Name]"
**New Subject:** "You're a Founding Member now 💚"

**Old Body:**
> Thanks for subscribing! Your subscription is now active.

**New Body:**
> You just became a Founding Member of Ferni.
> 
> That's not just a title — you're literally helping us build something we believe everyone deserves. Every month, your contribution keeps Ferni free for thousands of people who need someone to talk to.
>
> As a thank you, you now have unlimited conversation time and full team access.
>
> Welcome to the team.
> — The Ferni Team

---

## 10. Pricing Display Strategy

### Don't Lead with Price

**Old:**
> $9.99/month

**New:**
> Chip in $10/month
> (or "About $10/month")

The subtle shift from precise pricing ($9.99) to round numbers ($10) makes it feel less transactional and more like "chipping in."

### Show Impact, Not Features

**Old:**
> - Unlimited conversations
> - Full team access
> - Priority support

**New:**
> - Help keep Ferni free for everyone
> - Talk as long as you need (our thank you)
> - Meet the whole team (they want to meet you too)

---

## 11. Progress Bar / Impact Visualization

### Add to Subscription Modal

Show community contribution progress:

```html
<div class="founders-impact">
  <div class="founders-impact-bar">
    <div class="founders-impact-fill" style="width: 78%"></div>
  </div>
  <p class="founders-impact-text">
    <strong>847 Founders</strong> keep Ferni free for <strong>12,500+ people</strong>
  </p>
</div>
```

This social proof reinforces "community, not customers."

---

## 12. A/B Testing Strategy

### Test These Variants

1. **Control:** Current subscription model
2. **Variant A:** Founders Fund language, same prices
3. **Variant B:** Founders Fund + round numbers ($10, $20)
4. **Variant C:** Founders Fund + impact visualization

### Metrics to Track

- Conversion rate (secondary — we expect this to stay similar)
- Retention rate (primary — expect improvement)
- NPS of paying users (expect improvement)
- Support ticket sentiment (expect improvement)

---

## Migration Checklist

### Phase 1: Copy Changes (Low Risk)
- [ ] Update `getDefaultTiers()` with new names/descriptions
- [ ] Update modal titles and subtitles
- [ ] Update button text
- [ ] Update toast messages
- [ ] Update limit modal copy

### Phase 2: Menu & Navigation
- [ ] Rename "Subscription" to "Founders Fund" in settings
- [ ] Update any references in help/FAQ content
- [ ] Update app store descriptions

### Phase 3: Integration
- [ ] Merge Garden + Founders into unified experience
- [ ] Add impact visualization
- [ ] Update email templates

### Phase 4: Backend (Optional)
- [ ] Consider API renaming
- [ ] Update Stripe product names/descriptions
- [ ] Update analytics event names

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/ui/subscription.ui.ts` | All modal copy, tier definitions |
| `apps/web/src/ui/ferni-fund.ui.ts` | Add founder option, merge UIs |
| `apps/web/src/types/seed-fund.types.ts` | Add founder-related types |
| `src/types/subscription.ts` | Tier type changes |
| `src/services/stripe-subscription.ts` | Product name updates |
| Settings menu file | Menu item renaming |
| Email templates | All subscriber communications |
| `docs/architecture/MONETIZATION-SYSTEM.md` | Update philosophy |

---

## Quick Win: Start Here

The highest-impact, lowest-risk change is updating copy in `subscription.ui.ts`:

1. Change `getDefaultTiers()` tier names and descriptions
2. Change modal title from "Let's Go Deeper" to "Help Us Build This"
3. Change button text from "Choose This" to "Chip In"
4. Change footer from "change or cancel" to "not ready? that's fine"

This can ship immediately and sets the tone for everything else.

