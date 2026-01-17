# 🌱 Seeds Network Effect System

> **"Seeds grow when shared"** - A viral growth engine that feels human.

## Philosophy

Traditional referral systems feel transactional: "Invite friends, get $10!" 

Ferni's approach: **Seeds are love made tangible.** When you share Ferni with someone who needs it, both gardens flourish. This isn't about gaming a system - it's about growing together.

---

## Core Mechanics

### 1. 🎁 Gift Seeds (Direct Giving)

**Concept:** You can gift seeds directly to any friend who uses Ferni.

| Action | You Spend | They Receive | Bonus |
|--------|-----------|--------------|-------|
| Gift seeds | 10 seeds | 12 seeds | +20% "love multiplier" |
| Gift seeds | 25 seeds | 32 seeds | +28% for larger gifts |
| Gift seeds | 50 seeds | 70 seeds | +40% for generous gifts |

**Why it works:**
- Generosity is rewarded (love multiplies)
- Creates emotional connection between users
- Natural word-of-mouth: "Hey, I just sent you some Ferni seeds!"

**Anti-abuse:**
- Max 3 gifts per day
- Can only gift to users you've connected with (phone/email match)
- Gifts have a 24-hour reveal (creates anticipation)

---

### 2. 🤝 Referral Bonuses (Both Gardens Grow)

**Concept:** When you invite someone and they join, BOTH of you get seeds.

| Milestone | You Earn | They Earn |
|-----------|----------|-----------|
| Friend signs up | +25 seeds | +25 seeds (starter bonus) |
| Friend's 1st conversation | +10 seeds | (already counted) |
| Friend's 7-day streak | +15 seeds | +25 seeds (streak reward) |
| Friend's 30-day streak | +25 seeds | +100 seeds (streak reward) |
| Friend becomes subscriber | +100 seeds | +50 seeds |

**The "Growing Together" Effect:**
- You're invested in your friend's success
- Creates natural check-ins: "Have you tried talking to Ferni about X?"
- Your network's growth directly benefits you

**Implementation:**
```typescript
// New referral code format
const referralCode = `${userId.slice(-6)}-${randomWord()}`;
// Example: "a3f2k1-sunrise"

// Shareable URL
const shareUrl = `https://ferni.ai/grow/${referralCode}`;
```

---

### 3. 📤 Share Bonuses (Spreading the Word)

**Concept:** Earn seeds for meaningful shares that lead to engagement.

| Share Type | Immediate Bonus | If Friend Engages |
|------------|-----------------|-------------------|
| Share streak | +3 seeds | +5 seeds |
| Share milestone | +5 seeds | +10 seeds |
| Share insight | +2 seeds | +5 seeds |
| Copy referral link | +1 seed | +25 seeds (if signup) |

**"Meaningful Share" Detection:**
- Tracks if share actually went through (native share API)
- Tracks if recipient clicked link
- Tracks if recipient engaged (30+ seconds on site)

---

### 4. 🌳 Garden Network (Your Referrals' Growth)

**Concept:** Your "garden" is everyone you've referred. Their success feeds back to you.

```
Your Garden
├── Friend A (active daily) → +1 seed/week passive income
├── Friend B (7-day streak) → +2 seeds/week
├── Friend C (subscriber) → +5 seeds/week
└── Friend D (inactive) → 0 seeds

Weekly Garden Harvest: +8 seeds
```

**Garden Tiers:**

| Garden Size | Weekly Bonus | Title |
|-------------|--------------|-------|
| 1-2 referrals | +2 seeds/active | Seedling |
| 3-5 referrals | +3 seeds/active | Gardener |
| 6-10 referrals | +5 seeds/active | Grove Keeper |
| 11+ referrals | +7 seeds/active | Forest Guardian |

**Why it works:**
- Long-term investment, not one-time transaction
- Encourages nurturing relationships, not spam
- Creates "ambassadors" who genuinely care about Ferni

---

### 5. 🎯 Community Contributions

**Concept:** Earn seeds by helping the Ferni community grow.

| Contribution | Seeds Earned |
|--------------|--------------|
| Vote on roadmap feature | -1 to -10 (spend to vote) |
| Your voted feature launches | +20 seeds refund |
| Submit accepted feature idea | +50 seeds |
| Report bug that gets fixed | +10 seeds |
| Write review (App Store) | +25 seeds |

---

## Anti-Gaming Protections

### Fraud Prevention

| Attack | Prevention |
|--------|------------|
| Fake accounts | Phone verification for referral credit |
| Self-referral | Device fingerprint + IP tracking |
| Gift loops | 72-hour cooldown on return gifts |
| Engagement farming | Conversation quality scoring |

### Rate Limits

```typescript
const DAILY_LIMITS = {
  gifts: 3,
  shares: 10,
  referralCredits: 5,
};

