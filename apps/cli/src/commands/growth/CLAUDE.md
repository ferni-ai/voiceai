# Growth Automation Module

> **Autonomous growth marketing for ferni.ai across all channels.**

This module automates the 5 growth playbooks defined in `docs/growth/`:

| Playbook | Commands | Status |
|----------|----------|--------|
| TikTok Content Machine | `ferni growth tiktok` | ✅ Implemented |
| SEO Content Strategy | `ferni growth seo` | ✅ Implemented |
| Reddit Growth | `ferni growth content` | ✅ Implemented |
| Influencer Outreach | `ferni growth influencer` | ✅ Implemented |
| Product Hunt Launch | `ferni growth ph` | ✅ Implemented |

---

## Quick Start

```bash
# View dashboard
ferni growth

# Set up API keys for AI content generation
ferni growth auto key openai sk-...
ferni growth auto key anthropic sk-ant-...

# Enable full autonomous mode
ferni growth auto on

# Generate content immediately
ferni growth auto quick --platform tiktok --count 5

# Run background scheduler
ferni growth auto daemon
```

---

## Architecture

```
apps/cli/src/commands/growth/
├── index.ts               # Module exports
├── growth.ts              # CLI commands (Commander.js)
├── growth-storage.ts      # State persistence (~/.ferni/growth-state.json)
├── growth-validation.ts   # Zod validation schemas
├── growth-metrics.ts      # Observability & metrics collection
├── growth-intelligence.ts # BTH AI-powered growth intelligence (NEW!)
├── content-engine.ts      # AI content generation
├── scheduler.ts           # Autonomous task execution
├── platform-clients.ts    # Platform API integrations (Reddit, TikTok, Email)
└── CLAUDE.md              # This file

# Tests are in src/tests/growth/
src/tests/growth/
├── growth-storage.test.ts
├── growth-validation.test.ts
├── growth-e2e.test.ts
├── growth-metrics.test.ts
└── growth-intelligence.test.ts  # 47 tests for BTH capabilities
```

### Data Flow

```
User Commands → growth.ts → content-engine.ts → growth-storage.ts
                              ↓                        ↑
                          scheduler.ts ──────────────────┤
                              ↓                        │
                          Task Executors               │
                              ↓                        │
                          platform-clients.ts          │
                              ↓                        │
                      Reddit/TikTok/Email APIs         │
                                                       │
BTH Intelligence Layer (growth-intelligence.ts)        │
         ↓                                             │
┌────────────────────────────────────────────────────────┐
│  Pattern Analysis   │  Predictive Scheduling         │
│  Trend Detection    │  Cross-Platform Intelligence   │
│  Engagement Scoring │  Influencer Fit Analysis       │
│  Content Optimization│ Sentiment Platform Fit        │
│  Competitive Intel  │  A/B Testing Framework         │
└────────────────────────────────────────────────────────┘
```

---

## File Reference

### growth-storage.ts

State persistence using local JSON file (`~/.ferni/growth-state.json`).

**Key Types:**
- `TikTokAccount` - Account with angle (main, motivation, productivity, emotional, comparison)
- `ContentPiece` - Generated content (script, post, article, email)
- `InfluencerLead` - Influencer pipeline tracking
- `SEOArticle` - Blog article with keyword targeting
- `ScheduledTask` - Task for autonomous execution
- `Campaign` - Goal-based campaign tracking

**Key Functions:**
- `getDashboard()` - Get full dashboard state
- `addContent()` / `getContentQueue()` - Content CRUD
- `addTikTokAccount()` / `getTikTokAccounts()` - Account management
- `scheduleTask()` / `getPendingTasks()` - Task scheduling

### content-engine.ts

AI-powered content generation using OpenAI or Anthropic.

**Generators:**
- `generateTikTokScript(topic, account)` - TikTok video scripts with hooks, CTAs
- `generateSEOArticle(topic, keyword)` - Blog articles with meta descriptions
- `generateRedditPost(topic, subreddit)` - Reddit posts (value-first)
- `generateInfluencerEmail(lead, type)` - Outreach emails

**Topic Banks:**
- `TIKTOK_TOPIC_BANK` - 25 topics across 5 angles
- `SEO_KEYWORD_BANK` - 8 keyword-optimized topics
- `REDDIT_TOPICS` - 15 topics for 3 subreddits

### scheduler.ts

Autonomous task execution.

