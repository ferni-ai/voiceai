# GTM (Go-To-Market) Content Automation Module

> Autonomous content generation, scheduling, and publishing for Ferni's brand presence across all platforms.

## Overview

The GTM module provides:
- **Content Generation** - AI-powered content creation following Ferni's brand voice
- **Content Calendar** - Automated scheduling with pillar-based content strategy
- **Multi-Platform Publishing** - Twitter, LinkedIn, Discord, and blog
- **Brand Voice Enforcement** - Consistent tone, personality, and messaging
- **Firestore Persistence** - Content survives container restarts

## Quick Start

```bash
# Verify brand account setup (IMPORTANT: run this first!)
ferni brand gtm verify

# Check GTM status
ferni brand gtm status

# Generate a week of content
ferni brand gtm generate --week

# View content calendar
ferni brand gtm calendar

# Publish approved content
ferni brand gtm publish
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GTM Service                             │
│                    (gtm-service.ts)                          │
│  Orchestrates content generation, scheduling, publishing     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Content     │    │   Content     │    │    Social     │
│  Generator    │    │   Calendar    │    │   Service     │
│               │    │               │    │               │
│ AI content    │    │ Scheduling,   │    │ Twitter,      │
│ creation      │    │ persistence   │    │ LinkedIn,     │
│               │    │               │    │ Discord       │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        │                     ▼                     │
        │            ┌───────────────┐              │
        │            │   Firestore   │              │
        │            │   Storage     │              │
        │            │               │              │
        │            │ Persistence   │              │
        │            │ layer         │              │
        │            └───────────────┘              │
        │                                           │
        └───────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `gtm-service.ts` | Main orchestrator - publishing, generation, milestones |
| `content-calendar.ts` | Calendar management, in-memory cache with Firestore sync |
| `content-generator.ts` | AI content generation using brand voice |
| `brand-voice.ts` | Brand voice rules, tone, templates |
| `gtm-storage.ts` | Firestore persistence layer |
| `gtm-config.ts` | Configuration and brand verification |
| `types.ts` | TypeScript interfaces |

## Brand Account Configuration

**CRITICAL**: Posts must go as the Ferni brand, not your personal accounts.

### Required Environment Variables

```bash
# Brand Account Type (REQUIRED)
SOCIAL_ACCOUNT_TYPE=brand

# LinkedIn Organization (for company page posts)
LINKEDIN_ORGANIZATION_URN=urn:li:organization:YOUR_ORG_ID

# Twitter (must be logged into brand account when generating tokens)
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...

# Discord (bot/webhook for Ferni Community server)
DISCORD_WEBHOOK_URL=...
DISCORD_BOT_TOKEN=...
```

### Verify Configuration

```bash
# Run verification to check brand setup
ferni brand gtm verify

# Expected output:
# ✅ SOCIAL_ACCOUNT_TYPE: brand
# ✅ LinkedIn Organization: urn:li:organization:110229625
# ✅ Twitter: Configured
# ✅ Discord: Configured
```

### How Brand Posting Works

The `linkedin-adapter.ts` determines author:

```typescript
const authorUrn =
  credentials.accountType === 'brand' && credentials.organizationUrn
    ? credentials.organizationUrn  // Posts as Ferni company page
    : credentials.personUrn;       // Fallback: personal profile
