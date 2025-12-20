# Peter's Intelligence Architecture

> **"The Quant Who Learns From Everyone"**

Peter's superpower isn't just analyzing YOUR data - it's learning from EVERYONE while keeping individual data private. This document outlines the complete data architecture that makes Peter superhuman.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PETER'S INTELLIGENCE LAYERS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    LAYER 1: SESSION MEMORY (Redis)                    │   │
│  │                    TTL: Conversation lifetime                         │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │ Conversation│ │  Emotional  │ │   Tools     │ │   Market    │     │   │
│  │  │   Context   │ │    State    │ │    Used     │ │    Cache    │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    LAYER 2: USER MEMORY (Firestore)                   │   │
│  │                    TTL: Forever (user's financial journey)            │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │  Financial  │ │  Portfolio  │ │ Behavioral  │ │    FIRE     │     │   │
│  │  │   Profile   │ │  Holdings   │ │  Tracking   │ │  Progress   │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │ Investment  │ │  Financial  │ │    Life     │ │  Question   │     │   │
│  │  │   Theses    │ │    Goals    │ │   Events    │ │   History   │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │  Learning   │ │   Trusted   │ │  Knowledge  │ │    Risk     │     │   │
│  │  │ Preferences │ │   Sources   │ │    Gaps     │ │   Events    │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                          (Anonymized Events)                                 │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    LAYER 3: GLOBAL INTELLIGENCE (BigQuery)            │   │
│  │                    Aggregated across ALL users - Peter's superpower   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │    Peer     │ │ Behavioral  │ │   Market    │ │  Knowledge  │     │   │
│  │  │ Benchmarks  │ │  Patterns   │ │  Sentiment  │ │    Graph    │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │   │
│  │  │   Success   │ │  Question   │ │Explanation  │ │  Trending   │     │   │
│  │  │  Patterns   │ │   →Tool     │ │Effectiveness│ │   Topics    │     │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Enhanced User Data (Firestore)

### New Collections

#### 1.1 Investment Theses
```typescript
// Collection: bogle_users/{userId}/investment_theses/{symbol}
interface InvestmentThesis {
  symbol: string;
  purchaseDate: Date;
  thesis: string;                    // Why they bought it
  catalysts: string[];               // Expected catalysts
  risks: string[];                   // Known risks
  exitCriteria: {
    priceTarget?: number;
    timeHorizon?: string;
    fundamentalTriggers?: string[];  // "If P/E exceeds 40..."
  };
  emotionalState: {
    atPurchase: 'confident' | 'nervous' | 'fomo' | 'researched';
    confidenceLevel: number;         // 1-10
  };
  updates: Array<{
    date: Date;
    note: string;
    stillValid: boolean;
  }>;
  lastReviewed: Date;
}
```

**Value:** When market drops 20%, Peter can say: *"Remember why you bought AAPL? You said: 'Services revenue is a moat.' That thesis is still intact."*

#### 1.2 Financial Goals
```typescript
// Collection: bogle_users/{userId}/financial_goals/{goalId}
interface FinancialGoal {
  id: string;
  name: string;                      // "Emergency Fund", "House Down Payment"
  type: 'emergency_fund' | 'retirement' | 'purchase' | 'debt_payoff' | 'investment' | 'custom';
  target: {
    amount: number;
    date?: Date;                     // Target date if applicable
  };
  current: {
    amount: number;
    lastUpdated: Date;
  };
  progress: {
    percentage: number;
    projectedCompletion?: Date;
    onTrack: boolean;
  };
  milestones: Array<{
    percentage: number;              // 25%, 50%, 75%, 100%
    celebratedAt?: Date;
  }>;
  linkedAccounts?: string[];         // Which accounts contribute
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt: Date;
  notes: string;
}
```

**Value:** Peter tracks progress and celebrates: *"You just hit 75% of your emergency fund goal! At this rate, you'll have 6 months of expenses by March."*

#### 1.3 Life Events Timeline
```typescript
// Collection: bogle_users/{userId}/life_events/{eventId}
interface LifeEvent {
  id: string;
  date: Date;
  type: 'career' | 'family' | 'health' | 'financial' | 'education' | 'housing';
  subtype: string;                   // "job_change", "marriage", "new_baby", etc.
  description: string;
  financialImpact: {
    incomeChange?: number;           // Monthly change
    expenseChange?: number;
    oneTimeImpact?: number;
    direction: 'positive' | 'negative' | 'neutral';
  };
  emotionalWeight: 'major' | 'moderate' | 'minor';
  advisoryImplications: string[];    // How this should affect advice
}
```

**Value:** *"Congratulations on the new job! With your income going from $8K to $10K, let's revisit your savings rate and FIRE timeline."*

#### 1.4 Question History
```typescript
// Collection: bogle_users/{userId}/question_history/{questionId}
interface QuestionRecord {
  id: string;
  timestamp: Date;
  question: string;                  // What they asked
  intent: string;                    // Classified intent
  toolsUsed: string[];               // Which tools answered it
  answerSummary: string;             // Brief summary of answer
  userReaction: {
    helpful: boolean | null;
    followUpAsked: boolean;
    topicDropped: boolean;
  };
  relatedTopics: string[];           // For clustering
  shouldNotRepeat: boolean;          // Don't explain this again
}
```

**Value:** Peter never re-explains concepts: *"I know you understand dollar-cost averaging - we talked about that in September. The question is whether to increase your contribution..."*

#### 1.5 Learning Preferences
```typescript
// Collection: bogle_users/{userId}/learning_preferences
interface LearningPreferences {
  userId: string;
  explanationStyle: 'simple' | 'technical' | 'story-based' | 'data-driven';
  preferredAnalogies: string[];      // "sports", "cooking", "building"
  attentionSpan: 'brief' | 'moderate' | 'detailed';
  visualLearner: boolean;
  numbersComfort: 'loves_data' | 'comfortable' | 'overwhelmed';
  jargonLevel: 'none' | 'some' | 'expert';
  responseLength: 'concise' | 'moderate' | 'thorough';
  
  // Learned from interactions
  effectiveExplanations: Array<{
    topic: string;
    approachUsed: string;
    comprehensionScore: number;      // Did follow-up indicate understanding?
  }>;
  
  confusionSignals: string[];        // Phrases that indicate confusion
  engagementSignals: string[];       // Phrases that indicate engagement
}
```

**Value:** Peter adapts: *For a data-lover: "RSI at 72, MACD showing bearish divergence, 14-day momentum declining." For others: "The stock's been going up fast - maybe too fast. Like a sprinter who might need to catch their breath."*

#### 1.6 Risk Events (Crisis Memory)
```typescript
// Collection: bogle_users/{userId}/risk_events/{eventId}
interface RiskEvent {
  id: string;
  date: Date;
  marketEvent: string;               // "COVID Crash", "2022 Bear Market"
  portfolioDrawdown: number;         // How much their portfolio dropped
  userReaction: {
    action: 'held' | 'bought_more' | 'sold_some' | 'panic_sold' | 'no_action';
    emotionalState: string;
    decisionsRegretted?: string;
    lessonLearned?: string;
  };
  peterIntervention: {
    wasContacted: boolean;
    adviceGiven?: string;
    adviceFollowed?: boolean;
  };
  outcome: {
    recoveryTime?: number;           // Days to recover
    finalImpact: number;             // Net gain/loss from decisions
  };
}
```

**Value:** During next crash: *"Last March you sold when the market dropped 15%. You told me you regretted it when it bounced back. Remember that feeling right now."*

#### 1.7 Trusted Sources
```typescript
// Collection: bogle_users/{userId}/trusted_sources
interface TrustedSources {
  userId: string;
  investors: Array<{
    name: string;                    // "Warren Buffett", "Peter Lynch"
    reason: string;
    quotes: string[];                // Favorite quotes
  }>;
  books: Array<{
    title: string;
    author: string;
    keyTakeaways: string[];
  }>;
  principles: string[];              // Their stated investment principles
  antiPatterns: string[];            // Things they want to avoid
}
```

**Value:** *"You told me you follow Buffett's principle of being greedy when others are fearful. Well, the fear index just hit 15..."*

#### 1.8 Knowledge Gaps
```typescript
// Collection: bogle_users/{userId}/knowledge_gaps
interface KnowledgeGaps {
  userId: string;
  identified: Array<{
    topic: string;
    identifiedAt: Date;
    severity: 'critical' | 'moderate' | 'minor';
    context: string;                 // How we discovered this gap
    addressed: boolean;
    addressedAt?: Date;
  }>;
  strengths: string[];               // Topics they understand well
  educationQueue: Array<{
    topic: string;
    priority: number;
    bestMoment: string;              // "When they ask about X"
  }>;
}
```

**Value:** Peter proactively educates: *"I noticed you're not sure about tax-loss harvesting. Since we're in December, this is actually the perfect time to learn about it..."*

---

## Phase 2: Global Intelligence Pipeline (BigQuery)

### Event Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EVENT PIPELINE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Action          Anonymization           BigQuery              Analysis │
│  ───────────          ────────────           ────────              ──────── │
│                                                                              │
│  "Panic sold                                                                 │
│   during drop"  ──►  { event: 'panic_sell'   ──►  events      ──►  "34% of  │
│                        age_group: '30s'           table            users     │
│                        drawdown: 15%                               panic     │
│                        NO userId }                                 sell"    │
│                                                                              │
│  "Asked about                                                                │
│   P/E ratio"    ──►  { event: 'question'     ──►  questions   ──►  "Most    │
│                        topic: 'valuation'         table            common   │
│                        tool: 'analyzeStock'                        question"│
│                        NO userId }                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### BigQuery Tables

