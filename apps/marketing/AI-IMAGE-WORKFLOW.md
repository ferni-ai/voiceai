# Ferni AI Image Generation Workflow
## Generating Apple-Style Lifestyle Photography

---

## 🎯 Quick Start

### Option 1: Midjourney (Recommended for Stills)

**Setup:**
1. Join Discord and access Midjourney
2. Use `/imagine` command with prompts below

**Basic Prompt Structure:**
```
[Subject] + [Action] + [Environment] + [Lighting] + [Camera/Film Style] + [Parameters]
```

**Ferni Prompt Template:**
```
A [age] [gender] [description] [action with phone/device], 
[environment details], [lighting], warm earthy tones, 
Kodak Portra 400 film, 85mm lens, shallow depth of field, 
natural candid moment --ar 16:9 --v 6 --s 250
```

---

## 📸 Ready-to-Use Midjourney Prompts

### Morning Kitchen (Hero Shot)
```
/imagine A woman in her early 30s sitting by a sunny kitchen window, 
holding her iPhone to her ear with a soft genuine smile, eyes looking 
thoughtfully into the distance, morning light streams through sheer 
curtains, coffee mug with steam nearby, cozy cream oversized sweater, 
warm golden hour lighting, Kodak Portra 400, 85mm f/1.8, 
shallow depth of field, natural candid moment --ar 16:9 --v 6 --s 250
```

### Evening Armchair
```
/imagine A man in his 40s in a comfortable armchair, laptop on lap, 
AirPods in, warm lamp light, living room with books and plants, 
evening golden light through window, relaxed contemplative expression, 
the comfort of a meaningful conversation at home, film grain, 
Kodak Portra 400, warm color palette --ar 16:9 --v 6 --s 200
```

### Commute Moment
```
/imagine A professional man in his late 20s on a train, AirPods in, 
looking out the window with a peaceful expression, soft morning light 
on his face, natural candid moment, he seems to be listening intently, 
slight nod, urban landscape blurred in background, warm earth tones, 
documentary style, 35mm film --ar 16:9 --v 6 --s 200
```

### Late Night Support
```
/imagine A young man in his 20s sitting on his bed at night, phone in hand, 
soft lamp light illuminating his face, expression of relief and comfort, 
cozy bedroom environment with warm tones, books on nightstand, 
intimate lighting, the moment of being heard at 2am, film grain, 
warm shadows --ar 16:9 --v 6 --s 250
```

### Golden Hour Walk
```
/imagine A woman walking through a quiet park path at golden hour, 
phone to her ear, relaxed posture, genuine smile, warm sunset light 
filtering through trees, casual athleisure in earthy sage green, 
autumn leaves on path, peaceful unhurried moment, shallow depth of field, 
soft bokeh, 85mm portrait lens, Kodak Portra --ar 16:9 --v 6 --s 200
```

### Home Office
```
/imagine A woman in her 30s at a clean minimal home desk, MacBook open, 
AirPods in, talking animatedly with hands, soft natural light from 
large window, plants in background, coffee cup, sage green accent items, 
warm productive energy, engaged and energized, 35mm film, 
golden morning light --ar 16:9 --v 6 --s 200
```

---

## 🎬 Google Veo / Runway Prompts (Video)

### Hero Video: Morning Conversation
```
A woman in her early 30s by a sunny kitchen window having a voice conversation 
on her phone. She smiles softly, nods occasionally, takes a sip of coffee. 
Morning sunlight streams through sheer curtains. Warm, intimate, cinematic. 
Kodak film look, 24fps, shallow depth of field. Camera slowly pushes in 
on her face as she has a moment of realization.
```

### Testimonial B-Roll: The Moment of Clarity
```
Close-up of a person's face as they listen intently to advice on their phone. 
The moment of realization spreads across their face - a soft smile forms, 
eyes light up. Intimate, emotional, real. Slow motion. Warm afternoon light. 
Shallow depth of field. Music: soft ambient piano.
```

### Product Demo: Voice Interface
```
A person picks up their phone from a nightstand. They tap once and start 
talking naturally, like calling a friend. Camera follows as they walk 
around their apartment, phone to ear, having a genuine conversation. 
Documentary style, warm natural light, handheld camera movement.
```

---

## 🖼️ DALL-E 3 / ChatGPT Prompts

DALL-E works well for quick iterations. Use these prompts in ChatGPT with DALL-E:

### Professional Portrait Style
```
Create a warm, intimate photograph of a [demographic] having a phone 
conversation. They're in [environment], with [lighting]. The mood is 
[emotional state]. Shot on 35mm film with shallow depth of field, 
warm Kodak Portra color palette. Natural, candid, not posed. 
The scene feels like an Apple "Shot on iPhone" advertisement.
```

