# Seed Fund Complete Integration Plan

## Overview
Wire up the existing Stripe integration with the new Garden routes, mount the garden widget in the UI, and connect everything for a complete end-to-end Seed Fund experience.

---

## Phase 1: Backend - Wire Stripe to Garden Routes (4 tasks)

### 1.1 Update garden-routes.ts to use createPaymentIntent for one-time contributions
**File:** `src/api/garden-routes.ts`
- Import `createPaymentIntent` from `../services/stripe-payments.js`
- In `handlePlantSeed()`, replace TODO with actual Stripe payment intent creation
- Return `clientSecret` for frontend to complete payment with Stripe.js

### 1.2 Update garden-routes.ts to use createCheckoutSession for monthly subscriptions
**File:** `src/api/garden-routes.ts`
- Import `createCheckoutSession` from `../services/stripe-subscription.js`
- In `handleStartMonthly()`, create a Stripe checkout session with:
  - `mode: 'subscription'`
  - Garden-specific price IDs (need to create in Stripe dashboard)
  - Success/cancel URLs pointing to garden success page

### 1.3 Add Stripe Products/Prices for Seed Fund
**Action:** Create in Stripe Dashboard (or via API)
- Product: "Seed Fund Monthly"
- Prices: $5/mo, $10/mo, $25/mo recurring
- Metadata: `type: 'garden_monthly'`

### 1.4 Update garden stats tracking on successful payment
**File:** `src/api/garden-routes.ts`
- Create `updateGardenStats()` helper to increment Firestore `garden_stats/{month}` document
- Call from webhook handler when payment succeeds
- Update: `totalAmount`, `uniqueContributors`, `totalSeeds`, `monthlySubscribers`

---

## Phase 2: Frontend - Mount Garden Widget (4 tasks)

### 2.1 Add garden widget container to index.html
**File:** `frontend-typescript/index.html`
- Add `<div id="gardenWidgetContainer"></div>` below the team roster or near settings
- Best location: After `<div id="teamRoster">` section, subtle but visible

### 2.2 Initialize garden widget in app.ts
**File:** `frontend-typescript/src/app.ts`
- Import `initGardenWidget, getGardenWidgetStyles` from `./ui/garden-widget.ui.js`
- Add styles in init function
- Call `initGardenWidget(document.getElementById('gardenWidgetContainer'))`

### 2.3 Listen for plant-seed event to open modal
**File:** `frontend-typescript/src/app.ts`
- Add event listener for `ferni:open-plant-seed`
- On event, call `ferniFundUI.open(userId)`
- Pass `type` from event detail to pre-select one-time vs monthly

### 2.4 Replace emojis with SVG icons in garden-widget.ui.ts
**File:** `frontend-typescript/src/ui/garden-widget.ui.ts`
- Replace `STATUS_ICONS` emojis with SVG icons per CLAUDE.md guidelines
- Use design system tokens for colors

---

## Phase 3: Connect Frontend to Backend (4 tasks)

### 3.1 Update ferni-fund.ui.ts to call garden API
**File:** `frontend-typescript/src/ui/ferni-fund.ui.ts`
- Change submit handler to call `/api/garden/plant` for one-time
- Call `/api/garden/subscribe` for monthly
- Handle response with `clientSecret` or `checkoutUrl`

### 3.2 Add Stripe.js integration for payment completion
**File:** `frontend-typescript/src/ui/ferni-fund.ui.ts`
- Load Stripe.js SDK (already may be loaded)
- For one-time: Use `stripe.confirmPayment()` with client secret
- For monthly: Redirect to `checkoutUrl`

### 3.3 Create success/cancel pages for Stripe redirect
**Files:** New routes or handle in app.ts
- Success: `/garden/success?session_id=...`
- Cancel: `/garden/cancel`
- On success, refresh garden widget and show thank you

### 3.4 Add loading states and error handling
**File:** `frontend-typescript/src/ui/ferni-fund.ui.ts`
- Show spinner during API call
- Handle network errors gracefully
- Show appropriate error messages

---

## Phase 4: Testing & Deploy (4 tasks)

### 4.1 Test in development
- Start all 3 servers
- Test garden widget loading
- Test one-time contribution flow with test Stripe card
- Test monthly subscription flow

### 4.2 Run quality checks
```bash
npm run typecheck
npm run lint
cd frontend-typescript && npm run lint:tokens
```

### 4.3 Deploy backend
```bash
npm run deploy:ui:async
```

### 4.4 Deploy frontend
```bash
npm run deploy:frontend
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/api/garden-routes.ts` | Wire Stripe integration |
| `frontend-typescript/index.html` | Add widget container |
| `frontend-typescript/src/app.ts` | Init widget, listen events |
| `frontend-typescript/src/ui/garden-widget.ui.ts` | Replace emojis with SVG |
| `frontend-typescript/src/ui/ferni-fund.ui.ts` | Call garden API |

---

## API Flow

```
User clicks "Plant a Seed" in widget
  → Opens ferni-fund modal
  → User selects amount + optional monthly
  → Submit calls POST /api/garden/plant or /api/garden/subscribe
  → Backend creates Stripe payment intent or checkout session
  → Frontend completes payment (Stripe.js or redirect)
  → Stripe webhook fires on success
  → Backend updates garden_stats in Firestore
  → Widget refreshes with new totals
```

---

## Dependencies
- Stripe is already configured (STRIPE_SECRET_KEY exists)
- Firebase/Firestore already available
- Garden routes already registered in ui-server.js
- Garden widget and ferni-fund UI already created