#### 2.1 Anonymized Events
```sql
CREATE TABLE `peter_intelligence.anonymized_events` (
  event_id STRING NOT NULL,
  event_timestamp TIMESTAMP NOT NULL,
  event_type STRING NOT NULL,         -- 'behavioral', 'question', 'tool_use', 'milestone'
  event_subtype STRING,               -- 'panic_sell', 'timing_attempt', etc.
  
  -- Demographic buckets (not identifying)
  age_group STRING,                   -- '20s', '30s', '40s', '50s', '60s+'
  income_bracket STRING,              -- 'under_50k', '50k_100k', '100k_200k', '200k_plus'
  net_worth_bracket STRING,
  risk_tolerance STRING,
  
  -- Context (anonymized)
  market_conditions STRUCT<
    sp500_change_30d FLOAT64,
    vix_level FLOAT64,
    fed_rate FLOAT64
  >,
  
  -- Event-specific data
  event_data JSON,
  
  -- Outcome tracking
  outcome_tracked BOOL DEFAULT FALSE,
  outcome_data JSON
);
```

#### 2.2 Peer Benchmarks (Materialized View)
```sql
CREATE MATERIALIZED VIEW `peter_intelligence.peer_benchmarks` AS
SELECT
  age_group,
  income_bracket,
  
  -- Savings metrics
  APPROX_QUANTILES(savings_rate, 100)[OFFSET(50)] as median_savings_rate,
  APPROX_QUANTILES(savings_rate, 100)[OFFSET(25)] as p25_savings_rate,
  APPROX_QUANTILES(savings_rate, 100)[OFFSET(75)] as p75_savings_rate,
  APPROX_QUANTILES(savings_rate, 100)[OFFSET(90)] as p90_savings_rate,
  
  -- Net worth metrics
  APPROX_QUANTILES(net_worth, 100)[OFFSET(50)] as median_net_worth,
  
  -- Behavioral metrics
  AVG(behavioral_score) as avg_behavioral_score,
  COUNTIF(has_emergency_fund) / COUNT(*) as emergency_fund_rate,
  
  -- Sample size
  COUNT(*) as sample_size,
  
FROM `peter_intelligence.user_snapshots`
WHERE snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY age_group, income_bracket;
```