```

**If `SOCIAL_ACCOUNT_TYPE` is not `brand`**, the verification will fail with an error.

## Content Pillars

Content is organized into four strategic pillars:

| Pillar | Purpose | Example Categories |
|--------|---------|-------------------|
| `tutorials` | Educational, how-to | tutorial, quick-tip |
| `thought-leadership` | Industry insights | deep-dive, industry-insight |
| `product-updates` | News, releases | changelog, announcement, week-preview |
| `community` | User stories | case-study, community-spotlight, milestone |

### Weekly Schedule (Default)

| Day | Pillar | Category |
|-----|--------|----------|
| Monday | tutorials | tutorial |
| Tuesday | thought-leadership | deep-dive |
| Wednesday | product-updates | changelog |
| Thursday | community | case-study |
| Friday | community | community-spotlight |
| Saturday | tutorials | quick-tip |
| Sunday | thought-leadership | industry-insight |

## Persistence (Firestore)

Content and calendar entries persist to Firestore for durability across container restarts.

### Write-Through Caching

```typescript
// In-memory for speed, async persist for durability
export function storeContent(content: GeneratedContent): void {
  contentStore.set(content.id, content);  // Fast in-memory

  firestoreStorage.storeContent(content).catch((error) => {
    log.error('Failed to persist', { error });
  });
}
```

### Cache Initialization

Main entry points call `initializeGTMCache()` to hydrate from Firestore:

```typescript
export async function runDailyPublishing(config) {
  await initializeGTMCache();  // Hydrate from Firestore
  // ... rest of function
}
```

### Firestore Collections

| Collection | Documents | Fields |
|------------|-----------|--------|
| `gtm-content` | Content ID | title, body, excerpt, status, hashtags, publishedAt |
| `gtm-calendar` | Entry ID | date, pillar, category, status, contentId |

## Content Status Flow

```
planned → in-progress → review → approved → published
                          ↓
                       rejected
```

| Status | Description |
|--------|-------------|
| `draft` | Initial generation |
| `review` | Awaiting human review |
| `approved` | Ready to publish |
| `published` | Live on platforms |
| `rejected` | Needs revision |

## API Reference

### GTM Service (gtm-service.ts)

```typescript
// Daily autonomous publishing (called by Cloud Scheduler)
runDailyPublishing(config?): Promise<{ success, generated, published, errors }>

// Generate week of content
generateWeeklyContent(startDate?): Promise<{ success, entries, content }>

// Create single piece of content
createContent(brief): Promise<GeneratedContent>

// Celebrate milestone (e.g., user count)
celebrateMilestone(milestone, publishImmediately?): Promise<{ content, published }>

// Get dashboard data
getGTMDashboard(): Promise<GTMDashboard>

// Get status for CLI
getGTMStatus(): { calendarStats, socialStatus, pendingEntries, suggestion }

// Approval workflow
approveContent(contentId): boolean
rejectContent(contentId, reason): boolean
publishNow(contentId): Promise<{ success, results }>

// Verify brand configuration
verifyBrandAccountConfig(): { isValid, errors, warnings }
```

### Content Calendar (content-calendar.ts)

```typescript
// Calendar generation
generateWeeklyCalendar(startDate, config?): ContentCalendarEntry[]
generateMonthlyCalendar(year, month, config?): ContentCalendarEntry[]

// Calendar queries
getCalendarEntry(id): ContentCalendarEntry | undefined
getEntriesForDate(date): ContentCalendarEntry[]
getEntriesForWeek(startDate): ContentCalendarEntry[]
getPendingEntries(): ContentCalendarEntry[]
getReadyToPublish(): ContentCalendarEntry[]

// Calendar updates
updateEntryStatus(id, status, contentId?): void
linkContentToEntry(entryId, content): void

// Content storage
storeContent(content): void
getContent(id): GeneratedContent | undefined
getAllContent(): GeneratedContent[]
updateContentStatus(id, status, publishedAt?): void

// Publishing queue
getPublishQueue(config?): PublishQueueItem[]

// Analytics
getCalendarStats(): CalendarStats

// Suggestions
suggestNextContent(): { category, pillar, reason }

// Cache management
initializeGTMCache(): Promise<void>
isCacheHydrated(): boolean
```

### Brand Voice (brand-voice.ts)

```typescript
// Brand constants
FERNI_BRAND_VOICE: BrandVoice
BRAND_COLORS: ColorPalette
TYPOGRAPHY: TypographyConfig
DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule
MONTHLY_THEMES: MonthlyTheme[]
HEADLINE_PATTERNS: string[]
WRITING_TEMPLATES: Record<ContentCategory, string>

