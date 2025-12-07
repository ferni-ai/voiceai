# Ferni Website Build Refactor Plan

## 🚨 Current Problems

### Duplication Audit
| Issue | Impact |
|-------|--------|
| **1,900+ lines** of duplicate inline CSS | 5 files have their own `:root {}` blocks |
| **Header/footer** copied in every page | 5+ duplicate nav structures |
| **Design tokens** not shared everywhere | Some pages use `design-tokens.css`, others inline |
| **No templating** | Every page is standalone HTML |
| **Hardcoded values** | Colors, fonts scattered throughout |

### Files with Inline CSS (Bloat)
```
developers/index.html:        596 lines
platform.html:                358 lines
developers/api.html:          331 lines
developers/getting-started.html: 305 lines
developers/testing.html:      304 lines
─────────────────────────────────────
Total duplicate CSS:          ~1,894 lines
```

---

## ✅ Proposed Solution: Eleventy (11ty)

**Why Eleventy?**
- Simple, fast static site generator
- Nunjucks templates for partials
- Markdown support for blog posts
- Zero client-side JS
- Perfect for marketing sites
- Used by Google, CERN, Netlify

---

## 📁 New Directory Structure

```
promo/ferni-website/
├── package.json              # Build dependencies
├── .eleventy.js              # Eleventy config
├── src/
│   ├── _data/
│   │   └── site.json         # Global site data (name, url, etc.)
│   ├── _includes/
│   │   ├── layouts/
│   │   │   ├── base.njk      # Base HTML template
│   │   │   ├── page.njk      # Standard page layout
│   │   │   ├── docs.njk      # Developer docs layout
│   │   │   └── blog.njk      # Blog post layout
│   │   └── partials/
│   │       ├── header.njk    # Shared header/nav
│   │       ├── footer.njk    # Shared footer
│   │       ├── head.njk      # <head> with meta, fonts, CSS
│   │       └── dev-nav.njk   # Developer docs sidebar
│   ├── css/
│   │   ├── tokens.css        # Single source of truth
│   │   ├── base.css          # Reset, typography
│   │   ├── components.css    # Buttons, cards, forms
│   │   ├── layouts.css       # Header, footer, grids
│   │   ├── docs.css          # Developer docs styles
│   │   └── utilities.css     # Spacing, text helpers
│   ├── pages/
│   │   ├── index.njk         # Homepage
│   │   ├── platform.njk      # Platform page
│   │   ├── pricing.njk       # Pricing page
│   │   ├── press.njk         # Press kit
│   │   └── ...
│   ├── developers/
│   │   ├── index.md          # Docs home
│   │   ├── getting-started.md
│   │   ├── api.md
│   │   └── testing.md
│   ├── blog/
│   │   ├── blog.json         # Blog collection config
│   │   └── *.md              # Blog posts in Markdown
│   └── images/
│       └── ...               # Static assets
└── _site/                    # Build output (gitignored)
```

---

## 🎨 Single Source of Truth: Design Tokens

### `src/css/tokens.css`
```css
:root {
  /* ===========================================
     FERNI DESIGN TOKENS - SINGLE SOURCE
     =========================================== */
  
  /* Colors - Background */
  --color-bg-primary: #F5F1E8;
  --color-bg-secondary: #E8E0D5;
  --color-bg-elevated: #FFFDFB;
  --color-bg-dark: #2C2520;
  
  /* Colors - Text */
  --color-text-primary: #2C2520;
  --color-text-secondary: #5C544A;
  --color-text-muted: #756A5E;
  --color-text-inverse: #F5F1E8;
  
  /* Colors - Accent */
  --color-accent: #3D5A45;
  --color-accent-hover: #4a6d52;
  --color-highlight: #C4A265;
  
  /* Typography */
  --font-display: 'Plus Jakarta Sans', -apple-system, sans-serif;
  --font-body: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  
  /* Spacing Scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;
  
  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(44, 37, 32, 0.04);
  --shadow-md: 0 4px 12px rgba(44, 37, 32, 0.08);
  --shadow-lg: 0 8px 24px rgba(44, 37, 32, 0.12);
}
```

---

## 🧩 Shared Partials

### `src/_includes/partials/header.njk`
```njk
<header class="header">
  <div class="container header-inner">
    <a href="/" class="logo">
      <div class="logo-icon">FN</div>
      <span>Ferni</span>
      {% if badge %}<span class="logo-badge">{{ badge }}</span>{% endif %}
    </a>
    <nav class="nav">
      {% for item in navigation %}
        <a href="{{ item.url }}" {% if item.url == page.url %}class="active"{% endif %}>
          {{ item.title }}
        </a>
      {% endfor %}
    </nav>
  </div>
</header>
```

