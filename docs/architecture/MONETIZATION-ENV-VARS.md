# Monetization Environment Variables

This document lists all environment variables required for the Ferni monetization system to work correctly.

## Quick Reference

| Provider | Required For     | Variables Needed                                       |
| -------- | ---------------- | ------------------------------------------------------ |
| Stripe   | Web payments     | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`           |
| Apple    | iOS payments     | `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Firebase | Data persistence | `GOOGLE_CLOUD_PROJECT`                                 |

## Required Variables

### Stripe Configuration

| Variable                      | Description                          | Example                        |
| ----------------------------- | ------------------------------------ | ------------------------------ |
| `STRIPE_SECRET_KEY`           | Stripe secret key (server-side)      | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET`       | Webhook endpoint signing secret      | `whsec_...`                    |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (client-side) | `pk_live_...` or `pk_test_...` |

### Stripe Price IDs (Subscriptions)

| Variable                      | Description                   | Example     |
| ----------------------------- | ----------------------------- | ----------- |
| `STRIPE_PRICE_FRIEND`         | Monthly Friend tier price ID  | `price_...` |
| `STRIPE_PRICE_PARTNER`        | Monthly Partner tier price ID | `price_...` |
| `STRIPE_PRICE_FRIEND_ANNUAL`  | Annual Friend tier price ID   | `price_...` |
| `STRIPE_PRICE_PARTNER_ANNUAL` | Annual Partner tier price ID  | `price_...` |

### Firebase/Firestore Configuration

| Variable               | Description           | Example      |
| ---------------------- | --------------------- | ------------ |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID        | `ferni-prod` |
| `FIRESTORE_DATABASE`   | Firestore database ID | `(default)`  |

## Optional Variables

### B2B Licensing

| Variable                  | Description                             | Default    |
| ------------------------- | --------------------------------------- | ---------- |
| `B2B_STARTER_PRICE_CENTS` | Per-seat monthly price for Starter plan | `500` ($5) |
| `B2B_GROWTH_PRICE_CENTS`  | Per-seat monthly price for Growth plan  | `800` ($8) |

## Setting Up Stripe

### 1. Create Stripe Account

1. Go to [stripe.com](https://stripe.com) and create an account
2. Get your API keys from Dashboard → Developers → API keys

### 2. Create Products and Prices

Create products in Stripe for each tier:

```bash
# Using Stripe CLI
stripe products create --name="Ferni Friend" --description="Unlimited conversations + core team"
stripe prices create --product=prod_xxx --unit-amount=999 --currency=usd --recurring[interval]=month

stripe products create --name="Ferni Partner" --description="Full team + exclusive features"
stripe prices create --product=prod_yyy --unit-amount=1999 --currency=usd --recurring[interval]=month
```

### 3. Set Up Webhooks

1. Go to Dashboard → Developers → Webhooks
2. Add endpoint: `https://app.ferni.ai/api/monetization/webhook`
3. Select events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

### 4. Test Mode

For development, use test mode keys:

- Test secret key: `sk_test_...`
- Test publishable key: `pk_test_...`

Test card numbers:

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

## Firestore Collections

The monetization system uses the following Firestore collections:

| Collection                                             | Document Structure     | Purpose            |
| ------------------------------------------------------ | ---------------------- | ------------------ |
| `bogle_users/{userId}/monetization_tips`               | `UserTipData`          | User tip history   |
| `bogle_users/{userId}/monetization_value_capture`      | `UserValueCaptureData` | Value events       |
| `bogle_users/{userId}/monetization_fund_contributions` | `UserFundData`         | Fund contributions |
| `bogle_users/{userId}/monetization_journey`            | `UserJourneyData`      | Journey progress   |
| `monetization_organizations/{orgId}`                   | `OrganizationData`     | B2B organizations  |
| `monetization_fund_global`                             | `GlobalFundStats`      | Global fund stats  |

### Apple In-App Purchase Configuration

Required for iOS subscriptions via StoreKit.

| Variable            | Description                              | Example                                                       |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `APPLE_ISSUER_ID`   | App Store Connect Issuer ID              | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`                        |
| `APPLE_KEY_ID`      | App Store Connect Key ID                 | `XXXXXXXXXX`                                                  |
| `APPLE_BUNDLE_ID`   | iOS app bundle identifier                | `com.ferni.app`                                               |
| `APPLE_PRIVATE_KEY` | Private key from App Store Connect (.p8) | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----` |

**Getting Apple Credentials:**

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Keys
2. Click "+" to create a new key with "In-App Purchase" access type
3. Download the .p8 file (you can only download it once!)
4. Note the Key ID and your Issuer ID (shown at top of Keys page)

**Apple Product IDs:**

Configure these products in App Store Connect:

| Product ID                  | Tier    | Duration | Price   |
| --------------------------- | ------- | -------- | ------- |
| `com.ferni.friend.monthly`  | Friend  | Monthly  | $9.99   |
| `com.ferni.friend.annual`   | Friend  | Annual   | $99.90  |
| `com.ferni.partner.monthly` | Partner | Monthly  | $19.99  |
| `com.ferni.partner.annual`  | Partner | Annual   | $199.90 |

**Apple Webhook:**

Set up App Store Server Notifications in App Store Connect:

- URL: `https://app.ferni.ai/api/apple/webhook`
- Version: V2

## Local Development

Create a `.env.local` file:

```bash
# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# Stripe Prices (create in test mode)
STRIPE_PRICE_FRIEND=price_test_friend
STRIPE_PRICE_PARTNER=price_test_partner

# Apple (optional for local dev - iOS features won't work without)
APPLE_ISSUER_ID=your_issuer_id
APPLE_KEY_ID=your_key_id
APPLE_BUNDLE_ID=com.ferni.app
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Firebase
GOOGLE_CLOUD_PROJECT=ferni-dev
FIRESTORE_DATABASE=(default)
```

## Production Checklist

Before going live:

### Stripe

- [ ] Switch from test to live Stripe keys
- [ ] Create live products and prices in Stripe
- [ ] Configure live webhook endpoint
- [ ] Test full payment flow with live cards

### Apple

- [ ] Create products in App Store Connect
- [ ] Configure App Store Server Notifications webhook
- [ ] Set up Apple credentials in production
- [ ] Test with Sandbox accounts before release
- [ ] Submit app for review with IAP

### General

- [ ] Verify Firestore security rules
- [ ] Set up monitoring for failed payments
- [ ] Configure revenue reporting/analytics
- [ ] Test cancellation flows for both providers
