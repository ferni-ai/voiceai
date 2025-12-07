# Ferni Avatar Generation - Midjourney Guide

Use Midjourney's `--cref` (character reference) feature to create consistent zen bowl avatars matching Maya's style.

---

## Setup

1. **Upload Reference Image to Discord:**
   - Upload `images/generated/avatars/avatar-maya.png` to a Discord channel
   - Right-click the uploaded image → "Copy Link"
   - This URL becomes your `--cref` reference

2. **Or Host Reference Image:**
   - Upload Maya to any image host (Imgur, etc.)
   - Use the direct image URL

---

## Prompts (Copy-Paste Ready)

Replace `[MAYA_URL]` with your uploaded Maya image URL.

### Ferni (Sage Green - Lead Coach)
```
TOP-DOWN bird's eye view of nested concentric ceramic bowls, 5 sage green #4a6741 matte ceramic rings, white ceramic ring accent near center, small round face in center with closed happy eyes and gentle warm smile, matte grainy terracotta texture, pure white background, soft even lighting, Japanese zen nesting bowls style --cref [MAYA_URL] --cw 100 --ar 1:1 --v 6.1
```

### Peter (Ocean Teal - Research)
```
TOP-DOWN bird's eye view of nested concentric ceramic bowls, 5 ocean teal #3a6b73 matte ceramic rings, white ceramic ring accent near center, small round face in center with closed happy eyes and gentle curious smile, matte grainy terracotta texture, pure white background, soft even lighting, Japanese zen nesting bowls style --cref [MAYA_URL] --cw 100 --ar 1:1 --v 6.1
```

### Alex (Slate Blue - Communications)
```
TOP-DOWN bird's eye view of nested concentric ceramic bowls, 5 soft slate blue #5a6b8a matte ceramic rings, white ceramic ring accent near center, small round face in center with closed happy eyes and gentle confident smile, matte grainy terracotta texture, pure white background, soft even lighting, Japanese zen nesting bowls style --cref [MAYA_URL] --cw 100 --ar 1:1 --v 6.1
```

### Jordan (Warm Coral - Events)
```
TOP-DOWN bird's eye view of nested concentric ceramic bowls, 5 warm coral #c4856a matte ceramic rings, white ceramic ring accent near center, small round face in center with closed happy eyes and gentle joyful smile, matte grainy terracotta texture, pure white background, soft even lighting, Japanese zen nesting bowls style --cref [MAYA_URL] --cw 100 --ar 1:1 --v 6.1
```

### Nayan (Amber Gold - Premium)
```
TOP-DOWN bird's eye view of nested concentric ceramic bowls, 5 warm amber gold #b8956a matte ceramic rings, white ceramic ring accent near center, small round face in center with closed happy eyes and gentle wise smile, matte grainy terracotta texture, pure white background, soft even lighting, Japanese zen nesting bowls style --cref [MAYA_URL] --cw 100 --ar 1:1 --v 6.1
```

### Team Shot (All 6 Together)
```
Six zen ceramic bowl characters in gentle curved line viewed from above, each is nested concentric ceramic rings in different colors: sage green, terracotta, slate blue, ocean teal, coral, amber gold, sage green largest in center front, each has small face with closed eyes and gentle smile, matte ceramic texture, warm cream background, Japanese zen pottery family portrait --cref [MAYA_URL] --cw 80 --ar 16:9 --v 6.1
```

---

## Parameter Reference

| Parameter | Purpose |
|-----------|---------|
| `--cref [URL]` | Character reference - maintains visual style |
| `--cw 100` | Character weight (0-100) - higher = more faithful to reference |
| `--ar 1:1` | Aspect ratio - square for avatars |
| `--ar 16:9` | Aspect ratio - wide for team shot |
| `--v 6.1` | Midjourney version 6.1 (best quality) |

---

## Workflow

1. In Discord, type `/imagine` and paste the prompt
2. Wait for 4 variations to generate
3. Click U1-U4 to upscale your favorite
4. Right-click upscaled image → Save
5. Rename to `avatar-[name].png`
6. Move to `images/generated/avatars-final/`

---

## Color Reference

| Persona | Hex | Role |
|---------|-----|------|
| Ferni | #4a6741 | Life Coach (Lead) |
| Peter | #3a6b73 | Research |
| Alex | #5a6b8a | Communications |
| Maya | #a67a6a | Habits/Routines |
| Jordan | #c4856a | Events |
| Nayan | #b8956a | Premium Coach |

---

## Tips for Consistency

1. **Use same reference image** for all prompts
2. **Keep `--cw 100`** for maximum style matching
3. **Upscale the best variant** (U1-U4) for final use
4. **Regenerate** if colors drift - Midjourney sometimes shifts hues
5. **Compare side-by-side** before finalizing

---

## Alternative: Use Midjourney Web

1. Go to https://www.midjourney.com
2. Click "Create" 
3. Upload Maya as reference in the image panel
4. Paste prompts (remove `--cref [URL]` since you uploaded directly)
5. Generate and download

---

## Final Checklist

- [ ] avatar-ferni.png (sage green)
- [ ] avatar-peter.png (ocean teal)  
- [ ] avatar-alex.png (slate blue)
- [ ] avatar-maya.png (terracotta) - already have!
- [ ] avatar-jordan.png (warm coral)
- [ ] avatar-nayan.png (amber gold)
- [ ] avatar-team.png (all together)

Save all final avatars to: `images/generated/avatars-final/`

