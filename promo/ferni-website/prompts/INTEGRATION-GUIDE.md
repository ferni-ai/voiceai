# 🔧 Asset Integration Guide

Quick reference for adding generated images/videos to the Ferni website.

---

## 📁 File Structure

Place generated assets in these folders:

```
promo/ferni-website/
├── images/
│   ├── avatars/           <- Team avatars (NEW)
│   │   ├── ferni.png
│   │   ├── jack.png
│   │   ├── peter.png
│   │   ├── alex.png
│   │   ├── maya.png
│   │   └── jordan.png
│   ├── testimonials/      <- Testimonial photos (NEW)
│   │   ├── sarah-k.jpg
│   │   ├── michael-r.jpg
│   │   ├── jessica-l.jpg
│   │   └── david-w.jpg
│   ├── og-image.png       <- Social sharing image (NEW)
│   └── sequence/          <- Hero animation frames (existing)
├── videos/                <- Video assets (NEW)
│   ├── hero-bg.mp4
│   └── cta-bg.mp4
```

---

## 🎭 Team Avatars Integration

### Current HTML (initials only):
```html
<div class="team-avatar"><span>FN</span></div>
```

### Updated HTML (with image):
```html
<div class="team-avatar">
  <img src="images/avatars/ferni.png" alt="Ferni avatar" loading="lazy">
  <span>FN</span> <!-- Fallback if image fails -->
</div>
```

### All Team Members:
```html
<!-- Ferni -->
<div class="team-avatar">
  <img src="images/avatars/ferni.png" alt="Ferni" loading="lazy">
  <span>FN</span>
</div>

<!-- Jack -->
<div class="team-avatar">
  <img src="images/avatars/jack.png" alt="Jack" loading="lazy">
  <span>JB</span>
</div>

<!-- Peter -->
<div class="team-avatar">
  <img src="images/avatars/peter.png" alt="Peter" loading="lazy">
  <span>PL</span>
</div>

<!-- Alex -->
<div class="team-avatar">
  <img src="images/avatars/alex.png" alt="Alex" loading="lazy">
  <span>AX</span>
</div>

<!-- Maya -->
<div class="team-avatar">
  <img src="images/avatars/maya.png" alt="Maya" loading="lazy">
  <span>MY</span>
</div>

<!-- Jordan -->
<div class="team-avatar">
  <img src="images/avatars/jordan.png" alt="Jordan" loading="lazy">
  <span>JD</span>
</div>
```

---

## 💬 Testimonial Photos Integration

### Current HTML:
```html
<div class="testimonial-avatar">SK</div>
```

### Updated HTML (with photo):
```html
<div class="testimonial-avatar">
  <img src="images/testimonials/sarah-k.jpg" alt="Sarah K." loading="lazy">
  SK
</div>
```

---

## 🖼️ OG/Social Image Integration

### In `<head>` section of index.html:

```html
<!-- Open Graph -->
<meta property="og:image" content="https://ferni.ai/images/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<!-- Twitter Card -->
<meta name="twitter:image" content="https://ferni.ai/images/og-image.png">
```

---

## 🎬 Hero Video Integration (Replace Image Sequence)

### Option A: Video Background (Recommended)

Replace canvas with video element in index.html:

```html
<!-- Hero Section with Video Background -->
<section class="hero-scroll-container" id="heroScrollContainer">
  <!-- Video Background -->
  <video 
    class="hero-video" 
    autoplay 
    muted 
    loop 
    playsinline
    poster="images/sequence/frame-001.jpg"
  >
    <source src="videos/hero-bg.mp4" type="video/mp4">
  </video>
  
  <!-- Hero Content Layer -->
  <div class="hero-content-wrapper" id="heroContentWrapper">
    <!-- ... existing hero content ... -->
  </div>
</section>
```

### CSS for Video Background:
```css
.hero-video {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  object-fit: cover;
  z-index: 0;
}

/* Transition from video to rest of page */
.hero-scroll-container {
  position: relative;
}
```

### Option B: Keep Image Sequence (Current)
The current image sequence animation works well. Only switch to video if:
- You have a higher quality video
- You want smoother playback
- File size is smaller than current images

---

## 🎯 CTA Section Video Background

### Add to CTA section:
```html
<section class="cta">
  <div class="cta-bg">
    <video 
      class="cta-video" 
      autoplay 
      muted 
      loop 
      playsinline
    >
      <source src="videos/cta-bg.mp4" type="video/mp4">
    </video>
    <div class="cta-orb"></div>
  </div>
  <!-- ... existing content ... -->
</section>
```

### CSS:
```css
.cta-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.3;
}
```

---

## ✅ Integration Checklist

When you have generated assets ready:

- [ ] Create `images/avatars/` folder
- [ ] Create `images/testimonials/` folder  
- [ ] Create `videos/` folder
- [ ] Add OG image to `images/og-image.png`
- [ ] Update meta tags in `<head>`
- [ ] Add team avatar images
- [ ] Add testimonial photos
- [ ] Test on social media preview tools
- [ ] Optimize images (TinyPNG, Squoosh)
- [ ] Test on mobile devices

---

## 🔗 Useful Tools

- **Image Optimization:** [TinyPNG](https://tinypng.com), [Squoosh](https://squoosh.app)
- **Video Compression:** [HandBrake](https://handbrake.fr)
- **OG Preview Test:** [OpenGraph.xyz](https://opengraph.xyz)
- **Favicon Generator:** [RealFaviconGenerator](https://realfavicongenerator.net)

---

## 📐 Image Size Reference

| Asset | Dimensions | Format | Max Size |
|-------|-----------|--------|----------|
| OG Image | 1200x630 | PNG/JPG | 500KB |
| Team Avatars | 400x400 | PNG | 100KB each |
| Testimonials | 200x200 | JPG | 50KB each |
| Hero Video | 4K | MP4 (H.264) | 10MB |
| CTA Video | 1080p | MP4 (H.264) | 5MB |

---

*Last updated: December 2024*

