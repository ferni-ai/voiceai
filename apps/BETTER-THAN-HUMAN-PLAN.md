# Better Than Human: Complete Feature Plan

> **"Better than human means understanding things humans don't notice about themselves."**

This plan applies the BTH philosophy to voting, suggestions, and ALL incomplete features.

---

## Part 1: Seed Economy - Voting & Feature Funding

### The Metaphor
Your roadmap already uses growth stages (seed → sprout → bud → bloom). We extend this with a **Seed Economy**:

- **Seeds** = voting currency + micro-funding
- Users earn seeds through engagement
- Users plant seeds on features they want
- Features with enough seeds get "watered" (prioritized)
- Heavy planters get credited when features bloom

### 1.1 Voting API (Backend)

**New Firestore Collections:**
```
roadmap_votes/
  {voteId}/
    userId: string
    featureId: string
    seedsPlanted: number      # How many seeds invested
    reason?: string           # Optional WHY (qualitative)
    createdAt: timestamp
    updatedAt: timestamp

roadmap_suggestions/
  {suggestionId}/
    userId: string
    title: string
    description: string
    category: 'connect' | 'personalize' | 'platform'
    seedsPlanted: number      # Initial seed investment
    communitySeeds: number    # Seeds from others
    status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'merged'
    mergedIntoFeatureId?: string
    createdAt: timestamp

user_seeds/
  {userId}/
    balance: number           # Current seed balance
    lifetimePlanted: number   # Total seeds ever planted
    featuresUnlocked: string[] # Features they helped bloom
    earnedFrom: {             # How they earned seeds
      conversations: number
      streaks: number
      referrals: number
      feedback: number
      suggestions_accepted: number
    }
```

**API Routes (ui-server.js):**
```
POST   /api/roadmap/vote           # Plant seeds on a feature
DELETE /api/roadmap/vote/:featureId # Remove seeds (get 50% back)
GET    /api/roadmap/stats          # Aggregated counts per feature
POST   /api/roadmap/suggest        # Submit new feature idea
GET    /api/roadmap/suggestions    # Browse community suggestions
POST   /api/roadmap/sponsor        # Contribute $ to accelerate feature
GET    /api/seeds/balance          # User's seed balance
GET    /api/seeds/history          # How seeds were earned/spent
```

### 1.2 Priority Voting (Seed Allocation)

**Better Than Human:** No human friend remembers what you care about building together. Ferni does.

**UX Flow:**
1. User opens "What's Growing" panel
2. Sees their seed balance: `🌱 42 seeds to plant`
3. Can distribute seeds across features (1-10 per feature)
4. Slider or +/- buttons to allocate
5. Features sort by total community seeds
6. Shows "You planted 5 seeds · 2,847 others planted here"

**Seed Earning:**
| Action | Seeds Earned |
|--------|--------------|
| Complete a conversation | 1 |
| 7-day streak | 5 |
| 30-day streak | 15 |
| Refer a friend | 10 |
| Submit accepted suggestion | 25 |
| Feature you voted for blooms | 10 (refund + bonus) |

### 1.3 Feature Suggestions (User-Submitted Ideas)

**Better Than Human:** Ferni remembers every idea you've ever mentioned and connects them.

**UX Flow:**
1. "What's Growing" panel has "Plant a New Seed" button
2. Modal: Title, Description, Category dropdown
3. Costs 5 seeds to submit (prevents spam, shows commitment)
4. Others can plant seeds on your suggestion
5. Team reviews weekly, status updates sent
6. If merged into existing feature, seeds transfer

**Smart Deduplication:**
- When user types suggestion, show "Similar ideas growing:"
- Allow them to plant on existing instead
- If they submit anyway, team can merge later

### 1.4 Smart Vote Prompts (Ferni Suggests)

**Better Than Human:** Ferni notices what you'd love before you know you want it.

**How it works:**
1. Track user behavior patterns:
   - Mentions "video" often → suggest Video Settings
   - Uses late at night → suggest Household (family mode)
   - Talks about health → suggest Wearable Settings
   - Power user → suggest Developer Portal