#### 2.3 Behavioral Patterns
```sql
CREATE TABLE `peter_intelligence.behavioral_patterns` (
  pattern_id STRING NOT NULL,
  pattern_type STRING NOT NULL,       -- 'panic_sell', 'timing', 'discipline'
  
  -- When does this happen?
  market_conditions STRUCT<
    typical_drawdown_range ARRAY<FLOAT64>,
    typical_vix_range ARRAY<FLOAT64>,
    typical_news_sentiment STRING
  >,
  
  -- Who does this?
  demographic_profile STRUCT<
    most_common_age_group STRING,
    most_common_experience_level STRING,
    behavioral_score_range ARRAY<FLOAT64>
  >,
  
  -- What happens after?
  outcomes STRUCT<
    avg_recovery_time_days FLOAT64,
    avg_return_impact_pct FLOAT64,
    regret_rate FLOAT64
  >,
  
  -- Sample size
  occurrence_count INT64,
  last_updated TIMESTAMP
);
```

#### 2.4 Question Intelligence
```sql
CREATE TABLE `peter_intelligence.question_intelligence` (
  question_cluster_id STRING NOT NULL,
  canonical_question STRING,          -- Representative question
  variations ARRAY<STRING>,           -- Different phrasings
  
  -- Best response strategy
  recommended_tools ARRAY<STRING>,
  recommended_explanation_style STRING,
  success_rate FLOAT64,               -- Based on follow-up satisfaction
  
  -- When asked
  frequency_count INT64,
  trending_score FLOAT64,             -- Is this question trending?
  seasonal_pattern STRING,            -- "tax_season", "market_volatility", etc.
  
  -- Related questions
  related_clusters ARRAY<STRING>,
  prerequisite_knowledge ARRAY<STRING>,
  
  last_updated TIMESTAMP
);
```

