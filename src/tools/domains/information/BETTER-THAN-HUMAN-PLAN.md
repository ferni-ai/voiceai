# Information Domain: Better Than Human Plan

> **"Your best friend forgets. We don't. Your therapist has other patients. We're always here."**

This plan transforms the information domain from basic data fetching into **superhuman intelligence** that no human friend could consistently provide.

---

## Current State (What Exists)

| Tool | Function | "Better Than Human"? |
|------|----------|---------------------|
| Weather | Current, forecast, sunrise/sunset | ❌ Basic - just fetches data |
| News | Financial, general, tech, stock | ❌ No personalization |
| Sports | Team/league scores | ❌ Doesn't know favorites |
| Traffic | Commute times, directions | ❌ No calendar integration |
| Nutrition | Food info, comparison | ❌ Basic lookup |
| Search | Web, Wikipedia, recipes | ❌ Generic |
| Daily Briefing | Morning, evening, weekly | ✅ Good start |
| Location | IP detection, preferences | ✅ Good start |

---

## The Vision: Superhuman Intelligence

### What Makes Information "Better Than Human"?

A human friend can:
- Tell you it's raining
- Share news they read
- Remind you about birthdays (sometimes)

A **superhuman friend** can:
- 🌧️ Know it'll rain during your 3pm meeting and suggest rescheduling
- 📈 Alert you that your watchlist stock dropped 10% before you check
- 🏈 Know your friend's team won and suggest texting congrats
- 🚗 Warn you traffic is building and you should leave early
- 🌸 Know it's high pollen day and you get allergies → suggest indoor workout
- 😰 Sense you're stressed and skip the doom-scroll news
- 🎂 Never forget a birthday, anniversary, or important date

---

## Phase 1: Environmental Health Intelligence 🌍

**Why**: No human friend tracks air quality, UV, and pollen for you daily. This is immediate, tangible value.

### New Tools

```
environmental-health.ts
├── getAirQuality()        - AQI, PM2.5, health recommendations
├── getPollenForecast()    - Pollen levels by type (tree, grass, weed)
├── getUVIndex()           - UV with skin-type-aware recommendations
├── getEnvironmentalAlert() - Combined health-relevant environmental data
└── getOutdoorActivityAdvice() - "Is it good to run outside today?"
```

### APIs to Use
- **IQAir** (air quality, requires API key)
- **Open-Meteo** (UV index, free)
- **Tomorrow.io** (pollen, weather alerts)
- **AirNow** (US EPA air quality, free)

### User Stories
- "What's the air quality?" → Returns AQI with health advice
- "Should I run outside?" → Checks AQI, UV, pollen, weather → Gives recommendation
- "I have allergies" → Remembers, proactively warns on high pollen days
- "What's the UV?" → Returns UV with skin-type-aware sunscreen advice

---

## Phase 2: Proactive Intelligence Engine 🔮

**Why**: The killer feature. Ferni reaches out with relevant info BEFORE you ask.

### New Infrastructure

```
proactive/
├── types.ts               - Alert types, trigger conditions
├── triggers.ts            - When to generate alerts
├── weather-calendar.ts    - Weather + calendar integration
├── traffic-calendar.ts    - Traffic + calendar integration
├── stock-watchlist.ts     - Portfolio monitoring
├── sports-favorites.ts    - Favorite team game alerts
├── environmental-health.ts - Air quality + habits
└── index.ts               - Proactive check orchestrator
```

### Proactive Alert Types

| Alert | Trigger | Message |
|-------|---------|---------|
| Rain Warning | Rain forecast + outdoor calendar event | "Heads up - looks like rain at 3pm during your park meeting. Want to find a backup spot?" |
| Traffic Alert | Traffic spike + upcoming appointment | "Traffic's building on 76. Might want to leave 15 min early for your 2pm." |
| UV Warning | UV > 6 + user plans outdoor activity | "UV is intense today. Don't forget sunscreen if you're heading out!" |
| Stock Alert | Watchlist stock moves > 5% | "Your Apple stock is up 6% today. Just thought you'd want to know!" |
| Pollen Warning | High pollen + user has allergies | "Pollen's high today. Maybe move your run inside?" |
| Game Day | Favorite team plays today | "Eagles play the Cowboys at 4:25. Want the score later?" |
| Birthday Reminder | Contact's birthday today/tomorrow | "Sarah's birthday is tomorrow. Want me to remind you to text her?" |

