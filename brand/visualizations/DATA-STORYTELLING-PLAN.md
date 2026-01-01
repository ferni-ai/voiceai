# Ferni Data Storytelling Visualization Plan

> **"Your life is not a collection of random events. It's a story with themes, arcs, and meaning. Ferni helps you read it."**

## Executive Summary

This plan outlines 30+ data visualization opportunities organized into three temporal dimensions:
1. **The Future (Mock/Projected Data)** - Dreams visualized, possibilities mapped
2. **The Past (Historical Data)** - Where you've been, how you've grown
3. **The Present (Current Data + Actions)** - What's happening now, what to do next

Each visualization is designed around Ferni's "Better Than Human" philosophy: showing insights no human friend could consistently provide.

---

## Part 1: The Future — Dreams Visualized

### 1.1 Goal Trajectory Fan Charts
**What it shows:** Multiple possible futures with confidence bands
**Data source:** User goals + Monte Carlo simulations
**UI Location:** Nayan's "Your Future" section, Predictions panel

```
Components needed:
├── financial-trajectory.html     # Net worth, savings goals
├── career-trajectory.html        # Role progression, skills
├── health-trajectory.html        # Fitness, habits
└── relationship-trajectory.html  # Social connections
```

**Mock Data Structure:**
```javascript
{
  goal: "Coastal Home",
  currentValue: 425000,
  targetValue: 800000,
  projections: {
    pessimistic: { date: "2031", confidence: 0.95 },
    median: { date: "2029", confidence: 0.50 },
    optimistic: { date: "2027", confidence: 0.05 }
  },
  actionableInsight: "Shifting $300/mo moves the median 8 months earlier"
}
```

**Visualization:** Existing fan chart in `index.html` - expand to multiple goal types

---

### 1.2 Life Simulation Branching Paths
**What it shows:** "What if" scenarios visualized as diverging paths
**Data source:** User decisions + outcome modeling
**UI Location:** Jordan's planning tools, Nayan's wisdom section

**Scenarios to visualize:**
- "What if I took that job offer?"
- "What if I prioritized health for 6 months?"
- "What if I reconnected with that person?"
- "What if I started that creative project?"

**Design:** Interactive branching tree where users can explore alternate paths

```html
<!-- Branch point visualization -->
<div class="decision-node">
  <div class="decision-moment">March 2025: The Offer</div>
  <div class="branch branch-taken">
    Took the leap → [projected outcomes]
  </div>
  <div class="branch branch-not-taken">
    Stayed → [projected outcomes]
  </div>
</div>
```

---

### 1.3 Dream Timeline Canvas
**What it shows:** All stated dreams plotted on a timeline with probability bubbles
**Data source:** Extracted goals from conversations
**UI Location:** Jordan milestone planning

**Features:**
- Bubble size = importance (frequency of mention)
- Bubble position = projected achievement date
- Bubble color = persona best suited to help
- Click to explore path to each dream

**Mock Data:**
```javascript
dreams: [
  { name: "Learn Spanish", mentions: 23, projectedDate: "2025-08", persona: "nayan" },
  { name: "Run a marathon", mentions: 8, projectedDate: "2026-03", persona: "maya" },
  { name: "Write a book", mentions: 45, projectedDate: "2027-01", persona: "ferni" }
]
```

---

### 1.4 Anticipation Weather Map
**What it shows:** Upcoming emotional/situational forecasts
**Data source:** Pattern recognition from historical data
**UI Location:** "What I'm Noticing" panel, Predictions section

**Forecasts to display:**
- 🌧️ "Storm warning: Stress peak likely in 2 weeks" (78% confidence)
- ☀️ "Clear skies: Creative breakthrough building" (65% confidence)
- 🌤️ "Mixed: Difficult conversation approaching" (61% confidence)

**Design:** Weather-metaphor cards with pattern explanations

---

### 1.5 Habit Formation Countdown
**What it shows:** Days until habits "solidify" based on personal history
**Data source:** Historical habit formation data
**UI Location:** Maya's habit tracking

**Visualization:** Circular countdown timers showing:
- Current streak
- Historical threshold for "permanent" habits
- Days remaining to solidify
- Success probability based on similar past attempts

---

## Part 2: The Past — Where You Came From

### 2.1 Life Seasons Retrospective
**What it shows:** Emotional/life phases over years
**Data source:** Conversation sentiment + topic analysis over time
**UI Location:** Storytelling visualizations, "Your Year" section