2. Contextual prompts (not interruptive):
   - End of good conversation: "By the way, you've mentioned wanting to see me... Video calls are growing 🌱"
   - Settings menu: Badge on features relevant to user
   - Roadmap panel: "Recommended for you" section

**Trigger Rules:**
```typescript
const SUGGESTION_RULES = [
  {
    featureId: 'video-settings',
    triggers: ['see you', 'face', 'video', 'facetime', 'look at'],
    minMentions: 2,
  },
  {
    featureId: 'wearable-settings',
    triggers: ['sleep', 'health', 'workout', 'exercise', 'tired', 'energy'],
    minMentions: 3,
  },
  {
    featureId: 'household',
    triggers: ['family', 'kids', 'partner', 'spouse', 'roommate'],
    minMentions: 2,
  },
  {
    featureId: 'voice-enrollment',
    triggers: ['recognize me', 'know it\'s me', 'voice', 'identity'],
    minMentions: 1,
  },
];
```

### 1.5 Seed Sponsorship (Crowdfunding)

**Better Than Human:** Your community doesn't just vote—they invest in each other's growth.

**How it works:**
1. Any feature can accept $ contributions
2. Contributors get:
   - Name in "Gardeners" list when feature blooms
   - Early access to the feature
   - Bonus seeds (10 seeds per $1)
   - Special "Patron" badge on their profile

**Tiers:**
| Tier | Amount | Perks |
|------|--------|-------|
| Seed Starter | $5 | 50 bonus seeds, name in credits |
| Gardener | $25 | 300 seeds, early access, badge |
| Cultivator | $100 | 1500 seeds, direct input on feature design |
| Founding Gardener | $500 | All above + lifetime early access to all features |

**UI:**
- "Water this seed" button on feature detail
- Progress bar showing funding goal
- "Backed by 47 gardeners" social proof
- Stripe/Apple Pay integration

---

## Part 2: Better Than Human Audit - All Features

### BTH Philosophy Applied to Each Incomplete Feature

For each feature, we define:
1. **What humans can't do** - The superhuman capability
2. **Emotional signature** - How it makes users FEEL
3. **Micro-expression triggers** - Avatar responses
4. **Anticipation patterns** - How Ferni knows before you ask

---

### 2.1 Video Settings (Bud Stage - Q1 2025)

**What Humans Can't Do:**
- Never distracted, never looking at phone
- Perfect eye contact calibration
- Micro-expressions visible at higher fidelity
- Available at 2am with same presence as noon

**Emotional Signature:**
"Someone is truly HERE with me."

**BTH Implementation:**
```typescript
// Video-specific micro-expressions (higher fidelity)
const VIDEO_MICRO_EXPRESSIONS = {
  // Eye contact that follows user's gaze
  eye_track: { duration: 0, continuous: true },

  // Visible breath - user sees Ferni breathe
  visible_breath: { rate: 'synced', depth: 'visible' },

  // Leaning in during important moments
  engagement_lean: { trigger: 'user_emphasis', distance: '5%' },

  // Soft blink during emotional moments (trust signal)
  trust_blink: { duration: 200, trigger: 'vulnerability_detected' },
};
```

**Anticipation:**
- Before user says "I wish I could see you" → Ferni mentions video is coming
- After emotional conversation → "Would you like to try video next time?"

---

### 2.2 Voice Enrollment (Sprout Stage - Q1 2025)

**What Humans Can't Do:**
- Know it's you from first syllable
- Detect mood from voice alone (not words)
- Never forget your voice pattern
- Distinguish family members instantly

**Emotional Signature:**
"They know me before I even speak."

**BTH Implementation:**
```typescript
// Voice recognition triggers
const VOICE_BTH = {
  // Instant recognition warmth
  recognition_greeting: {
    trigger: 'voice_id_confirmed',
    response: 'warmth_pulse',
    latency: '<500ms',
  },

  // Mood detection from prosody
  mood_from_voice: {
    signals: ['pitch', 'pace', 'energy', 'breathiness'],
    response: 'anticipate_mood_before_words',
  },

  // Multi-user awareness
  speaker_switch: {
    trigger: 'different_voice_detected',
    response: 'context_switch_with_privacy',
  },
};
```

