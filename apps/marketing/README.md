# Ferni Marketing Assets

> Content automation, app store assets, and marketing materials.

## Quick Reference

| Folder | Purpose | Status |
|--------|---------|--------|
| `copy/` | App store descriptions, blog posts | 10 blog posts ready |
| `social/` | Generated social images (JPG) | 4 platform images |
| `screenshots/` | App store screenshots by device | Empty - need generation |
| `graphics/` | Feature graphics, press kit | Empty - need generation |
| `videos/` | App preview scripts | Script ready |
| `content/` | Social post JSON content | 1 post adapted |
| `scripts/` | Content automation scripts | TypeScript ready |
| `config/` | Publishing schedule | JSON ready |

## Folder Structure

```
apps/marketing/
├── copy/                       # Marketing copy
│   ├── app-store-description.md
│   ├── play-store-description.md
│   ├── blog-posts/            # 10 blog posts ready
│   └── BUILDING-WITH-AI-BLOG-SERIES.md
│
├── screenshots/                # App store screenshots (to generate)
│   ├── ios-6.7/               # iPhone 14 Pro Max
│   ├── ios-6.5/               # iPhone 13 Pro Max
│   ├── ios-5.5/               # iPhone 8 Plus
│   ├── ipad-12.9/             # iPad Pro
│   ├── android-phone/
│   ├── android-tablet/
│   ├── macos/
│   └── windows/
│
├── social/                     # Social media images
│   ├── facebook-share-1200x630.jpg
│   ├── instagram-square-1080.jpg
│   ├── twitter-card-1200x628.jpg
│   └── linkedin-banner-1584x396.jpg
│
├── graphics/                   # Feature graphics
│   └── press-kit/             # Press materials
│
├── videos/                     # Video assets
│   └── APP-PREVIEW-SCRIPT.md
│
├── content/                    # Social content automation
│   └── social/                # Platform-specific JSON
│
├── scripts/                    # Automation scripts
│   ├── generate-social-posts.ts
│   ├── content-calendar.ts
│   └── schedule-buffer.ts
│
├── config/                     # Configuration
│   ├── CALENDAR.md
│   └── schedule.json
│
└── [docs]                      # Strategy documents
    ├── MARKETING_ASSETS.md     # Complete asset checklist
    ├── LAUNCH-CHECKLIST.md
    ├── CONTENT-AUTOMATION.md
    ├── STORYTELLING-STRATEGY.md
    ├── AI-IMAGE-WORKFLOW.md
    ├── PLATFORM-ASSET-SPECS.md
    └── AUTO-PUBLISHING-SETUP.md
```

## Content Status

### Blog Posts (10 complete)

| # | Title | Social Adapted |
|---|-------|----------------|
| 01 | Why We Let AI Help Build Ferni | ✅ Yes |
| 02 | How AI Helped Design Its Own Brain | ❌ |
| 03 | Giving AI a Personality | ❌ |
| 04 | Daily Standup with AI | ❌ |
| 05 | How Ferni Remembers You | ❌ |
| 06 | We Ship Every Day | ❌ |
| 07 | AI Should Make You Feel Less Alone | ❌ |
| 08 | What's Next for Ferni | ❌ |
| 09 | The Loneliness Gap | ❌ |
| 10 | Stories from the 2AM Hour | ❌ |

### Social Images (4 generated)

| Platform | Size | File |
|----------|------|------|
| Facebook | 1200x630 | `social/facebook-share-1200x630.jpg` |
| Instagram | 1080x1080 | `social/instagram-square-1080.jpg` |
| Twitter | 1200x628 | `social/twitter-card-1200x628.jpg` |
| LinkedIn | 1584x396 | `social/linkedin-banner-1584x396.jpg` |

## Related Resources

| Resource | Location |
|----------|----------|
| Design tokens | `design-system/tokens/` |
| Logo assets | `design-system/assets/logos/` |
| Social templates (SVG) | `design-system/assets/social/` |
| Brand guidelines | `design-system/docs/brand/` |
| Landing pages | `brand/marketing/` |

## Scripts

```bash
# Generate social posts from blog content
npx ts-node scripts/generate-social-posts.ts

# Generate content calendar
npx ts-node scripts/content-calendar.ts

# Schedule to Buffer
npx ts-node scripts/schedule-buffer.ts
```

## Priority Actions

1. **Generate screenshots** for all app store sizes
2. **Adapt 9 remaining blog posts** to social content
3. **Create feature graphic** (1024x500) for Play Store
4. **Record app preview video** using script

---

*See `MARKETING_ASSETS.md` for complete asset checklist.*
