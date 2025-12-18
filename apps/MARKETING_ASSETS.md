# 🎨 Voice AI - Marketing Assets Checklist

Complete checklist of brand and marketing assets needed for app store submissions and marketing.

---

## 📊 Asset Status Overview

| Category | Have | Need | Priority |
|----------|------|------|----------|
| App Icons | ✅ All sizes | - | Done |
| Logos | ✅ All variants | - | Done |
| Screenshots | ❌ | All platforms | 🔴 Critical |
| App Preview Videos | ⏳ Have prompts | Generate | 🔴 Critical |
| Feature Graphics | ⏳ Hero images | Store-specific | 🟡 High |
| Store Descriptions | ❌ | All stores | 🔴 Critical |
| Website Assets | ✅ Most ready | Minor gaps | 🟢 Low |

---

## 📱 Apple App Store (iOS + macOS)

### Required Assets

| Asset | Spec | Status | Action |
|-------|------|--------|--------|
| **App Icon** | 1024x1024 PNG | ✅ `brand/icons/png/ios-1024.png` | Done |
| **iPhone 6.7" Screenshots** | 1290x2796 | ❌ | Generate 4-8 |
| **iPhone 6.5" Screenshots** | 1284x2778 | ❌ | Generate 4-8 |
| **iPhone 5.5" Screenshots** | 1242x2208 | ❌ | Generate 4-8 |
| **iPad Pro 12.9" Screenshots** | 2048x2732 | ❌ | Generate 4-8 |
| **App Preview Video** | 1920x1080 / 30fps | ⏳ | Use Veo prompts |
| **App Name** | 30 chars | ❌ | "Voice AI - Life Coach" |
| **Subtitle** | 30 chars | ❌ | "Your AI that listens" |
| **Description** | 4000 chars | ❌ | Write copy |
| **Keywords** | 100 chars | ❌ | Research |
| **Privacy URL** | - | ✅ `apps/website/ferni-website/privacy.html` | Done |
| **Support URL** | - | ❌ | Create |
| **Marketing URL** | - | ⏳ | Ferni website |

### macOS Specific

| Asset | Spec | Status | Action |
|-------|------|--------|--------|
| **macOS Screenshots** | 2880x1800 | ❌ | Generate 4-8 |
| **macOS App Preview** | 1920x1080 | ⏳ | Same as iOS |

---

## 🤖 Google Play Store (Android)

### Required Assets

| Asset | Spec | Status | Action |
|-------|------|--------|--------|
| **App Icon** | 512x512 PNG | ✅ `brand/icons/png/android-512.png` | Done |
| **Feature Graphic** | 1024x500 | ❌ | Generate |
| **Phone Screenshots** | 16:9 or 9:16 | ❌ | Generate 4-8 |
| **7" Tablet Screenshots** | 7" | ❌ | Generate 4-8 |
| **10" Tablet Screenshots** | 10" | ❌ | Generate 4-8 |
| **Promo Video** | YouTube link | ⏳ | Use Veo output |
| **Short Description** | 80 chars | ❌ | Write |
| **Full Description** | 4000 chars | ❌ | Write |
| **App Name** | 50 chars | ❌ | "Voice AI - AI Life Coach" |
| **Privacy Policy URL** | - | ✅ | Done |

---

## 🪟 Microsoft Store (Windows)

### Required Assets

| Asset | Spec | Status | Action |
|-------|------|--------|--------|
| **Store Logo** | 300x300 | ✅ | Resize from 1024 |
| **Square 44x44** | 44x44 | ❌ | Generate |
| **Square 150x150** | 150x150 | ❌ | Generate |
| **Wide 310x150** | 310x150 | ❌ | Generate |
| **Screenshots** | 1366x768+ | ❌ | Generate 4-8 |
| **Description** | - | ❌ | Write |
| **Promo Video** | - | ⏳ | Optional |

---

## 🌐 Website & Social

### Existing Assets ✅

| Asset | Location |
|-------|----------|
| Hero images | `apps/website/ferni-website/images/generated/hero/` |
| OG/Social images | `apps/website/ferni-website/images/generated/social/` |
| Avatar images | `apps/website/ferni-website/images/generated/avatars/` |
| Testimonial backgrounds | `apps/website/ferni-website/images/generated/testimonials/` |
| Video frames | `apps/website/ferni-website/images/sequence/` |
| Full logo set | `brand/logos/` |
| Privacy/Terms pages | `apps/website/ferni-website/` |

### Needed Assets

| Asset | Spec | Use | Priority |
|-------|------|-----|----------|
| Twitter Card | 1200x628 | Social sharing | 🟡 |
| LinkedIn Banner | 1584x396 | Company page | 🟢 |
| Press Kit | ZIP | Media inquiries | 🟢 |

---

## 🎬 Video Generation (Veo 3 Prompts Ready)

You already have prompts in `apps/website/ferni-website/prompts/VEO3-PROMPTS.txt`!

### Priority Videos to Generate

| Video | Duration | Prompt Ready | Use For |
|-------|----------|--------------|---------|
| Hero Background | 10-15s loop | ✅ | Website, App Store |
| App Preview | 15-30s | ⏳ Need | App Store |
| Feature Demo | 30-60s | ⏳ Need | YouTube, Ads |
| Social Teaser | 6-15s | ⏳ Need | TikTok, Reels |

