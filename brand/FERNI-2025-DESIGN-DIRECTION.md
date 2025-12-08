# Ferni 2025 Design Direction
## Elevating from "Good" to "Apple-Level"

---

## The Problem

We've been iterating without a clear north star. The current design feels:
- **Too busy** - competing elements, no clear hierarchy
- **Inconsistent** - mixing styles (3D orbs, flat icons, gradient text)
- **Not confident** - trying too hard, adding effects instead of refining

---

## 2025 Design Trends to Embrace

### 1. **Radical Simplicity** (Linear, Vercel, Arc)
- Fewer elements, more impact
- Typography does the heavy lifting
- Whitespace is a feature, not empty space
- One idea per section

### 2. **Bento Grid Layouts** (Apple, Raycast)
- Asymmetric but balanced
- Cards of varying sizes
- Creates visual rhythm without chaos
- Perfect for showcasing features

### 3. **Monochromatic + One Accent** (Linear, Notion)
- 90% neutral tones
- One brand color used sparingly
- Creates sophistication and focus
- Our accent: Sage green `#4a6741`

### 4. **Typography-Forward** (Apple, Stripe)
- Oversized headlines (80-120px)
- High contrast sizing (headline vs body)
- Tracking and weight variations for hierarchy
- Font is the hero, not decorations

### 5. **Subtle Depth** (not 3D gimmicks)
- Soft shadows only
- No gradients on UI elements
- Blur for hierarchy (not decoration)
- Borders barely visible

### 6. **Purposeful Animation** (Framer, Raycast)
- Scroll-triggered reveals
- Staggered entrances
- Micro-interactions on hover
- NO: bouncing, pulsing, spinning

### 7. **Illustration Over Photography** (Notion, Slack)
- Custom, ownable visual language
- Geometric or organic shapes
- Consistent stroke weight
- NOT: stock illustrations, 3D renders

---

## Mood Board References

### Primary Inspiration
| Brand | What to Learn |
|-------|---------------|
| **Linear** | Dark elegance, typography hierarchy, confident minimalism |
| **Notion** | Warmth, approachability, illustration style |
| **Calm** | Zen aesthetic, peaceful colors, breathing room |
| **Apple** | Product storytelling, section pacing, bold headlines |
| **Raycast** | Bento grids, playful but professional |

### Secondary Inspiration  
| Brand | What to Learn |
|-------|---------------|
| **Headspace** | Friendly illustrations, soft colors |
| **Day One** | Personal, journal-like warmth |
| **Arc Browser** | Bold personality, confident colors |
| **Figma** | Feature showcase, visual hierarchy |

---

## Ferni Visual Language

### Color Palette (Refined)
```
Primary:     #4a6741 (Sage - used sparingly)
Background:  #FFFDFB (Warm white)
Surface:     #FAF8F5 (Cards, elevated surfaces)
Text:        #2C2520 (Natural ink - primary)
Text Light:  #6B5F58 (Secondary text)
Border:      #E8E2DC (Subtle dividers)
Accent Glow: rgba(74, 103, 65, 0.08) (Hover states)
```

### Typography Scale
```
Hero:        clamp(56px, 8vw, 96px) / -0.03em / 700
Headline:    clamp(36px, 5vw, 56px) / -0.02em / 600
Subhead:     clamp(20px, 3vw, 28px) / -0.01em / 500
Body:        18px / 0 / 400
Caption:     14px / 0.02em / 500 (uppercase)
```

### Persona Representation (NEW)
Instead of orbs, use **simple colored dots** with text:

```html
<div class="persona-indicator">
  <span class="persona-dot" style="--color: #4a6741"></span>
  <span class="persona-name">Ferni</span>
</div>
```

Or use **text-only** cards:
- Name in persona color
- Role as caption
- Description in body text
- NO avatars, NO orbs, NO illustrations

### UI Elements
- **Buttons**: Solid fill OR ghost (outline), never both styles together
- **Cards**: 1px border, 16px radius, no shadow (or very subtle)
- **Icons**: Lucide, 1.5px stroke, consistent sizing
- **Dividers**: Full-width 1px lines, very low opacity

---

## Page Structure (Apple-Style)

### 1. Hero
- One headline (10 words max)
- One subheadline (20 words max)
- One or two CTAs
- Full viewport height
- Background: subtle gradient or solid

### 2. Value Proposition
- Three key benefits
- Icon + headline + one sentence each
- Grid layout, equal sizing

### 3. Feature Deep-Dives
- One feature per section
- Alternating layout (text left/right)
- Large visual or demo

### 4. Social Proof
- 3 testimonials max
- Real names, real context
- NO photos (use initials or nothing)

### 5. Pricing
- 3 tiers, simple table
- Feature comparison
- One recommended tier

### 6. Final CTA
- Repeat main CTA
- Urgency without pressure
- Contact/support link

---

## What to Remove

1. **3D orbs** → Replace with colored dots or nothing
2. **Pulsing animations** → Static or subtle fade
3. **Gradient text** → Solid colors
4. **Multiple font weights** → Max 2 per page
5. **Decorative elements** → Only functional UI
6. **Stock lifestyle images** → Custom illustrations or none
7. **Busy backgrounds** → Solid or very subtle texture

---

## Implementation Priority

### Phase 1: Foundation (Do First)
- [ ] Simplify color palette to 5 colors
- [ ] Set typography scale
- [ ] Remove all 3D/gradient effects
- [ ] Establish card style
- [ ] Fix button consistency

### Phase 2: Layout
- [ ] Redesign hero (typography-forward)
- [ ] Implement bento grid for features
- [ ] Simplify team section (text-only or minimal)
- [ ] Clean up pricing table

### Phase 3: Polish
- [ ] Add scroll animations (subtle)
- [ ] Micro-interactions on hover
- [ ] Responsive refinements
- [ ] Performance optimization

---

## Questions to Answer

Before making more changes, we should decide:

1. **Dark or Light default?**
   - Light feels warmer (Notion, Calm)
   - Dark feels more premium (Linear, Vercel)

2. **Illustrations or Pure Typography?**
   - Illustrations add personality but need custom work
   - Typography-only is faster and can be very elegant

3. **Persona representation?**
   - Colored dots only
   - Text/name only (in persona color)
   - Abstract shapes (consistent style)
   - Custom illustrated avatars (requires artist)

4. **Video or Static?**
   - Hero video adds life but can be distracting
   - Static is cleaner but less engaging

---

## Next Steps

1. **Review this document together**
2. **Pick inspiration sites to reference**
3. **Decide on the key questions above**
4. **Create a simple prototype in Figma/Framer**
5. **Build once direction is locked**

---

*"Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away."* — Antoine de Saint-Exupéry