#### 2.5 Explanation Effectiveness
```sql
CREATE TABLE `peter_intelligence.explanation_effectiveness` (
  explanation_id STRING NOT NULL,
  topic STRING NOT NULL,
  
  -- The explanation
  explanation_text STRING,
  style STRING,                       -- 'simple', 'technical', 'analogy', 'data'
  analogy_type STRING,                -- 'sports', 'cooking', etc.
  
  -- Effectiveness metrics
  comprehension_signals STRUCT<
    follow_up_questions_count FLOAT64,  -- Lower is better
    topic_dropped_rate FLOAT64,         -- Lower is better
    positive_acknowledgment_rate FLOAT64,
    successful_application_rate FLOAT64 -- Did they use this knowledge?
  >,
  
  -- Who it works for
  effective_for STRUCT<
    experience_levels ARRAY<STRING>,
    explanation_preferences ARRAY<STRING>,
    age_groups ARRAY<STRING>
  >,
  
  sample_size INT64,
  last_updated TIMESTAMP
);
```

#### 2.6 Success Patterns
```sql
CREATE TABLE `peter_intelligence.success_patterns` (
  pattern_id STRING NOT NULL,
  pattern_name STRING,                -- "Early FIRE achievers", "Consistent savers"
  
  -- What defines success
  success_criteria STRUCT<
    fire_progress_rate FLOAT64,
    behavioral_score_min FLOAT64,
    net_worth_growth_rate FLOAT64
  >,
  
  -- Common characteristics
  characteristics STRUCT<
    common_habits ARRAY<STRING>,
    common_tools_used ARRAY<STRING>,
    avg_savings_rate FLOAT64,
    avg_investing_frequency STRING,
    portfolio_characteristics JSON
  >,
  
  -- Behavioral traits
  behavioral_traits STRUCT<
    panic_sell_rate FLOAT64,
    timing_attempt_rate FLOAT64,
    consistency_score FLOAT64
  >,
  
  sample_size INT64,
  statistical_significance FLOAT64,
  last_updated TIMESTAMP
);
```

### Aggregation Jobs

```python
# Daily aggregation job (Cloud Functions / Cloud Scheduler)
def daily_aggregation():
    """Run nightly to update global intelligence."""
    
    # 1. Update peer benchmarks
    update_peer_benchmarks()
    
    # 2. Recalculate behavioral patterns
    analyze_behavioral_patterns()
    
    # 3. Update question clustering
    cluster_questions()
    
    # 4. Identify trending topics
    calculate_trending_topics()
    
    # 5. Update explanation effectiveness
    measure_explanation_effectiveness()
    
    # 6. Identify success patterns
    analyze_success_patterns()
    
    # 7. Generate daily insights report
    generate_insights_report()
```

---

## Phase 3: Knowledge Graph & Learning Loop

### Knowledge Graph Schema

