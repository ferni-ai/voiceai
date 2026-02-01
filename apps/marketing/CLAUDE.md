# Marketing Assets

Content automation, app store assets, and marketing materials for Ferni.

## Purpose

Central location for all marketing collateral - app store descriptions, blog posts, social images, screenshots, and content automation scripts.

## Structure

```
apps/marketing/
├── assets/                     # Generated image assets
│   ├── app-stores/             # App store icons
│   ├── social/                 # Social media profile images
│   └── web/                    # Web assets (favicon, OG, cards)
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
├── site/                       # Static marketing site
│   ├── blog/                   # HTML blog posts
│   ├── css/                    # Marketing CSS
│   └── screenshots/            # Screenshot generator
│
└── config/                     # Configuration
    ├── CALENDAR.md
    └── schedule.json
```

## Scripts

```bash
# Generate social posts from blog content
npx ts-node scripts/generate-social-posts.ts

# Generate content calendar
npx ts-node scripts/content-calendar.ts

# Schedule to Buffer
npx ts-node scripts/schedule-buffer.ts
```

## Blog Posts (10 complete)

1. Why We Let AI Help Build Ferni
2. How AI Helped Design Its Own Brain
3. Giving AI a Personality
4. Daily Standup with AI
5. How Ferni Remembers You
6. We Ship Every Day
7. AI Should Make You Feel Less Alone
8. What's Next for Ferni
9. The Loneliness Gap
10. Stories from the 2AM Hour

## Related Resources

| Resource | Location |
|----------|----------|
| Design tokens | `design-system/tokens/` |
| Logo assets | `design-system/assets/logos/` |
| Social templates | `design-system/assets/social/` |
| Brand guidelines | `design-system/docs/brand/` |
| Landing pages | `brand/marketing/` |

## Priority Actions

1. Generate screenshots for all app store sizes
2. Adapt 9 remaining blog posts to social content
3. Create feature graphic (1024x500) for Play Store
4. Record app preview video using script

## Documentation

- `MARKETING_ASSETS.md` - Complete asset checklist
- `LAUNCH-CHECKLIST.md` - Launch preparation
- `CONTENT-AUTOMATION.md` - Automation setup
- `STORYTELLING-STRATEGY.md` - Content strategy
- `AI-IMAGE-WORKFLOW.md` - Image generation workflow
- `PLATFORM-ASSET-SPECS.md` - Platform requirements