**Functions:**
- `runContinuousScheduler(config)` - Background daemon
- `runPendingTasks(dryRun)` - Execute due tasks
- `scheduleDailyTasks()` - Schedule next day's tasks
- `quickGenerate(platform, count)` - Generate content now

**Task Types:**
- `generate_content` - AI creates content
- `post_content` - Post to platform
- `send_outreach` - Send influencer emails
- `engage_reddit` - Reddit engagement
- `check_metrics` - Fetch analytics

### growth.ts

CLI command registration and handlers.

**Command Groups:**
- `ferni growth` - Dashboard
- `ferni growth tiktok` - TikTok account management
- `ferni growth content` - Content queue
- `ferni growth influencer` - Influencer pipeline
- `ferni growth seo` - SEO articles
- `ferni growth auto` - Automation settings
- `ferni growth run` - Execute tasks
- `ferni growth campaign` - Campaign management
- `ferni growth ph` - Product Hunt launch
- `ferni growth metrics` - Analytics

---

## Command Reference

### Dashboard
```bash
ferni growth                    # Show overview dashboard
```

### TikTok
```bash
ferni growth tiktok             # List accounts
ferni growth tiktok add @handle --angle motivation
```

### Content
```bash
ferni growth content            # Show queue
ferni growth content --status draft
ferni growth content add --platform tiktok --type video_script
ferni growth content schedule <id> "2026-01-20 10:00"
```

### Influencer
```bash
ferni growth influencer         # Show pipeline
ferni growth influencer --tier micro
ferni growth influencer add "Name" --handle @handle --platform tiktok --followers 50000 --category self-improvement
ferni growth influencer update <id> contacted
```

### SEO
```bash
ferni growth seo                # List articles
ferni growth seo add --title "Article" --keyword "target keyword"
```

### Automation
```bash
ferni growth auto               # Show settings
ferni growth auto on            # Enable all
ferni growth auto off           # Disable all
ferni growth auto post on       # Toggle auto-posting
ferni growth auto engage on     # Toggle Reddit engagement
ferni growth auto generate on   # Toggle AI generation
ferni growth auto limit content 10   # Daily content limit
ferni growth auto key openai <key>   # Set API key
ferni growth auto daemon        # Run background scheduler
ferni growth auto quick --platform tiktok --count 5
ferni growth auto schedule      # Schedule tomorrow's tasks
```

### Product Hunt
```bash
ferni growth ph                 # Launch status
ferni growth ph init --date 2026-02-15
ferni growth ph checklist       # 4-week prep checklist
ferni growth ph check <item>    # Mark item complete
ferni growth ph hunter          # Hunter pipeline
ferni growth ph assets          # Visual assets status
ferni growth ph countdown       # Days until launch
```

### Campaigns & Metrics
```bash
ferni growth campaign           # List campaigns
ferni growth campaign create "Q1 TikTok" --channel tiktok
ferni growth metrics            # Show growth metrics
ferni growth metrics --days 7   # Last 7 days
```

### Better Than Human Intelligence (NEW!)
```bash
# Dashboard - consolidated AI growth intelligence
ferni growth intel              # Full BTH intelligence dashboard
ferni growth ai                 # Alias for intel

# Pattern Recognition
ferni growth intel patterns                 # Analyze performance patterns
ferni growth intel patterns --platform tiktok --days 30

# Predictive Scheduling
ferni growth intel timing                   # Calculate optimal post times
ferni growth intel suggest-time --platform reddit  # Best time to post

# Trend Detection
ferni growth intel trends                   # Detect emerging trends
ferni growth intel trends --threshold 0.7

# Engagement Quality Scoring
ferni growth intel score                    # Score content engagement quality
ferni growth intel score --id content_123

# Cross-Platform Intelligence
ferni growth intel cross-platform           # Analyze cross-platform synergies
ferni growth intel cross-platform --with-recommendations

# Influencer Fit Analysis
ferni growth intel influencer-fit           # Score influencer-brand alignment
ferni growth intel influencer-fit --handle @creator

# Content Optimization
ferni growth intel optimize                 # Get AI optimization suggestions
ferni growth intel optimize --id content_123 --platform tiktok

# Sentiment Platform Fit
ferni growth intel sentiment                # Analyze content sentiment
ferni growth intel sentiment "Your content text here"

# Competitive Intelligence
ferni growth intel competitor               # Track competitor activity
ferni growth intel competitor --brand competitor_name

# A/B Testing Insights
ferni growth intel learn                    # Extract learnings from A/B tests
ferni growth intel learn --experiment exp_123
```

