# Ferni Content Development Workflow

##  Video Content (Veo 3 / Runway / Production)

### Priority 1: Hero Background Videos (Choose 1-2)

| Video | File | Prompt File | Notes |
|-------|------|-------------|-------|
| Mountain Meadow (Park City) | `hero-mountain-meadow.mp4` | VEO3-PROMPTS.txt #1 | **CRITICAL** - Main hero background |
| Conversation in Park City | `hero-conversation.mp4` | VEO3-PROMPTS.txt #1C | Human-centered alternative |
| Walking Path | `hero-walking-path.mp4` | VEO3-PROMPTS.txt #1D | Journey metaphor |

**How to Generate:**
1. Open [Google Veo 3](https://labs.google.com/videotools) or similar
2. Copy the full prompt from `VEO3-PROMPTS.txt`
3. Generate at 4K or 8K resolution
4. Download and convert to web-optimized MP4 (H.264)
5. Place in `/promo/ferni-website/videos/`

### Priority 2: Supporting Videos

| Video | Duration | Prompt Location |
|-------|----------|-----------------|
| Listening Moment | 8-10s | VEO3-PROMPTS.txt #2 |
| CTA Particles | 8-10s loop | VEO3-PROMPTS.txt #3 |
| Team Gathering | 8-10s | VEO3-PROMPTS.txt #4 |
| Ink & Water (Loading) | 3-4s | VEO3-PROMPTS.txt #5 |

---

##  Image Content (Nana Banana / Midjourney / DALL-E)

### Priority 1: Critical Images

| Image | Dimensions | File Name | Prompt # |
|-------|------------|-----------|----------|
| OG/Social Share | 1200x630 | `og-image.png` | IMAGE-PROMPTS.txt #1 |
| Hero Image | 1920x1080 | `hero-park-city.jpg` | IMAGE-PROMPTS.txt #8 |

### Priority 2: Team Avatars

| Avatar | Color | File Name | Prompt # |
|--------|-------|-----------|----------|
| Ferni | #4a6741 (Sage) | `avatar-ferni.png` | IMAGE-PROMPTS.txt #2 |
| Jack | #9a7b5a (Cedar) | `avatar-jack.png` | IMAGE-PROMPTS.txt #3 |
| Peter | #3a6b73 (Teal) | `avatar-peter.png` | IMAGE-PROMPTS.txt #4 |
| Alex | #5a6b8a (Indigo) | `avatar-alex.png` | IMAGE-PROMPTS.txt #5 |
| Maya | #a67a6a (Terracotta) | `avatar-maya.png` | IMAGE-PROMPTS.txt #6 |
| Jordan | #c4856a (Coral) | `avatar-jordan.png` | IMAGE-PROMPTS.txt #7 |

### Priority 3: Testimonial Photos

| Person | File Name | Prompt # |
|--------|-----------|----------|
| Sarah K. | `testimonial-sarah.jpg` | IMAGE-PROMPTS.txt #9 |
| Michael R. | `testimonial-michael.jpg` | IMAGE-PROMPTS.txt #10 |
| Jessica L. | `testimonial-jessica.jpg` | IMAGE-PROMPTS.txt #11 |
| David W. | `testimonial-david.jpg` | IMAGE-PROMPTS.txt #12 |

---

##  Story Videos (Professional Production or Extended AI)

For longer brand storytelling (see `MOVIE-STORY-PROMPTS.txt`):

| Video | Duration | Purpose |
|-------|----------|---------|
| "Finally, Someone Listens" | 60-90s | Brand film |
| "Sarah's Morning" | 45-60s | Testimonial story |
| "Meet Your Team" | 60-75s | Team introduction |
| "The Space Between" | 90-120s | Mini-documentary |

---

##  File Organization

```
promo/ferni-website/
 images/
    og-image.png          # Social sharing
    hero-park-city.jpg    # Main hero image
    avatars/
       ferni.png
       jack.png
       peter.png
       alex.png
       maya.png
       jordan.png
    testimonials/
        sarah.jpg
        michael.jpg
        jessica.jpg
        david.jpg
 videos/
    hero-background.mp4   # Main hero video
    particles.mp4         # CTA section
    brand-film.mp4        # Full brand film
 prompts/
     VEO3-PROMPTS.txt
     IMAGE-PROMPTS.txt
     MOVIE-STORY-PROMPTS.txt
```

---

##  Tools & Services

### AI Video Generation
- **Google Veo 3**: Primary for short loops
- **Runway Gen-3**: Alternative for cinematic shots
- **Pika Labs**: Good for abstract/particles

### AI Image Generation
- **Nana Banana**: Great for stylized/artistic
- **Midjourney v6**: Best for photorealistic
- **DALL-E 3**: Good for specific compositions

### Post-Processing
- **Video**: DaVinci Resolve (free) or Premiere Pro
- **Images**: Photoshop or Affinity Photo
- **Compression**: HandBrake (video), TinyPNG (images)

---

##  Color Reference (Copy-Paste Ready)

```css
/* Primary */
--paper-cream: #F5F1E8;
--natural-ink: #2C2520;
--forest-green: #3D5A45;

/* Avatar Colors */
--ferni-sage: #4a6741;
--jack-cedar: #9a7b5a;
--peter-teal: #3a6b73;
--alex-indigo: #5a6b8a;
--maya-terra: #a67a6a;
--jordan-coral: #c4856a;

/* Accents */
--warm-amber: #C4A265;
--moss: #7A8B6E;
--bamboo: #B8A88A;
```

---

##  Development Checklist

### Phase 1: Essential (Launch Ready)
- [ ] Hero background video (mountain meadow or conversation)
- [ ] OG/Social sharing image
- [ ] Hero static image (fallback)
- [ ] All 6 team avatars

### Phase 2: Enhanced
- [ ] Testimonial photos (4)
- [ ] Feature images (conversation, morning ritual)
- [ ] CTA particles video
- [ ] Ink & water loading animation

### Phase 3: Premium
- [ ] Brand film (60-90s)
- [ ] Testimonial video stories
- [ ] Team introduction video
- [ ] Mini-documentary

---

##  Park City, Utah Location Notes

All outdoor content should evoke the Park City mountain aesthetic:
- **Mountains**: Wasatch Range, snow-capped peaks
- **Flora**: Alpine meadows, golden aspens, wildflowers
- **Mood**: Mountain town tranquility, ski-lodge warmth
- **Colors**: Natural earth tones, golden hour light
- **Seasons**: Late summer/early fall golden hour ideal

---

##  Quick Start

1. **Start with the hero video** - Copy prompt #1 or #1C from `VEO3-PROMPTS.txt`
2. **Generate team avatars** - 6 images from `IMAGE-PROMPTS.txt` #2-7
3. **Create OG image** - `IMAGE-PROMPTS.txt` #1
4. **Add to website** - Update paths in `index.html`
5. **Deploy** - `firebase deploy --only hosting --project johnb-2025`

---

Made with  in Park City, Utah

