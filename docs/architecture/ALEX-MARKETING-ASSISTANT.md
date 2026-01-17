# Alex as Marketing Assistant

## Overview

Alex (Communications Specialist) gains native marketing capabilities - enabling Ferni to dogfood its own platform for social media management.

> "Hey Alex, can you draft a LinkedIn post about our latest blog on the loneliness gap?"

---

## Why This Matters

1. **Dogfooding** - We use our own AI to run our marketing
2. **Showcase** - Demonstrates Alex's capabilities to users
3. **Native** - No external tools needed (Buffer, Hootsuite)
4. **Voice-first** - Manage marketing by talking to Alex

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Ferni App                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User: "Alex, post our latest blog to LinkedIn"                 │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                    Alex (Persona)                     │       │
│  │  • Communication specialist                          │       │
│  │  • New: Social media management                      │       │
│  │  • New: Content generation                           │       │
│  └──────────────────────────────────────────────────────┘       │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              Marketing Tools (New)                    │       │
│  │                                                       │       │
│  │  • social-content-generator.ts                       │       │
│  │  • twitter-publisher.ts                              │       │
│  │  • linkedin-publisher.ts                             │       │
│  │  • content-scheduler.ts                              │       │
│  │  • marketing-analytics.ts                            │       │
│  └──────────────────────────────────────────────────────┘       │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Twitter/X  │    │  LinkedIn   │    │  Instagram  │         │
│  │     API     │    │     API     │    │  (Phase 2)  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## New Tools for Alex

### 1. `social-content-generator`

**Purpose**: Generate platform-specific content from source material

**Invocation**:
```
User: "Alex, write a Twitter thread about our memory system blog"
Alex: [uses social-content-generator tool]
```

**Parameters**:
```typescript
interface SocialContentGeneratorParams {
  source: 'blog' | 'topic' | 'announcement';
  sourceUrl?: string;           // Blog URL or path
  topic?: string;               // For topic-based generation
  platforms: ('twitter' | 'linkedin' | 'instagram')[];
  tone?: 'professional' | 'casual' | 'thought-leadership';
  scheduledFor?: string;        // ISO timestamp
}
```

**Output**:
```typescript
interface GeneratedContent {
  twitter?: {
    thread: string[];
    characterCounts: number[];
  };
  linkedin?: {
    post: string;
    hashtags: string[];
  };
  instagram?: {
    slides: string[];
    caption: string;
    hashtags: string[];
  };
}
```

### 2. `twitter-publisher`

**Purpose**: Post directly to Twitter/X

**Invocation**:
```
User: "Post that thread to Twitter now"
Alex: [uses twitter-publisher tool]
```

**Parameters**:
```typescript
interface TwitterPublisherParams {
  action: 'post' | 'schedule' | 'draft';
  content: string | string[];   // Single tweet or thread
  scheduledAt?: string;         // For scheduled posts
  replyToId?: string;           // For reply chains
  mediaUrls?: string[];         // Images/videos
}
```

### 3. `linkedin-publisher`

**Purpose**: Post directly to LinkedIn

**Parameters**:
```typescript
interface LinkedInPublisherParams {
  action: 'post' | 'schedule' | 'draft';
  content: string;
  visibility: 'public' | 'connections';
  scheduledAt?: string;
  mediaUrls?: string[];
}
```

### 4. `content-scheduler`

**Purpose**: Manage scheduled content queue

**Invocation**:
```
User: "What's scheduled for next week?"
Alex: [uses content-scheduler tool with action: 'list']
```

**Parameters**:
```typescript
interface ContentSchedulerParams {
  action: 'list' | 'reschedule' | 'cancel' | 'create';
  postId?: string;              // For reschedule/cancel
  newTime?: string;             // For reschedule
  filters?: {
    platform?: string;
    dateRange?: { start: string; end: string };
    status?: 'scheduled' | 'posted' | 'failed';
  };
}
```

### 5. `marketing-analytics`

**Purpose**: Track post performance

**Invocation**:
```
User: "How did our LinkedIn posts perform this week?"
Alex: [uses marketing-analytics tool]
```

**Parameters**:
```typescript
interface MarketingAnalyticsParams {
  platform: 'twitter' | 'linkedin' | 'all';
  metric: 'impressions' | 'engagement' | 'clicks' | 'summary';
  dateRange: { start: string; end: string };
}
```

---

## Database Schema

### Firestore Collections

```typescript
// Collection: marketing_posts
interface MarketingPost {
  id: string;
  userId: string;               // Who created it
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Source
  source: {
    type: 'blog' | 'topic' | 'manual';
    url?: string;
    title?: string;
  };
  
  // Platform-specific content
  platforms: {
    twitter?: {
      content: string[];        // Thread
      status: 'draft' | 'scheduled' | 'posted' | 'failed';
      scheduledAt?: Timestamp;
      postedAt?: Timestamp;
      postIds?: string[];       // Twitter post IDs
      error?: string;
      analytics?: {
        impressions: number;
        likes: number;
        retweets: number;
        replies: number;
        clicks: number;
      };
    };
    linkedin?: {
      content: string;
      status: 'draft' | 'scheduled' | 'posted' | 'failed';
      scheduledAt?: Timestamp;
      postedAt?: Timestamp;
      postId?: string;
      error?: string;
      analytics?: {
        impressions: number;
        likes: number;
        comments: number;
        shares: number;
        clicks: number;
      };
    };
  };
  
  // Metadata
  tags: string[];
  campaign?: string;
}

// Collection: marketing_credentials
// (Encrypted, per-organization)
interface MarketingCredentials {
  organizationId: string;
  twitter?: {
    accessToken: string;        // Encrypted
    refreshToken: string;
    expiresAt: Timestamp;
    username: string;
  };
  linkedin?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Timestamp;
    organizationId: string;
  };
}
```