### App Store Preview Script (NEW - GENERATE THIS)

```
FERNI APP STORE PREVIEW - 30 SECOND SCRIPT
===========================================

[0:00-0:05] HOOK
- Screen recording: App opens, warm orb avatar appears
- Text overlay: "Finally, someone who listens"
- Soft ambient music

[0:05-0:12] PROBLEM → SOLUTION  
- Quick montage: Person looking stressed, alone
- Transition to: Person relaxed, talking to phone
- Text: "Your AI life coach. Available 24/7"

[0:12-0:20] FEATURES
- Screen: Waveform visualization while talking
- Screen: Different persona avatars (swipe through)
- Text: "6 expert advisors" → "Career" → "Wellness" → "Finance"

[0:20-0:28] SOCIAL PROOF
- Screen: Beautiful UI, conversation in progress
- Text: "Conversations that remember you"
- Text: "No judgment. Just support."

[0:28-0:30] CTA
- App icon animation
- Text: "Download Voice AI"
- App Store badge
```

---

## 📝 Store Copy (Write These)

### App Store Description Template

```markdown
# Voice AI - Your AI Life Coach

Finally, someone who actually listens.

Voice AI is your personal AI companion that's always available - whether it's 2am worries, commute contemplation, or a moment before a big decision.

## 🎯 MEET YOUR TEAM

• **Ferni** - Your warm, grounded life coach
• **Maya** - Mindfulness & wellness expert  
• **Alex** - Career strategy advisor
• **Jordan** - Creative thinking partner
• **Nayan** - Financial wellness guide
• **Peter** - Practical wisdom mentor

## ✨ WHY VOICE AI?

**It Actually Listens**
Have real voice conversations, not text chats. Express yourself naturally.

**It Remembers You**
Your story builds over time. No repeating yourself.

**It's Always There**
24/7 availability. No scheduling. No waiting rooms.

**It's Private**
Your conversations are yours. We don't sell data.

## 🧘 DESIGNED FOR HUMANS

Voice AI isn't trying to replace your friends or therapist. We fill the gaps - those moments when you just need someone to talk to.

---

Download now and experience the difference of being truly heard.
```

### Keywords (Research These)

```
ai coach, life coach, mental wellness, self improvement, 
ai companion, voice ai, therapy alternative, personal growth,
mindfulness app, career coach, ai assistant, wellbeing
```

---

## 📸 Screenshot Generation Plan

### Tools to Use
- **Figma/Sketch**: Create device mockups
- **Screenshots.pro**: Auto-generate store screenshots
- **AppMockUp**: Device frame templates
- **Your app running**: Record actual screens

### Screenshot Themes (4-8 per store)

1. **Hero Shot**: Main conversation screen with waveform
2. **Team**: Show the 6 advisor avatars
3. **In Conversation**: Beautiful active session
4. **Persona Swap**: Switching between advisors
5. **Dark Mode**: If supported
6. **Feature Callout**: Key feature highlighted
7. **Privacy**: Security/privacy messaging
8. **Testimonial**: Social proof overlay

### Screenshot Copy Templates

```
Screen 1: "Your AI that actually listens"
Screen 2: "6 expert advisors, one app"
Screen 3: "Voice-first conversations"
Screen 4: "Remembers your story"
Screen 5: "Available 24/7"
Screen 6: "Private & secure"
```

---

## ✅ Pre-Launch Checklist

### Week Before Launch

- [ ] All screenshots generated and uploaded
- [ ] App preview video uploaded
- [ ] Store descriptions finalized
- [ ] Keywords researched and set
- [ ] Privacy policy URL live
- [ ] Support URL/email ready
- [ ] Press kit prepared
- [ ] Social announcements drafted

### Launch Day

- [ ] Submit iOS app for review
- [ ] Submit Android app for review
- [ ] Submit to Mac App Store (optional)
- [ ] Post to social channels
- [ ] Send press release
- [ ] Enable monitoring/analytics

---

## 🎯 Quick Action Items

### Today (30 min)
1. Write short description (80 chars)
2. Write app name variants
3. List 10 keywords

### This Week (2-3 hours)
1. Generate screenshots with device mockups
2. Create feature graphic (1024x500)
3. Write full description

### Before Submit (1-2 days)
1. Generate app preview video with Veo
2. Record screen capture demo
3. Combine into 30s preview
4. Final review all assets

---

## 📁 Recommended Folder Structure

```
apps/marketing/
├── screenshots/
│   ├── ios-6.7/
│   ├── ios-6.5/
│   ├── ios-5.5/
│   ├── ipad-12.9/
│   ├── android-phone/
│   ├── android-tablet/
│   ├── macos/
│   └── windows/
├── videos/
│   ├── app-preview-ios.mp4
│   ├── app-preview-android.mp4
│   └── promo-30s.mp4
├── graphics/
│   ├── feature-graphic-1024x500.png
│   ├── twitter-card-1200x628.png
│   └── press-kit/
├── copy/
│   ├── app-store-description.md
│   ├── play-store-description.md
│   └── keywords.txt
└── README.md
```

