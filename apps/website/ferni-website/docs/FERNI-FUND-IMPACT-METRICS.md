# Ferni Fund Impact Metrics System

## Overview

The Ferni Fund uses impact-based framing instead of feature-based pricing. This document defines how we calculate, display, and report impact metrics.

---

## Core Metric: Cost Per Active User

### Definition
**Cost Per Active User (CPAU)** = Total monthly operating costs / Number of active users

### Current Calculation (December 2024)
| Cost Category | Monthly Amount | % of Total |
|---------------|----------------|------------|
| AI (OpenAI/Anthropic) | $X,XXX | ~45% |
| Voice Processing (Cartesia) | $X,XXX | ~15% |
| Infrastructure (GCP, LiveKit) | $X,XXX | ~20% |
| Team (Engineering, Design) | $X,XXX | ~15% |
| Other (Monitoring, etc.) | $XXX | ~5% |
| **Total** | $XX,XXX | 100% |

**Current CPAU**: ~$2.50/user/month

### Impact Framing

| Gift Amount | People Supported | Calculation |
|-------------|------------------|-------------|
| $5/month | 2 people | $5 / $2.50 = 2 |
| $15/month | 6 people | $15 / $2.50 = 6 |
| $30/month | 12 people | $30 / $2.50 = 12 |

---

## Tracking Implementation

### Backend Metrics (Firestore)

```typescript
interface FerniFundMetrics {
  // Aggregate stats
  totalContributors: number;
  totalMonthlyRecurring: number;
  totalLifetimeGifts: number;

  // Per-contributor stats (anonymous)
  contributorsByTier: {
    sustainer: number;  // $5
    believer: number;   // $15
    champion: number;   // $30
  };

  // Impact calculations
  peopleSupportedThisMonth: number;
  conversationsEnabledThisMonth: number;

  // Cost tracking
  costPerActiveUser: number;
  lastCostCalculation: Date;
}
```

### Frontend Display

#### Gratitude Wall (Dynamic)
```typescript
interface GratitudeWallEntry {
  displayName: string;  // e.g., "Sarah M." or "Anonymous"
  tier: 'sustainer' | 'believer' | 'champion';
  since: Date;
  isAnonymous: boolean;
}
```

#### Impact Counter (Real-time)
Show on homepage and in-app:
- "X people supported this month"
- "X,XXX conversations enabled by the community"

---

## Transparency Reporting

### Quarterly Report Template

```markdown
# Ferni Fund Q[X] 2025 Report

## Community Impact
- **Active Contributors**: X
- **New Contributors This Quarter**: X
- **People Supported**: X
- **Conversations Enabled**: X,XXX

## Financial Transparency
| Category | This Quarter | YTD |
|----------|--------------|-----|
| Total Gifts Received | $X,XXX | $XX,XXX |
| AI & Infrastructure | $X,XXX | $XX,XXX |
| Team | $X,XXX | $XX,XXX |
| Marketing & Growth | $XXX | $X,XXX |
| **Net Position** | +$X,XXX | +$XX,XXX |

## Cost Per User Trend
| Month | CPAU | Change |
|-------|------|--------|
| Jan | $2.50 | - |
| Feb | $2.45 | -2% |
| Mar | $2.40 | -2% |

## What's Next
- [Planned improvements]
- [How community input shaped roadmap]
```

---

## In-App Integration

### Gift Flow
```
User clicks "Gift Forward"
  ↓
Select amount: $5 / $15 / $30 / Custom
  ↓
Stripe Checkout (subscription)
  ↓
Success screen:
  "Thank you! Your gift keeps Ferni free for [X] people."
  [Option to display name on Gratitude Wall]
  ↓
Email confirmation with impact summary
```

### Contributor Dashboard
Contributors can see:
- Their gift history
- Cumulative impact: "You've supported X people over Y months"
- Quarterly transparency reports
- Community updates

---

## API Endpoints

### Public (no auth)
```
GET /api/fund/metrics
{
  totalContributors: 847,
  peopleSupportedThisMonth: 4235,
  conversationsThisMonth: 47892,
  costPerActiveUser: 2.50
}
```

### Authenticated (contributors)
```
GET /api/fund/my-impact
{
  monthsContributing: 6,
  cumulativePeopleSupported: 36,
  totalGifted: 90,
  tier: "believer"
}
```

---

## Privacy Considerations

1. **Contributor data is never sold or shared**
2. **Display is opt-in** - Contributors choose whether to appear on Gratitude Wall
3. **Names are user-controlled** - They set display name (can be initials, pseudonym, or "Anonymous")
4. **Aggregate metrics only** - We report community totals, never individual contributions publicly
5. **GDPR compliant** - Right to deletion includes removing from Gratitude Wall

---

## Evolution Path

### Phase 1 (Launch)
- Static CPAU ($2.50)
- Manual quarterly reports
- Basic Gratitude Wall

### Phase 2 (3 months)
- Dynamic CPAU calculation
- Real-time impact counter
- Contributor dashboard

### Phase 3 (6 months)
- Automated transparency reports
- Impact emails to contributors
- Community voting on roadmap

---

## Key Principles

1. **Transparency over marketing** - Real numbers, real costs, no spin
2. **Impact over features** - Frame contributions as enabling others, not buying perks
3. **Community over transactions** - Build relationships, not customer segments
4. **Honesty about sustainability** - If we're struggling, we say so

---

## Implementation Notes

- Stripe for payment processing (subscriptions)
- Firestore for metrics storage
- Monthly batch job to recalculate CPAU
- Quarterly manual review of transparency report