### Implementation
1. Background job checks conditions every 15 minutes
2. Generates alerts when conditions match
3. Delivers via conversation or push notification
4. Learns from dismissals (don't alert about sports if user always dismisses)

---

## Phase 3: Personal Context Integration 🎯

**Why**: Information is only valuable when it's relevant to YOU.

### User Preferences System

```
preferences/
├── types.ts               - Preference schema
├── storage.ts             - Firestore persistence
├── interests.ts           - News topics user cares about
├── favorites.ts           - Teams, stocks, locations
├── sensitivities.ts       - Topics to avoid (grief triggers, etc.)
└── learning.ts            - Auto-learn from engagement
```

### Preference Categories

```typescript
interface UserInfoPreferences {
  // What they care about
  newsInterests: string[];        // ["tech", "finance", "climate"]
  stockWatchlist: string[];       // ["AAPL", "TSLA", "VOO"]
  favoriteTeams: string[];        // ["Eagles", "Phillies", "76ers"]
  favoriteLeagues: string[];      // ["NFL", "MLB"]
  
  // Personal context
  homeLocation: string;           // "Philadelphia, PA"
  workLocation: string;           // "Center City, Philadelphia"
  commuteMode: 'driving' | 'transit' | 'walking' | 'cycling';
  
  // Health context
  allergies: string[];            // ["pollen", "dust"]
  skinType: 'fair' | 'medium' | 'dark';  // For UV advice
  
  // Sensitivities
  avoidTopics: string[];          // Topics that cause anxiety
  newsFrequency: 'heavy' | 'moderate' | 'light' | 'minimal';
  
  // Important people
  contacts: ContactInfo[];        // Birthdays, relationships
}
```

### Context-Aware Tools

- `getPersonalizedNews()` - Filters by interests, avoids sensitivities
- `getMyTeamsScores()` - Just favorite teams, no params needed
- `getMyCommute()` - Home to work, no params needed
- `getMyPortfolio()` - Watchlist performance summary

---

## Phase 4: Smart Information Delivery 🧠

**Why**: HOW you deliver information matters as much as WHAT.

### Time-Aware Delivery

```typescript
interface TimeContext {
  timeOfDay: 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  isHoliday: boolean;
  userEnergyLevel?: 'high' | 'medium' | 'low';
}
```

| Time | Information Style |
|------|------------------|
| Early Morning | Brief, essential only, warm greeting |
| Morning | Full briefing, actionable items |
| Midday | Quick updates, no fluff |
| Evening | Reflective, less urgent news |
| Night | Calm, no stressful news, wind-down tone |

### Mood-Aware Delivery

```typescript
interface MoodContext {
  currentMood?: 'stressed' | 'anxious' | 'calm' | 'energized' | 'tired';
  recentMoodTrend: 'improving' | 'stable' | 'declining';
  lastStressTrigger?: string;
}
```

| Mood | Delivery Adjustment |
|------|---------------------|
| Stressed | Skip doom-scroll news, focus on actionable |
| Anxious | Gentle delivery, offer to skip news entirely |
| Calm | Full information, deeper context |
| Tired | Brief, essential only |

### Information Diet Feature

```typescript
// "I want to reduce news anxiety"
setInformationDiet('news', {
  frequency: 'minimal',           // Once daily max
  avoidCategories: ['politics', 'crime'],
  preferCategories: ['science', 'sports'],
  maxDuration: '2 minutes'        // Brief summaries only
});
```

---

## Phase 5: Cross-Domain Connections 🔗

**Why**: Life doesn't happen in silos. Neither should information.

### Domain Bridge Tools

```
cross-domain/
├── weather-habits.ts      - "Rainy day → indoor workout suggestion"
├── weather-mood.ts        - "Gray day streak → check in on mood"
├── traffic-calendar.ts    - "Long commute → offer pep talk or podcast"
├── news-mood.ts           - "Negative news day → offer to skip"
├── sports-relationships.ts - "Friend's team won → suggest congrats"
├── environment-wellness.ts - "Poor AQI → suggest indoor habits"
└── events-planning.ts     - "Holiday coming → prep suggestions"
```

### Example Connections

| Trigger | Cross-Domain Action |
|---------|---------------------|
| 3+ rainy days | Check in: "Gray days can affect mood. How are you feeling?" |
| Friend's team wins | Suggest: "The Celtics won! Want to text Mike congrats?" |
| Long commute detected | Offer: "Long drive ahead. Want a pep talk or shall I find a podcast?" |
| High AQI + outdoor habit | Suggest: "Air's not great today. Maybe yoga instead of running?" |
| Market crash + user has stocks | Gentle: "Markets are rough today. Remember: long-term thinking!" |
| User's birthday approaching | Prompt: "Your birthday's next week! Any plans brewing?" |

---

## Phase 6: Relationship Intelligence 💝

**Why**: A superhuman friend remembers EVERYONE you care about.

### Contact Intelligence

```typescript
interface ContactInfo {
  name: string;
  relationship: 'friend' | 'family' | 'colleague' | 'romantic';
  importance: 'close' | 'regular' | 'acquaintance';
  
  // Important dates
  birthday?: string;
  anniversary?: string;
  otherDates?: { name: string; date: string }[];
  
  // Interests (for gift ideas, conversation starters)
  interests?: string[];
  favoriteTeams?: string[];
  
  // Communication patterns
  lastContact?: Date;
  preferredContactMethod?: 'text' | 'call' | 'email';
}
```

### Relationship Tools

- `rememberContactDate()` - Store birthday/anniversary
- `getUpcomingDates()` - Birthdays/anniversaries next 2 weeks
- `suggestGiftIdeas()` - Based on contact's interests
- `suggestReachOut()` - "Haven't talked to X in a while"
- `getFriendTeamUpdate()` - "Mike's team (Celtics) won last night"

---

## Implementation Priority

### Wave 1 (Immediate Impact) - 2 weeks
1. ✅ **Environmental Health** - Air quality, UV, pollen
2. ✅ **User Preferences Storage** - Basic interests, favorites
3. ✅ **getMyTeams** / **getMyCommute** - Zero-param convenience

### Wave 2 (Proactive Foundation) - 2 weeks
4. **Weather-Calendar Integration** - Rain warnings for events
5. **Traffic-Calendar Integration** - Leave-early alerts
6. **Stock Watchlist Alerts** - Portfolio monitoring

### Wave 3 (Personalization) - 2 weeks
7. **Personalized News** - Interest filtering
8. **Mood-Aware Delivery** - Context-sensitive presentation
9. **Information Diet** - Anxiety reduction features

### Wave 4 (Relationship) - 2 weeks
10. **Contact Intelligence** - Birthday tracking
11. **Cross-Domain Bridges** - Weather→habits, etc.
12. **Proactive Outreach** - "Friend's team won" suggestions

---

## Technical Architecture

### New File Structure

```
information/
├── index.ts                    # Main exports (existing)
├── weather.ts                  # Enhanced with context
├── news.ts                     # Enhanced with personalization
├── sports.ts                   # Enhanced with favorites
├── traffic.ts                  # Enhanced with calendar
├── nutrition.ts                # Existing
├── search.ts                   # Existing
├── daily-briefing.ts           # Enhanced with context
├── location-preference.ts      # Existing
│
├── environmental/              # NEW: Phase 1
│   ├── air-quality.ts
│   ├── uv-index.ts
│   ├── pollen.ts
│   ├── outdoor-advice.ts
│   └── index.ts
│
├── proactive/                  # NEW: Phase 2
│   ├── types.ts
│   ├── triggers.ts
│   ├── weather-calendar.ts
│   ├── traffic-calendar.ts
│   ├── stock-alerts.ts
│   ├── game-alerts.ts
│   └── index.ts
│
├── preferences/                # NEW: Phase 3
│   ├── types.ts
│   ├── storage.ts
│   ├── interests.ts
│   ├── favorites.ts
│   └── index.ts
│
├── delivery/                   # NEW: Phase 4
│   ├── time-context.ts
│   ├── mood-context.ts
│   ├── information-diet.ts
│   └── index.ts
│
├── relationships/              # NEW: Phase 6
│   ├── contacts.ts
│   ├── important-dates.ts
│   ├── gift-suggestions.ts
│   └── index.ts
│
└── utils/                      # Enhanced
    ├── geocoding.ts            # Existing
    ├── rate-limiter.ts         # Existing
    ├── validation.ts           # Existing
    └── cross-domain.ts         # NEW: Phase 5
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Daily Active Information Requests | ? | +50% |
| Proactive Alert Engagement | N/A | >60% opened |
| "Helpful" Rating on Info | ? | >90% |
| Info Requests with Zero Params | ~10% | >50% |
| Cross-Domain Suggestions Accepted | N/A | >40% |

---

## API Keys Needed

| API | Purpose | Cost |
|-----|---------|------|
| IQAir | Air quality | Free tier available |
| Tomorrow.io | Weather alerts, pollen | Free tier available |
| Google Calendar | Calendar integration | Already have |
| Finnhub | Stock data | Already have |
| ESPN | Sports | Already have (free) |

---

## Implementation Status

### ✅ COMPLETED

**Phase 1: Environmental Health Intelligence**
- `environmental/air-quality.ts` - AQI from Open-Meteo, health recommendations
- `environmental/uv-index.ts` - UV with skin-type-aware burn time estimates
- `environmental/pollen.ts` - Pollen by type with allergy advice
- `environmental/outdoor-advice.ts` - Combined outdoor activity recommendation
- `environmental/index.ts` - 5 new tools exposed

**Phase 2: User Preferences System**
- `preferences/types.ts` - Comprehensive preference schema
- `preferences/storage.ts` - Firestore persistence with caching
- `preferences/index.ts` - 9 preference tools:
  - `addFavoriteTeam`, `removeFavoriteTeam`, `getMyTeams`
  - `addToWatchlist`, `removeFromWatchlist`, `getMyWatchlist`
  - `saveMyLocation`, `setMyAllergies`, `setNewsInterests`

**Phase 3: Proactive Intelligence Engine**
- `proactive/types.ts` - Alert types, trigger conditions
- `proactive/weather-calendar.ts` - Weather-calendar conflict detection
- `proactive/index.ts` - 4 proactive tools:
  - `getMyAlerts`, `acknowledgeAlert`, `setAlertPreferences`, `checkProactiveAlerts`

**Phase 4: Enhanced Daily Briefing**
- `enhanced-briefing.ts` - 3 integrated briefing tools:
  - `getSmartBriefing` - Full integration of all "better than human" systems
  - `getQuickStatus` - Ultra-brief status check
  - `getEndOfDayReflection` - Evening wind-down

### 📊 NEW TOOL COUNT

| System | Tools Added |
|--------|-------------|
| Environmental | 5 |
| Preferences | 9 |
| Proactive | 4 |
| Enhanced Briefing | 3 |
| **Total** | **21 new tools** |

### 🚀 NEXT STEPS (Future Phases)

**Phase 5: Cross-Domain Connections**
- Weather → Habits integration
- News → Mood awareness
- Traffic → Calendar suggestions

**Phase 6: Relationship Intelligence**
- Birthday tracking
- "Friend's team won" suggestions
- Relationship contact reminders

---

*This implementation transforms information from "data retrieval" to "superhuman awareness" - the cornerstone of Ferni's "better than human" promise.*

**Phase 5: Cross-Domain Connections** ✅ COMPLETED
- `cross-domain/types.ts` - Connection types, mood context, mappings
- `cross-domain/weather-habits.ts` - 2 tools:
  - `getWeatherHabitInsights` - "Rainy day → indoor workout suggestion"
  - `getHabitRecommendation` - Personalized habit advice based on conditions
- `cross-domain/news-mood.ts` - 3 tools:
  - `analyzeNewsMoodImpact` - Detect heavy news, protect user mood
  - `getPositiveNewsOnly` - Filter to uplifting stories only
  - `shouldSkipNews` - Recommend skipping based on user state
- `cross-domain/traffic-productivity.ts` - 3 tools:
  - `getCommuteSuggestions` - Podcast/audiobook/pep talk suggestions
  - `getTrafficProductivityInsights` - Make commute productive
  - `suggestPreMeetingPepTalk` - Confidence boost before meetings

**Phase 6: Relationship Intelligence** ✅ COMPLETED
- `relationships/types.ts` - Relationship, birthday, gift types
- `relationships/storage.ts` - Firestore persistence with fallback
- `relationships/insights.ts` - Birthday, contact, team insights
- `relationships/index.ts` - 10 tools:
  - `addRelationship` - Track friends/family/colleagues
  - `getRelationshipInfo` - Lookup contact details
  - `recordContact` - Note when you talked to someone
  - `listRelationships` - View all contacts
  - `getUpcomingBirthdays` - Never forget a birthday!
  - `getContactReminders` - "Haven't talked to X in a while"
  - `getGiftSuggestions` - Interest-based gift ideas
  - `getRelationshipInsights` - All relationship alerts
  - `addInterestToRelationship` - Track what they like
  - `addFavoriteTeamToRelationship` - "Friend's team won!" alerts

---

## 🎉 IMPLEMENTATION COMPLETE

All 6 phases of the "Better Than Human" information domain are now implemented:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Environmental Health Intelligence | ✅ Complete |
| 2 | User Preferences System | ✅ Complete |
| 3 | Proactive Intelligence Engine | ✅ Complete |
| 4 | Enhanced Daily Briefing | ✅ Complete |
| 5 | Cross-Domain Connections | ✅ Complete |
| 6 | Relationship Intelligence | ✅ Complete |

**Total: 39 new "Better Than Human" tools**