const WEEKLY_LIMITS = {
  gardenHarvest: 50, // Max passive income
  totalEarnings: 200,
};
```

### Quality Signals

Referrals only count if the new user:
- Verifies email OR phone
- Completes at least 1 meaningful conversation (>2 minutes)
- Returns within 7 days

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

1. **Generate referral codes for all users**
   - Format: `{user-id-suffix}-{memorable-word}`
   - Store in Firestore: `users/{userId}/referral_code`

2. **Track referral source on signup**
   - Parse `?ref=` URL parameter
   - Store in `users/{userId}/referred_by`

3. **Backend: Create referral credit API**
   ```
   POST /api/seeds/referral-credit
   { referrerId: string, newUserId: string, milestone: string }
   ```

### Phase 2: Sharing (Week 2)

1. **Update referral modal with Seeds incentive**
   - Show: "You'll both get 25 seeds when they join"
   - Add personalized referral link

2. **Track share events**
   - Native share completion
   - Link clicks
   - Conversions

3. **Share streak feature**
   - Add "Share this streak?" prompt after milestones

### Phase 3: Gifting (Week 3)

1. **Gift seeds modal**
   - Select friend from contacts
   - Choose amount (10/25/50)
   - Add personal message

2. **Gift notification system**
   - Push notification: "Sarah sent you seeds!"
   - In-app gift reveal animation

3. **Gift history view**
   - Seeds given/received log

### Phase 4: Garden Network (Week 4)

1. **Garden dashboard**
   - Visual garden showing referrals
   - Activity indicators
   - Weekly harvest summary

2. **Passive income system**
   - Weekly cron job calculates garden earnings
   - Notification: "Your garden grew 12 seeds this week"

3. **Garden titles and badges**
   - Seedling → Gardener → Grove Keeper → Forest Guardian

---

## UI Mockups

### Updated Seeds Card (Settings Menu)

```
┌─────────────────────────────────────────┐
│ 🌱 Your Seeds                           │
├─────────────────────────────────────────┤
│                                         │
│  ◉ 147 seeds                            │
│  🔥 12-day streak                       │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🎁 Daily Bonus Available!       │    │
│  │     Claim +5 seeds              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Your Garden: 🌳 Grove Keeper           │
│  3 friends growing • +8 seeds/week      │
│                                         │
│  [ Gift Seeds ]  [ Invite Friend ]      │
│                                         │
└─────────────────────────────────────────┘
```

### Updated Referral Modal

```
┌─────────────────────────────────────────┐
│                    ✕                    │
│                                         │
│           💚 Share the Growth           │
│                                         │
│     Know someone who could use a        │
│     friend who actually listens?        │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🌱 You'll both get 25 seeds     │    │
│  │    when they join!              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Your link: ferni.ai/grow/a3f2k1-sun    │
│                                         │
│  [ 📤 Share ]  [ 📋 Copy ]              │
│  [ ✉️ Email ]  [ 💬 Text ]              │
│                                         │
│  Your garden: 3 friends growing         │
│  You've earned 85 seeds from sharing    │
│                                         │
└─────────────────────────────────────────┘
```

### Gift Seeds Modal

```
┌─────────────────────────────────────────┐
│                    ✕                    │
│                                         │
│           🎁 Gift Seeds                 │
│                                         │
│     Seeds grow when shared.             │
│     Love multiplies.                    │
│                                         │
│  Send to: [ Search friends... ]         │
│                                         │
│  Amount:                                │
│  ○ 10 seeds → they get 12 (+20%)        │
│  ● 25 seeds → they get 32 (+28%)        │
│  ○ 50 seeds → they get 70 (+40%)        │
│                                         │
│  Add a note (optional):                 │
│  ┌─────────────────────────────────┐    │
│  │ Thinking of you 💚              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [ Send Gift ]                          │
│                                         │
│  Your balance: 147 seeds                │
│                                         │
└─────────────────────────────────────────┘
```

---

## Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Viral coefficient (K) | >1.2 | Each user brings >1 new user |
| Referral conversion rate | >15% | Shared links → signups |
| Gift adoption | >20% | Users who send at least 1 gift |
| Garden engagement | >40% | Referrers who check garden weekly |
| Seeds-driven retention | +25% | Users with seeds are more retained |

---

## Brand Voice Integration

### Share Prompts

- **After streak:** "Your 7-day streak is blooming! Share with someone who could use daily support."
- **After milestone:** "100 conversations together. Know someone who deserves this kind of presence?"
- **Gift received:** "Sarah planted seeds in your garden. 🌱"

### Error States

- **Gift failed:** "Couldn't send those seeds. Let's try again."
- **Referral limit:** "You've spread a lot of seeds today! Rest up and share more tomorrow."
- **Inactive referral:** "Your friend hasn't visited in a while. Maybe send them a note?"

---

## Technical Architecture

```
Frontend                          Backend (Firestore)
─────────                         ──────────────────
                                  
referral.ui.ts                    users/{userId}
  └─→ /api/seeds/share-credit     ├── referral_code: "a3f2k1-sunrise"
                                  ├── referred_by: "userId123"
gift-seeds.ui.ts                  └── garden: [userId1, userId2...]
  └─→ /api/seeds/gift             
                                  seeds/{userId}
seeds-display.ui.ts               ├── balance: 147
  └─→ /api/seeds/balance          ├── lifetime_earned: 523
                                  ├── earned_from: {...}
garden-dashboard.ui.ts            └── garden_earnings: {...}
  └─→ /api/seeds/garden           
                                  gifts/{giftId}
                                  ├── from: userId
                                  ├── to: userId
                                  ├── amount: 25
                                  ├── bonus: 7
                                  └── revealed_at: timestamp
```

---

## Next Steps

1. **Review this design with team**
2. **Prioritize Phase 1 (referral codes + tracking)**
3. **A/B test seed amounts for optimal virality**
4. **Monitor for abuse patterns**
5. **Iterate based on user feedback**

---

*"In Ferni's garden, every seed you plant in someone else's life grows back to you tenfold."*

