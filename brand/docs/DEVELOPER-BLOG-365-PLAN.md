# Ferni Developers Blog: 365 Days Content Strategy

> **Mission:** Build the most developer-friendly AI voice platform through consistent, valuable content that educates, inspires, and converts.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State](#current-state)
3. [Content Strategy](#content-strategy)
4. [365-Day Content Calendar](#365-day-content-calendar)
5. [Content Categories & Themes](#content-categories--themes)
6. [Automated Changelog Integration](#automated-changelog-integration)
7. [Image Generation System](#image-generation-system)
8. [Brand Voice for Developers](#brand-voice-for-developers)
9. [SEO & Distribution Strategy](#seo--distribution-strategy)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Automation Scripts](#automation-scripts)
12. [Prompts Library](#prompts-library)

---

## Executive Summary

### Goals

| Metric | Target | Timeline |
|--------|--------|----------|
| Weekly posts | 7 (daily) | Day 1 |
| Developer signups | +500/month | Month 3 |
| API calls | +1M/month | Month 6 |
| Community members | 1,000 | Month 6 |
| Documentation NPS | 50+ | Month 3 |

### Content Mix (Weekly)

| Day | Content Type | Audience |
|-----|--------------|----------|
| Monday | **Tutorial** | Beginners |
| Tuesday | **Deep Dive** | Advanced |
| Wednesday | **Changelog** (automated) | All |
| Thursday | **Case Study / Community Spotlight** | Decision Makers |
| Friday | **Quick Tips / Code Snippets** | All |
| Saturday | **Industry Insights** | Thought Leadership |
| Sunday | **Week Ahead / Roadmap Preview** | Engaged Users |

---

## Current State

### What Exists

```
apps/website/ferni-website/src/dev-blog/
├── dev-blog.json                      # Template config
├── introducing-developer-platform.md  # Launch post
├── mcp-server-integration.md          # Integration guide
├── webhook-security.md                # Security guide
└── workflow-engine-guide.md           # Workflow guide
```

- **6 posts** currently live
- **Dark theme** template (dev-blog-post.njk)
- **Empty image directory** (`/images/dev-blog/`)
- **Release automation** exists (Gemini-powered via `ferni release notes`)

### Gaps to Address

1. No automated content pipeline
2. No image generation system
3. No changelog → blog automation
4. No content calendar
5. No developer personas defined
6. No SEO optimization

---

## Content Strategy

### Developer Personas

| Persona | Description | Content Needs |
|---------|-------------|---------------|
| **Explorer** | New to Ferni, evaluating | Quick starts, comparisons, "why Ferni" |
| **Builder** | Building first integration | Tutorials, code samples, troubleshooting |
| **Scaler** | Production deployment | Performance, security, best practices |
| **Contributor** | Wants to extend/contribute | Architecture, MCP servers, open source |

### Content Pillars

```
                    ┌─────────────────────┐
                    │   THOUGHT LEADERSHIP │
                    │   (Industry Vision)  │
                    └─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│   TUTORIALS   │    │  REFERENCES   │    │   COMMUNITY   │
│  (How to do)  │    │ (What exists) │    │ (Who's doing) │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   CHANGELOG/NEWS   │
                    │  (What's new)      │
                    └───────────────────┘
```

---

## 365-Day Content Calendar

### Month 1-3: Foundation (90 Posts)

| Week | Theme | Key Posts |
|------|-------|-----------|
| 1 | Platform Overview | Getting Started Series (5-part) |
| 2 | MCP Servers | Building Your First MCP Server |
| 3 | Webhooks | Event-Driven Architecture |
| 4 | Workflows | Automation Deep Dive |
| 5 | Voice Design | Creating Natural Conversations |
| 6 | Personas | Building Character & Personality |
| 7 | Security | Auth, Encryption, Best Practices |
| 8 | Performance | Latency Optimization |
| 9 | Testing | Voice AI Testing Strategies |
| 10 | Deployment | Production Readiness |
| 11 | Monitoring | Observability & Debugging |
| 12 | Case Studies | First 3 Partner Stories |

### Month 4-6: Growth (90 Posts)

| Week | Theme | Key Posts |
|------|-------|-----------|
| 13-16 | Advanced Integrations | Salesforce, Slack, Notion, etc. |
| 17-20 | Industry Solutions | Healthcare, Finance, Education, Retail |
| 21-24 | Developer Experience | SDKs, CLI tools, IDE extensions |

### Month 7-9: Community (90 Posts)

| Week | Theme | Key Posts |
|------|-------|-----------|
| 25-28 | Open Source | Contributing to Ferni |
| 29-32 | Community Projects | Spotlight series |
| 33-36 | Hackathon Content | Build challenges |

### Month 10-12: Scale (95 Posts)

| Week | Theme | Key Posts |
|------|-------|-----------|
| 37-40 | Enterprise Patterns | Multi-tenant, compliance |
| 41-44 | Global Deployment | i18n, regional optimization |
| 45-48 | Future of Voice AI | Vision pieces, research |
| 49-52 | Year in Review | Retrospectives, roadmap |

---

## Content Categories & Themes

### Category Taxonomy

```yaml
categories:
  tutorials:
    icon: "📚"
    color: "#10b981"  # emerald
    description: "Step-by-step guides"
    frequency: "weekly"

  deep-dives:
    icon: "🔬"
    color: "#8b5cf6"  # violet
    description: "Technical explorations"
    frequency: "weekly"

  changelog:
    icon: "🚀"
    color: "#f59e0b"  # amber
    description: "Platform updates"
    frequency: "weekly (automated)"

  case-studies:
    icon: "💼"
    color: "#06b6d4"  # cyan (primary accent)
    description: "Real-world implementations"
    frequency: "bi-weekly"

  community:
    icon: "👥"
    color: "#ec4899"  # pink
    description: "Developer spotlights"
    frequency: "weekly"

  quick-tips:
    icon: "⚡"
    color: "#38bdf8"  # sky (dev accent)
    description: "Code snippets & tips"
    frequency: "2x weekly"

  industry-insights:
    icon: "🌍"
    color: "#a855f7"  # purple
    description: "Voice AI trends"
    frequency: "weekly"

  api-updates:
    icon: "🔌"
    color: "#3b82f6"  # blue
    description: "API changes & deprecations"
    frequency: "as needed"
```

### Theme Calendar

| Month | Theme | Color Accent |
|-------|-------|--------------|
| January | New Beginnings / Getting Started | Cyan |
| February | Connection (Voice + Relationships) | Pink |
| March | Spring Cleaning (Code Quality) | Green |
| April | Testing & Reliability | Blue |
| May | Performance Week | Yellow |
| June | Mid-Year Review | Purple |
| July | Hackathon Season | Orange |
| August | Back to Basics | Teal |
| September | Enterprise Ready | Navy |
| October | Halloween (Debugging Horror Stories) | Orange |
| November | Gratitude (Community Highlights) | Amber |
| December | Year in Review | Gold |

---

## Automated Changelog Integration

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Release Tag  │───▶│ Changelog    │───▶│ Blog Post    │  │
│  │ (v1.2.3)     │    │ Generation   │    │ Creation     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  Parse git log       Gemini API           Create .md file   │
│  Categorize commits  Format for humans    Add to dev-blog/  │
│  Extract breaking    Add context          Generate images   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Enhanced Changelog Workflow

**File:** `.github/workflows/dev-blog-changelog.yml`

```yaml
name: Dev Blog Changelog

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to generate changelog for'
        required: true

jobs:
  generate-blog-post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate Changelog Blog Post
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          node scripts/generate-changelog-post.js \
            --version ${{ github.event.release.tag_name || github.event.inputs.version }} \
            --output apps/website/ferni-website/src/dev-blog/

      - name: Generate OG Image
        run: |
          node scripts/generate-og-image.js \
            --title "What's New in ${{ github.event.release.tag_name }}" \
            --category "changelog" \
            --output apps/website/ferni-website/images/dev-blog/

      - name: Commit & Push
        run: |
          git config user.name "Ferni Bot"
          git config user.email "bot@ferni.ai"
          git add apps/website/ferni-website/src/dev-blog/*.md
          git add apps/website/ferni-website/images/dev-blog/*.png
          git commit -m "docs: add changelog post for ${{ github.event.release.tag_name }}"
          git push
```

### Changelog Post Template

**File:** `scripts/templates/changelog-post.md.template`

```markdown
---
title: "What's New in Ferni {{version}}"
excerpt: "{{excerpt}}"
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: {{date}}
category: "Changelog"
image: "changelog-{{version_slug}}.png"
readTime: {{readTime}}
version: "{{version}}"
---

🚀 **Ferni {{version}}** is here! Here's everything new for developers.

## Highlights

{{highlights}}

## ✨ New Features

{{features}}

## 🔧 Improvements

{{improvements}}

## 🐛 Bug Fixes

{{bugfixes}}

## ⚠️ Breaking Changes

{{breaking}}

## 📚 Documentation Updates

{{docs}}

---

## Upgrade Guide

\`\`\`bash
# Update your SDK
npm install @ferni/sdk@{{version}}

# Or via pnpm
pnpm add @ferni/sdk@{{version}}
\`\`\`

## Full Changelog

See the complete [release notes on GitHub](https://github.com/ferni-ai/ferni/releases/tag/{{version}}).

---

**Questions?** Join our [Discord](https://discord.gg/ferni) or check the [documentation](https://developers.ferni.ai/docs).
```

---

## Image Generation System

### Image Style Guide

| Element | Specification |
|---------|---------------|
| **Background** | Dark navy gradient (#0f172a → #1e293b) |
| **Accent** | Cyan (#38bdf8) for highlights |
| **Grid** | Subtle dot grid pattern (10% opacity) |
| **Icons** | Geometric, line-style, consistent stroke width |
| **Typography** | Inter (headings), JetBrains Mono (code) |
| **Dimensions** | 1200×630 (OG), 800×420 (card), 400×300 (thumb) |

### Image Categories

```
┌─────────────────────────────────────────────────────────────┐
│                    IMAGE TEMPLATES                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  TUTORIAL   │  │  CHANGELOG  │  │  DEEP DIVE  │         │
│  │  Template   │  │  Template   │  │  Template   │         │
│  │             │  │             │  │             │         │
│  │ [Code icon] │  │ [Rocket]    │  │ [Microscope]│         │
│  │ + Title     │  │ + Version   │  │ + Title     │         │
│  │ + Category  │  │ + Date      │  │ + Tech      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ CASE STUDY  │  │  COMMUNITY  │  │  QUICK TIP  │         │
│  │  Template   │  │  Template   │  │  Template   │         │
│  │             │  │             │  │             │         │
│  │ [Company    │  │ [Avatar]    │  │ [Lightning] │         │
│  │  Logo area] │  │ + Name      │  │ + Snippet   │         │
│  │ + Quote     │  │ + Project   │  │ preview     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Image Generation Script

**File:** `scripts/generate-og-image.js`

```javascript
/**
 * Developer Blog OG Image Generator
 *
 * Uses:
 * - Sharp for image manipulation
 * - SVG templates for consistency
 * - Design tokens for colors
 */

const sharp = require('sharp');
const path = require('path');

const TEMPLATES = {
  tutorial: {
    icon: 'book-open',
    gradient: ['#0f172a', '#1e293b'],
    accent: '#10b981',
  },
  changelog: {
    icon: 'rocket',
    gradient: ['#0f172a', '#1e293b'],
    accent: '#f59e0b',
  },
  'deep-dive': {
    icon: 'microscope',
    gradient: ['#0f172a', '#1e293b'],
    accent: '#8b5cf6',
  },
  'case-study': {
    icon: 'building',
    gradient: ['#0f172a', '#1e293b'],
    accent: '#06b6d4',
  },
  community: {
    icon: 'users',
    gradient: ['#0f172a', '#1e293b'],
    accent: '#ec4899',
  },
  'quick-tip': {
    icon: 'zap',
    gradient: ['#0f172a', '#1e293b'],
    accent: '#38bdf8',
  },
};

async function generateOGImage({ title, category, version, output }) {
  const template = TEMPLATES[category] || TEMPLATES.tutorial;

  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${template.gradient[0]}"/>
          <stop offset="100%" style="stop-color:${template.gradient[1]}"/>
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="1" fill="white" opacity="0.1"/>
        </pattern>
      </defs>

      <!-- Background -->
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect width="1200" height="630" fill="url(#grid)"/>

      <!-- Accent line -->
      <rect x="60" y="60" width="6" height="100" fill="${template.accent}" rx="3"/>

      <!-- Category badge -->
      <rect x="90" y="60" width="auto" height="36" fill="${template.accent}" opacity="0.2" rx="18"/>
      <text x="110" y="85" font-family="Inter" font-size="16" font-weight="600" fill="${template.accent}">
        ${category.toUpperCase()}
      </text>

      <!-- Title -->
      <text x="60" y="220" font-family="Inter" font-size="56" font-weight="700" fill="white">
        ${title.length > 40 ? title.substring(0, 40) + '...' : title}
      </text>

      <!-- Version (if changelog) -->
      ${version ? `
        <text x="60" y="280" font-family="JetBrains Mono" font-size="24" fill="#94a3b8">
          ${version}
        </text>
      ` : ''}

      <!-- Ferni logo -->
      <g transform="translate(1040, 530)">
        <circle cx="50" cy="50" r="40" fill="${template.accent}" opacity="0.2"/>
        <!-- Luxo eyes -->
        <ellipse cx="40" cy="50" rx="8" ry="10" fill="white"/>
        <ellipse cx="60" cy="50" rx="8" ry="10" fill="white"/>
      </g>

      <!-- developers.ferni.ai -->
      <text x="60" y="580" font-family="Inter" font-size="20" fill="#64748b">
        developers.ferni.ai
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(output, `${slugify(title)}.png`));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

module.exports = { generateOGImage };
```

### AI Image Prompt Templates

For generating unique header images using DALL-E/Midjourney:

```yaml
# Template: Tutorial Images
prompt_template: |
  Abstract geometric visualization of {topic},
  dark navy background (#0f172a),
  glowing cyan accent lines (#38bdf8),
  isometric perspective,
  minimal, developer-focused,
  subtle dot grid pattern,
  no text, no logos,
  technical illustration style

# Template: Changelog Images
prompt_template: |
  Abstract representation of software evolution,
  version {version} release,
  dark gradient background,
  rocket or upward motion elements,
  amber accent color (#f59e0b),
  geometric shapes,
  clean, minimal, professional

# Template: Deep Dive Images
prompt_template: |
  Technical deep dive visualization of {topic},
  layers of abstraction shown as geometric planes,
  purple accent (#8b5cf6) highlights,
  dark background with subtle grid,
  code-like patterns,
  sophisticated, analytical mood

# Template: Case Study Images
prompt_template: |
  Abstract representation of {company_industry},
  success/growth visualization,
  teal/cyan accents (#06b6d4),
  professional, enterprise feel,
  geometric building blocks,
  dark background

# Template: Community Images
prompt_template: |
  Developer community visualization,
  connected nodes forming network,
  diverse, collaborative energy,
  pink accent (#ec4899),
  warm despite dark background,
  abstract human elements
```

---

## Brand Voice for Developers

### Tone Spectrum

```
More Human ←─────────────────────────────────────→ More Technical
    │                                                     │
    ▼                                                     ▼
Community Posts                                   API Docs
Case Studies                                      Changelogs
Quick Tips                                        Deep Dives
```

### Voice Guidelines

| Do | Don't |
|----|-------|
| "Here's how to..." | "The user shall..." |
| "You'll need..." | "It is required that..." |
| "Let's build..." | "One must construct..." |
| "Run this command" | "Execute the following command" |
| "If something breaks..." | "In the event of a failure..." |

### Ferni Developer Voice Traits

1. **Helpful Expert** - We know our stuff but don't show off
2. **Pragmatic** - Focus on what works, not theory
3. **Inclusive** - "We" not "you", welcoming to beginners
4. **Honest** - Acknowledge limitations and trade-offs
5. **Efficient** - Respect developers' time

### Writing Templates

**Tutorial Intro:**
```markdown
# Building {Feature} with Ferni

In this tutorial, we'll build a {description} in about {time} minutes.
You'll learn how to:

- {Learning objective 1}
- {Learning objective 2}
- {Learning objective 3}

**Prerequisites:** {list}

Let's get started.
```

**Changelog Intro:**
```markdown
🚀 **Ferni {version}** is here! This release focuses on {theme}.

**TL;DR:**
- {Highlight 1}
- {Highlight 2}
- {Highlight 3}

Here's everything new for developers.
```

**Deep Dive Intro:**
```markdown
# {Topic}: A Deep Dive

How does {thing} actually work under the hood? In this post,
we'll explore the architecture, trade-offs, and implementation
details of {thing}.

**Reading time:** {time} min | **Level:** {Intermediate/Advanced}
```

---

## SEO & Distribution Strategy

### SEO Checklist for Every Post

- [ ] Title < 60 characters
- [ ] Meta description 150-160 characters
- [ ] One H1 (the title)
- [ ] Descriptive H2s every ~300 words
- [ ] Alt text for all images
- [ ] Internal links to related posts
- [ ] External links to authoritative sources
- [ ] Code blocks with language tags
- [ ] Table of contents for long posts

### Keyword Strategy

**Primary Keywords (High Intent):**
- "voice AI API"
- "build voice assistant"
- "conversational AI platform"
- "voice AI SDK"

**Long-tail Keywords (Tutorial Focus):**
- "how to build voice AI with [language]"
- "voice AI webhook integration"
- "MCP server tutorial"
- "voice AI performance optimization"

### Distribution Channels

| Channel | Content Type | Frequency |
|---------|--------------|-----------|
| **Dev Blog** | Full posts | Daily |
| **Twitter/X** | Threads, tips | 2x daily |
| **LinkedIn** | Case studies, thought leadership | 3x weekly |
| **Discord** | Announcements, discussions | Real-time |
| **Hacker News** | Major releases, deep dives | Monthly |
| **Dev.to** | Cross-posted tutorials | Weekly |
| **Reddit** | r/MachineLearning, r/programming | Weekly |
| **YouTube** | Video tutorials | Bi-weekly |
| **Newsletter** | Weekly digest | Weekly |

### Newsletter Structure

**Weekly Developer Digest:**

```
Subject: 🔊 Ferni Dev Weekly: {Main Topic}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 THIS WEEK'S HIGHLIGHT
{Featured post with image}

📚 TUTORIALS
• {Tutorial 1}
• {Tutorial 2}

🔬 DEEP DIVE
{Deep dive summary}

⚡ QUICK TIPS
{3 code snippets}

📢 CHANGELOG
{Version updates}

👥 COMMUNITY SPOTLIGHT
{Featured project/developer}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Happy building,
The Ferni Team
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task | Owner | Status |
|------|-------|--------|
| Set up dev-blog directory structure | - | ⬜ |
| Create image generation scripts | - | ⬜ |
| Build changelog automation workflow | - | ⬜ |
| Design 6 image templates | - | ⬜ |
| Write first 14 posts (2 weeks buffer) | - | ⬜ |
| Set up newsletter (ConvertKit/Buttondown) | - | ⬜ |

### Phase 2: Automation (Week 3-4)

| Task | Owner | Status |
|------|-------|--------|
| GitHub Action for changelog posts | - | ⬜ |
| OG image auto-generation | - | ⬜ |
| Newsletter automation (weekly digest) | - | ⬜ |
| Social media scheduling (Buffer/Typefully) | - | ⬜ |
| RSS feed optimization | - | ⬜ |

### Phase 3: Scale (Week 5-8)

| Task | Owner | Status |
|------|-------|--------|
| Content calendar in Notion/Linear | - | ⬜ |
| Guest author workflow | - | ⬜ |
| Community submission process | - | ⬜ |
| Analytics dashboard (Plausible/PostHog) | - | ⬜ |
| A/B testing for headlines | - | ⬜ |

### Phase 4: Optimize (Ongoing)

| Task | Owner | Status |
|------|-------|--------|
| Monthly content performance review | - | ⬜ |
| SEO audit quarterly | - | ⬜ |
| Reader feedback integration | - | ⬜ |
| Content refresh schedule | - | ⬜ |

---

## Automation Scripts

### 1. Content Generation Script

**File:** `scripts/generate-blog-post.js`

```javascript
#!/usr/bin/env node
/**
 * Blog Post Generator
 *
 * Usage:
 *   node generate-blog-post.js --type tutorial --topic "MCP Servers"
 *   node generate-blog-post.js --type changelog --version v1.2.3
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

const PROMPTS = {
  tutorial: `Write a developer tutorial about {topic} for the Ferni AI voice platform.

Requirements:
- Start with a clear problem statement
- Include working code examples
- Use TypeScript/JavaScript
- Add troubleshooting section
- Keep it practical, not theoretical
- Target: intermediate developers
- Length: 1500-2000 words

Format as markdown with proper frontmatter.`,

  changelog: `Write a changelog blog post for Ferni {version}.

Commits since last release:
{commits}

Requirements:
- Lead with most exciting feature
- Group: ✨ New, 🔧 Improved, 🐛 Fixed
- Include code examples for new APIs
- Add upgrade instructions
- Mention breaking changes prominently
- Keep it scannable

Format as markdown with proper frontmatter.`,

  'deep-dive': `Write a technical deep dive about {topic} in Ferni.

Requirements:
- Explain the "why" behind design decisions
- Include architecture diagrams (as ASCII)
- Show before/after comparisons
- Discuss trade-offs honestly
- Target: advanced developers
- Length: 2500-3500 words

Format as markdown with proper frontmatter.`,
};

async function generatePost(type, options) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = PROMPTS[type]
    .replace('{topic}', options.topic || '')
    .replace('{version}', options.version || '')
    .replace('{commits}', options.commits || '');

  const result = await model.generateContent(prompt);
  const content = result.response.text();

  const slug = slugify(options.topic || options.version);
  const filename = `${new Date().toISOString().split('T')[0]}-${slug}.md`;
  const filepath = path.join(__dirname, '../apps/website/ferni-website/src/dev-blog', filename);

  await fs.writeFile(filepath, content);
  console.log(`Created: ${filepath}`);

  return filepath;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// CLI handling
const args = process.argv.slice(2);
const type = args[args.indexOf('--type') + 1];
const topic = args[args.indexOf('--topic') + 1];
const version = args[args.indexOf('--version') + 1];

generatePost(type, { topic, version });
```

### 2. Weekly Digest Generator

**File:** `scripts/generate-weekly-digest.js`

```javascript
#!/usr/bin/env node
/**
 * Weekly Digest Generator
 * Collects posts from the past week and generates newsletter content
 */

const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');

async function generateDigest() {
  const postsDir = path.join(__dirname, '../apps/website/ferni-website/src/dev-blog');
  const files = await fs.readdir(postsDir);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentPosts = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const content = await fs.readFile(path.join(postsDir, file), 'utf-8');
    const { data } = matter(content);

    if (new Date(data.date) >= oneWeekAgo) {
      recentPosts.push({
        title: data.title,
        excerpt: data.excerpt,
        category: data.category,
        url: `/developers/blog/${file.replace('.md', '')}/`,
        date: data.date,
      });
    }
  }

  // Group by category
  const grouped = recentPosts.reduce((acc, post) => {
    acc[post.category] = acc[post.category] || [];
    acc[post.category].push(post);
    return acc;
  }, {});

  // Generate newsletter markdown
  const digest = `
# Ferni Dev Weekly: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}

${Object.entries(grouped).map(([category, posts]) => `
## ${getCategoryEmoji(category)} ${category}

${posts.map(p => `- [${p.title}](https://developers.ferni.ai${p.url})`).join('\n')}
`).join('\n')}

---

Happy building,
The Ferni Team
  `;

  console.log(digest);
  return digest;
}

function getCategoryEmoji(category) {
  const emojis = {
    'Tutorials': '📚',
    'Changelog': '🚀',
    'Deep Dives': '🔬',
    'Case Studies': '💼',
    'Community': '👥',
    'Quick Tips': '⚡',
  };
  return emojis[category] || '📝';
}

generateDigest();
```

### 3. Image Batch Generator

**File:** `scripts/batch-generate-images.js`

```javascript
#!/usr/bin/env node
/**
 * Batch Image Generator
 * Generates OG images for all posts missing images
 */

const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const { generateOGImage } = require('./generate-og-image');

async function batchGenerate() {
  const postsDir = path.join(__dirname, '../apps/website/ferni-website/src/dev-blog');
  const imagesDir = path.join(__dirname, '../apps/website/ferni-website/images/dev-blog');

  const files = await fs.readdir(postsDir);
  const existingImages = new Set(await fs.readdir(imagesDir));

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const content = await fs.readFile(path.join(postsDir, file), 'utf-8');
    const { data } = matter(content);

    const expectedImage = data.image || `${file.replace('.md', '')}.png`;

    if (!existingImages.has(expectedImage)) {
      console.log(`Generating: ${expectedImage}`);

      await generateOGImage({
        title: data.title,
        category: data.category?.toLowerCase().replace(' ', '-') || 'tutorial',
        version: data.version,
        output: imagesDir,
      });
    }
  }

  console.log('Done!');
}

batchGenerate();
```

---

## Prompts Library

### Tutorial Prompt

```
You are a senior developer advocate at Ferni, an AI voice platform.
Write a tutorial about: {TOPIC}

VOICE:
- Friendly but expert
- "We" and "you" (inclusive)
- Practical, not theoretical
- Acknowledge trade-offs

STRUCTURE:
1. What we're building (2 sentences)
2. Prerequisites (bullet list)
3. Step 1: Setup (with code)
4. Step 2-N: Implementation (with code)
5. Testing it works
6. Common issues & fixes
7. Next steps

CODE STYLE:
- TypeScript preferred
- Full working examples
- Comments explaining "why"
- Error handling included

LENGTH: 1500-2000 words
```

### Changelog Prompt

```
You are Ferni, writing release notes for developers.
Version: {VERSION}
Commits: {COMMITS}

RULES:
1. Lead with most exciting feature
2. Group by: ✨ New, 🔧 Improved, 🐛 Fixed
3. Use simple language (not jargon)
4. Include code snippets for new APIs
5. Highlight breaking changes with ⚠️
6. Add upgrade instructions

VOICE:
- Celebratory but professional
- Focus on developer benefits
- Acknowledge community contributions

LENGTH: 500-1000 words
```

### Deep Dive Prompt

```
You are a senior engineer at Ferni explaining complex systems.
Topic: {TOPIC}

STRUCTURE:
1. The Problem (why this exists)
2. Design Goals (what we optimized for)
3. Architecture (with ASCII diagram)
4. Implementation Details
5. Trade-offs & Alternatives Considered
6. Performance Characteristics
7. Future Improvements

VOICE:
- Technical but accessible
- Honest about limitations
- Show your thinking process

LENGTH: 2500-3500 words
```

### Case Study Prompt

```
Write a developer case study for: {COMPANY}

STRUCTURE:
1. Company context (1 paragraph)
2. The challenge (what they needed)
3. Why Ferni (decision criteria)
4. Implementation journey (with timeline)
5. Technical architecture (brief)
6. Results (metrics if available)
7. Developer quote (fabricate if needed, mark as example)
8. Key learnings

VOICE:
- Professional but warm
- Focus on technical decisions
- Celebrate the developer

LENGTH: 1000-1500 words
```

### Quick Tip Prompt

```
Write a developer quick tip about: {TOPIC}

FORMAT:
- Title: "{Actionable Verb} + {Specific Thing}"
- Problem (1-2 sentences)
- Solution (code snippet)
- Why it works (1-2 sentences)
- Pro tip (optional bonus)

VOICE:
- Punchy and direct
- No fluff
- Immediately actionable

LENGTH: 200-400 words
```

---

## Appendix: First 30 Posts

| # | Date | Title | Category | Status |
|---|------|-------|----------|--------|
| 1 | Week 1 | Getting Started with Ferni in 5 Minutes | Tutorial | ⬜ |
| 2 | Week 1 | Understanding MCP Servers | Tutorial | ⬜ |
| 3 | Week 1 | What's New in v2.0 | Changelog | ⬜ |
| 4 | Week 1 | Building Your First Voice Workflow | Tutorial | ⬜ |
| 5 | Week 1 | Webhook Security Best Practices | Deep Dive | ⬜ |
| 6 | Week 1 | 5 Code Snippets Every Ferni Dev Needs | Quick Tips | ⬜ |
| 7 | Week 1 | The Future of Voice AI Interfaces | Industry | ⬜ |
| 8 | Week 2 | Authentication Deep Dive: OAuth, API Keys, JWTs | Deep Dive | ⬜ |
| 9 | Week 2 | Building a Customer Support Bot | Tutorial | ⬜ |
| 10 | Week 2 | Changelog: Performance Improvements | Changelog | ⬜ |
| 11 | Week 2 | How {Company} Built Voice AI | Case Study | ⬜ |
| 12 | Week 2 | Error Handling Patterns | Quick Tips | ⬜ |
| 13 | Week 2 | Voice AI vs Chatbots: A Developer's Perspective | Industry | ⬜ |
| 14 | Week 2 | Week 3 Preview: Testing & Reliability | Roadmap | ⬜ |
| 15 | Week 3 | Unit Testing Voice Agents | Tutorial | ⬜ |
| 16 | Week 3 | Integration Testing with Mock Voices | Tutorial | ⬜ |
| 17 | Week 3 | Changelog: Testing Framework Updates | Changelog | ⬜ |
| 18 | Week 3 | E2E Testing Voice Flows | Tutorial | ⬜ |
| 19 | Week 3 | Debugging Voice AI: A Complete Guide | Deep Dive | ⬜ |
| 20 | Week 3 | Testing Quick Tips | Quick Tips | ⬜ |
| 21 | Week 3 | Why Voice-First is the Next Mobile-First | Industry | ⬜ |
| 22 | Week 4 | Deploying to Production: Checklist | Tutorial | ⬜ |
| 23 | Week 4 | Monitoring & Observability | Deep Dive | ⬜ |
| 24 | Week 4 | Changelog: Monitoring Dashboard | Changelog | ⬜ |
| 25 | Week 4 | Scaling to 1M Conversations | Deep Dive | ⬜ |
| 26 | Week 4 | Production Debugging Tips | Quick Tips | ⬜ |
| 27 | Week 4 | Developer Spotlight: {Community Member} | Community | ⬜ |
| 28 | Week 4 | Month 1 Recap & What's Coming | Roadmap | ⬜ |
| 29 | Week 5 | Building Salesforce Integration | Tutorial | ⬜ |
| 30 | Week 5 | Slack Bot with Voice AI | Tutorial | ⬜ |

---

## Success Metrics

### Content KPIs

| Metric | Week 4 | Month 3 | Month 6 | Month 12 |
|--------|--------|---------|---------|----------|
| Total Posts | 28 | 90 | 180 | 365 |
| Unique Visitors | 1,000 | 10,000 | 50,000 | 150,000 |
| Avg. Time on Page | 2 min | 3 min | 4 min | 5 min |
| Newsletter Subscribers | 100 | 1,000 | 5,000 | 15,000 |
| Developer Signups (from blog) | 50 | 500 | 2,000 | 10,000 |

### Engagement KPIs

| Metric | Target |
|--------|--------|
| Comments per post | 5+ |
| Social shares per post | 20+ |
| Backlinks per month | 10+ |
| Community contributions | 2/month |

---

*Last updated: January 2026*
*Document owner: Developer Experience Team*