---

## State File Structure

Located at `~/.ferni/growth-state.json`:

```json
{
  "settings": {
    "autoPost": true,
    "autoEngage": true,
    "autoGenerate": true,
    "contentPerDay": 10,
    "engagementPerDay": 20,
    "openaiApiKey": "sk-...",
    "anthropicApiKey": null
  },
  "tiktokAccounts": [...],
  "contentQueue": [...],
  "influencerLeads": [...],
  "seoArticles": [...],
  "scheduledTasks": [...],
  "campaigns": [...],
  "dailyMetrics": [...]
}
```

---

## AI Content Prompts

### TikTok Script Prompt
- Hook (2 seconds) - Pattern interrupt
- Body (15-45 seconds) - Value delivery
- CTA (3 seconds) - Drive to Ferni

### SEO Article Prompt
- Title with target keyword
- H2/H3 structure
- Meta description (150-160 chars)
- Soft CTA at end

### Reddit Post Prompt
- 80% value, 20% subtle mention
- Personal "I" language
- Discussion-sparking questions

### Influencer Email Prompt
- Reference specific content
- Lead with value
- Short (under 150 words)

---

## Platform API Integration

Platform clients for automated posting and outreach are in `platform-clients.ts`.

| Platform | API | Status | Commands |
|----------|-----|--------|----------|
| Reddit | Reddit OAuth API | ✅ Implemented | `ferni growth platform reddit` |
| TikTok | TikTok Content API | ⚠️ Requires Business Account | `ferni growth platform tiktok` |
| Email | Resend API | ✅ Implemented | `ferni growth platform email` |

### Platform Setup

```bash
# Configure Reddit (create app at reddit.com/prefs/apps)
ferni growth platform reddit \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_SECRET \
  --username YOUR_USERNAME \
  --password YOUR_PASSWORD

# Configure Email (sign up at resend.com)
ferni growth platform email \
  --api-key re_... \
  --from-email hello@ferni.ai

# Configure TikTok (requires Business Account approval)
ferni growth platform tiktok \
  --access-token YOUR_TOKEN

# Test connections
ferni growth platform test --reddit
ferni growth platform test --email your@email.com
```

### Key Functions

- `postToReddit(subreddit, title, body)` - Submit Reddit post
- `commentOnReddit(postId, body)` - Submit Reddit comment
- `sendOutreachEmail(to, subject, body)` - Send email via Resend
- `generateTikTokInstructions(script, hashtags, handle)` - Manual posting guide

---

## Validation (growth-validation.ts)

Zod schemas for all growth data types with strict validation.

### Validation Functions

| Function | Purpose |
|----------|---------|
| `validateTikTokAccount(data)` | Validate TikTok account input |
| `validateContent(data)` | Validate content piece input |
| `validateInfluencer(data)` | Validate influencer lead input |
| `validateSEOArticle(data)` | Validate SEO article input |
| `validateCampaign(data)` | Validate campaign input |
| `validateSettings(data)` | Validate settings update |
| `validateScheduledTask(data)` | Validate scheduled task input |

### Helper Functions