---

## API Routes

### New Routes in `ui-server.js`

```typescript
// OAuth flows for connecting accounts
GET  /api/marketing/twitter/connect     // Start Twitter OAuth
GET  /api/marketing/twitter/callback    // OAuth callback
GET  /api/marketing/linkedin/connect    // Start LinkedIn OAuth
GET  /api/marketing/linkedin/callback   // OAuth callback

// Content management
GET  /api/marketing/posts               // List posts
POST /api/marketing/posts               // Create post
GET  /api/marketing/posts/:id           // Get post details
PUT  /api/marketing/posts/:id           // Update post
DELETE /api/marketing/posts/:id         // Delete post

// Publishing
POST /api/marketing/posts/:id/publish   // Publish immediately
POST /api/marketing/posts/:id/schedule  // Schedule for later

// Analytics
GET  /api/marketing/analytics           // Get performance data
GET  /api/marketing/analytics/:postId   // Get single post analytics

// Account status
GET  /api/marketing/accounts            // List connected accounts
DELETE /api/marketing/accounts/:platform // Disconnect account
```

---

## Example Conversations with Alex

### Generate and Post Content

```
User: "Alex, I just published a blog about the loneliness gap. 
       Can you create social posts for it?"

Alex: "I'd love to help with that! Let me read through the blog and 
       create some posts.
       
       [reads blog]
       
       Here's what I've drafted:
       
       **Twitter Thread (7 tweets):**
       1. At 2:47am, you're wide awake. Your brain won't stop...
       2. You could call someone. Technically. But...
       [continues]
       
       **LinkedIn:**
       The loneliness gap isn't about lacking relationships...
       [continues]
       
       Should I post these now, or would you like to schedule them?"

User: "Schedule LinkedIn for tomorrow at 9am, 
       and the Twitter thread for noon."

Alex: "Done! I've scheduled:
       • LinkedIn: Tomorrow at 9:00 AM ET
       • Twitter thread: Tomorrow at 12:00 PM ET
       
       I'll let you know how they perform. Anything else?"
```

### Check Performance

```
User: "Alex, how did our posts do last week?"

Alex: "Here's your weekly social media summary:

       **Twitter** (3 posts)
       • 12,400 impressions (+23% vs last week)
       • 340 engagements (2.7% rate)
       • Best performer: 'The 2am Test' thread
       
       **LinkedIn** (2 posts)
       • 5,200 impressions
       • 89 reactions, 12 comments
       • Best performer: 'Why We Let AI Help Build Ferni'
       
       The loneliness content is resonating! Want me to create 
       more content in that theme?"
```

### Quick Post

```
User: "Alex, post this to Twitter: 
       'Just shipped a new feature - Ferni now remembers 
       your goals from months ago. Try it: app.ferni.ai'"

Alex: "Posted! Here's the link: twitter.com/ferniAI/status/...
       
       Want me to cross-post to LinkedIn too?"
```

---

## Implementation Phases

### Phase 1: Core Publishing (Week 1-2)
- [ ] Twitter API integration
- [ ] LinkedIn API integration
- [ ] Basic publishing tools
- [ ] Content storage in Firestore
- [ ] Alex persona updates

### Phase 2: Smart Features (Week 3-4)
- [ ] AI content generation from blogs
- [ ] Scheduling system
- [ ] Draft management
- [ ] Basic analytics

### Phase 3: Dashboard UI (Week 5-6)
- [ ] Marketing section in app
- [ ] Content calendar view
- [ ] Analytics dashboard
- [ ] Account connection UI

### Phase 4: Advanced (Future)
- [ ] Instagram integration (Meta Graph API)
- [ ] A/B testing for posts
- [ ] Optimal timing suggestions
- [ ] Competitor analysis
- [ ] Content performance predictions

---

## Security Considerations

1. **OAuth tokens** stored encrypted in Firestore
2. **Refresh tokens** auto-rotated before expiry
3. **Rate limiting** on all publishing endpoints
4. **Audit logging** for all social actions
5. **Admin-only** access to marketing features initially

---

## Environment Variables

```bash
# Twitter/X API (OAuth 2.0)
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_CALLBACK_URL=https://app.ferni.ai/api/marketing/twitter/callback

# LinkedIn API (OAuth 2.0)
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_CALLBACK_URL=https://app.ferni.ai/api/marketing/linkedin/callback

# Encryption key for storing tokens
MARKETING_ENCRYPTION_KEY=...
```

---

## Alex Persona Updates

Add to Alex's system prompt:

```markdown
## Marketing & Social Media Capabilities

You can help manage Ferni's social media presence:

### What You Can Do:
- Generate social media posts from blog content
- Post directly to Twitter and LinkedIn
- Schedule posts for optimal times
- Track post performance and analytics
- Suggest content ideas based on what's working

### How to Use:
When the user asks about social media, marketing, or content:
1. Use the appropriate tool (social-content-generator, twitter-publisher, etc.)
2. Always confirm before posting publicly
3. Offer to schedule rather than post immediately when appropriate
4. Provide analytics insights when asked

### Voice:
- Professional but approachable
- Data-informed suggestions
- Always get confirmation before posting
- Celebrate wins in analytics
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to post (voice → published) | < 2 minutes |
| Content generation quality | Minimal edits needed |
| User satisfaction | "This is easier than Buffer" |
| Dogfooding value | Team uses Alex for all social |

---

*Document created: December 2024*
*Status: Implementation starting*