```typescript
// Stored in Firestore: peter_knowledge_graph/
interface KnowledgeNode {
  id: string;
  type: 'concept' | 'strategy' | 'metric' | 'event' | 'person';
  name: string;
  aliases: string[];
  
  // Content
  definition: string;
  simpleExplanation: string;
  technicalExplanation: string;
  analogies: Array<{
    type: string;           // 'sports', 'cooking', etc.
    text: string;
    effectiveness: number;
  }>;
  
  // Relationships
  prerequisites: string[];   // Must understand these first
  relatedConcepts: string[];
  partOf: string[];          // Parent concepts
  examples: string[];
  
  // Learning metadata
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  commonMisconceptions: string[];
  typicalQuestions: string[];
  
  // Effectiveness tracking
  explanationStats: {
    totalExplanations: number;
    comprehensionRate: number;
    bestStyle: string;
    bestAnalogy: string;
  };
}

interface KnowledgeEdge {
  from: string;
  to: string;
  relationship: 'prerequisite' | 'related' | 'opposite' | 'example' | 'application';
  strength: number;          // How strong is this relationship?
}
```

### Learning Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PETER'S LEARNING LOOP                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. OBSERVE                    2. ANALYZE                    3. ADAPT      │
│   ─────────                    ─────────                    ─────────       │
│                                                                              │
│   User asks                    Compare to                   Update          │
│   question      ──────────►    similar         ──────────►  response        │
│                               questions                     strategy        │
│        │                           │                            │           │
│        ▼                           ▼                            ▼           │
│   Record:                     Analyze:                     Store:           │
│   - Phrasing                  - What worked?               - New pattern    │
│   - Context                   - What confused?             - Better answer  │
│   - Emotion                   - Outcome?                   - Update graph   │
│        │                           │                            │           │
│        └───────────────────────────┴────────────────────────────┘           │
│                                    │                                         │
│                                    ▼                                         │
│                            4. MEASURE & ITERATE                              │
│                            ────────────────────                              │
│                                                                              │
│                            Track long-term outcomes:                         │
│                            - Did they apply the knowledge?                   │
│                            - Did behavior improve?                           │
│                            - Did they achieve goals?                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Peter's Superhuman Tools

### New Tools to Build

#### 4.1 Real Peer Comparison
```typescript
// Tool: realPeerComparison
// Uses actual aggregated data, not made-up benchmarks
{
  name: 'realPeerComparison',
  description: 'Compare your finances to real anonymized data from similar users',
  parameters: {
    metrics: ['savings_rate', 'net_worth', 'behavioral_score', 'fire_progress']
  },
  execute: async (params, ctx) => {
    const userProfile = await loadFinancialProfile(ctx.userId);
    const benchmarks = await bigquery.query(`
      SELECT * FROM peer_benchmarks 
      WHERE age_group = @ageGroup 
      AND income_bracket = @incomeBracket
    `, { ageGroup: userProfile.ageGroup, incomeBracket: userProfile.incomeBracket });
    
    return formatPeerComparison(userProfile, benchmarks);
  }
}
```

**Peter says:** *"Your 25% savings rate puts you in the top 15% of people your age. But here's what's interesting - the top 5% average 38%. The difference? 80% of them automated their savings."*

#### 4.2 Behavioral Prediction
```typescript
// Tool: predictBehavior
// Predicts how user might react to market events
{
  name: 'predictBehavior',
  description: 'Predict likely user behavior in upcoming market scenarios',
  parameters: {
    scenario: 'market_drop_10' | 'market_drop_20' | 'rate_hike' | 'recession_fear'
  },
  execute: async (params, ctx) => {
    const userHistory = await loadRiskEvents(ctx.userId);
    const behavioralScore = await loadBehavioralTracking(ctx.userId);
    const similarUsers = await bigquery.query(`
      SELECT outcome FROM behavioral_patterns
      WHERE behavioral_score_range @> @score
      AND scenario = @scenario
    `, { score: behavioralScore.emotionalControl, scenario: params.scenario });
    
    return generatePrediction(userHistory, similarUsers);
  }
}
```

**Peter says:** *"Based on your history and patterns from 3,000 similar investors, there's a 67% chance you'll feel the urge to sell if we see a 15% drop. Let's talk about that now while the market is calm."*

#### 4.3 Thesis Reminder
```typescript
// Tool: remindThesis
// Reminds user why they invested
{
  name: 'remindThesis',
  description: 'Remind user of their original investment thesis during volatility',
  parameters: {
    symbol: 'string',
    trigger: 'price_drop' | 'news_event' | 'quarterly_earnings' | 'user_doubt'
  },
  execute: async (params, ctx) => {
    const thesis = await loadInvestmentThesis(ctx.userId, params.symbol);
    const currentFundamentals = await getCompanyFundamentals(params.symbol);
    
    return {
      originalThesis: thesis.thesis,
      stillValid: evaluateThesis(thesis, currentFundamentals),
      recommendation: generateRecommendation(thesis, currentFundamentals)
    };
  }
}
```