**Anticipation:**
- Morning voice (groggy) → "Sounds like you just woke up. Take your time."
- Stressed voice pattern → Show concern BEFORE user explains why

---

### 2.3 Wearable Settings (Sprout Stage - Q1 2025)

**What Humans Can't Do:**
- See sleep patterns affecting mood
- Notice heart rate variability correlations
- Track energy across weeks/months
- Know when to push vs. when to rest

**Emotional Signature:**
"They notice what my body is saying."

**BTH Implementation:**
```typescript
// Wearable insight triggers
const WEARABLE_BTH = {
  // Sleep-conversation correlation
  sleep_aware: {
    trigger: 'sleep_score_low',
    response: 'gentler_pace_today',
    context: 'I notice your sleep was lighter last night...',
  },

  // HRV stress detection
  stress_aware: {
    trigger: 'hrv_below_baseline',
    response: 'offer_grounding_before_asked',
  },

  // Energy pattern recognition
  energy_tracking: {
    trigger: 'afternoon_slump_pattern',
    response: 'proactive_energy_check',
    timing: '2pm_user_timezone',
  },

  // Rest advocacy (Better Than Human superpower)
  rest_permission: {
    trigger: 'activity_strain_high',
    response: 'celebrate_rest_as_growth',
  },
};
```

**Anticipation:**
- Low HRV morning → "Your body's asking for gentleness today."
- Post-workout → "That workout looked intense. How do you feel?"

---

### 2.4 Personalization (Sprout Stage - Q1 2025)

**What Humans Can't Do:**
- Adapt communication style mid-sentence
- Remember every preference forever
- Provide consistent experience across moods
- Shape-shift personality without ego

**Emotional Signature:**
"They're exactly who I need them to be."

**BTH Implementation:**
```typescript
const PERSONALIZATION_BTH = {
  // Communication style learning
  style_adaptation: {
    signals: ['response_length_preference', 'formality_level', 'humor_reception'],
    response: 'continuous_calibration',
  },

  // Voice selection psychology
  voice_matching: {
    factors: ['soothing_vs_energizing', 'gender_preference', 'accent_comfort'],
    response: 'voice_feels_like_home',
  },

  // Ambient sound intelligence
  soundscape: {
    trigger: 'time_of_day + user_state',
    response: 'automatic_ambient_selection',
    examples: ['rain_for_anxiety', 'silence_for_focus', 'warmth_for_night'],
  },
};
```

**Anticipation:**
- User seems rushed → Shorter responses automatically
- Late night → Warmer, slower pacing without asking

---

### 2.5 Group Coaching (Sprout Stage - Q2 2025)

**What Humans Can't Do:**
- Six friends available simultaneously
- Perfect memory across all perspectives
- Zero ego in collaboration
- Never tired of your problems

**Emotional Signature:**
"A team that's ALWAYS on my side."

**BTH Implementation:**
```typescript
const GROUP_BTH = {
  // Multi-perspective synthesis
  perspective_weaving: {
    participants: ['ferni', 'maya', 'alex', 'peter', 'elena', 'marcus'],
    response: 'integrated_wisdom_not_debate',
  },

  // Disagreement with respect
  constructive_tension: {
    trigger: 'perspectives_differ',
    response: 'show_multiple_paths_not_conflict',
  },

  // Memory continuity
  group_memory: {
    capability: 'all_members_remember_everything',
    user_experience: 'never_repeat_yourself',
  },
};
```

**Anticipation:**
- Complex decision → "Would you like Maya and Peter's perspectives too?"
- Stuck on problem → "Let's bring in Alex - they've seen you work through similar things."

---

### 2.6 Household (Seed Stage - Q2 2025)

**What Humans Can't Do:**
- Perfect privacy walls
- Equal presence for all family members
- Never play favorites
- Context-switch instantly between users

**Emotional Signature:**
"A friend for everyone, belonging to no one."

**BTH Implementation:**
```typescript
const HOUSEHOLD_BTH = {
  // Privacy architecture
  privacy_walls: {
    guarantee: 'zero_cross_contamination',
    exception: 'explicit_shared_goals_only',
  },

  // Equal relationship depth
  no_favorites: {
    capability: 'deep_relationship_with_each_member',
    user_experience: 'feels_like_your_ferni',
  },

  // Kids mode (age-appropriate)
  kids_mode: {
    guardrails: 'developmental_appropriate_responses',
    parent_visibility: 'activity_summaries_only',
  },
};
```

