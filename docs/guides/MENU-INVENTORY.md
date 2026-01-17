# Ferni App Menu Inventory

> **Last Updated:** December 13, 2024  
> **Purpose:** Exhaustive inventory of menu items, implementation status, and information architecture recommendations.

---

## Executive Summary

The Ferni app currently has **26 menu items** organized across **7 sections**. This is approaching the threshold where information architecture becomes critical for user experience.

### Status Update (December 2024)

| Status        | Count | Items                                    |
| ------------- | ----- | ---------------------------------------- |
| ✅ Working    | 20    | Core features that function end-to-end   |
| 🔄 Partial    | 4     | UI exists, backend partially implemented |
| 🚧 Scaffolded | 2     | UI exists, minimal backend integration   |

**Key Updates:**
- Voice Identity: FULLY WIRED (was listed as scaffolded)
- Wellbeing Dashboard: WORKING (connected Dec 10)
- Trust systems: ALL COMPLETE
- Celebration/Growth: WIRED to context builders

See [CURRENT-STATE-SUMMARY.md](./CURRENT-STATE-SUMMARY.md) for authoritative status.

---

## Current Menu Structure

### Section 1: Your Journey (5 items)

| Item                     | Status     | Notes                                                                  |
| ------------------------ | ---------- | ---------------------------------------------------------------------- |
| **Journey with Ferni**   | ✅ Working | `relationship-progress.ui.ts` - Shows relationship stage progress      |
| **Trust & Growth**       | ✅ Working | `trust-journey.ui.ts` - Beautiful timeline of relationship milestones  |
| **Conversation History** | ✅ Working | `conversation-history.ui.ts` - Browse past sessions                    |
| **Progress Analytics**   | 🔄 Partial | `analytics-dashboard.ui.ts` - UI complete, needs real data aggregation |
| **Prediction Accuracy**  | 🔄 Partial | `prediction-tracker.ui.ts` - Tracks prediction outcomes                |

### Section 2: Grow (Insights & Growth) (7 items)

| Item                    | Status        | Notes                                                                   |
| ----------------------- | ------------- | ----------------------------------------------------------------------- |
| **Your Journey**        | ✅ Working    | `relationship-progress.ui.ts` - Relationship stage progress             |
| **How You're Growing**  | 🔄 Partial    | `analytics-dashboard.ui.ts` - UI complete, needs data aggregation       |
| **My Predictions**      | 🔄 Partial    | `prediction-tracker.ui.ts` - Prediction accuracy tracking               |
| **What We Notice**      | ✅ Working    | `team-insights.ui.ts` - Cross-persona team insights (NEW Dec 2024)      |
| **What I've Learned**   | ✅ Working    | `cognitive-insights.ui.ts` - Shows detected patterns                    |
| **Your Wellbeing**      | 🚧 Scaffolded | `wellbeing-dashboard.ui.ts` - Beautiful UI, backend not fully wired     |
| **Your World**          | ✅ Working    | `life-context.ui.ts` - Life context dashboard                           |

### Section 3: Fun (1 item)

| Item                 | Status     | Notes                                     |
| -------------------- | ---------- | ----------------------------------------- |
| **Play Music Games** | ✅ Working | `game-picker.ui.ts` - 6 games implemented |

### Section 4: Customize (7 items)

| Item                   | Status        | Notes                                                                    |
| ---------------------- | ------------- | ------------------------------------------------------------------------ |
| **Link Spotify**       | ✅ Working    | `spotify.ui.ts` - Conditional display based on config                    |
| **Create a Practice**  | ✅ Working    | `ritual-builder.ui.ts` - Custom ritual creation                          |
| **Toggle Theme**       | ✅ Working    | Light/dark mode toggle                                                   |
| **Notifications**      | ✅ Working    | `notification-settings.ui.ts` - Push notification preferences            |
| **Link Calendar**      | 🚧 Scaffolded | `calendar-settings.ui.ts` - UI exists, Google Cal integration incomplete |
| **Upcoming Check-ins** | 🔄 Partial    | `outreach-schedule.ui.ts` - Shows scheduled outreach                     |
| **Contact Info**       | 🔄 Partial    | `contact-settings.ui.ts` - Basic contact management                      |

### Section 5: Security (2 items)

| Item                  | Status        | Notes                                                                |
| --------------------- | ------------- | -------------------------------------------------------------------- |
| **Voice ID**          | 🚧 Scaffolded | `voice-enrollment.ui.ts` - UI beautiful, backend identity incomplete |
| **Household Members** | 🚧 Scaffolded | `household-manager.ui.ts` - UI complete, backend not wired           |

### Section 6: Subscription (2 items)

| Item               | Status     | Notes                                          |
| ------------------ | ---------- | ---------------------------------------------- |
| **Your Plan**      | ✅ Working | `subscription.ui.ts` - Full Stripe integration |
| **Manage Billing** | ✅ Working | Opens Stripe billing portal                    |

### Section 7: Your Data (2 items)