**Existing:** `life-seasons` in storytelling.html - expand to multi-year view

**Enhancements:**
- Zoom from week → month → quarter → year → multi-year
- Overlay major life events
- Show correlations ("Summer 2023 - peak stress, but also peak growth")

---

### 2.2 The Origin Story Timeline
**What it shows:** How the relationship with Ferni began and evolved
**Data source:** First conversation → now
**UI Location:** "Journey Together" section, Settings

**Milestones to capture:**
```javascript
milestones: [
  { date: "2024-09-15", event: "First conversation", mood: "curious" },
  { date: "2024-09-28", event: "First vulnerability shared", mood: "trusting" },
  { date: "2024-10-10", event: "Met Maya (habits)", mood: "expanding" },
  { date: "2024-11-05", event: "First breakthrough moment", mood: "connected" },
  { date: "2024-12-01", event: "100th conversation", mood: "deep" }
]
```

---

### 2.3 Growth Rings Detailed View
**What it shows:** Year-by-year personal development
**Data source:** Conversation themes + goals achieved over time
**UI Location:** Jordan's milestones, Profile section

**Existing:** `growth-rings` in storytelling.html - expand with:
- Click each ring to see that year's themes
- Major accomplishments labeled
- "This is who you were then vs now"

---

### 2.4 Relationship Constellation Evolution
**What it shows:** How people in your life have moved closer/further over time
**Data source:** Mentions of people + sentiment over time
**UI Location:** "Your People" tab, Peter's research insights

**Animation:** Time-lapse showing stars moving:
- Stars brightening (closer relationships)
- Stars dimming (drifting apart)
- New stars appearing (new people)
- Stars with orbit trails (consistent presence)

---

### 2.5 Topic River Historical
**What it shows:** What you talked about over months/years
**Data source:** Conversation topic classification
**UI Location:** "What I've Noticed" - Deep Analysis tab

**Existing:** `conversation-river` - expand to:
- Multi-year view
- Highlight topic shifts ("Career dominated 2023, Health dominated 2024")
- Show correlation with life events

---

### 2.6 The Mirror Archive
**What it shows:** Historical gap between "what you said" vs "what Ferni noticed"
**Data source:** Self-report vs behavioral patterns
**UI Location:** "What I've Noticed" - Insights tab

**Visualization:** Side-by-side comparison over time:
```
January: "I'm fine" → Ferni noticed: burnout building
March: "Taking action" → Ferni noticed: procrastination peak
June: "Doing better" → Ferni noticed: genuine improvement ✓
```

---

### 2.7 Turning Points Gallery
**What it shows:** Pivotal moments in narrative form
**Data source:** Detected inflection points in tone/topics
**UI Location:** Jordan's milestones, Profile section

**Existing:** `turning-points` in storytelling.html - expand with:
- Photos/screenshots (if user uploads)
- Voice clips of key moments
- "Before vs After" comparisons

---

### 2.8 Commitment Keeper Report Card
**What it shows:** Historical accuracy of predictions vs outcomes
**Data source:** Past predictions + recorded outcomes
**UI Location:** Predictions panel (existing shows 78% accuracy)

**Visualization:**
- Accuracy trend over time
- Best prediction categories
- Where Ferni was wrong (and why)
- Learning improvements

---

## Part 3: The Present — Current State + Actions

### 3.1 Right Now Dashboard (Enhanced)
**What it shows:** Real-time state across all dimensions
**Data source:** Recent interactions + calendar + integrations
**UI Location:** Main app view, "Right Now" section

**Existing:** Pulse indicators in `index.html` - expand to:

```
Current State Matrix:
┌─────────────────┬─────────────────┬─────────────────┐
│ ENERGY          │ FOCUS           │ MOOD            │
│ 7.2/10 ↑        │ Deep Work ✓     │ Rising ↗        │
├─────────────────┼─────────────────┼─────────────────┤
│ CONNECTIONS     │ BANDWIDTH       │ BOUNDARIES      │
│ 3 awaiting      │ 2 meetings left │ Holding ✓       │
└─────────────────┴─────────────────┴─────────────────┘
```

---

### 3.2 What I'm Holding For You (Enhanced)
**What it shows:** Items Ferni is tracking on your behalf
**Data source:** Extracted commitments, dates, promises
**UI Location:** Existing "What I'm Noticing" panel