| Function | Purpose |
|----------|---------|
| `parseCliDate(input)` | Parse CLI date input ("tomorrow", "+2d", "2026-01-20") |
| `tierFromFollowers(count)` | Determine influencer tier from follower count |
| `normalizeHandle(handle)` | Normalize social handle (add @ if missing) |
| `normalizeHashtags(tags)` | Normalize hashtags (add # if missing) |
| `generateSlug(title)` | Generate URL slug from title |

### Usage

```typescript
import { validateContent, parseCliDate } from './growth-validation.js';

// Validate input
const result = validateContent({
  platform: 'tiktok',
  type: 'video_script',
  content: 'My content...',
});

if (!result.success) {
  console.error('Validation errors:', result.errors);
  return;
}

// Use validated data
const content = result.data;

// Parse CLI date
const date = parseCliDate('tomorrow');  // Date object for tomorrow 9 AM
const date2 = parseCliDate('+2d');      // Date object for 2 days from now
```

---

## Testing

```bash
# Run unit tests
pnpm vitest run src/tests/growth/

# Test specific file
pnpm vitest run apps/cli/src/commands/growth/__tests__/growth-storage.test.ts

# Test the CLI commands manually
ferni growth
ferni growth tiktok
ferni growth auto
ferni growth platform

# Test with dry run (where available)
ferni growth run --dry-run
```

### Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| growth-storage.test.ts | 20 | CRUD, filtering, dashboard |
| content-engine.test.ts | 12 | AI generation, topic banks |
| scheduler.test.ts | 11 | Task execution, scheduling |
| platform-clients.test.ts | 10 | API calls, error handling |
| growth-validation.test.ts | 48 | Schema validation, helpers |
| growth-metrics.test.ts | 26 | Observability, percentiles |
| growth-intelligence.test.ts | 34 | BTH capabilities, all 10 features |
| growth-e2e.test.ts | 14 | Full workflow integration |

**Total: 175 tests**

### BTH Intelligence Test Coverage

| Capability | Tests | Description |
|------------|-------|-------------|
| State Management | 5 | Load, save, singleton, reset |
| Pattern Analysis | 6 | Performance patterns, day analysis, format analysis |
| Predictive Scheduling | 5 | Optimal times, suggest times, empty data |
| Trend Detection | 5 | Emerging trends, declining trends, confidence |
| Engagement Scoring | 5 | Quality scoring, missing metrics, comparison |
| Cross-Platform | 5 | Synergy detection, recommendations, single platform |
| Influencer Fit | 5 | Fit scoring, category matching, risk assessment |
| Content Optimization | 5 | Suggestions, platform-specific, empty content |
| Sentiment Analysis | 4 | Sentiment detection, platform fit scores |
| Competitive Intel | 2 | Tracking, gap analysis |

---

## Security Considerations

### Credential Storage

Credentials are stored in `~/.ferni/growth-state.json`. This is standard for CLI tools but be aware:

- File contains API keys for Reddit, TikTok, Resend, OpenAI, Anthropic
- Set appropriate file permissions: `chmod 600 ~/.ferni/growth-state.json`
- Never commit this file to version control
- Consider using a secrets manager in production environments

### Security Audit Summary

| Area | Status | Notes |
|------|--------|-------|
| Input Validation | ✅ Secure | Zod schemas validate all user input |
| API Endpoints | ✅ Secure | All URLs are hardcoded, not user-controlled |
| Shell Execution | ✅ Secure | No `exec`, `spawn`, or shell commands |
| Path Traversal | ✅ Secure | File paths are controlled by module |
| Credential Handling | ⚠️ Local Only | Stored in plain text JSON file |

### Validation Schema Coverage

All data types have strict Zod validation:
- TikTok accounts: Handle format, angle enum
- Content: Platform/type enums, length limits
- Influencers: Follower counts, email format
- SEO articles: Slug format, keyword length
- Campaigns: Channel enum, goal structure
- Settings: API key format, numeric limits

### Best Practices

1. **Never hardcode credentials** - Always use CLI flags or settings
2. **Use dry-run mode** - Test with `--dry-run` before posting real content
3. **Rotate API keys** - Periodically regenerate platform credentials
4. **Monitor rate limits** - All platform clients have built-in rate limit warnings

---

## Observability & Metrics (growth-metrics.ts)

Real-time observability for growth automation operations.

### Key Types

| Type | Purpose |
|------|---------|
| `OperationMetric` | Single operation timing/status |
| `AggregatedMetrics` | Summary with percentiles |
| `GrowthMetricsSummary` | Full dashboard data |
| `OperationTracker` | Track operation lifecycle |

### Usage

```typescript
import { getGrowthMetrics, trackOperation, formatMetricsSummary } from './growth-metrics.js';

// Get singleton collector
const metrics = getGrowthMetrics();

// Track operation lifecycle
const tracker = metrics.startOperation('generate_content', { platform: 'tiktok' });
try {
  const result = await generateContent();
  tracker.success({ contentId: result.id });
} catch (error) {
  tracker.failure(error.message);
}

// Convenience wrapper for async operations
const result = await trackOperation('post_content', async () => {
  return await postToReddit(content);
}, { subreddit: 'productivity' });

// Record API calls
metrics.recordApiCall('reddit', true);  // success
metrics.recordApiCall('openai', false); // failure

// Record content stats
metrics.recordContentGenerated('tiktok');
metrics.recordContentPosted('tiktok');
metrics.recordContentFailed();

// Record influencer funnel
metrics.recordInfluencerContacted();
metrics.recordInfluencerResponded();
metrics.recordInfluencerConverted();

// Record task lifecycle
metrics.recordTaskScheduled();
metrics.recordTaskCompleted();
metrics.recordTaskFailed();

// Get aggregated metrics
const aggregated = metrics.getAggregatedMetrics();
console.log(`Success rate: ${(aggregated.successRate * 100).toFixed(1)}%`);
console.log(`P95 latency: ${aggregated.p95Duration}ms`);

// Get full summary
const summary = metrics.getSummary();
console.log(formatMetricsSummary(summary));

// Get recent/failed operations
const recent = metrics.getRecentOperations(100);
const failed = metrics.getFailedOperations();

// Reset (useful for testing or daily reset)
metrics.reset();
```

### Metrics Tracked

| Category | Metrics |
|----------|---------|
| **Operations** | Total, success/failure count, success rate |
| **Latency** | Average, P50, P95, P99 |
| **By Type** | Per-operation breakdown |
| **API Calls** | Reddit, TikTok, Email, OpenAI, Anthropic |
| **Content** | Generated, posted, failed, by platform |
| **Influencers** | Contacted, responded, converted |
| **Tasks** | Scheduled, completed, failed |

### Console Output

```
📊 Growth Metrics Summary
   Period: 2026-01-17T12:00:00.000Z

📝 Content
   Generated: 10
   Posted: 8
   Failed: 2
   By Platform:
     tiktok: 5
     reddit: 3

🤝 Influencers
   Contacted: 20
   Responded: 10
   Converted: 5

📋 Tasks
   Scheduled: 50
   Completed: 45
   Failed: 5

🔌 API Calls
   reddit: 100 calls, 5 errors (5.0% error rate)
   tiktok: 50 calls, 2 errors (4.0% error rate)
   openai: 30 calls, 1 errors (3.3% error rate)

⚡ Performance
   Total Operations: 100
   Success Rate: 90.0%
   Avg Duration: 150ms
   P50: 120ms
   P95: 300ms
   P99: 500ms
   By Operation:
     generate_content: 50x, 92% success, 200ms avg
     post_content: 30x, 87% success, 100ms avg
```

---

## Better Than Human Intelligence (growth-intelligence.ts)

AI-powered growth intelligence with 10 superhuman capabilities that go beyond human intuition.

### Philosophy

This module implements "Better Than Human" growth intelligence:
- **Pattern Recognition** that surfaces non-obvious correlations
- **Predictive Scheduling** based on audience behavior analysis
- **Cross-Platform Synergies** no human could track manually
- **Sentiment Analysis** calibrated to platform-specific norms
- **Competitive Intelligence** with real-time gap analysis

### Key Types

| Type | Purpose |
|------|---------|
| `IntelligenceState` | Persistent state for all intelligence features |
| `PerformancePatterns` | Analyzed content performance patterns |
| `OptimalTimeSlot` | Predicted best posting times |
| `TrendSignal` | Detected trend with momentum/confidence |
| `EngagementScore` | Quality-weighted engagement scoring |
| `CrossPlatformInsights` | Multi-platform synergy analysis |
| `InfluencerFitScore` | Brand-influencer alignment scoring |
| `ContentOptimization` | AI-generated optimization suggestions |
| `SentimentPlatformFit` | Sentiment analysis with platform fit |
| `CompetitorInsight` | Competitive intelligence data |
| `ABTestLearning` | Learnings from experiments |

### 10 Superhuman Capabilities

#### 1. Performance Pattern Analysis
```typescript
import { analyzePerformancePatterns } from './growth-intelligence.js';

const patterns = analyzePerformancePatterns(contentHistory, {
  platform: 'tiktok',
  days: 30,
});

// Returns:
// - Top performing content types/formats
// - Engagement rate by day of week
// - Optimal posting frequency
// - Content length correlations
```

#### 2. Predictive Scheduling
```typescript
import { calculateOptimalTimes, suggestNextPostTime } from './growth-intelligence.js';

const slots = calculateOptimalTimes(contentHistory, 'reddit');
// Returns ranked time slots with confidence scores

const nextBest = suggestNextPostTime('tiktok');
// Returns specific recommended posting time
```

#### 3. Trend Detection
```typescript
import { detectTrends } from './growth-intelligence.js';

const trends = detectTrends(contentHistory, {
  threshold: 0.7,  // Confidence threshold
  lookbackDays: 14,
});

// Returns:
// - Emerging topics with momentum scores
// - Rising hashtags/keywords
// - Declining trends to avoid
```

#### 4. Engagement Quality Scoring
```typescript
import { scoreEngagementQuality } from './growth-intelligence.js';

const score = scoreEngagementQuality(content);

// Returns weighted score considering:
// - Comment quality (not just count)
// - Share/save ratio (high-intent actions)
// - Engagement velocity (time to engagement)
// - Audience quality signals
```

#### 5. Cross-Platform Intelligence
```typescript
import { analyzeCrossPlatformSynergies } from './growth-intelligence.js';

const insights = analyzeCrossPlatformSynergies(allContent);

// Returns:
// - Platform synergy scores
// - Best content repurposing paths
// - Audience overlap analysis
// - Cross-posting recommendations
```

#### 6. Influencer Fit Analysis
```typescript
import { scoreInfluencerFit } from './growth-intelligence.js';

const fit = scoreInfluencerFit(influencer, brandValues);

// Returns:
// - Overall fit score (0-100)
// - Audience alignment score
// - Content style match
// - Risk assessment
// - Recommended collaboration type
```

#### 7. Content Optimization
```typescript
import { getContentOptimizations } from './growth-intelligence.js';

const suggestions = getContentOptimizations(content, 'tiktok');

// Returns AI-powered suggestions:
// - Hook improvements
// - CTA optimization
// - Hashtag recommendations
// - Length/format suggestions
// - Timing recommendations
```

#### 8. Sentiment Platform Fit
```typescript
import { analyzeSentimentPlatformFit } from './growth-intelligence.js';

const analysis = analyzeSentimentPlatformFit(contentText);

// Returns:
// - Sentiment score (-1 to 1)
// - Platform fit scores (Reddit, TikTok, LinkedIn, Twitter)
// - Tone recommendations per platform
// - Risk of negative reception
```

#### 9. Competitive Intelligence
```typescript
import { trackCompetitor } from './growth-intelligence.js';

const intel = await trackCompetitor('competitor_brand');

// Returns:
// - Content strategy patterns
// - Posting frequency
// - Top performing content
// - Audience growth trends
// - Gap opportunities for Ferni
```

#### 10. A/B Test Learnings
```typescript
import { extractABTestLearnings } from './growth-intelligence.js';

const learnings = extractABTestLearnings(experimentResults);

// Returns:
// - Statistical significance
// - Winner with confidence interval
// - Segment-specific insights
// - Recommended next experiments
```

### State Persistence

Intelligence state is stored alongside growth state at `~/.ferni/growth-intelligence.json`:

```json
{
  "patterns": { ... },
  "optimalTimes": { ... },
  "trends": [ ... ],
  "competitorInsights": { ... },
  "abTestLearnings": [ ... ],
  "lastUpdated": "2026-01-17T12:00:00.000Z"
}
```

### Dashboard Output

```
🧠 Better Than Human Growth Intelligence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Performance Patterns (Last 30 days)
   Top Format: video_script (3.2x avg engagement)
   Best Day: Tuesday (2.1x baseline)
   Optimal Length: 45-60 seconds

🕐 Optimal Posting Times
   TikTok: 7:00 PM - 9:00 PM (confidence: 87%)
   Reddit: 10:00 AM - 12:00 PM (confidence: 82%)

📈 Trending Topics
   🔥 "AI productivity" (+45% momentum)
   🔥 "mindful tech" (+32% momentum)
   ⚠️  "hustle culture" (-18% declining)

🎯 Engagement Quality Score
   Overall: 78/100
   Comment Quality: High
   Share Ratio: Above Average
   Velocity: Fast (top 20%)

🌐 Cross-Platform Insights
   Best Repurpose Path: TikTok → Reddit → LinkedIn
   Synergy Score: 0.84

🤝 Influencer Fit (Top 3)
   @productivity_pro: 92/100 fit
   @mindful_creator: 88/100 fit
   @tech_human: 85/100 fit

🏆 Competitive Intelligence
   Gap Opportunity: "AI ethics" content
   Competitor Weakness: Low engagement on weekends

💡 Recommendations
   1. Post TikTok content Tuesday 7-9 PM
   2. Explore "AI productivity" trending topic
   3. Consider @productivity_pro collab
```

---

## Related Files

- `docs/growth/README.md` - Growth playbook index
- `docs/growth/TIKTOK-CONTENT-MACHINE.md` - TikTok strategy
- `docs/growth/SEO-CONTENT-STRATEGY.md` - SEO strategy
- `docs/growth/REDDIT-GROWTH-STRATEGY.md` - Reddit strategy
- `docs/growth/INFLUENCER-OUTREACH.md` - Influencer strategy
- `docs/growth/PRODUCT-HUNT-LAUNCH.md` - PH launch playbook

---

*Last updated: January 2026*
