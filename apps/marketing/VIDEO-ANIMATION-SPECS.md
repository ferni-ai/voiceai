# Ferni Video & Animation Specifications

> Production specs for App Store previews, social content, and promotional videos.

---

## Quick Reference

| Asset Type | Duration | Resolution | Frame Rate | Format |
|------------|----------|------------|------------|--------|
| App Preview (iOS) | 15-30s | 1080×1920 (9:16) | 30fps | H.264 MP4 |
| App Preview (Android) | 30s-2min | 1080×1920 | 30fps | H.264 MP4 |
| Social Reel (TikTok/IG) | 15-60s | 1080×1920 | 30fps | H.264 MP4 |
| Social Post (Square) | 15-30s | 1080×1080 | 30fps | H.264 MP4 |
| YouTube Short | 15-60s | 1080×1920 | 30fps | H.264 MP4 |
| Website Hero | Loop | 1920×1080 | 30fps | WebM/MP4 |

---

## Core Animation Assets

### 1. Ferni Breathing Animation

The signature animation showing Ferni's avatar with a gentle "breathing" effect.

**Animation Parameters:**
```css
/* Scale breathing */
@keyframes breatheOrb {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
animation: breatheOrb 4s ease-in-out infinite;

/* Glow breathing */
@keyframes breatheGlow {
  0%, 100% { opacity: 0.4; transform: scale(0.95); }
  50% { opacity: 0.7; transform: scale(1.05); }
}
animation: breatheGlow 4s ease-in-out infinite;
```

**Export Specs:**
- Size: 512×512 (can scale down)
- Duration: 4 seconds (seamless loop)
- Format: GIF (for social), MP4 (for video), Lottie JSON (for web/app)
- Background: Transparent or #FAF8F5

### 2. Team Entrance Animation

Staggered reveal of all 6 personas entering the frame.

**Sequence:**
1. Ferni enters center (0.0s - 0.5s)
2. Maya enters left (0.3s - 0.8s)
3. Peter enters right (0.4s - 0.9s)
4. Jordan enters left (0.5s - 1.0s)
5. Alex enters right (0.6s - 1.1s)
6. Nayan enters bottom (0.7s - 1.2s)

**Animation:**
- Entrance: Fade + scale from 0.8 to 1.0
- Easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` (bounce spring)
- Final position: Hold for 2+ seconds

### 3. Handoff Transition

Visual showing seamless transition between personas (e.g., Ferni → Maya).

**Sequence:**
1. Active persona centered (0.0s - 1.0s)
2. Active persona moves left with fade (1.0s - 1.5s)
3. New persona enters from right (1.2s - 1.7s)
4. New persona centers (1.5s - 2.0s)
5. Connection line animates between (1.3s - 1.8s)

**Visual Elements:**
- Subtle glow transfer effect
- Optional: Chat bubble showing "Let me bring in Maya..."
- Both personas visible briefly during overlap

### 4. Expression Variations

Micro-animations for persona expressions.

| Expression | Description | Duration |
|------------|-------------|----------|
| Neutral | Gentle breathing only | Loop |
| Happy | Eyes squint, slight bounce | 0.5s |
| Curious | One eye slightly larger, head tilt | 0.4s |
| Warm | Eyes soften, glow intensifies | 0.6s |
| Thinking | Eyes look up-left, subtle pause | 0.8s |
| Concerned | Slight downturn, dimmed glow | 0.5s |

**Export:** Individual Lottie files for each expression

---

## App Store Preview Video

### iOS App Preview (30 seconds)

**Structure:**

| Time | Scene | Content | Audio |
|------|-------|---------|-------|
| 0-3s | Opening | Ferni avatar breathing, centered | Soft ambient |
| 3-8s | Value Prop | Text: "Your team of 6 AI specialists" + team reveal | Continue |
| 8-15s | Demo 1 | Late night conversation (dark mode) | Soft piano |
| 15-22s | Demo 2 | Handoff animation (Ferni → Maya) | Continue |
| 22-27s | Features | Quick capability montage | Building |
| 27-30s | CTA | "Your team. Always here." + 6 avatars | Resolve |

**Technical Requirements:**
- Resolution: 1080×1920 (9:16 portrait)
- Duration: Exactly 30 seconds
- No voiceover (Apple requirement—text/visuals only)
- Seamless loop preferred for last frame

**Visual Style:**
- Dark mode scenes for "3am" emotional resonance
- Light mode scenes for features
- Use breathing animations throughout
- Persona colors for glows and accents

### Google Play Preview (30s-2min)

**Additional Options:**
- Can include voiceover
- Can be longer (up to 2 minutes)
- Same visual style as iOS

---

## Social Video Content

### TikTok/Instagram Reels

**Format:** 1080×1920 (9:16), 15-60 seconds

**Content Types:**

1. **"3am Companion"** (15s)
   - Dark mode
   - Text overlay: "When you can't sleep..."
   - Ferni avatar with warm glow
   - Chat simulation
   - CTA: "Ferni is always here"

2. **"Meet the Team"** (30s)
   - Light mode
   - Quick intro of each persona
   - 4-5 seconds per persona
   - Name + role + one-line description

3. **"Handoff Magic"** (20s)
   - Show conversation context
   - Ferni suggests specialist
   - Seamless transition animation
   - New persona continues naturally

4. **"Better Than Human"** (15s)
   - Text-focused: Key differentiators
   - "Remembers everything you've shared"
   - "Never too busy for you"
   - "Available at 3am"
   - Avatar punctuation between points

### YouTube Shorts

Same specs as TikTok/Reels (9:16, 60s max)

**Content Focus:**
- Problem/solution framing
- "I built an AI team because..."
- Behind-the-scenes personality reveals

---

## Website Animations

### Hero Background

**Specs:**
- Resolution: 1920×1080 (or responsive)
- Duration: 4-8 second seamless loop
- Format: WebM (primary), MP4 (fallback)
- File size: < 2MB (optimize heavily)

**Content:**
- Centered Ferni avatar with breathing animation
- Subtle particle/glow effects in background
- Very slow color shift in glow (optional)

### Scroll-Triggered Reveals

Use CSS animations triggered by Intersection Observer:

```css
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