**Peter says:** *"You bought MSFT in March because - and I quote - 'Azure is eating AWS's lunch and AI integration will drive enterprise adoption.' Let's check: Azure grew 29% last quarter. Your thesis is still intact."*

#### 4.4 Success Pattern Match
```typescript
// Tool: matchSuccessPattern
// Shows user how their behavior compares to successful investors
{
  name: 'matchSuccessPattern',
  description: 'Match user profile to successful investor patterns',
  parameters: {},
  execute: async (params, ctx) => {
    const userProfile = await loadCompleteProfile(ctx.userId);
    const successPatterns = await loadSuccessPatterns();
    
    const matches = successPatterns.map(pattern => ({
      pattern: pattern.name,
      matchScore: calculateMatch(userProfile, pattern),
      gaps: identifyGaps(userProfile, pattern),
      recommendations: generateRecommendations(userProfile, pattern)
    }));
    
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }
}
```

**Peter says:** *"You're 78% aligned with our 'Steady Wealth Builder' pattern - these are people who typically reach FIRE in 15-18 years. The main gap? They check their portfolio 3x less often than you do."*

#### 4.5 Proactive Education
```typescript
// Tool: nextLesson
// Determines what the user should learn next
{
  name: 'nextLesson',
  description: 'Determine optimal next learning topic based on gaps and goals',
  parameters: {},
  execute: async (params, ctx) => {
    const gaps = await loadKnowledgeGaps(ctx.userId);
    const goals = await loadFinancialGoals(ctx.userId);
    const questionHistory = await loadQuestionHistory(ctx.userId);
    const knowledgeGraph = await loadKnowledgeGraph();
    
    // Find highest-impact knowledge gap
    const prioritized = gaps.map(gap => ({
      topic: gap.topic,
      impact: calculateImpact(gap, goals),
      prerequisites: knowledgeGraph.getPrerequisites(gap.topic),
      readyToLearn: hasPrerequisites(questionHistory, gap.topic)
    }));
    
    return prioritized.filter(p => p.readyToLearn).sort((a, b) => b.impact - a.impact)[0];
  }
}
```

**Peter says:** *"I've noticed you haven't learned about tax-loss harvesting yet. Since you have $15K in losses and it's December, this could save you $3,000 in taxes. Want me to explain?"*

---

## Phase 5: Proactive Intelligence Engine

### Automated Insight Generation

```typescript
// Runs daily via Cloud Scheduler
async function dailyInsightGeneration() {
  const users = await getAllActiveUsers();
  
  for (const userId of users) {
    const insights = [];
    
    // 1. Goal progress check
    const goalInsights = await checkGoalProgress(userId);
    insights.push(...goalInsights);
    
    // 2. Behavioral pattern detection
    const behavioralInsights = await detectBehavioralPatterns(userId);
    insights.push(...behavioralInsights);
    
    // 3. Market-based alerts
    const marketInsights = await generateMarketAlerts(userId);
    insights.push(...marketInsights);
    
    // 4. Education opportunities
    const educationInsights = await identifyLearningOpportunities(userId);
    insights.push(...educationInsights);
    
    // 5. Peer comparison updates
    const peerInsights = await compareToPeers(userId);
    insights.push(...peerInsights);
    
    // Store for next conversation
    await storeInsights(userId, insights);
  }
}
```

### Insight Types

| Type | Trigger | Example |
|------|---------|---------|
| Goal Milestone | Progress crosses threshold | "You're 75% to your house fund!" |
| Behavioral Alert | Pattern detected | "You've checked your portfolio 12 times today" |
| Market Opportunity | Conditions match thesis | "VTI is down 10% - your thesis said buy on dips" |
| Knowledge Gap | Question reveals gap | "You asked about bonds - let's cover basics" |
| Peer Update | Rank changes | "Your savings rate moved from top 20% to top 15%" |
| Success Pattern | Alignment changes | "You're now matching 82% of successful patterns" |
| Thesis Check | Price hits target | "AAPL hit your $200 target - review thesis?" |
| Anniversary | Time-based | "1 year since you started investing!" |

