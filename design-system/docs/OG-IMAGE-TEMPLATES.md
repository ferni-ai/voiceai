# 🖼️ Social OG Image Templates

> **Templates for generating consistent, beautiful Open Graph images across all Ferni properties.**

**Version**: 1.0.0  
**Created**: January 2026  
**Status**: Planning

---

## Overview

Open Graph (OG) images appear when Ferni links are shared on social media. Every OG image should:

1. **Be instantly recognizable** as Ferni
2. **Communicate the content** clearly
3. **Look beautiful** at any size
4. **Be consistent** across all pages

### Technical Requirements

| Platform | Size | Aspect Ratio |
|----------|------|--------------|
| Facebook/LinkedIn | 1200x630 | 1.91:1 |
| Twitter (large) | 1200x600 | 2:1 |
| Twitter (square) | 1200x1200 | 1:1 |
| WhatsApp | 300x200 (thumbnail) | 1.5:1 |

**Primary format**: 1200x630 (works everywhere)

---

## Template System

### Template 1: Default / Hero

**Use for**: Homepage, main landing pages

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Paper Cream Background (#F5F1E8)                           │
│                                                             │
│                    ╭───────────╮                            │
│                   │            │                            │
│                   │   ⌒  ⌒    │   ← Ferni Avatar           │
│                   │            │      (centered)            │
│                    ╰───────────╯                            │
│                                                             │
│                    Ferni                                    │
│              Finally, someone who                           │
│               actually listens.                             │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ferni.ai                                      [Logo Mark]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Elements**:
- Background: Paper Cream (#F5F1E8)
- Avatar: 200px, centered
- Title: Plus Jakarta Sans, 64px, Natural Ink
- Tagline: Inter, 32px, Secondary
- Footer bar: subtle with URL and logomark

### Template 2: Documentation Page

**Use for**: design.ferni.ai pages

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Gradient Background (Paper Cream → slight sage tint)       │
│                                                             │
│  FERNI DESIGN SYSTEM                                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │            [Component Preview]                        │  │
│  │                                                       │  │
│  │                 Avatar                                │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  The Avatar component brings Ferni to life                  │
│  with Pixar-quality animation.                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  design.ferni.ai/components/avatar            [Logo Mark]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Elements**:
- Eyebrow: "FERNI DESIGN SYSTEM"
- Preview area: Visual representation of the component
- Title: Component/page name
- Description: One-line description
- URL in footer

### Template 3: Persona Feature

**Use for**: Persona-specific pages

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Persona Color] gradient background                        │
│                                                             │
│                                                             │
│       ╭───────────╮                                         │
│      │            │                                         │
│      │   ⌒  ⌒    │   ← Persona Avatar                      │
│      │            │      with glow                          │
│       ╰───────────╯                                         │
│                                                             │
│                        Peter                                │
│                   The Researcher                            │
│                                                             │
│        "Data-driven insights with heart"                    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ferni.ai                                      [Logo Mark]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Elements**:
- Background: Gradient using persona's color
- Avatar: Large, with persona-specific glow
- Name: Large, centered
- Role: Secondary, below name
- Quote or tagline

### Template 4: Blog Post / Announcement

**Use for**: Blog posts, changelogs, announcements

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │                                      │                   │
│  │     [Optional: Relevant Image]       │   Paper Cream     │
│  │                                      │   right side      │
│  │                                      │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│                          Introducing Ferni EQ               │
│                                                             │
│                          Superhuman emotional               │
│                          intelligence in every              │
│                          interaction.                       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  January 15, 2026 • 5 min read           ferni.ai [Logo]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Elements**:
- Optional image area (left 60%)
- Title: Plus Jakarta Sans, 48px
- Description: 2-3 lines max
- Date and read time in footer

### Template 5: Error / 404

**Use for**: Error pages (just in case they get shared)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Paper Cream Background                                     │
│                                                             │
│                                                             │
│                    ╭───────────╮                            │
│                   │            │                            │
│                   │   ?  ?     │   ← Confused expression    │
│                   │            │                            │
│                    ╰───────────╯                            │
│                                                             │
│                                                             │
│               Hmm, this page wandered off.                  │
│                                                             │
│                  Let's find our way back.                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ferni.ai                                      [Logo Mark]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Template 6: Celebration / Milestone

**Use for**: Major announcements, milestones

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Gradient background with subtle confetti                   │
│                                                             │
│              🎉                      🎊                      │
│                                                             │
│                    ╭───────────╮                            │
│                   │            │                            │
│                   │   ◠  ◠     │   ← Celebrating expression │
│                   │            │                            │
│                    ╰───────────╯                            │
│                                                             │
│           ✨                               ✨                │
│                                                             │
│              Ferni is now available!                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ferni.ai                                      [Logo Mark]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Specifications

### Colors

| Element | Color | Notes |
|---------|-------|-------|
| Background | #F5F1E8 | Paper Cream |
| Primary Text | #2C2520 | Natural Ink |
| Secondary Text | #5C544A | Secondary |
| Accent | #4a6741 | Ferni Sage |
| Footer Bar | rgba(44,37,32,0.05) | Subtle |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Eyebrow | Inter | 18px | 600 |
| Title | Plus Jakarta Sans | 48-64px | 700 |
| Description | Inter | 24-28px | 400 |
| Footer | Inter | 16px | 500 |

### Spacing

| Element | Value |
|---------|-------|
| Edge padding | 48px |
| Title to description | 16px |
| Footer height | 64px |
| Avatar size | 150-200px |

---

## Generation Script

### Using Satori + Sharp

```javascript
import satori from 'satori';
import sharp from 'sharp';
import fs from 'fs';

const fonts = [
  {
    name: 'Plus Jakarta Sans',
    data: fs.readFileSync('fonts/PlusJakartaSans-Bold.ttf'),
    weight: 700,
  },
  {
    name: 'Inter',
    data: fs.readFileSync('fonts/Inter-Regular.ttf'),
    weight: 400,
  },
];

async function generateOGImage(options) {
  const { 
    template = 'default',
    title,
    description,
    persona,
    url,
  } = options;

  const svg = await satori(
    <OGTemplate 
      template={template}
      title={title}
      description={description}
      persona={persona}
      url={url}
    />,
    {
      width: 1200,
      height: 630,
      fonts,
    }
  );

  const png = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return png;
}

// React component for templates
function OGTemplate({ template, title, description, persona, url }) {
  switch (template) {
    case 'default':
      return <DefaultTemplate title={title} description={description} />;
    case 'docs':
      return <DocsTemplate title={title} description={description} url={url} />;
    case 'persona':
      return <PersonaTemplate persona={persona} />;
    case 'blog':
      return <BlogTemplate title={title} description={description} />;
    default:
      return <DefaultTemplate title={title} description={description} />;
  }
}
```

### CLI Command

```bash
# Generate OG image for a page
ferni og generate \
  --template docs \
  --title "Avatar Component" \
  --description "Animated persona representation" \
  --output og-avatar.png

# Batch generate for all pages
ferni og generate-all --config og-config.json
```

### Configuration File

```json
{
  "pages": [
    {
      "url": "/",
      "template": "default",
      "output": "og-home.png"
    },
    {
      "url": "/components/avatar",
      "template": "docs",
      "title": "Avatar",
      "description": "Animated persona representation",
      "output": "og-avatar.png"
    },
    {
      "url": "/personas/peter",
      "template": "persona",
      "persona": "peter",
      "output": "og-peter.png"
    }
  ]
}
```

---

## Figma Templates

### Template Library

Create a Figma file with:
1. All template variants as components
2. Variables for title, description, persona
3. Export presets for 1200x630

### Usage

1. Duplicate template
2. Update text layers
3. Export as PNG
4. Upload to `/public/og/`

---

## Implementation

### HTML Meta Tags

```html
<!-- Primary Meta Tags -->
<meta name="title" content="Ferni - Finally, someone who actually listens">
<meta name="description" content="AI coaching that remembers, understands, and grows with you.">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://ferni.ai/">
<meta property="og:title" content="Ferni - Finally, someone who actually listens">
<meta property="og:description" content="AI coaching that remembers, understands, and grows with you.">
<meta property="og:image" content="https://ferni.ai/og/home.png">

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="https://ferni.ai/">
<meta property="twitter:title" content="Ferni - Finally, someone who actually listens">
<meta property="twitter:description" content="AI coaching that remembers, understands, and grows with you.">
<meta property="twitter:image" content="https://ferni.ai/og/home.png">
```

### Dynamic Generation (API Route)

For pages with dynamic content:

```typescript
// /api/og/[slug].ts
import { generateOGImage } from '@/lib/og';

export default async function handler(req, res) {
  const { slug } = req.query;
  const page = await getPageData(slug);
  
  const image = await generateOGImage({
    template: page.ogTemplate,
    title: page.title,
    description: page.description,
  });
  
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(image);
}
```

---

## Quality Checklist

### Before Publishing

- [ ] Image is exactly 1200x630
- [ ] Text is readable at 50% scale
- [ ] Brand colors are correct
- [ ] No spelling errors
- [ ] Logo is present
- [ ] URL is correct
- [ ] File size < 500KB

### Testing

1. Test with Facebook Debugger: https://developers.facebook.com/tools/debug/
2. Test with Twitter Card Validator: https://cards-dev.twitter.com/validator
3. Test with LinkedIn Inspector: https://www.linkedin.com/post-inspector/

---

## File Organization

```
public/
└── og/
    ├── home.png                    # Homepage
    ├── design-system.png           # Design system landing
    ├── components/
    │   ├── avatar.png
    │   ├── button.png
    │   ├── toast.png
    │   └── ...
    ├── personas/
    │   ├── ferni.png
    │   ├── peter.png
    │   ├── alex.png
    │   └── ...
    └── blog/
        ├── introducing-ferni-eq.png
        └── ...
```

---

**© 2026 Ferni. Every share is a first impression.**

*"Your OG image is the cover of your book. Make it count."*
