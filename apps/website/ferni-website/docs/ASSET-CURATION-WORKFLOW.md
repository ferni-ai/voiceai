# 🌱 Ferni Asset Curation Workflow

> **"Every image should feel like it was made by a friend who knows you."**

This workflow ensures visual consistency across all Ferni assets while embodying our core philosophy of human connection.

---

## The Philosophy

Ferni's visual assets aren't just marketing materials—they're the first impression of our brand's humanity. Every image should:

1. **Feel warm, not corporate** - Earth tones, handmade textures, golden hour light
2. **Invite connection** - Compositions that draw you in, not push information at you
3. **Be consistent** - Like a trusted friend who shows up the same way every time
4. **Have intention** - Curated with care, not churned out for quantity

---

## Curation Process (The Avatar Method)

### Phase 1: Generate Variants
```bash
# Generate 4 variants per asset
node scripts/generate-assets.js --key=<asset-key>
```

### Phase 2: Review & Select
For each asset category, open all variants side-by-side and ask:

| Question | Why It Matters |
|----------|----------------|
| Does this feel warm and human? | Ferni isn't cold tech |
| Is the color palette consistent with our tokens? | Visual trust |
| Does it match the style of our best assets? | Family resemblance |
| Would I want this on my wall? | The delight test |

**Selection criteria:**
- Pick **ONE winner** per asset
- Archive variants for future reference
- Document why you chose it (helps future generations)

### Phase 3: Archive & Clean
```bash
# Move variants to archive
mkdir -p images/generated/<category>-archive
mv images/generated/<category>/*-v[234].* images/generated/<category>-archive/

# Verify only finals remain
ls images/generated/<category>/
```

### Phase 4: Document the Style
After curation, update the README with:
- Which version was selected
- Why it was chosen
- Style notes for regeneration

---

## Asset Categories & Status

### ✅ Avatars (COMPLETE)
- **Status:** Curated, archived, clean
- **Style:** Top-down zen ceramic bowls, Maya v3 reference
- **Count:** 7 finals

### 🔄 Hero Backgrounds (NEEDS CURATION)
- **Current:** 13 files (3 base + 10 variants)
- **Target:** 3-4 finals
- **Style goal:** Golden hour, warm earth tones, Park City/zen aesthetic

### 🔄 Lifestyle Scenes (NEEDS CURATION)
- **Current:** 24 files (6 base + 18 variants)
- **Target:** 6 finals
- **Style goal:** Warm, authentic moments, NOT stock photo feeling

### 🔄 Social/OG Images (NEEDS CURATION)
- **Current:** 32 files (8 base + 24 variants)
- **Target:** 8 finals
- **Style goal:** Consistent with hero, space for text overlay

### 🔄 Testimonial Backgrounds (NEEDS CURATION)
- **Current:** 10 files (3 base + 7 variants)
- **Target:** 3 finals
- **Style goal:** Subtle, warm gradients, don't compete with text

---

## Style Reference System

The key to avatar consistency was **style references**. Apply this everywhere:

```bash
# Generate with style reference (Vertex AI required)
node scripts/generate-assets.js --batch=hero --style-ref=images/generated/hero/hero-zen-garden.jpg
```

### Master Style References

| Category | Reference Image | Why |
|----------|-----------------|-----|
| Avatars | `avatar-maya.png` | Best ceramic texture, perfect face |
| Hero | `hero-zen-garden.jpg` (TBD) | Pick the warmest, most inviting |
| Lifestyle | TBD | Should feel authentic, not staged |
| Social | Match hero style | Brand consistency |
| Testimonials | TBD | Subtle, supportive of text |

---

## Color Palette Enforcement

Every generated image must use Ferni's earth tones:

| Color | Hex | Use |
|-------|-----|-----|
| Paper Cream | `#F5F1E8` | Backgrounds |
| Sage Green | `#4a6741` | Ferni, primary accent |
| Cedar Brown | `#9a7b5a` | Secondary warmth |
| Ocean Teal | `#3a6b73` | Peter, research |
| Terracotta | `#a67a6a` | Maya, habits |
| Warm Coral | `#c4856a` | Jordan, events |
| Amber Gold | `#b8956a` | Nayan, premium |
| Natural Ink | `#2C2520` | Text, contrast |

**❌ NEVER use:**
- Cool blues (tech feeling)
- Neon/bright colors (not earthy)
- Purple/violet (not our palette)
- Pure black or white (too stark)

---

## Regeneration Prompts

When regenerating, always include:

1. **Warm lighting** - "golden hour", "soft warm light"
2. **Texture** - "organic", "handmade", "natural"
3. **Palette reference** - Include hex codes
4. **Anti-patterns** - "NOT corporate", "NOT cold", "NOT generic"
5. **Emotional goal** - "inviting", "peaceful", "human"

Example prompt evolution:
```
❌ "A landscape with mountains"
✅ "Serene alpine meadow at golden hour, Park City Utah style. 
   Warm paper cream (#F5F1E8) and sage green (#4a6741) palette. 
   NOT corporate, NOT stock photo. Feels like a place you'd want to sit quietly."
```

---

## Quality Gates

Before any asset goes to production:

- [ ] Matches Ferni color palette (no cool blues/purples)
- [ ] Has warm, inviting feeling
- [ ] Consistent with other assets in category
- [ ] High resolution (see specs per category)
- [ ] Accessible (sufficient contrast for any text overlays)
- [ ] Passes the "would I want this on my wall?" test

---

## Connection to Being Human

This workflow isn't just about pretty pictures. It's about:

### Consistency = Trust
When users see Ferni assets anywhere—website, app, social—they should feel the same warmth. Like recognizing a friend's handwriting.

### Curation = Care
We don't just generate and publish. We thoughtfully select. This mirrors how Ferni listens carefully rather than just responding quickly.

### Quality = Respect
Every asset represents a moment of attention we're asking from a user. Respect that by making it worth their time.

### Style = Personality
Ferni has a distinct personality. So should our visual language. Warm earth tones, handmade textures, golden light—these aren't aesthetic choices, they're expressions of who we are.

---

## Quick Commands

```bash
# List what needs curation
find images/generated -name "*-v[234]*" | head -20

# Count variants per folder
for d in hero lifestyle social testimonials; do
  echo "$d: $(find images/generated/$d -name "*-v*" | wc -l) variants"
done

# Archive all variants in a category
CATEGORY=hero
mkdir -p images/generated/${CATEGORY}-archive
mv images/generated/${CATEGORY}/*-v[234].* images/generated/${CATEGORY}-archive/

# Check disk space savings
du -sh images/generated/*-archive
```

---

*"The goal isn't to have the most assets. It's to have assets that make people feel something."*

