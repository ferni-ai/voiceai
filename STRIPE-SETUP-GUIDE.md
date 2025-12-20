# 🌱 Stripe Setup Guide for Ferni Seed Fund

## Step 1: Get Your Price IDs from Stripe

Go to **https://dashboard.stripe.com/products** and copy the Price ID for each product:

| Your Product | Environment Variable |
|--------------|----------------------|
| Plant a Seed ($5) | `STRIPE_PRICE_SEED_5` |
| Sponsor a Conversation ($10) | `STRIPE_PRICE_SEED_10` |
| Help Someone Get Started ($25) | `STRIPE_PRICE_SEED_25` |
| Support the Mission ($50) | `STRIPE_PRICE_SEED_50` |
| Founding Member ($10/month) | `STRIPE_PRICE_FOUNDING_MEMBER` |
| Founding Patron ($20/month) | `STRIPE_PRICE_FOUNDING_PATRON` |

### How to Find Price IDs:
1. Click on a product in Stripe
2. Under "Pricing", you'll see the Price ID (e.g., `price_1QYsHp...`)
3. Click the ID to copy it

## Step 2: Add to Google Cloud Secrets

Run these commands (replace `price_xxx` with your actual Price IDs):

```bash
# One-time contributions
echo "YOUR_PRICE_ID_HERE" | gcloud secrets versions add STRIPE_PRICE_SEED_5 --data-file=-
echo "YOUR_PRICE_ID_HERE" | gcloud secrets versions add STRIPE_PRICE_SEED_10 --data-file=-
echo "YOUR_PRICE_ID_HERE" | gcloud secrets versions add STRIPE_PRICE_SEED_25 --data-file=-
echo "YOUR_PRICE_ID_HERE" | gcloud secrets versions add STRIPE_PRICE_SEED_50 --data-file=-

# Monthly subscriptions
echo "YOUR_PRICE_ID_HERE" | gcloud secrets versions add STRIPE_PRICE_FOUNDING_MEMBER --data-file=-
echo "YOUR_PRICE_ID_HERE" | gcloud secrets versions add STRIPE_PRICE_FOUNDING_PATRON --data-file=-
```

## Step 3: Verify Webhook is Configured

Your webhook should be set up at: `https://app.ferni.ai/subscription/webhook`

Required events:
- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `payment_intent.succeeded`

## Step 4: Deploy

After adding the secrets, deploy:

```bash
ferni deploy ui       # Deploy UI server
ferni deploy frontend # Deploy frontend
```

---

## Quick Reference: What Each Secret Does

| Secret | Used For |
|--------|----------|
| `STRIPE_PRICE_SEED_5` | "Plant a Seed" $5 one-time payment |
| `STRIPE_PRICE_SEED_10` | "Sponsor a Conversation" $10 one-time |
| `STRIPE_PRICE_SEED_25` | "Help Someone Get Started" $25 one-time |
| `STRIPE_PRICE_SEED_50` | "Support the Mission" $50 one-time |
| `STRIPE_PRICE_FOUNDING_MEMBER` | Monthly $10 subscription |
| `STRIPE_PRICE_FOUNDING_PATRON` | Monthly $20 subscription |