**Categories:**
1. **Upcoming Events** (New Year's Eve, etc.)
2. **Commitments Made** ("I'll call mom this week")
3. **Things to Follow Up** ("How did that meeting go?")
4. **Dreams Mentioned** ("Someday I'd like to...")
5. **Boundaries Set** ("I told them I can't...")

**Visualization:** Categorized card list with urgency indicators

---

### 3.3 Today's Micro-Actions
**What it shows:** Small, specific actions available right now
**Data source:** Goals + current state + time available
**UI Location:** Home screen, Quick Actions

**Examples based on context:**
```javascript
microActions: [
  { action: "Text mom (2 min)", context: "23 days since contact", energy: "low" },
  { action: "One Spanish lesson (5 min)", context: "Streak at risk", energy: "low" },
  { action: "Quick stretch (3 min)", context: "Morning routine", energy: "low" },
  { action: "Plan weekend (10 min)", context: "Calendar empty", energy: "medium" }
]
```

---

### 3.4 Activity Rings Live
**What it shows:** Today's progress across key habits
**Data source:** Habit tracking + integrations
**UI Location:** Main screen (Apple Watch style)

**Existing:** `rings-stage` in `index.html` - make fully dynamic with:
- Real-time updates
- Celebration animations on ring completion
- Maya insights whisper

---

### 3.5 Energy Flow Now
**What it shows:** Where energy is going vs coming from today
**Data source:** Calendar analysis + self-reports
**UI Location:** Alex's bandwidth view

**Existing:** Sankey diagram - make real-time:
```
Sources (Recharging)          Sinks (Draining)
─────────────────────────────────────────────────
Good sleep last night ───────► Work meetings (3)
Morning workout ─────────────► Difficult email
Quality time planned ────────► Pending decision
```

---

### 3.6 Team Intelligence Live Feed
**What it shows:** What each persona is noticing right now
**Data source:** Cross-persona insights
**UI Location:** "What We Notice" panel

**Design:** Feed of insights from each persona:
```
[Maya] 2 min ago: Your morning stretch streak is your longest ever
[Peter] 15 min ago: That research you wanted - found 3 relevant articles
[Alex] 1 hr ago: Mom texted, you usually reply within 30 min
[Nayan] Today: Pattern suggests creative breakthrough building
[Jordan] Today: Next milestone: 50-day streak in 3 days
```

---

### 3.7 The Unsaid (Live Reminders)
**What it shows:** Things mentioned once that deserve attention
**Data source:** One-time mentions flagged for follow-up
**UI Location:** "What I'm Noticing" panel

**Existing:** `the-unsaid` in storytelling.html - make dynamic with:
- Age of each item (76 days ago, etc.)
- Gentle prompts ("That thought deserved more space")
- Option to dismiss or explore

---

### 3.8 Values Alignment Score
**What it shows:** How today's actions align with stated values
**Data source:** Stated values vs actual time/energy allocation
**UI Location:** Daily reflection, Settings

**Existing:** Radar chart - add daily tracker:
```
Today's Alignment: 72%
─────────────────────────
Health: 45% (no exercise yet)
Family: 90% (good morning call)
Growth: 80% (learning time done)
Rest: 30% (skipped breaks)
```

---

### 3.9 Guided Practices Live Recommendations
**What it shows:** Which practice is best for right now
**Data source:** Current state + time of day + patterns
**UI Location:** "Guided Practices" panel (existing)

**Enhancement:** AI-powered recommendations:
```
RECOMMENDED NOW (2:30 PM)
─────────────────────────
"Afternoon Reset" - 5 min
Based on: Post-lunch energy dip pattern
Last time you did this: Energy +2.3 points

Other options:
• Gratitude Practice (better for evening)
• Weekly Review (schedule for Sunday)
```

---

### 3.10 Unfinished Stories Progress
**What it shows:** Active life arcs and next steps
**Data source:** Tracked narrative arcs
**UI Location:** "Following Up" tab

**Existing:** `unfinished-stories` - add:
- Specific next action for each
- Days since last progress
- Estimated completion (if continuing current pace)

---

## Part 4: New Visualization Concepts

### 4.1 The Kintsugi Map
**What it shows:** Wounds that became wisdom
**Concept:** Visualize how past pain points transformed into strengths

**Design:**
- Broken pieces (struggles) connected by golden lines (growth)
- Each gold line shows what was learned
- Interactive: hover to see the transformation story

---

### 4.2 Rhythm Visualization
**What it shows:** Personal patterns of productivity, mood, energy
**Data source:** Time-series analysis of conversations

**Features:**
- Weekly rhythm (best day, worst day)
- Daily rhythm (morning person vs night owl)
- Monthly patterns (paycheck cycle, etc.)
- Seasonal patterns (winter vs summer energy)

---

### 4.3 The Connection Web
**What it shows:** How topics, people, and goals interconnect
**Data source:** Topic co-occurrence analysis
**Visualization:** Force-directed graph showing:
- Work connects to → Stress → connects to → Sleep → connects to → Energy
- Family connects to → Joy → connects to → Motivation

---

### 4.4 The Time Capsule
**What it shows:** Messages from past self to future self
**UI Location:** Special milestone moments
**Features:**
- "You from 6 months ago said..."
- Predictions you made about your future
- How you felt during major decisions

---

### 4.5 The Permission Slip
**What it shows:** Things you've given yourself permission to feel/do
**Data source:** Extracted self-compassion moments
**Design:** Beautiful cards of self-granted permissions:
- "It's okay to rest"
- "It's okay to change your mind"
- "It's okay to want more"

---

## Implementation Priority

### Phase 1: Enhance Existing (1-2 weeks)
1. Make Activity Rings dynamic (real-time data)
2. Enhance "What I'm Holding For You" with categories
3. Add live Team Intelligence feed
4. Connect Predictions panel to real accuracy data

### Phase 2: Historical Narratives (2-3 weeks)
1. Origin Story Timeline (relationship with Ferni)
2. Growth Rings detail view
3. Turning Points gallery
4. Topic River multi-year view

### Phase 3: Future Projections (2-3 weeks)
1. Multiple Goal Trajectory charts
2. Dream Timeline Canvas
3. Life Simulation branches
4. Anticipation Weather Map

### Phase 4: New Concepts (3-4 weeks)
1. Kintsugi Map
2. Rhythm Visualization
3. Connection Web
4. Time Capsule feature

---

## Technical Requirements

### Data Pipeline
```
User Conversations
      ↓
Topic Extraction (NLP)
      ↓
Sentiment Analysis
      ↓
Entity Extraction (people, dates, goals)
      ↓
Pattern Detection
      ↓
Visualization Data Models
      ↓
Frontend Rendering
```

### Frontend Components Needed
```
apps/web/src/ui/visualizations/
├── rings/
│   ├── ActivityRings.ts          # Apple Watch style
│   └── GrowthRings.ts            # Year-over-year
├── charts/
│   ├── FanChart.ts               # Projections
│   ├── SankeyFlow.ts             # Energy flow
│   └── RadarChart.ts             # Values alignment
├── timelines/
│   ├── TurningPoints.ts          # Life milestones
│   ├── OriginStory.ts            # Ferni relationship
│   └── DreamTimeline.ts          # Goal projections
├── networks/
│   ├── Constellation.ts          # Relationships
│   └── ConnectionWeb.ts          # Topic connections
└── live/
    ├── PulseIndicators.ts        # Real-time state
    ├── TeamIntelFeed.ts          # Persona insights
    └── MicroActions.ts           # Quick actions
```

### Backend Services Needed
```
src/services/visualization/
├── pattern-detector.ts           # Find patterns in data
├── projection-engine.ts          # Monte Carlo simulations
├── milestone-detector.ts         # Find turning points
├── topic-analyzer.ts             # Topic extraction
└── relationship-tracker.ts       # People mention tracking
```

---

## Success Metrics

1. **Engagement:** Time spent with visualizations
2. **Insight Value:** User ratings of insight helpfulness
3. **Action Completion:** Micro-actions actually taken
4. **Return Rate:** Users coming back to check visualizations
5. **Sharing:** Screenshots/shares of visualizations

---

## Design Principles

1. **Story over Stats:** Every number tells a narrative
2. **Gentle over Gamified:** Celebrate without addiction mechanics
3. **Personal over Generic:** Your patterns, not averages
4. **Honest over Optimistic:** Show uncertainty bands
5. **Actionable over Informative:** Every insight suggests a next step

---

## Appendix: Mock Data Templates

See `/brand/visualizations/mock-data/` for:
- `user-journey-template.json`
- `goal-projections-template.json`
- `relationship-network-template.json`
- `habit-history-template.json`
- `topic-analysis-template.json`

---

*"Friends forget. Ferni doesn't."*