### `src/_includes/partials/footer.njk`
```njk
<footer class="footer">
  <div class="container footer-inner">
    <a href="/" class="logo">
      <div class="logo-icon">FN</div>
      <span>Ferni</span>
    </a>
    <div class="footer-links">
      <div class="footer-column">
        <h4>Product</h4>
        <a href="/features">Features</a>
        <a href="/team">Meet the Team</a>
        <a href="/pricing">Pricing</a>
      </div>
      <div class="footer-column">
        <h4>Developers</h4>
        <a href="/developers/">Documentation</a>
        <a href="/developers/api">API Reference</a>
        <a href="/platform">Platform</a>
      </div>
      <div class="footer-column">
        <h4>Company</h4>
        <a href="/press">Press Kit</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <p>© {{ site.year }} Ferni. All rights reserved.</p>
  </div>
</footer>
```

---

## 📝 Page Example

### `src/pages/platform.njk`
```njk
---
layout: layouts/page.njk
title: Platform
description: Build custom AI voice agents with Ferni's open platform.
---

<section class="hero">
  <div class="container">
    <div class="hero-eyebrow">🚀 Now Open Source</div>
    <h1>One Platform.<br><span class="accent">Two Paths.</span></h1>
    <p class="hero-subtitle">Experience Ferni as your AI life coach, or build your own voice agents.</p>
    <div class="hero-ctas">
      <a href="https://app.ferni.ai" class="btn btn-primary">Try Ferni Free →</a>
      <a href="/developers/" class="btn btn-secondary">Start Building</a>
    </div>
  </div>
</section>

{# Rest of page content #}
```

---

## 📚 Developer Docs in Markdown

### `src/developers/getting-started.md`
```markdown
---
layout: layouts/docs.njk
title: Getting Started
description: Build your first AI voice agent in 5 minutes
order: 1
---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** — [Download here](https://nodejs.org)
- **npm or pnpm** — Comes with Node.js
- **OpenAI API Key** — [Get one here](https://platform.openai.com)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/ferni-ai/ferni-agents.git
cd ferni-agents
```

### 2. Install dependencies

```bash
npm install
```

{# Markdown content continues... #}
```

---

## ⚙️ Build Configuration

### `package.json`
```json
{
  "name": "ferni-website",
  "scripts": {
    "dev": "eleventy --serve",
    "build": "eleventy",
    "clean": "rm -rf _site"
  },
  "devDependencies": {
    "@11ty/eleventy": "^2.0.1",
    "@11ty/eleventy-plugin-syntaxhighlight": "^5.0.0"
  }
}
```

### `.eleventy.js`
```javascript
module.exports = function(eleventyConfig) {
  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/js");
  
  // Syntax highlighting for code blocks
  eleventyConfig.addPlugin(require("@11ty/eleventy-plugin-syntaxhighlight"));
  
  // Add current year to global data
  eleventyConfig.addGlobalData("site", {
    name: "Ferni",
    url: "https://ferni.ai",
    year: new Date().getFullYear()
  });
  
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
```

---

## 📊 Before/After Comparison

| Metric | Before | After |
|--------|--------|-------|
| **Total HTML lines** | 10,845 | ~2,000 (templates + content) |
| **Duplicate CSS** | 1,894 lines | 0 (single tokens.css) |
| **Design tokens** | 8 copies | 1 source of truth |
| **Header/footer** | 5+ copies | 2 partials |
| **Blog posts** | HTML files | Markdown files |
| **Build time** | N/A | ~200ms |

---

## 🚀 Migration Steps

### Phase 1: Setup (30 min)
1. [ ] Install Eleventy: `npm init -y && npm i -D @11ty/eleventy`
2. [ ] Create directory structure
3. [ ] Setup `.eleventy.js` config
4. [ ] Create base layout template

### Phase 2: Extract Shared Code (1 hour)
1. [ ] Consolidate CSS into single `tokens.css`
2. [ ] Create `header.njk` partial
3. [ ] Create `footer.njk` partial
4. [ ] Create `head.njk` (meta, fonts, CSS links)

### Phase 3: Convert Pages (2 hours)
1. [ ] Convert `index.html` → `index.njk`
2. [ ] Convert `platform.html` → `platform.njk`
3. [ ] Convert `pricing.html` → `pricing.njk`
4. [ ] Convert developer docs → Markdown files
5. [ ] Convert press, contact, etc.

### Phase 4: Cleanup (30 min)
1. [ ] Delete old HTML files
2. [ ] Update build/deploy scripts
3. [ ] Test all pages
4. [ ] Verify no hardcoded values remain

---

## ✅ Quality Gates

Before deploying, verify:

- [ ] `npm run build` succeeds
- [ ] All pages render correctly
- [ ] No duplicate CSS in source
- [ ] All colors use `var(--color-*)` tokens
- [ ] All spacing uses `var(--space-*)` tokens
- [ ] Header/footer partials used everywhere
- [ ] No hardcoded brand values

---

## 🎯 Benefits After Refactor

1. **Single source of truth** for design tokens
2. **~80% reduction** in total code
3. **Easy updates** - change header once, updates everywhere
4. **Blog posts in Markdown** - non-developers can contribute
5. **Fast builds** - 200ms full rebuild
6. **No duplication** - DRY principle enforced
7. **Type-safe** - Nunjucks catches missing variables

---

*Ready to proceed? Run `npm init -y && npm i -D @11ty/eleventy` to start.*