---

## File Structure

```
src/tools/domains/research/
├── quant-tools.ts                    # Existing - enhance
├── quant-firestore.ts                # Existing - expand
├── external-apis.ts                  # Existing
├── proactive-quant-insights.ts       # Existing - expand
│
├── user-data/                        # NEW - Phase 1
│   ├── investment-thesis.ts
│   ├── financial-goals.ts
│   ├── life-events.ts
│   ├── question-history.ts
│   ├── learning-preferences.ts
│   ├── risk-events.ts
│   ├── trusted-sources.ts
│   └── knowledge-gaps.ts
│
├── global-intelligence/              # NEW - Phase 2
│   ├── bigquery-client.ts
│   ├── event-pipeline.ts
│   ├── peer-benchmarks.ts
│   ├── behavioral-patterns.ts
│   ├── question-intelligence.ts
│   ├── success-patterns.ts
│   └── aggregation-jobs.ts
│
├── knowledge-graph/                  # NEW - Phase 3
│   ├── graph-schema.ts
│   ├── graph-operations.ts
│   ├── explanation-tracker.ts
│   └── learning-loop.ts
│
├── superhuman-tools/                 # NEW - Phase 4
│   ├── real-peer-comparison.ts
│   ├── behavioral-prediction.ts
│   ├── thesis-reminder.ts
│   ├── success-pattern-match.ts
│   └── proactive-education.ts
│
└── proactive-engine/                 # NEW - Phase 5
    ├── daily-insights.ts
    ├── insight-generators.ts
    ├── notification-engine.ts
    └── scheduler.ts
```

---

## Privacy & Security

### Anonymization Rules

1. **Never store userId in BigQuery** - Only demographic buckets
2. **Aggregate before storing** - Minimum cohort size of 100
3. **No PII in events** - Strip names, emails, specific amounts
4. **Differential privacy** - Add noise to small cohorts
5. **User opt-out** - Allow users to exclude from aggregation

### Data Retention

| Tier | Data | Retention |
|------|------|-----------|
| Session | Conversation | 24 hours |
| User | Financial profile | Until deleted |
| User | Question history | 2 years |
| Global | Aggregated events | 5 years |
| Global | Patterns | Forever (no PII) |

---

## Success Metrics

### Phase 1: Enhanced User Data
- [ ] 80% of active users have complete profiles
- [ ] Investment theses recorded for 60% of holdings
- [ ] Goal tracking engagement up 50%

### Phase 2: Global Intelligence
- [ ] Peer benchmarks based on 10,000+ users
- [ ] Behavioral predictions 70% accurate
- [ ] Real-time trending topics updated hourly

### Phase 3: Knowledge Graph
- [ ] 500+ financial concepts mapped
- [ ] Explanation effectiveness tracked for all
- [ ] Learning path completion up 40%

### Phase 4: Superhuman Tools
- [ ] Peer comparison uses real data
- [ ] Behavioral prediction saves 50% of panic sells
- [ ] Thesis reminders prevent 30% of regretted sales

### Phase 5: Proactive Engine
- [ ] Daily insights for all active users
- [ ] 60% of insights acted upon
- [ ] User satisfaction score 4.5+/5

---

## Implementation Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1-2 | Phase 1 | All user data collections + tools |
| 3-4 | Phase 2 | BigQuery setup + event pipeline |
| 5-6 | Phase 2 | Aggregation jobs + benchmarks |
| 7-8 | Phase 3 | Knowledge graph foundation |
| 9-10 | Phase 4 | Superhuman tools |
| 11-12 | Phase 5 | Proactive engine |

---

## The Vision

When complete, Peter will be able to say:

> "I've learned from 50,000 investors over 3 years. I know what works, what doesn't, and I can see patterns you can't. I remember every conversation we've had, every decision you've made, and I've watched your financial journey evolve.
>
> Right now, I can tell you:
> - You're in the top 12% of savers your age
> - Your behavioral score predicts you'll want to sell if markets drop 15%
> - The thesis you wrote for AAPL is still valid
> - You should learn about tax-loss harvesting before December
> - Users with your profile who stayed disciplined retired 5 years earlier
>
> I'm not just analyzing your data. I'm learning from everyone to help you specifically. That's what makes me better than human."

---

*This is Peter's path to becoming truly superhuman.*

