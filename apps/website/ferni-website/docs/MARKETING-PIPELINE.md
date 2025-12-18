# Ferni Marketing Pipeline
## From Idea → Asset → Published

> *A systematic approach to creating and distributing Ferni marketing content at scale.*

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Content Types & Specs](#2-content-types--specs)
3. [Asset Generation Workflow](#3-asset-generation-workflow)
4. [Video Production](#4-video-production)
5. [Content Calendar](#5-content-calendar)
6. [Distribution Channels](#6-distribution-channels)
7. [Quality Gates](#7-quality-gates)
8. [Quick Commands](#8-quick-commands)

---

## 1. Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FERNI MARKETING PIPELINE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │  IDEATE  │ →  │  CREATE  │ →  │  REVIEW  │ →  │  PUBLISH │     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│       │              │               │               │             │
│       ▼              ▼               ▼               ▼             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ Content  │    │ Generate │    │  Brand   │    │ Schedule │     │
│  │ Calendar │    │  Assets  │    │ Checklist│    │& Automate│     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principles

| Principle | What It Means |
|-----------|---------------|
| **Batch Create** | Generate a week's content in one session |
| **Template First** | Start from templates, customize second |
| **Brand Check** | Every asset runs through the checklist |
| **Automate Distribution** | Schedule once, publish everywhere |

---

## 2. Content Types & Specs

### Images

| Type | Dimensions | Format | Use Case |
|------|------------|--------|----------|
| **OG Image** | 1200×630 | JPG | Link previews, sharing |
| **Twitter Post** | 1200×675 | JPG/PNG | Timeline posts |
| **Instagram Square** | 1080×1080 | JPG | Feed posts |
| **Instagram Story** | 1080×1920 | JPG/MP4 | Stories |
| **LinkedIn Post** | 1200×627 | JPG/PNG | Feed posts |
| **YouTube Thumbnail** | 1280×720 | JPG | Video thumbnails |
| **Banner - Twitter** | 1500×500 | JPG | Profile banner |
| **Banner - LinkedIn** | 1128×191 | JPG | Company banner |
| **Banner - YouTube** | 2560×1440 | JPG | Channel art |
| **Avatar** | 400×400 | PNG | Profile photos |

### Videos

| Type | Dimensions | Duration | Format | Use Case |
|------|------------|----------|--------|----------|
| **Hero Background** | 4K/8K | 10-15s loop | MP4/WebM | Website hero |
| **Feature Demo** | 1080p | 5-8s loop | MP4/WebM | Feature sections |
| **Social Clip** | 1080×1920 | 15-60s | MP4 | TikTok/Reels |
| **YouTube Short** | 1080×1920 | <60s | MP4 | YouTube Shorts |
| **Explainer** | 1920×1080 | 60-90s | MP4 | YouTube/Website |
| **Testimonial** | 1920×1080 | 30-60s | MP4 | Website/Social |

### Copy

| Type | Length | Use Case |
|------|--------|----------|
| **Headline** | 5-10 words | Hero, ads, posts |
| **Subhead** | 15-25 words | Supporting headline |
| **Tweet** | 280 chars max | Twitter |
| **LinkedIn Post** | 1,300 chars ideal | LinkedIn |
| **Instagram Caption** | 2,200 chars max | Instagram |
| **Email Subject** | 40-60 chars | Newsletters |
| **CTA** | 2-4 words | Buttons, links |

---

## 3. Asset Generation Workflow

### Step 1: Content Batching Session

**Weekly Cadence:**
- Monday: Plan content for the week
- Tuesday-Wednesday: Generate assets
- Thursday: Review and approve
- Friday: Schedule distribution

### Step 2: Generate Assets

#### Images (Imagen 4.0 / Midjourney)

```bash
# Navigate to scripts
cd apps/website/ferni-website/scripts

# Generate avatar images
node generate-assets.js --batch=avatars

# Generate hero images  
node generate-assets.js --batch=hero

# Generate social images
node generate-assets.js --batch=social

# Generate lifestyle images
node generate-assets.js --batch=lifestyle
```

**Prompts Location:** `prompts/IMAGE-PROMPTS.txt`

#### Videos (Veo 3)

1. Open [Google Veo 3](https://labs.google.com/videotools)
2. Copy prompt from `prompts/VEO3-PROMPTS.txt`
3. Generate video
4. Download to `videos/generated/[category]/`
5. Rename following convention: `[type]-[description]-[date].mp4`

### Step 3: Post-Process Assets

```bash
# Optimize images for web
npm run optimize:images

# Convert videos for web
npm run convert:videos

# Generate video thumbnails
npm run generate:thumbnails
```

---

## 4. Video Production

### Priority Queue

| Priority | Video | Status | Prompt Location |
|----------|-------|--------|-----------------|
| 🔴 CRITICAL | Hero Background (Mountain) | ⬜ Todo | VEO3-PROMPTS.txt #1 |
| 🔴 CRITICAL | Hero Background (Zen) | ⬜ Todo | VEO3-PROMPTS.txt #1B |
| 🟡 HIGH | Listening Moment | ⬜ Todo | VEO3-PROMPTS.txt #2 |
| 🟡 HIGH | CTA Particles | ⬜ Todo | VEO3-PROMPTS.txt #3 |
| 🟢 MEDIUM | Team Gathering | ⬜ Todo | VEO3-PROMPTS.txt #4 |
| 🟢 MEDIUM | Ink & Water Loading | ⬜ Todo | VEO3-PROMPTS.txt #5 |
| 🔵 LOW | Memory Feature | ⬜ Todo | VEO3-PROMPTS.txt #6 |
| 🔵 LOW | Six Lights Team | ⬜ Todo | VEO3-PROMPTS.txt #7 |

### Video Naming Convention

```
[priority]-[category]-[description]-[version].mp4

Examples:
- hero-mountain-meadow-v1.mp4
- feature-memory-network-v2.mp4
- social-listening-moment-v1.mp4
```

### Video Integration

Once generated, add videos to features:

```html
<!-- In feature block -->
<div class="feature-video" data-feature="memory">
  <video muted playsinline preload="metadata">
    <source src="/videos/feature-memory-network-v1.mp4" type="video/mp4">
  </video>
  <div class="feature-video-fallback">
    <!-- Existing CSS animation fallback -->
  </div>
</div>
```

---

## 5. Content Calendar

### Weekly Template

| Day | Platform | Content Type | Theme |
|-----|----------|--------------|-------|
| **Monday** | Twitter, LinkedIn | Quote/Insight | Motivation |
| **Tuesday** | Instagram, TikTok | Team Spotlight | Meet the Team |
| **Wednesday** | Twitter, LinkedIn | Feature Highlight | Product |
| **Thursday** | Instagram, TikTok | User Tip | Value |
| **Friday** | All | Community/Fun | Engagement |
| **Saturday** | Instagram Stories | Behind the Scenes | Connection |
| **Sunday** | Rest or Evergreen | - | - |

### Monthly Themes

| Month | Theme | Key Content |
|-------|-------|-------------|
| Jan | New Beginnings | Goal setting with Ferni |
| Feb | Connection | Valentine's focus on self-love |
| Mar | Growth | Spring renewal, habit building |
| Apr | Clarity | Decision-making, research |
| May | Wellness | Mental health awareness |
| Jun | Planning | Summer planning, events |
| Jul | Balance | Work-life balance |
| Aug | Learning | Back to learning mindset |
| Sep | Organization | Fall reset, routines |
| Oct | Reflection | Review progress |
| Nov | Gratitude | Thanksgiving focus |
| Dec | Review & Plan | Year review, next year goals |

### Content Queue

```markdown
## This Week's Content

### Monday - Dec 9
- [ ] Twitter: Morning motivation quote
- [ ] LinkedIn: Weekly insight post
- [ ] Schedule: 8am ET

### Tuesday - Dec 10  
- [ ] Instagram: Meet Maya (Habits)
- [ ] TikTok: "One habit tip" video
- [ ] Schedule: 12pm ET

### Wednesday - Dec 11
- [ ] Twitter: Feature thread (Memory)
- [ ] LinkedIn: How Ferni remembers
- [ ] Schedule: 10am ET

... (continue for week)
```

---

## 6. Distribution Channels

### Primary Channels

| Channel | Handle | Frequency | Best Times (ET) |
|---------|--------|-----------|-----------------|
| **Website** | ferni.ai | Continuous | - |
| **Twitter/X** | @ferniAI | 1-3/day | 8am, 12pm, 5pm |
| **LinkedIn** | /company/ferni | 3-5/week | Tue-Thu 8-10am |
| **Instagram** | @ferni.ai | 4-5/week + daily stories | 11am-1pm, 7-9pm |
| **TikTok** | @ferni.ai | 3-4/week | 7-9am, 12-3pm, 7-11pm |
| **YouTube** | @ferniAI | 1-2/week | - |
| **Email** | Newsletter | 1/week | Tue 10am |

### Cross-Posting Strategy

```
Original Content → Repurpose → Distribute

LinkedIn Article → Twitter Thread → Instagram Carousel
         ↓
YouTube Video → TikTok Clips → Instagram Reels
         ↓
Blog Post → Email Newsletter → Social Quotes
```

### Tools

| Tool | Purpose | Link |
|------|---------|------|
| **Buffer** | Social scheduling | buffer.com |
| **Canva** | Quick graphics | canva.com |
| **Veo 3** | AI video generation | labs.google.com |
| **Imagen** | AI image generation | (via API) |
| **Mailchimp** | Email marketing | mailchimp.com |
| **Google Analytics** | Tracking | analytics.google.com |

---

## 7. Quality Gates

### Pre-Publish Checklist

Every piece of content must pass:

```markdown
## Content Checklist

### Brand Compliance
- [ ] Uses Ferni color palette (no purple, cool grays)
- [ ] Typography follows brand (Plus Jakarta Sans, Inter)
- [ ] Voice is warm, human, grounded (not corporate)
- [ ] No emoji as UI elements (Lucide icons only)

### Visual Quality
- [ ] High resolution (meets platform specs)
- [ ] Properly cropped for platform
- [ ] Text is readable on mobile
- [ ] Colors match brand palette

### Copy Quality
- [ ] Spell-checked
- [ ] Grammar checked
- [ ] Within character limits
- [ ] Includes CTA where appropriate
- [ ] Hashtags reviewed (no banned/problematic)

### Technical
- [ ] Links work and tracked (UTM params)
- [ ] Alt text for images
- [ ] Video has captions/subtitles
- [ ] Mobile preview checked

### Legal
- [ ] No unlicensed music/images
- [ ] No misleading claims
- [ ] Disclaimers where needed
```

### Review Process

1. **Creator** generates content
2. **Self-review** against checklist
3. **Peer review** (if available)
4. **Schedule** for publishing
5. **Monitor** engagement after publish

---

## 8. Quick Commands

### Package.json Scripts

Add to `apps/website/ferni-website/package.json`:

```json
{
  "scripts": {
    "marketing:images": "node scripts/generate-assets.js",
    "marketing:optimize": "node scripts/optimize-assets.js",
    "marketing:thumbnails": "node scripts/generate-thumbnails.js",
    "marketing:audit": "./scripts/audit-content.sh",
    "marketing:calendar": "open https://docs.google.com/spreadsheets/d/YOUR_CALENDAR_ID"
  }
}
```

### Daily Workflow

```bash
# Morning: Check scheduled content
npm run marketing:calendar

# Generate new images
npm run marketing:images -- --batch=social

# Optimize for web
npm run marketing:optimize

# Audit before publish
npm run marketing:audit
```

### Quick Reference

| Task | Command/Action |
|------|----------------|
| Generate avatars | `node scripts/generate-assets.js --batch=avatars` |
| Generate hero images | `node scripts/generate-assets.js --batch=hero` |
| Create video | Copy from `prompts/VEO3-PROMPTS.txt` → Veo 3 |
| Check brand compliance | `npm run lint:design` |
| Preview website | `npm run dev` |
| Build website | `npm run build` |

---

## Appendix: File Locations

| Content Type | Source | Output |
|--------------|--------|--------|
| Image prompts | `prompts/IMAGE-PROMPTS.txt` | `images/generated/` |
| Video prompts | `prompts/VEO3-PROMPTS.txt` | `videos/generated/` |
| Social guide | `SOCIAL-MEDIA-GUIDE.md` | - |
| Brand guidelines | `../../design-system/design-system/brand/FERNI-BRAND-GUIDELINES.md` | - |
| Design tokens | `../../brand/ferni-design-tokens.css` | - |
| Website standards | `WEBSITE-STANDARDS.md` | - |

---

## Appendix: Asset Generation Prompts

### Quick Image Prompts (Copy-Paste Ready)

**Social Quote Card:**
```
Minimalist quote card on warm cream paper background (#F5F1E8). 
Elegant typography in deep sage green (#2C2520). 
Subtle texture like handmade paper. Small Ferni logo mark in corner.
Clean, warm, Apple-like simplicity. 1080x1080px.
```

**Team Member Spotlight:**
```
Abstract avatar representation of [PERSONA NAME], 
color palette centered on [PERSONA COLOR]. 
Soft glowing orb with organic waveform patterns. 
Warm cream background with subtle gradient. 
Professional yet approachable. 1080x1080px.
```

**Feature Highlight:**
```
Clean product screenshot mockup showing [FEATURE]. 
Floating iPhone/browser on warm cream background. 
Soft sage green accents and subtle shadows.
Apple-quality composition. 1200x675px.
```

---

*Pipeline Version: 1.0 | December 2024*
*Maintained by: Marketing Team*

