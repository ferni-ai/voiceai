# Stripe Subscription Setup Guide

## Overview

Ferni uses Stripe for subscription management. This guide covers:

- Environment variable configuration
- Webhook setup
- Testing with Stripe test mode
- Production deployment checklist

## Philosophy

> "Subscriptions are relationship commitments, not transactions."

The payment flow is designed to feel warm and human:

- Soft gating with encouraging messaging
- Celebration on upgrade (not just a receipt)
- Grace periods for failed payments
- No shame messaging for limits

---

## Environment Variables

### Required Variables

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...           # Backend API key
STRIPE_PUBLISHABLE_KEY=pk_test_...      # Frontend (exposed to browser)
STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signature verification

# Price IDs (create these in Stripe Dashboard)
# Both naming conventions are supported for backward compatibility
STRIPE_PRICE_FRIEND=price_...           # $9.99/month "Your Life Coach"
STRIPE_PRICE_PARTNER=price_...          # $19.99/month "Partner in Growth"
# Or use the alternate naming:
# STRIPE_FRIEND_PRICE_ID=price_...
# STRIPE_PARTNER_PRICE_ID=price_...
```

### Optional Variables

```bash
# Trial Configuration
STRIPE_TRIAL_DAYS=7                     # Days of free trial (default: 0)

# Feature Flags
SUBSCRIPTION_ENABLED=true               # Master switch for subscriptions
```

---

## Stripe Dashboard Setup

### 1. Create Products and Prices

1. Go to Stripe Dashboard → Products
2. Create two products:

**Product 1: Your Life Coach**

- Name: "Your Life Coach"
- Description: "I'm here whenever you need me"
- Price: $9.99/month (recurring)
- Copy the Price ID → `STRIPE_PRICE_FRIEND`

**Product 2: Partner in Growth**

- Name: "Partner in Growth"
- Description: "Together for the long haul"
- Price: $19.99/month (recurring)
- Copy the Price ID → `STRIPE_PRICE_PARTNER`

### 2. Configure Webhook Endpoint

1. Go to Developers → Webhooks
2. Add endpoint:
   - URL: `https://app.ferni.ai/subscription/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.paid`
     - `customer.subscription.trial_will_end`
3. Copy the Signing Secret → `STRIPE_WEBHOOK_SECRET`

### 3. Test Mode vs Live Mode

- **Test Mode** (development): Use `sk_test_*` and `pk_test_*` keys
- **Live Mode** (production): Use `sk_live_*` and `pk_live_*` keys

Test credit cards:

- Success: `4242424242424242`
- Decline: `4000000000000002`
- Requires auth: `4000002500003155`

---

## Local Development

### Without Stripe (Dev Mode)

If Stripe is not configured, the app uses a dev mode:

1. Subscription modal still works
2. "Upgrade" triggers `/subscription/upgrade` with `admin_key: 'dev-mode'`
3. Status updates locally without Stripe

### With Stripe Test Mode

1. Set environment variables in `.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

2. For webhook testing, use Stripe CLI:

```bash
stripe listen --forward-to localhost:3002/subscription/webhook
```

3. Copy the webhook secret it provides to `STRIPE_WEBHOOK_SECRET`

---

## Deployment Checklist

### Cloud Run Environment

Set these in your Cloud Run service configuration:

```bash
# Required
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FRIEND=price_...
STRIPE_PRICE_PARTNER=price_...

# Optional
STRIPE_TRIAL_DAYS=7
```

### Firebase Hosting

The `firebase.json` already includes rewrites for `/subscription/**`:

```json
{
  "source": "/subscription/**",
  "run": {
    "serviceId": "john-bogle-ui",
    "region": "us-central1"
  }
}
```

### Production Webhook

Update Stripe Dashboard webhook endpoint to:

- `https://app.ferni.ai/subscription/webhook`

---

## API Endpoints

| Method | Endpoint                            | Description                     |
| ------ | ----------------------------------- | ------------------------------- |
| GET    | `/subscription/status?userId=...`   | Get current subscription status |
| GET    | `/subscription/config`              | Get tier configuration          |
| POST   | `/subscription/checkout`            | Create Stripe checkout session  |
| POST   | `/subscription/portal`              | Create billing portal session   |
| POST   | `/subscription/record-conversation` | Track conversation usage        |
| POST   | `/subscription/webhook`             | Stripe webhook handler          |

---

## Troubleshooting

### "Stripe is not configured"

Check that `STRIPE_SECRET_KEY` is set and starts with `sk_`.

### Webhook verification fails

1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Check that raw body is being passed (not parsed JSON)
3. Ensure clock sync is within tolerance

### Subscription status not updating

1. Check webhook logs in Stripe Dashboard
2. Verify `ferni_user_id` metadata is being sent
3. Check Cloud Run logs for errors

### Checkout redirects to wrong URL

Verify `successUrl` and `cancelUrl` in checkout request:

- Should be full URLs (not relative paths)
- Should include protocol (`https://`)

---

## Security Best Practices

1. **Never expose `STRIPE_SECRET_KEY`** - only use on backend
2. **Always verify webhooks** - check signature before processing
3. **Use metadata** - store `ferni_user_id` for customer mapping
4. **Handle failures gracefully** - don't block users on API errors

---

## User Experience Guidelines

### Limit Reached Modal

- Warm, empathetic messaging
- "I'll miss you" not "Access denied"
- Show when conversations reset
- Primary CTA: Upgrade
- Secondary CTA: "I'll wait"

### Upgrade Celebration

- "You're Amazing"
- Emphasize relationship, not transaction
- Show new tier benefits
- "Let's Talk" CTA

### Badge Display

- Free tier: "5 left" with sparkle icon
- Paid tier: "Life Coach" with infinity icon
- Low usage: Warm amber color
- Click opens upgrade modal

---

## Related Files

- `src/services/stripe-subscription.ts` - Core Stripe service
- `src/api/subscription-routes.ts` - API route handlers
- `src/types/subscription.ts` - Tier configuration
- `frontend-typescript/src/ui/subscription.ui.ts` - UI components
- `frontend-typescript/src/ui/subscription-badge.ui.ts` - Header badge