**Variables to fill in:**
- Demographic: "woman in her 30s", "man in his 50s", "young professional"
- Environment: "cozy kitchen", "modern home office", "quiet park bench"
- Lighting: "golden morning light", "warm evening lamp light", "sunset through trees"
- Emotional state: "peaceful and reflective", "moment of relief", "quiet joy"

---

## 📱 Ideogram / Leonardo AI Prompts

These platforms work well for text-in-image if needed:

```
An Apple-style advertisement photograph showing a person having a 
meaningful phone conversation. Warm, intimate lighting. The feeling 
of genuine human connection. Film photography aesthetic, shallow 
depth of field, earth tones. High-end commercial photography quality.
--style photographic --quality premium
```

---

## 🎨 Style Parameters Explained

### Midjourney Parameters
| Parameter | Effect | Ferni Value |
|-----------|--------|-------------|
| `--ar` | Aspect ratio | 16:9, 4:5, 1:1 |
| `--v 6` | Version 6 (most realistic) | Always |
| `--s 250` | Stylization (0-1000) | 200-300 |
| `--q 2` | Quality (higher = more detail) | 2 |
| `--no` | Negative prompt | "cold, blue, corporate, stock photo" |

### Recommended Negative Prompts
Add these to avoid generic AI look:
```
--no stock photo, corporate, sterile, cold lighting, blue tones, 
neon, posed, fake smile, AI generated, plastic skin, oversaturated
```

---

## 📋 Shot List Checklist

### Essential Lifestyle Shots (Priority 1)
- [ ] Morning kitchen - phone conversation
- [ ] Home office - laptop/AirPods
- [ ] Evening armchair - relaxed moment
- [ ] Golden hour walk - outdoor
- [ ] Late night - intimate support moment

### Diversity Shots (Priority 2)
- [ ] Professional woman 50s - wisdom
- [ ] Young man 20s - career exploration  
- [ ] Parent 30s - work-life balance
- [ ] Senior 70s - lifelong learning

### Device Shots (Priority 3)
- [ ] Hand holding iPhone with Ferni UI
- [ ] AirPods in ear, warm lighting
- [ ] MacBook with app visible
- [ ] Phone on nightstand scene

### Environment-Only (Priority 4)
- [ ] Cozy reading nook setup
- [ ] Morning kitchen counter
- [ ] Bedside table at night
- [ ] Home office desk aesthetic

---

## 🔄 Batch Generation Workflow

### Step 1: Generate Base Images
Run 4-5 variations of each key prompt in Midjourney:
```
/imagine [prompt] --ar 16:9 --v 6 --s 250
```

### Step 2: Upscale Winners
Select best 1-2 from each batch, upscale:
```
Click U1, U2, U3, or U4 to upscale
```

### Step 3: Generate Variations
For selected images, create variations:
```
Click V1, V2, V3, or V4 for variations
```

### Step 4: Export & Organize
Download high-res versions and organize:
```
apps/marketing/assets/lifestyle/
├── hero/
│   ├── kitchen-morning-v1.png
│   ├── kitchen-morning-v2.png
│   └── ...
├── people-using-ferni/
│   ├── phone-woman-30s.png
│   ├── laptop-man-40s.png
│   └── ...
└── devices/
    ├── hand-iphone.png
    └── ...
```

---

## ⚠️ Legal & Usage Notes

### AI-Generated Image Considerations
1. **Disclosure**: Consider disclosing AI-generated nature if required
2. **Model releases**: AI images don't have model releases
3. **Commercial use**: Check platform terms for commercial rights
4. **Consistency**: Hard to get exact same "person" across images

### Recommendations
- Use AI for concepts and mood boards
- Consider hiring photographer for hero images
- Mix AI-generated environments with stock photography
- Always have backup plan with traditional stock

---

## 🚀 Quick Command Reference

### Midjourney Essentials
```bash
# High quality photo
/imagine [prompt] --ar 16:9 --v 6 --s 250 --q 2

# Portrait orientation (Instagram)
/imagine [prompt] --ar 4:5 --v 6 --s 200

# Square (Social)
/imagine [prompt] --ar 1:1 --v 6 --s 200

# Exclude unwanted elements
/imagine [prompt] --no blue, cold, corporate, stock photo
```

### DALL-E in ChatGPT
```
"Generate a warm, intimate lifestyle photograph in the style of 
Apple advertising. Show [scene description]. Use film photography 
aesthetic with shallow depth of field and Kodak Portra colors."
```

---

*Last updated: December 2024*

