# Ferni Social Media Assets Guide

## Brand Colors (Use These Everywhere)

- **Primary (Sage Green):** #4a6741
- **Background (Paper Cream):** #F5F1E8
- **Text (Natural Ink):** #2C2520
- **Accent (Golden Hour):** #C4A265

---

## Profile Pictures (All Platforms)

### Specifications

| Platform  | Size      | Format  |
| --------- | --------- | ------- |
| Twitter/X | 400x400px | PNG/JPG |
| LinkedIn  | 400x400px | PNG/JPG |
| Instagram | 320x320px | PNG/JPG |
| TikTok    | 200x200px | PNG/JPG |
| YouTube   | 800x800px | PNG/JPG |

### Design

- Sage green background (#4a6741)
- White "FE" monogram centered
- Rounded corners (platform handles this)

### Generation Prompt (for Imagen/DALL-E)

```
Minimalist logo mark on sage green background (#4a6741). White letters "FE" in a modern sans-serif font (Plus Jakarta Sans style), centered. Clean, professional, Apple-inspired simplicity. Square format, solid background, no gradients.
```

---

## Banner/Header Images

### Twitter/X Header

- **Size:** 1500x500px
- **Design:** Paper cream background, subtle sage green gradient on right, "Your personal AI life coach" tagline

### LinkedIn Banner

- **Size:** 1584x396px
- **Design:** Same as Twitter, adjusted for dimensions

### YouTube Banner

- **Size:** 2560x1440px (safe area: 1546x423px center)
- **Design:** Centered content with tagline and website

### Generation Prompt

```
Minimalist banner design on warm paper cream background (#F5F1E8). Subtle sage green (#4a6741) gradient wave on the right side. Text "Your personal AI life coach" in dark brown (#2C2520), modern sans-serif. Clean, professional, Apple-inspired. Wide landscape format.
```

---

## Post Templates

### Quote Posts (1080x1080px - Instagram/LinkedIn)

- Paper cream background
- Sage green accent bar on left
- Quote text in Plus Jakarta Sans
- "— Ferni" attribution

### Feature Highlight (1080x1350px - Instagram)

- Dark section at top with feature name
- Light section with description
- Sage green CTA button mockup

### Team Introduction (1080x1080px)

- Team member color as accent
- Avatar area
- Name and role
- Brief description

---

## Video Thumbnails (YouTube)

### Size: 1280x720px

### Style

- Bold headline (Plus Jakarta Sans 800)
- Sage green accent elements
- Paper cream background
- Optional: Screenshot of app

---

## Quick Asset Checklist

### Profile Setup

- [ ] Profile picture uploaded (all platforms)
- [ ] Banner/header uploaded (all platforms)
- [ ] Bio written (see below)
- [ ] Website link added
- [ ] Location set (if applicable)

### Bio Templates

**Twitter/X (160 chars):**

```
Your personal AI life coach. Six specialists. One conversation. Just talk.
ferni.ai
```

**LinkedIn (2000 chars):**

```
Ferni is your personal AI life coach team—six specialists working together to help you navigate life's challenges.

Unlike generic AI chatbots, Ferni remembers your conversations, understands your context, and provides thoughtful guidance tailored to you.

Available 24/7 via web app or phone call.
Start free: ferni.ai
```

**Instagram (150 chars):**

```
Your AI life coach team
Six specialists. One conversation.
Just talk—they handle the rest.
ferni.ai
```

**TikTok (80 chars):**

```
AI life coach that actually listens
ferni.ai
```

---

## File Naming Convention

```
ferni-[platform]-[type]-[size].png

Examples:
ferni-twitter-profile-400x400.png
ferni-linkedin-banner-1584x396.png
ferni-instagram-post-template-1080x1080.png
```

---

## Generation Commands

### Using Imagen (in generate-assets.js)

```bash
cd promo/ferni-website
node scripts/generate-assets.js --batch=social
```

### Manual Generation

Use the prompts above in:

- Google Imagen 4.0 (labs.google.com)
- Midjourney
- DALL-E 3
- Canva (for templates)

---

## Platform-Specific Notes

### Twitter/X

- Pin a "Welcome to Ferni" thread
- Use polls for engagement
- Thread format for feature explanations

### LinkedIn

- Professional tone
- Focus on productivity benefits
- Share thought leadership content

### Instagram

- Visual-first, minimal text on images
- Use Stories for behind-the-scenes
- Reels for quick tips

### TikTok

- Casual, authentic tone
- Quick tips format (15-60 seconds)
- Trending sounds when appropriate

### YouTube

- Long-form tutorials
- Feature deep-dives
- User testimonial compilations
