# Ferni Auto-Publishing Setup Guide

## 🎉 NEW: Alex-Powered Marketing (Voice-First!)

**We dogfood our own platform!** Alex (Ferni's Communication Specialist) now has full marketing capabilities.

### Talk to Alex

Just say:
- "Alex, write a Twitter thread about our latest blog"
- "Alex, post that LinkedIn draft we worked on"
- "Alex, how did our posts perform last week?"
- "Alex, schedule the social content for tomorrow at 9am"

### What Alex Can Do

| Capability | Voice Command Example |
|------------|----------------------|
| Generate content | "Alex, create social posts from our loneliness gap blog" |
| Post to Twitter | "Alex, post that thread to Twitter" |
| Post to LinkedIn | "Alex, publish to LinkedIn" |
| Schedule posts | "Alex, schedule this for tomorrow morning" |
| View analytics | "Alex, how are our posts doing?" |
| List scheduled | "Alex, what's coming up this week?" |

### Marketing Dashboard

Access the marketing dashboard at **app.ferni.ai** → Settings → Marketing Dashboard

Or trigger it via the API:
```typescript
import { showMarketingDashboard } from './ui/marketing-dashboard.ui.js';
showMarketingDashboard();
```

### API Endpoints

```
GET  /api/marketing/accounts          # Connected social accounts
GET  /api/marketing/posts             # List scheduled/posted content
POST /api/marketing/posts             # Create new post
GET  /api/marketing/analytics         # Performance metrics
GET  /api/marketing/twitter/connect   # OAuth flow for Twitter
GET  /api/marketing/linkedin/connect  # OAuth flow for LinkedIn
```

---

## Fallback Options

If you prefer manual control or Alex isn't available:

---

## Quick Start (Get Publishing in 15 Minutes)

### Step 1: Add NPM Scripts

Add to your root `package.json`:

```json
{
  "scripts": {
    "marketing:calendar": "npx ts-node apps/marketing/scripts/content-calendar.ts",
    "marketing:social": "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npx ts-node apps/marketing/scripts/generate-social-posts.ts",
    "marketing:schedule": "npx ts-node apps/marketing/scripts/schedule-buffer.ts"
  }
}
```

### Step 2: Set Up Buffer (Recommended for Quick Start)

1. **Sign up**: [buffer.com](https://buffer.com) (free tier: 3 channels, 10 scheduled posts)
2. **Connect accounts**:
   - Twitter/X: @ferniAI
   - LinkedIn: Ferni company page
3. **Get API credentials**:
   - Go to: buffer.com → Settings → Manage Apps → Access Token
   - Copy your access token

4. **Add to environment**:
```bash
# Add to .env or export
export BUFFER_ACCESS_TOKEN="your-token-here"
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Step 3: Generate Content

```bash
# 1. Generate publishing calendar
npm run marketing:calendar

# 2. Generate social posts from your blog content
npm run marketing:social

# 3. Review generated content in:
#    - apps/marketing/content/social/linkedin/
#    - apps/marketing/content/social/twitter/
#    - apps/marketing/content/social/instagram/

# 4. Schedule to Buffer (once content is reviewed)
npm run marketing:schedule
```

---

## Option B: Direct Platform APIs (No Buffer)

For full control without Buffer, you need developer access to each platform.

### Twitter/X API Setup

1. Apply at [developer.twitter.com](https://developer.twitter.com)
2. Create a Project → App
3. Enable OAuth 2.0 with these scopes:
   - `tweet.read`
   - `tweet.write`
   - `users.read`
4. Generate Bearer Token
5. Add to env:
```bash
export TWITTER_BEARER_TOKEN="..."
export TWITTER_API_KEY="..."
export TWITTER_API_SECRET="..."
```

### LinkedIn API Setup

1. Create app at [linkedin.com/developers](https://www.linkedin.com/developers/)
2. Request these products:
   - **Share on LinkedIn** (instant approval)
   - **Sign In with LinkedIn** (for OAuth)
3. Add redirect URL: `https://app.ferni.ai/auth/linkedin/callback`
4. Generate OAuth 2.0 credentials
5. Add to env:
```bash
export LINKEDIN_CLIENT_ID="..."
export LINKEDIN_CLIENT_SECRET="..."
```

---

## Building Native Auto-Publishing

If we want to build this directly into Ferni's platform, here's the architecture:

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Ferni Marketing Hub                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Content    │───▶│   AI Gen     │───▶│   Schedule   │  │
│  │   Library    │    │   (Claude)   │    │   Queue      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                 │            │
│                                                 ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   LinkedIn   │◀───│   Publisher  │───▶│   Twitter    │  │
│  │   API        │    │   Service    │    │   API        │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                             │                               │
│                             ▼                               │
│                      ┌──────────────┐                       │
│                      │  Instagram   │                       │
│                      │  (via Meta)  │                       │
│                      └──────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### New Files to Create

```
src/services/marketing/
├── content-generator.ts     # AI-powered content generation
├── social-publisher.ts      # Multi-platform posting service
├── platforms/
│   ├── twitter.ts           # Twitter/X API client
│   ├── linkedin.ts          # LinkedIn API client
│   └── instagram.ts         # Meta Graph API client
├── scheduler.ts             # Cron-based scheduling
└── analytics.ts             # Track post performance
```

### Database Tables (Firestore)

```typescript
// Collection: marketing_posts
interface MarketingPost {
  id: string;
  blogSource: string;
  platforms: {
    twitter?: {
      content: string[];  // Thread
      scheduledAt: Timestamp;
      postedAt?: Timestamp;
      postUrl?: string;
      status: 'draft' | 'scheduled' | 'posted' | 'failed';
    };
    linkedin?: {
      content: string;
      scheduledAt: Timestamp;
      postedAt?: Timestamp;
      postUrl?: string;
      status: 'draft' | 'scheduled' | 'posted' | 'failed';
    };
    instagram?: {
      slides: string[];
      caption: string;
      scheduledAt: Timestamp;
      postedAt?: Timestamp;
      postUrl?: string;
      status: 'draft' | 'scheduled' | 'posted' | 'failed';
    };
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### API Routes

```
POST   /api/marketing/generate       # Generate social from blog URL
POST   /api/marketing/schedule       # Schedule a post
GET    /api/marketing/queue          # View scheduled posts
DELETE /api/marketing/queue/:id      # Cancel scheduled post
GET    /api/marketing/analytics      # View post performance
```

---

## Recommended Path Forward

### Phase 1: Buffer Integration (Today)
- Use existing scripts + Buffer
- ~15 min setup
- Start posting immediately

### Phase 2: Native Dashboard (2-4 weeks)
- Build admin UI for content management
- AI generation in-browser
- Preview before scheduling

### Phase 3: Direct API Posting (4-8 weeks)
- Remove Buffer dependency
- Full control over posting
- Better analytics

---

## Quick Test (Right Now)

1. **Generate social content from your existing blog posts**:

```bash
# Make sure you have Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Generate social posts
cd /Users/sethford/Documents/voiceai
npx ts-node apps/marketing/scripts/generate-social-posts.ts
```

2. **Review generated content**:
```bash
# Check LinkedIn posts
cat apps/marketing/content/social/linkedin/*.md

# Check Twitter threads
cat apps/marketing/content/social/twitter/*.json
```

3. **Manual posting** (for now):
   - Copy content to Buffer dashboard
   - Or post directly to LinkedIn/Twitter

---

## Environment Variables Needed

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...        # For AI content generation

# For Buffer (Option A)
BUFFER_ACCESS_TOKEN=...              # Buffer API token

# For Direct Posting (Option B)
TWITTER_BEARER_TOKEN=...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
```

---

## Summary

| Approach | Setup Time | Cost | Control | Maintenance |
|----------|------------|------|---------|-------------|
| **Buffer** | 15 min | $15/mo | Medium | Low |
| **n8n** | 2-4 hours | Free-$20/mo | High | Medium |
| **Native** | 2-4 weeks | API costs | Full | Higher |

**Recommendation**: Start with Buffer today, build native solution over time.

---

*Last updated: December 2024*

