# Content Automation System
## Automated Blog & Social Media Publishing for Ferni

> Get the "Building in Public" series scheduled, automated, and rolling with minimal manual effort.

---

## 🚀 Quick Start (Get Running in 30 Minutes)

### Option A: Buffer + Notion (Simplest)
**Best for**: Solo founder / small team
**Cost**: Free tier available, ~$15/mo for full features

### Option B: n8n + Airtable (More Control)
**Best for**: Technical team wanting customization
**Cost**: Self-hosted free, cloud ~$20/mo

### Option C: Custom Scripts (Maximum Control)
**Best for**: Full automation with AI-assisted drafts
**Cost**: Just API costs (~$5-10/mo)

---

## 📋 Option A: Buffer + Notion Setup

### Step 1: Create Notion Content Calendar

1. Go to [notion.so](https://notion.so) → Create new database
2. Import this template structure:

| Property | Type | Options |
|----------|------|---------|
| Title | Title | - |
| Status | Select | Draft, Review, Scheduled, Published |
| Publish Date | Date | - |
| Platform | Multi-select | Blog, LinkedIn, Twitter, Instagram |
| Blog Post | Relation | Link to blog posts database |
| Content | Text | The actual post content |
| Image | Files | Attached visuals |
| UTM Link | URL | Tracked link |

### Step 2: Pre-populate the Calendar

Copy these entries into your Notion database:

```
Week 1 (Dec 9, 2024)
├── Blog: "Why We Let AI Help Build Ferni"
├── LinkedIn: Thread summary (same day)
├── Twitter: 7-tweet thread (same day)
└── Instagram: Carousel (next day)

Week 3 (Dec 23, 2024)
├── Blog: "How an AI Helped Design Its Own Brain"
├── LinkedIn: Architecture focus
├── Twitter: Technical thread
└── Instagram: Diagram carousel

Week 5 (Jan 6, 2025)
├── Blog: "Giving AI a Personality"
├── LinkedIn: Persona deep-dive
├── Twitter: Personality thread
└── Instagram: Meet the team carousel

Week 7 (Jan 20, 2025)
├── Blog: "Our Daily Standup Has an AI"
├── LinkedIn: Day-in-the-life
├── Twitter: Process thread
└── Instagram: Behind-scenes carousel

Week 9 (Feb 3, 2025)
├── Blog: "How Ferni Remembers You"
├── LinkedIn: Privacy focus
├── Twitter: Memory thread
└── Instagram: Trust-building carousel

Week 11 (Feb 17, 2025)
├── Blog: "We Ship Every Day"
├── LinkedIn: Velocity metrics
├── Twitter: Speed thread
└── Instagram: Stats carousel

Week 13 (Mar 3, 2025)
├── Blog: "AI Should Make You Feel Less Alone"
├── LinkedIn: Mission/vision
├── Twitter: Philosophy thread
└── Instagram: Story carousel

Week 15 (Mar 17, 2025)
├── Blog: "What's Next for Ferni"
├── LinkedIn: Roadmap tease
├── Twitter: Future thread
└── Instagram: Teaser carousel
```

### Step 3: Connect Buffer

1. Sign up at [buffer.com](https://buffer.com)
2. Connect your social accounts:
   - Twitter/X: @ferniAI
   - LinkedIn: Ferni company page
   - Instagram: @ferni.ai (optional - can't auto-post carousels)

3. Set up posting schedule:
   ```
   LinkedIn: Tuesday & Thursday, 9:00 AM ET
   Twitter: Monday-Friday, 8:00 AM, 12:00 PM, 5:00 PM ET
   ```

4. Enable "Ideas" feature for content storage

### Step 4: Batch Schedule Content

1. Every Sunday, review Notion for upcoming week
2. Copy content from Notion → Buffer queue
3. Attach images, add UTM links
4. Review and approve

**Time commitment**: ~30 minutes/week

---

## 🔧 Option B: n8n + Airtable (Recommended)

More powerful automation with triggers and AI assistance.

### Step 1: Set Up Airtable Base

Create a base with these tables:

**Table: Blog Posts**
| Field | Type |
|-------|------|
| Title | Single line text |
| Slug | Single line text |
| Status | Single select: Draft/Review/Scheduled/Published |
| Publish Date | Date |
| Content (Markdown) | Long text |
| Excerpt | Long text |
| Hero Image | Attachment |
| Author | Single line text |
| Series | Single select |
| Series Part | Number |

**Table: Social Posts**
| Field | Type |
|-------|------|
| Blog Post | Link to Blog Posts |
| Platform | Single select: LinkedIn/Twitter/Instagram |
| Content | Long text |
| Images | Attachment |
| Scheduled Time | Date + time |
| Status | Single select: Draft/Scheduled/Posted |
| Post URL | URL (filled after posting) |

**Table: Schedule**
| Field | Type |
|-------|------|
| Week Number | Number |
| Start Date | Date |
| Blog Post | Link to Blog Posts |
| LinkedIn Post | Link to Social Posts |
| Twitter Thread | Link to Social Posts |
| Instagram Carousel | Link to Social Posts |

### Step 2: Set Up n8n Workflow

1. Self-host n8n or use [n8n.cloud](https://n8n.cloud)
2. Import this workflow:

```json
{
  "name": "Ferni Content Publisher",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "cronExpression", "expression": "0 9 * * 2,4" }]
        }
      }
    },
    {
      "name": "Get Scheduled Posts",
      "type": "n8n-nodes-base.airtable",
      "parameters": {
        "operation": "list",
        "table": "Social Posts",
        "filterByFormula": "AND({Status}='Scheduled', IS_SAME({Scheduled Time}, TODAY(), 'day'))"
      }
    },
    {
      "name": "Post to LinkedIn",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "https://api.linkedin.com/v2/ugcPosts",
        "authentication": "oAuth2",
        "body": "={{ $json.linkedinPayload }}"
      }
    },
    {
      "name": "Post to Twitter",
      "type": "n8n-nodes-base.twitter",
      "parameters": {
        "operation": "post",
        "text": "={{ $json.content }}"
      }
    },
    {
      "name": "Update Status",
      "type": "n8n-nodes-base.airtable",
      "parameters": {
        "operation": "update",
        "table": "Social Posts",
        "id": "={{ $json.id }}",
        "fields": { "Status": "Posted" }
      }
    },
    {
      "name": "Slack Notification",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#marketing",
        "text": "✅ Posted: {{ $json.content.substring(0, 100) }}..."
      }
    }
  ]
}
```

### Step 3: Add AI Content Generation

Add a node to help generate social posts from blog content:

```json
{
  "name": "Generate Social Posts",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "headers": {
      "x-api-key": "{{ $credentials.anthropicApiKey }}",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    "body": {
      "model": "claude-sonnet-4-20250514",
      "max_tokens": 2000,
      "messages": [{
        "role": "user",
        "content": "You are writing social media content for Ferni, an AI life coaching company. Voice: warm, grounded, honest—not corporate or hypey.\n\nBased on this blog post, create:\n1. A LinkedIn post (200-300 words, professional but human)\n2. A Twitter thread (7 tweets, punchy and insightful)\n\nBlog post:\n{{ $json.blogContent }}\n\nFormat as JSON with keys: linkedin, twitter (array of strings)"
      }]
    }
  }
}
```

---

## 💻 Option C: Custom Node.js Scripts

For maximum control and integration with your existing codebase.

### Directory Structure

```
apps/marketing/
├── scripts/
│   ├── generate-social-posts.ts
│   ├── schedule-buffer.ts
│   ├── publish-blog.ts
│   └── content-calendar.ts
├── content/
│   ├── blog-posts/
│   │   ├── 01-why-we-let-ai-help-build-ferni.md
│   │   └── ...
│   └── social/
│       ├── linkedin/
│       ├── twitter/
│       └── instagram/
└── config/
    └── schedule.json
```

### Script 1: Content Calendar Generator

Create `apps/marketing/scripts/content-calendar.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  publishDate: string;
  status: 'draft' | 'review' | 'scheduled' | 'published';
}

interface SocialPost {
  blogId: number;
  platform: 'linkedin' | 'twitter' | 'instagram';
  scheduledTime: string;
  content: string;
  status: 'draft' | 'scheduled' | 'posted';
}

const BLOG_SERIES: BlogPost[] = [
  {
    id: 1,
    title: 'Why We Let AI Help Build Ferni',
    slug: 'why-we-let-ai-help-build-ferni',
    publishDate: '2024-12-09',
    status: 'draft'
  },
  {
    id: 2,
    title: 'How an AI Helped Design Its Own Brain',
    slug: 'how-ai-helped-design-its-own-brain',
    publishDate: '2024-12-23',
    status: 'draft'
  },
  {
    id: 3,
    title: 'Giving AI a Personality (Without Losing Its Soul)',
    slug: 'giving-ai-a-personality',
    publishDate: '2025-01-06',
    status: 'draft'
  },
  {
    id: 4,
    title: 'Our Daily Standup Has an AI in the Room',
    slug: 'daily-standup-with-ai',
    publishDate: '2025-01-20',
    status: 'draft'
  },
  {
    id: 5,
    title: 'How Ferni Remembers You (Without Being Creepy)',
    slug: 'how-ferni-remembers-you',
    publishDate: '2025-02-03',
    status: 'draft'
  },
  {
    id: 6,
    title: 'We Ship Every Day. Here\'s How.',
    slug: 'we-ship-every-day',
    publishDate: '2025-02-17',
    status: 'draft'
  },
  {
    id: 7,
    title: 'AI Should Make You Feel Less Alone',
    slug: 'ai-should-make-you-feel-less-alone',
    publishDate: '2025-03-03',
    status: 'draft'
  },
  {
    id: 8,
    title: 'What\'s Next for Ferni',
    slug: 'whats-next-for-ferni',
    publishDate: '2025-03-17',
    status: 'draft'
  }
];

function generateSocialSchedule(blogs: BlogPost[]): SocialPost[] {
  const social: SocialPost[] = [];
  
  for (const blog of blogs) {
    const publishDate = new Date(blog.publishDate);
    
    // LinkedIn: Same day at 9 AM ET
    social.push({
      blogId: blog.id,
      platform: 'linkedin',
      scheduledTime: `${blog.publishDate}T09:00:00-05:00`,
      content: '', // Will be generated
      status: 'draft'
    });
    
    // Twitter: Same day at 12 PM ET
    social.push({
      blogId: blog.id,
      platform: 'twitter',
      scheduledTime: `${blog.publishDate}T12:00:00-05:00`,
      content: '', // Will be generated
      status: 'draft'
    });
    
    // Instagram: Next day at 11 AM ET
    const nextDay = new Date(publishDate);
    nextDay.setDate(nextDay.getDate() + 1);
    social.push({
      blogId: blog.id,
      platform: 'instagram',
      scheduledTime: `${nextDay.toISOString().split('T')[0]}T11:00:00-05:00`,
      content: '', // Will be generated
      status: 'draft'
    });
  }
  
  return social;
}

// Generate and save
const schedule = {
  blogs: BLOG_SERIES,
  social: generateSocialSchedule(BLOG_SERIES),
  generatedAt: new Date().toISOString()
};

const outputPath = path.join(__dirname, '../config/schedule.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(schedule, null, 2));

console.log(`✅ Generated schedule with ${schedule.blogs.length} blog posts and ${schedule.social.length} social posts`);
console.log(`📁 Saved to: ${outputPath}`);
```

### Script 2: AI Social Post Generator

Create `apps/marketing/scripts/generate-social-posts.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const anthropic = new Anthropic();

const FERNI_VOICE_PROMPT = `You are writing social media content for Ferni, an AI life coaching company.

VOICE GUIDELINES:
- Warm but not saccharine ("We're here when you need us" not "We're sooooo happy!")
- Confident but not arrogant ("Ferni remembers everything" not "We're the best AI ever")
- Clear but not cold ("Just talk. We'll understand" not "Utilize natural language processing")
- Human but not artificial ("Like talking to a friend" not "Our AI simulates human connection")

DO NOT:
- Use "revolutionary", "groundbreaking", "game-changing"
- Use "excited to announce", "thrilled to share"
- Use tech jargon unless explaining it
- Use more than 2 hashtags on Twitter
- Sound corporate or salesy

DO:
- Start with an observation or insight
- Be specific about challenges and tradeoffs
- Include something human (hesitation, surprise, lesson learned)
- End with an invitation, not a demand`;

interface GeneratedContent {
  linkedin: string;
  twitter: string[];
  instagram: {
    slides: string[];
    caption: string;
  };
}

async function generateSocialPosts(blogContent: string, blogTitle: string): Promise<GeneratedContent> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `${FERNI_VOICE_PROMPT}

Based on this blog post titled "${blogTitle}", create social media content:

1. LINKEDIN POST (200-300 words)
   - Professional but human
   - Include a hook that makes people stop scrolling
   - End with a soft CTA or question

2. TWITTER THREAD (7 tweets)
   - First tweet must hook immediately
   - Each tweet should stand alone but flow together
   - Last tweet includes link placeholder [LINK]

3. INSTAGRAM CAROUSEL (7 slides + caption)
   - Slide 1: Hook/title
   - Slides 2-6: Key insights (1 per slide, punchy)
   - Slide 7: CTA
   - Caption: 2-3 sentences + hashtags

BLOG POST:
${blogContent}

Return as JSON:
{
  "linkedin": "...",
  "twitter": ["tweet1", "tweet2", ...],
  "instagram": {
    "slides": ["slide1", "slide2", ...],
    "caption": "..."
  }
}`
    }]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }
  
  // Extract JSON from response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  
  return JSON.parse(jsonMatch[0]);
}

async function processBlogPost(blogPath: string): Promise<void> {
  const blogContent = fs.readFileSync(blogPath, 'utf-8');
  const titleMatch = blogContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled';
  
  console.log(`📝 Generating social posts for: ${title}`);
  
  const generated = await generateSocialPosts(blogContent, title);
  
  // Get blog slug from filename
  const slug = path.basename(blogPath, '.md').replace(/^\d+-/, '');
  
  // Save LinkedIn post
  const linkedinPath = path.join(__dirname, `../content/social/linkedin/${slug}.md`);
  fs.mkdirSync(path.dirname(linkedinPath), { recursive: true });
  fs.writeFileSync(linkedinPath, generated.linkedin);
  console.log(`  ✅ LinkedIn: ${linkedinPath}`);
  
  // Save Twitter thread
  const twitterPath = path.join(__dirname, `../content/social/twitter/${slug}.json`);
  fs.mkdirSync(path.dirname(twitterPath), { recursive: true });
  fs.writeFileSync(twitterPath, JSON.stringify(generated.twitter, null, 2));
  console.log(`  ✅ Twitter: ${twitterPath}`);
  
  // Save Instagram content
  const instagramPath = path.join(__dirname, `../content/social/instagram/${slug}.json`);
  fs.mkdirSync(path.dirname(instagramPath), { recursive: true });
  fs.writeFileSync(instagramPath, JSON.stringify(generated.instagram, null, 2));
  console.log(`  ✅ Instagram: ${instagramPath}`);
}

// Process all blog posts
async function main() {
  const blogDir = path.join(__dirname, '../copy/blog-posts');
  const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md') && !f.startsWith('SOCIAL'));
  
  for (const file of files) {
    await processBlogPost(path.join(blogDir, file));
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🎉 All social posts generated!');
}

main().catch(console.error);
```

### Script 3: Buffer API Scheduler

Create `apps/marketing/scripts/schedule-buffer.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

const BUFFER_ACCESS_TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const BUFFER_PROFILE_IDS = {
  linkedin: process.env.BUFFER_LINKEDIN_PROFILE_ID,
  twitter: process.env.BUFFER_TWITTER_PROFILE_ID,
};

interface BufferUpdate {
  text: string;
  profile_ids: string[];
  scheduled_at?: string;
  media?: { link: string }[];
}

async function scheduleToBuffer(update: BufferUpdate): Promise<void> {
  const response = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      access_token: BUFFER_ACCESS_TOKEN!,
      text: update.text,
      profile_ids: update.profile_ids.join(','),
      ...(update.scheduled_at && { scheduled_at: update.scheduled_at }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Buffer API error: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`✅ Scheduled: ${update.text.substring(0, 50)}...`);
  return result;
}

async function scheduleFromCalendar(): Promise<void> {
  const schedulePath = path.join(__dirname, '../config/schedule.json');
  const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
  
  for (const social of schedule.social) {
    if (social.status !== 'draft' || !social.content) continue;
    
    const profileId = BUFFER_PROFILE_IDS[social.platform as keyof typeof BUFFER_PROFILE_IDS];
    if (!profileId) continue;
    
    await scheduleToBuffer({
      text: social.content,
      profile_ids: [profileId],
      scheduled_at: social.scheduledTime,
    });
    
    // Update status in schedule
    social.status = 'scheduled';
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Save updated schedule
  fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
  console.log('\n📅 All posts scheduled to Buffer!');
}

scheduleFromCalendar().catch(console.error);
```

---

## 📅 Pre-Built Content Calendar

Import this into your tool of choice:

### Week-by-Week Schedule

```csv
Week,Start Date,Blog Title,Blog Status,LinkedIn Date,Twitter Date,Instagram Date
1,2024-12-09,Why We Let AI Help Build Ferni,Draft,2024-12-09 09:00,2024-12-09 12:00,2024-12-10 11:00
3,2024-12-23,How an AI Helped Design Its Own Brain,Draft,2024-12-23 09:00,2024-12-23 12:00,2024-12-24 11:00
5,2025-01-06,Giving AI a Personality,Draft,2025-01-06 09:00,2025-01-06 12:00,2025-01-07 11:00
7,2025-01-20,Our Daily Standup Has an AI in the Room,Draft,2025-01-20 09:00,2025-01-20 12:00,2025-01-21 11:00
9,2025-02-03,How Ferni Remembers You,Draft,2025-02-03 09:00,2025-02-03 12:00,2025-02-04 11:00
11,2025-02-17,We Ship Every Day,Draft,2025-02-17 09:00,2025-02-17 12:00,2025-02-18 11:00
13,2025-03-03,AI Should Make You Feel Less Alone,Draft,2025-03-03 09:00,2025-03-03 12:00,2025-03-04 11:00
15,2025-03-17,What's Next for Ferni,Draft,2025-03-17 09:00,2025-03-17 12:00,2025-03-18 11:00
```

---

## 🔐 Required API Keys & Accounts

### Buffer (Easiest for scheduling)
1. Sign up: [buffer.com](https://buffer.com)
2. Connect social accounts
3. Get access token: Settings → Apps & Extras → Access Token
4. Get profile IDs: Use Buffer API or check network tab when loading dashboard

### LinkedIn API (For direct posting)
1. Create app: [linkedin.com/developers](https://www.linkedin.com/developers/)
2. Request Marketing API access (takes 1-2 days)
3. Get OAuth tokens with `w_member_social` scope

### Twitter/X API (For direct posting)
1. Apply for developer access: [developer.twitter.com](https://developer.twitter.com/)
2. Create project and app
3. Generate OAuth 2.0 credentials
4. Get Bearer token and API keys

### Anthropic API (For content generation)
1. Get API key: [console.anthropic.com](https://console.anthropic.com/)
2. Add to environment: `ANTHROPIC_API_KEY=sk-ant-...`

---

## ⚡ One-Click Setup Commands

Add these to your `package.json`:

```json
{
  "scripts": {
    "marketing:generate-calendar": "npx ts-node apps/marketing/scripts/content-calendar.ts",
    "marketing:generate-social": "npx ts-node apps/marketing/scripts/generate-social-posts.ts",
    "marketing:schedule": "npx ts-node apps/marketing/scripts/schedule-buffer.ts",
    "marketing:setup": "npm run marketing:generate-calendar && npm run marketing:generate-social"
  }
}
```

Then run:

```bash
# First time setup
npm run marketing:setup

# Weekly scheduling
npm run marketing:schedule
```

---

## 🔄 Weekly Workflow (15 min/week)

### Sunday (10 min)
1. Run `npm run marketing:schedule` to queue next week's posts
2. Review Buffer queue, adjust timing if needed
3. Check any posts that need images

### Wednesday (5 min)
1. Check analytics on published posts
2. Respond to any comments/engagement
3. Note anything to improve for future posts

---

## 📊 Tracking & Analytics

### UTM Parameters
All links should include tracking:

```
https://app.ferni.ai?utm_source={platform}&utm_medium=social&utm_campaign=building-in-public&utm_content={post-slug}
```

### Key Metrics to Track
| Metric | Goal | Tool |
|--------|------|------|
| Blog views | 500+ per post | Google Analytics |
| LinkedIn impressions | 5,000+ per post | LinkedIn Analytics |
| Twitter impressions | 10,000+ per thread | Twitter Analytics |
| Click-through rate | 2%+ | UTM tracking |
| New signups attributed | 10+ per post | Ferni analytics |

---

## 🆘 Troubleshooting

### "Buffer API rate limited"
- Add delays between requests (1 second minimum)
- Use batch endpoints for multiple posts

### "LinkedIn post failed"
- Check character limits (3,000 for posts)
- Ensure images are < 8MB
- Verify OAuth token hasn't expired

### "AI-generated content sounds off"
- Regenerate with more specific prompts
- Manually edit first few posts to train your eye
- Add examples of good/bad content to the prompt

---

*Last updated: December 2024*