// Helpers
validateBrandVoice(content): { valid, issues }
getToneForContext(category, audience): Tone
getMonthlyTheme(month): MonthlyTheme | undefined
getCategoryColor(category): string
```

## CLI Commands

All GTM commands are under `ferni brand gtm`:

```bash
ferni brand gtm status      # Show GTM status and stats
ferni brand gtm verify      # Verify brand account configuration
ferni brand gtm calendar    # View content calendar
ferni brand gtm generate    # Generate content
ferni brand gtm publish     # Publish approved content
ferni brand gtm approve     # Approve content for publishing
ferni brand gtm reject      # Reject content with reason
ferni brand gtm test        # Test social posting (dry run)
```

## Testing

```bash
# Run GTM unit tests (47 tests)
pnpm vitest run src/tests/gtm-module.test.ts

# Run with coverage
pnpm vitest run src/tests/gtm-module.test.ts --coverage
```

### Test Coverage

| Area | Tests |
|------|-------|
| Content Calendar | 12 |
| Content Storage | 6 |
| GTM Configuration | 5 |
| Brand Verification | 4 |
| Service Orchestration | 8 |
| Firestore Storage | 4 |
| Brand Voice | 4 |
| Module Exports | 4 |

## Troubleshooting

### Posts appearing as personal, not brand

```bash
# Check configuration
ferni brand gtm verify

# Expected errors if misconfigured:
# ❌ SOCIAL_ACCOUNT_TYPE is "personal" - must be "brand"
# ❌ LINKEDIN_ORGANIZATION_URN not set
```

**Fix:**
```bash
# In .env
SOCIAL_ACCOUNT_TYPE=brand
LINKEDIN_ORGANIZATION_URN=urn:li:organization:YOUR_ORG_ID
```

### Content not persisting after restart

1. Check Firestore connection:
   ```bash
   ferni doctor apis
   ```

2. Verify `GOOGLE_CLOUD_PROJECT` is set

3. Check logs for persistence errors:
   ```bash
   ferni logs agent | grep "Failed to persist"
   ```

### Content not being generated

1. Check API keys:
   ```bash
   ferni doctor apis
   ```

2. Verify GTM is enabled:
   ```bash
   # In .env
   GTM_ENABLED=true
   ```

### Publishing fails

1. Check social credentials:
   ```bash
   ferni brand gtm verify
   ```

2. Check rate limits (Twitter especially)

3. Review error logs:
   ```bash
   ferni logs agent --errors | grep social
   ```

## Configuration Reference

### GTMConfig

```typescript
interface GTMConfig {
  enabled: boolean;           // Master switch
  autoPublish: boolean;       // Publish without review (default: false)
  reviewRequired: boolean;    // Require human approval (default: true)
  defaultTimezone: string;    // e.g., 'America/Los_Angeles'
  publishTimes: {
    morning: string;          // e.g., '09:00'
    afternoon: string;        // e.g., '14:00'
    evening: string;          // e.g., '18:00'
  };
  platforms: {
    twitter: boolean;
    linkedin: boolean;
    discord: boolean;
    blog: boolean;
  };
  contentRatio: Record<ContentCategory, number>;
}
```

### Default Content Ratios

```typescript
contentRatio: {
  tutorial: 20,
  'deep-dive': 10,
  changelog: 15,
  'case-study': 10,
  'community-spotlight': 10,
  'quick-tip': 15,
  'industry-insight': 10,
  'week-preview': 5,
  milestone: 3,
  announcement: 2,
}
```

## Related Documentation

- **Social Account Setup**: `brand/SOCIAL-ACCOUNTS-SETUP.md`
- **LinkedIn Publishing**: `docs/content/LINKEDIN-PUBLISHING-CALENDAR.md`
- **Brand Voice Guidelines**: `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md`
- **Content Strategy**: `brand/docs/CONTENT-CALENDAR-TEMPLATE.md`
