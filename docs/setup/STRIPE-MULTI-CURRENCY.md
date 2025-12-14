# Stripe Multi-Currency Setup

This guide documents how to set up Stripe price IDs for multi-currency support.

## Overview

Ferni supports subscriptions in 9 currencies with PPP (Purchasing Power Parity) adjustments:

| Currency | Region | Friend Tier | Partner Tier | PPP Adjustment |
|----------|--------|-------------|--------------|----------------|
| USD | US, Default | $9.99/mo | $19.99/mo | Base price |
| EUR | EU | 8.99/mo | 17.99/mo | ~10% lower |
| GBP | UK | 7.99/mo | 15.99/mo | ~20% lower |
| JPY | Japan | 1,500/mo | 3,000/mo | ~50% lower |
| KRW | South Korea | 15,000/mo | 30,000/mo | ~50% lower |
| CNY | China | 69/mo | 139/mo | ~30% lower |
| TWD | Taiwan | 299/mo | 599/mo | ~10% lower |
| SAR | Saudi Arabia | 37/mo | 75/mo | PPP adjusted |
| ILS | Israel | 35/mo | 70/mo | PPP adjusted |

## Environment Variables

Each currency + tier combination requires a Stripe Price ID:

```bash
# USD (Default)
STRIPE_PRICE_FRIEND_USD=price_xxxxx
STRIPE_PRICE_PARTNER_USD=price_xxxxx

# EUR
STRIPE_PRICE_FRIEND_EUR=price_xxxxx
STRIPE_PRICE_PARTNER_EUR=price_xxxxx

# GBP
STRIPE_PRICE_FRIEND_GBP=price_xxxxx
STRIPE_PRICE_PARTNER_GBP=price_xxxxx

# JPY
STRIPE_PRICE_FRIEND_JPY=price_xxxxx
STRIPE_PRICE_PARTNER_JPY=price_xxxxx

# KRW
STRIPE_PRICE_FRIEND_KRW=price_xxxxx
STRIPE_PRICE_PARTNER_KRW=price_xxxxx

# CNY
STRIPE_PRICE_FRIEND_CNY=price_xxxxx
STRIPE_PRICE_PARTNER_CNY=price_xxxxx

# TWD
STRIPE_PRICE_FRIEND_TWD=price_xxxxx
STRIPE_PRICE_PARTNER_TWD=price_xxxxx

# SAR
STRIPE_PRICE_FRIEND_SAR=price_xxxxx
STRIPE_PRICE_PARTNER_SAR=price_xxxxx

# ILS
STRIPE_PRICE_FRIEND_ILS=price_xxxxx
STRIPE_PRICE_PARTNER_ILS=price_xxxxx
```

## Creating Prices in Stripe Dashboard

### Step 1: Create Product (One Time)

1. Go to Stripe Dashboard > Products
2. Create two products:
   - **Ferni Friend** - Monthly subscription for Friend tier
   - **Ferni Partner** - Monthly subscription for Partner tier

### Step 2: Create Prices for Each Currency

For each product, create prices in all 9 currencies:

1. Click "Add a price"
2. Select "Recurring"
3. Set the billing period to "Monthly"
4. Select the currency
5. Enter the price from the table above
6. Save and copy the price ID

### Step 3: Configure Environment

Add the price IDs to your environment:

**Local Development (`.env.local`):**
```bash
STRIPE_PRICE_FRIEND_USD=price_1234...
STRIPE_PRICE_PARTNER_USD=price_5678...
# ... etc
```

**Cloud Run (via Secret Manager):**
```bash
gcloud secrets versions add STRIPE_PRICE_FRIEND_USD --data-file=-
gcloud secrets versions add STRIPE_PRICE_PARTNER_USD --data-file=-
# ... etc
```

## Locale to Currency Mapping

The system automatically maps user locales to currencies:

| Locale | Currency |
|--------|----------|
| en-US | USD |
| en-GB | GBP |
| es | EUR |
| fr | EUR |
| de | EUR |
| ja | JPY |
| ko | KRW |
| zh-Hans | CNY |
| zh-Hant | TWD |
| ar | SAR |
| he | ILS |

## API Usage

### Get Pricing for Locale

```typescript
import { getPricingForLocale } from '../i18n/pricing.js';

// Returns currency-specific pricing
const pricing = getPricingForLocale('ja');
// {
//   currency: 'JPY',
//   symbol: '¥',
//   friend: { amount: 1500, formatted: '¥1,500', stripePriceId: 'price_...' },
//   partner: { amount: 3000, formatted: '¥3,000', stripePriceId: 'price_...' }
// }
```

### Detect Currency from Accept-Language Header

```typescript
import { detectCurrencyFromHeader } from '../i18n/pricing.js';

const currency = detectCurrencyFromHeader('ja-JP,ja;q=0.9,en;q=0.8');
// 'JPY'
```

### Create Checkout with Currency

```typescript
import { createCheckoutSession } from '../services/stripe-subscription.js';

const session = await createCheckoutSession({
  userId: 'user_123',
  tier: 'friend',
  successUrl: 'https://app.ferni.ai/success',
  cancelUrl: 'https://app.ferni.ai/cancel',
  currency: 'JPY'  // Uses JPY price
});
```

## Testing

### Test Different Currencies

1. Use query parameter: `?locale=ja`
2. Or set Accept-Language header: `Accept-Language: ja-JP`
3. The pricing API will return JPY pricing

### Test Stripe Checkout

1. Ensure test mode price IDs are configured
2. Create checkout with `currency` parameter
3. Verify Stripe checkout shows correct currency

## Fallback Behavior

If a price ID is not configured for a currency:
1. System logs a warning
2. Falls back to USD pricing
3. Checkout still works but in USD

## Files

| File | Purpose |
|------|---------|
| `src/i18n/pricing.ts` | Currency config, price lookups |
| `src/api/subscription-routes.ts` | Locale-aware pricing API |
| `src/services/stripe-subscription.ts` | Checkout with currency |