**Stagger for multiple elements:**
```css
.reveal:nth-child(1) { transition-delay: 0.1s; }
.reveal:nth-child(2) { transition-delay: 0.2s; }
.reveal:nth-child(3) { transition-delay: 0.3s; }
```

---

## Production Workflow

### 1. Asset Preparation

Source files from brand library:
- `brand/characters/*/expressions.html` - All persona expressions
- `brand/master-tokens.css` - Colors, animations, easing
- `brand/motion/motion.html` - Animation references

### 2. Animation Export

**From HTML/CSS to Video:**
1. Set up scene in HTML with CSS animations
2. Use screen recording at 2x resolution
3. Export to After Effects for compositing
4. Render final output

**From Figma/Design Tools:**
1. Design keyframes
2. Export to Lottie (for web/app)
3. Export to After Effects (for video)

### 3. Video Production

**Tools:**
- After Effects - Primary compositing
- Premiere Pro - Final edit and audio
- DaVinci Resolve - Color grading (optional)

**Export Settings:**
```
Codec: H.264
Resolution: 1080×1920 (or as specified)
Frame Rate: 30fps
Bitrate: 8-12 Mbps (high quality), 4-6 Mbps (web)
Audio: AAC 256kbps (if included)
```

---

## Audio Guidelines

### Background Music

**Style:**
- Soft, ambient, non-intrusive
- Warm piano or acoustic tones
- No lyrics for app store previews

**Licensing:**
- Use royalty-free from Epidemic Sound, Artlist, or similar
- Document licenses for each track

### Sound Effects

**Optional for social:**
- Soft "message received" tone
- Gentle transition whoosh
- Subtle breathing ambient

---

## Brand Consistency Checklist

Before publishing any video/animation:

- [ ] Avatar eyes are LUXO-style (opaque white, NO pupils)
- [ ] Persona colors match brand specs exactly
- [ ] Typography is Plus Jakarta Sans (display) / Inter (body)
- [ ] Background colors from approved palette
- [ ] Breathing animation timing matches spec (4s cycle)
- [ ] Easing uses brand-defined curves
- [ ] No harsh transitions or jarring cuts
- [ ] Warm, human tone throughout

---

## File Organization

```
apps/marketing/video/
├── source/
│   ├── after-effects/      # .aep project files
│   ├── premiere/           # .prproj files
│   └── assets/             # Source images, audio
├── exports/
│   ├── app-preview/
│   │   ├── ios-1080x1920.mp4
│   │   └── android-1080x1920.mp4
│   ├── social/
│   │   ├── reels/
│   │   └── stories/
│   └── web/
│       └── hero-loop.webm
└── lottie/
    ├── ferni-breathing.json
    ├── team-entrance.json
    └── expressions/
```

---

## Timeline Recommendations

| Asset | Priority | Estimated Time |
|-------|----------|----------------|
| Ferni breathing loop | High | 2 hours |
| App Store preview (iOS) | High | 8 hours |
| App Store preview (Android) | High | 4 hours (adapt iOS) |
| Team entrance animation | Medium | 4 hours |
| Handoff transition | Medium | 4 hours |
| Social reels (3 variations) | Medium | 6 hours |
| Website hero animation | Low | 4 hours |
| Expression Lottie files | Low | 8 hours |

**Total estimated production time:** 40-50 hours

---

*Last Updated: December 2024*
*Owner: Marketing + Creative*
