# Generated Images

This folder contains AI-generated images for the Ferni landing page.

## Folder Structure

```
generated/
├── avatars/           # Team member abstract avatars (400x400)
│   ├── avatar-ferni.png
│   ├── avatar-nayan.png
│   ├── avatar-peter.png
│   ├── avatar-alex.png
│   ├── avatar-maya.png
│   └── avatar-jordan.png
│
├── hero/              # Hero section backgrounds (4K/1080p)
│   ├── hero-meadow-4k.jpg
│   └── hero-zen-garden-4k.jpg
│
├── testimonials/      # Testimonial card backgrounds
│   ├── testimonial-bg-1.jpg
│   ├── testimonial-bg-2.jpg
│   └── testimonial-bg-3.jpg
│
└── social/            # Social media images
    ├── og-image.png        # 1200x630
    └── twitter-card.png    # 1200x628
```

## Generation Methods

### Option 1: Google AI Studio (Easiest)
1. Go to https://aistudio.google.com
2. Use Imagen 3 model
3. Copy prompts from `/prompts/PLATFORM-SPECIFIC-PROMPTS.md`
4. Download and save to appropriate folder

### Option 2: Vertex AI Script
```bash
cd scripts
npm install
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-key.json"
npm run generate:images
```

### Option 3: Midjourney
Use prompts from `/prompts/PLATFORM-SPECIFIC-PROMPTS.md` with Midjourney v6

## Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Cream | #F5F1E8 | Background |
| Sage Green | #4a6741 | Ferni |
| Cedar Brown | #9a7b5a | Nayan |
| Ocean Teal | #3a6b73 | Peter |
| Indigo Slate | #5a6b8a | Alex |
| Terracotta | #a67a6a | Maya |
| Sunset Coral | #c4856a | Jordan |

## Quality Requirements

- Avatars: PNG, 400x400px minimum, transparent or cream background
- Hero: JPG/WebP, 1920x1080 minimum (4K preferred)
- Social: PNG, exact dimensions as specified
- All images should use warm earth tone color palette
- No cold blues or sterile tech aesthetics