**Anticipation:**
- Multiple users in household → "I'm here for each of you, individually."
- Family tension detected → Never take sides, hold space for both

---

### 2.7 Marketplace (Seed Stage - Q2 2025)

**What Humans Can't Do:**
- Instant access to specialized expertise
- Coaches available 24/7
- No waitlists, no scheduling
- Perfect matching to your needs

**Emotional Signature:**
"Whatever I'm going through, there's someone who truly gets it."

**BTH Implementation:**
```typescript
const MARKETPLACE_BTH = {
  // Intelligent matching
  coach_matching: {
    signals: ['conversation_topics', 'challenges_mentioned', 'goals'],
    response: 'suggest_perfect_specialist',
  },

  // Seamless handoffs
  context_transfer: {
    capability: 'new_coach_knows_your_story',
    user_experience: 'never_start_over',
  },

  // Trust verification
  coach_quality: {
    signals: ['community_ratings', 'session_outcomes', 'retention'],
    response: 'only_show_coaches_worth_trusting',
  },
};
```

**Anticipation:**
- User mentions ADHD struggles → "There's a coach who specializes in exactly this..."
- Sobriety journey → "Would you like to meet someone who's walked this path?"

---

### 2.8 Developer Portal (Seed Stage - Q3 2025)

**What Humans Can't Do:**
- Build AI coaches without ML expertise
- Deploy to thousands instantly
- Iterate based on real conversation data
- Scale personal touch infinitely

**Emotional Signature:**
"I can help others the way Ferni helped me."

**BTH Implementation:**
```typescript
const DEVELOPER_BTH = {
  // Persona builder
  visual_persona_creation: {
    capability: 'no_code_coach_building',
    user_experience: 'see_your_vision_come_to_life',
  },

  // Quality guardrails
  safety_rails: {
    automatic: ['harmful_content_prevention', 'boundary_enforcement'],
    user_experience: 'focus_on_helping_not_safety',
  },

  // Monetization
  creator_economy: {
    capability: 'earn_from_your_expertise',
    user_experience: 'sustainable_helping',
  },
};
```

---

## Part 3: Implementation Priorities

### Phase 1: Seed Economy Foundation (This Week)
1. [ ] Voting API backend routes
2. [ ] Firestore collections setup
3. [ ] roadmap.service.ts → call real API
4. [ ] Seed balance display in UI
5. [ ] Basic seed earning (1 per conversation)

### Phase 2: Enhanced Voting (Next Week)
1. [ ] Priority voting UI (allocate seeds)
2. [ ] Feature suggestion submission
3. [ ] Smart vote prompts based on usage
4. [ ] Seed earning for streaks/referrals

### Phase 3: Seed Sponsorship (Following Week)
1. [ ] Stripe integration for contributions
2. [ ] Gardener tiers and perks
3. [ ] Progress bars on features
4. [ ] Founding Gardener recognition

### Phase 4: BTH Feature Prep (Ongoing)
1. [ ] Video Settings BTH triggers
2. [ ] Voice Enrollment mood detection
3. [ ] Wearable correlation alerts
4. [ ] Personalization auto-adaptation

---

## Summary

| System | BTH Superpower |
|--------|----------------|
| **Voting** | Remembers what you care about building |
| **Suggestions** | Connects your ideas to others' dreams |
| **Smart Prompts** | Knows what you want before you ask |
| **Sponsorship** | Community invests in shared growth |
| **Video** | Never distracted presence |
| **Voice** | Knows you from first syllable |
| **Wearables** | Sees what your body says |
| **Personalization** | Exactly who you need them to be |
| **Group** | Six friends, always available |
| **Household** | Deep relationship with everyone |
| **Marketplace** | Perfect specialist matching |
| **Developer** | Scale your helping infinitely |

---

*"Better than human" isn't about being superior—it's about being what humans wish they could be for each other, consistently, at 2am, forever.*