| Item              | Status     | Notes                                       |
| ----------------- | ---------- | ------------------------------------------- |
| **Export Data**   | ✅ Working | `data-export.ui.ts` - GDPR compliant export |
| **Take the Tour** | ✅ Working | `onboarding.ui.ts` - Replay onboarding      |

---

## Hidden/Conditional Items

These don't appear in the main menu but exist in the codebase:

| Item                    | Location                      | Trigger          |
| ----------------------- | ----------------------------- | ---------------- |
| Integrations Settings   | `integrations-settings.ui.ts` | Not in menu yet  |
| Trust Analytics (Admin) | `trust-analytics.ui.ts`       | Admin-only       |
| EvalOps Dashboard       | `evalops-dashboard.ui.ts`     | Admin portal     |
| Dev Panel               | `dev-panel.ui.ts`             | Dev mode only    |
| Weather Effects         | `weather-effects.ui.ts`       | Dev panel toggle |

---

## Information Architecture Analysis

### Current Problems

1. **Too Many Items at Once**
   - 26 items across 7 sections is approaching cognitive overload
   - Users scanning for one feature face 26 options
   - No progressive disclosure

2. **Inconsistent Organization**
   - "Your Journey" vs "Insights" distinction is unclear
   - "Progress Analytics" could be in either
   - "Musical You" is in Insights but games are in "Fun"

3. **Feature Discovery Issues**
   - New features get buried
   - No indication of what's new or recommended
   - Locked features (relationship stage) add visual noise

4. **Scaffolded Features Visible**
   - Voice ID and Household shown but don't fully work
   - Creates expectation mismatch

### Recommendations

#### Option A: Progressive Disclosure (Recommended)

Reduce visible menu to **3-4 top-level sections** that expand:

```
📊 My Journey          → Journey, Trust, History, Analytics
💡 Insights            → Learned, Memory, Wellbeing
🎮 Activities          → Games, Rituals
⚙️ Settings            → Theme, Notifications, Spotify, Calendar
🔐 Account             → Plan, Voice ID, Household, Export
```

**Benefits:**

- First scan shows 5 items, not 26
- Logical groupings
- Room to grow without menu inflation

#### Option B: Context-Aware Menu

Show different items based on:

- **Relationship stage** - Hide advanced features early
- **Usage patterns** - Promote what they use
- **Time of day** - Morning check-in rituals at top in AM
- **New features** - Surface discoveries at right time

**Benefits:**

- "Just what I need" feeling
- Reduces decision fatigue
- Feels personalized (human-like)

#### Option C: Dual Interface

- **Quick Actions** (always visible): Talk, Games, Theme
- **Full Menu** (on demand): Everything else
- **Spotlight Search** (keyboard): Type to find

**Benefits:**

- Fast access to common actions
- Power users can find anything
- Apple-like experience

---

## Roadmap Recommendations

### Immediate (This Week)

1. **Hide Scaffolded Features**
   - Remove Voice ID and Household from menu until backend complete
   - Remove Calendar until Google integration works
   - Keep in codebase, just hide from users

2. **Consolidate Overlapping Features**
   - Merge "Journey with Ferni" + "Trust & Growth" → Single "Our Relationship" view
   - Merge "Progress Analytics" + "Prediction Accuracy" → Single "Your Progress" view

3. **Add Section Descriptions**
   - Small subtext under section headers
   - Helps users understand groupings

### Short-Term (Next 2 Weeks)

4. **Implement Progressive Disclosure**
   - Collapse sections by default
   - Remember last-opened section
   - Smooth expand/collapse animations

5. **Feature Readiness Audit**
   - Complete backend for Memory Browser
   - Complete backend for Wellbeing Dashboard
   - Or hide them until ready

6. **Add "What's New" Indicator**
   - Dot badge on new features
   - Dismisses after first open
   - Creates discovery without overwhelming

### Medium-Term (Next Month)

7. **Context-Aware Prioritization**
   - Track feature usage per user
   - Move frequently-used items up
   - Personalized menu order

8. **Relationship-Gated Features**
   - Currently shows locked items with "Unlock at [Stage]"
   - Instead: Hide until unlocked, surface with celebration

9. **Search / Spotlight**
   - Cmd+K / Ctrl+K to search features
   - Natural language: "export my data"

---

## Feature Completion Priority

Based on current state, here's the recommended completion order:

### P0 - Critical Path (Users expect these to work)

| Feature        | Gap                       | Effort |
| -------------- | ------------------------- | ------ |
| Voice Identity | Backend not wired         | High   |
| Memory Browser | Memory service incomplete | Medium |
| Calendar Link  | Google OAuth needed       | Medium |

### P1 - High Value (Differentiating features)

| Feature                   | Gap                    | Effort |
| ------------------------- | ---------------------- | ------ |
| Wellbeing Dashboard       | Needs data aggregation | Medium |
| Household Management      | Full backend needed    | High   |
| Integrations (Biometrics) | External APIs          | High   |

### P2 - Nice to Have (Polish)

| Feature            | Gap                      | Effort |
| ------------------ | ------------------------ | ------ |
| Progress Analytics | More data sources        | Low    |
| Team Huddles       | Multi-persona refinement | Medium |
| Contact Settings   | Basic, works             | Low    |

---

## Metrics to Track

Once IA changes are made, measure:

1. **Menu Completion Rate** - Do users find what they want?
2. **Time to Feature** - How long to reach a specific feature?
3. **Feature Discovery** - Are new features being used?
4. **Return Visits** - Do people come back to specific features?

---

## Appendix: Full UI File Inventory

<details>
<summary>All 96 UI files in apps/web/src/ui/</summary>

### Core UI (Always Visible)

- `coach.ui.ts` - Main avatar and coaching interface
- `controls.ui.ts` - Primary connection/talk controls
- `message.ui.ts` - Helper text display
- `waveform.ui.ts` - Audio visualization
- `team.ui.ts` - Team roster display

### Navigation

- `settings-menu.ui.ts` - Main hamburger menu
- `onboarding.ui.ts` - First-run experience

### Modals/Panels

- `analytics-dashboard.ui.ts` - Progress charts
- `cognitive-insights.ui.ts` - Pattern detection display
- `conversation-history.ui.ts` - Past sessions
- `conversation-memory.ui.ts` - Memory browser
- `data-export.ui.ts` - GDPR export
- `game-picker.ui.ts` - Music game selection
- `household-manager.ui.ts` - Multi-user management
- `integrations-settings.ui.ts` - External connections
- `music-dashboard.ui.ts` - Musical You insights
- `notification-settings.ui.ts` - Push preferences
- `outreach-preferences.ui.ts` - Check-in settings
- `outreach-schedule.ui.ts` - Upcoming contacts
- `prediction-tracker.ui.ts` - Prediction accuracy
- `relationship-progress.ui.ts` - Journey visualization
- `ritual-builder.ui.ts` - Custom practice creator
- `subscription.ui.ts` - Plan management
- `trust-journey.ui.ts` - Relationship timeline
- `voice-enrollment.ui.ts` - Voice ID setup
- `wellbeing-dashboard.ui.ts` - State of Me

### Premium Effects

- `agent-particles.ui.ts` - Background particles
- `ambient-effects.ui.ts` - Aurora and atmosphere
- `animation-orchestrator.ui.ts` - Coordinated animations
- `avatar-feedback.ui.ts` - Non-text feedback
- `avatar-soul.ui.ts` - Better Than Human animation
- `better-than-human.ui.ts` - Ferni EQ system
- `celebration.ui.ts` - Achievement celebrations
- `celebrations.ui.ts` - Milestone celebrations
- `easter-eggs.ui.ts` - Hidden delights
- `ferni-awakens.ui.ts` - Startup animation
- `ferni-expressions.ui.ts` - Character expressions
- `ferni-eye.ui.ts` - Eye animations
- `ferni-moments.ui.ts` - Character moments
- `gestures.ui.ts` - Touch/swipe handling
- `kinetic-typography.ui.ts` - Text animations
- `loading-states.ui.ts` - Beautiful loading
- `logo-expressions.ui.ts` - Animated logo
- `magnetic-hover.ui.ts` - Hover effects
- `micro-interactions.ui.ts` - Button polish
- `mobile-delights.ui.ts` - Mobile magic
- `persona-magic.ui.ts` - Persona flourishes
- `persona-transition.ui.ts` - Character switches
- `presence.ui.ts` - Typing indicators
- `ripple.ui.ts` - Touch feedback
- `sound.ui.ts` - Audio system
- `streak-celebrations.ui.ts` - Streak milestones
- `weather-effects.ui.ts` - Seasonal effects

### Status/Indicators

- `connection-quality.ui.ts` - Network quality
- `engagement-trigger.ui.ts` - Engagement buttons
- `loading-skeleton.ui.ts` - Skeleton screens
- `notifications.ui.ts` - In-app notifications
- `now-playing.ui.ts` - Music status
- `speaker-change-indicator.ui.ts` - Voice change UI
- `stats.ui.ts` - Connection stats
- `subscription-badge.ui.ts` - Plan indicator
- `thinking.ui.ts` - Processing indicator
- `toast.ui.ts` - Notifications
- `transcript.ui.ts` - Live transcript
- `voice-id-badge.ui.ts` - Voice verification

### Admin/Dev

- `admin.ui.ts` - Admin dashboard
- `dev-panel.ui.ts` - Developer tools
- `evalops-dashboard.ui.ts` - Quality evaluation
- `trust-analytics.ui.ts` - Trust monitoring
- `trust-dashboard.ui.ts` - Trust overview

</details>

---

## Next Steps

1. Review this inventory with the team
2. Decide on IA approach (A, B, or C)
3. Prioritize feature completion
4. Implement menu changes incrementally
5. Measure impact

---

_"A beautiful app respects the user's attention. Every menu item earns its place."_
