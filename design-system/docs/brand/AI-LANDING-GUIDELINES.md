# AI Landing Page Guidelines

> **"Better than Human"** — The AI features on our landing page demonstrate our core promise through actual interaction, not just description.

## Philosophy

The AI-powered landing page features embody Ferni's superhuman capabilities:

1. **Always Present** — Live chat available without signup
2. **Infinite Memory** — Demonstrated through memory visualization
3. **Reading Between Lines** — Micro-expressions react to behavior
4. **Six Perspectives** — Persona previews showcase each specialist
5. **Zero Judgment** — Warm, low-pressure interactions throughout

## Design Principles

### 1. Demonstrate, Don't Describe

Instead of saying "Ferni remembers everything," we SHOW the memory visualization demo. Instead of claiming "always available," we provide live chat without signup.

```
❌ "We offer 24/7 availability"
✅ Live chat widget with real AI responses
```

### 2. Progressive Engagement

Each interaction should feel natural, not pushy:

```
Visitor Journey:
1. Page load → Personalized hero (passive)
2. Scrolling → Micro-expressions react (subliminal)
3. Hover → "What would Ferni say?" tooltips (gentle)
4. Interest → Chat widget or persona preview (active)
5. Engagement → Smart FAQ or memory demo (deep)
```

### 3. Rate Limiting as Care

We limit demo messages (10 per session) not as a restriction, but as an invitation:

```
"You've used all your demo messages! 💚 Create a free account 
to keep talking with me. I'd love to continue this conversation."
```

This frames the limit as Ferni wanting to continue the relationship, not as a paywall.

## Component Guidelines

### Live Chat Widget

**Position:** Fixed bottom-right (desktop: 24px, mobile: 80px from bottom)

**Trigger Button:**
- Rounded pill shape (border-radius: 100px)
- Persona gradient background
- "Chat with Ferni" text + "AI" badge
- Shadow: `0 8px 32px rgba(74, 103, 65, 0.4)`

**Panel:**
- Width: 380px (responsive on mobile)
- Background: Warm paper cream (#faf8f5)
- Border-radius: 24px
- Header shows messages remaining

**Messages:**
- User: Persona gradient, white text, right-aligned
- AI: White background, dark text, left-aligned
- Both: 18px border-radius with 4px on corner

**Voice:**
- Short responses (2-3 sentences max)
- End with thoughtful questions
- Never salesy, always warm

### Persona Preview Cards

**Layout:** Grid with responsive columns (min 280px)

**Each Card Contains:**
- Persona avatar (56px, gradient background)
- Name and role
- Input field: "Ask [Name] something..."
- Response area with persona traits

**Response Style:**
- Italic quote
- Trait tags in persona color
- Brief (1-2 sentences)
- Shows unique personality

### Smart FAQ

**Container:**
- Gradient background (subtle sage)
- Padding: 24px, border-radius: 20px
- Ferni avatar + "Ask me anything" header

**Input:**
- Full-width with rounded style
- Placeholder: "What would you like to know about Ferni?"

**Response:**
- White card with shadow
- Answer text
- Related questions as clickable tags
- Low confidence disclaimer when unsure

### Memory Visualization

**Layout:** Two-column grid (TODAY → IN 3 MONTHS)

**Today Card:**
- User's input as italic quote
- Emotion tag

**Future Card:**
- Ferni avatar + "Ferni remembers"
- List of extracted insights
- Connected by dashed line SVG

**Insights Extraction:**
- Topic detection (work, relationship, etc.)
- Emotional context
- Growth opportunities

### Voice Samples

**Player Card:**
- Persona avatar + name + duration
- Play/pause button (48px, persona gradient)
- Waveform visualization (20 bars)
- Question context

**Waveform Animation:**
- Bars animate when playing
- Height range: 8px idle → 24px active
- Staggered animation-delay

**Audio Sources:**
- Pre-recorded MP3s preferred
- Browser TTS fallback
- Duration: 10-15 seconds

### Social Proof Dynamic

**Bar Layout:**
- Full-width with subtle background
- Ferni avatar (48px) + quote text
- Auto-rotates every 8 seconds

**Content Types:**
- Conversation: Specific interaction moments
- Moment: Memory callbacks
- Insight: Reading between lines examples

**Tone:**
- First-person from Ferni's perspective
- Specific times/durations for authenticity
- Never uses made-up names

### Hover Preview Tooltips

**Appearance:**
- Dark background (#2c2520)
- Light text (#faf8f5)
- Rounded pill (20px)
- Small Ferni avatar

**Trigger:**
- 500ms hover delay
- Fade + slide animation (200ms)

**Content by Element Type:**
- FAQ: "I'd love to explain this more..."
- Feature: "Let me show you how this works..."
- Testimonial: "Stories like this make me smile..."
- CTA: "No pressure. Just try talking."

### Micro-Expressions

**Expressions:**
| Name | Color | Trigger | Duration |
|------|-------|---------|----------|
| Curious | #5a8060 | CTA hover | 120ms |
| Interested | #6a9070 | Pricing view | 100ms |
| Helpful | #5a7751 | FAQ interaction | 150ms |
| Concerned | #5a7050 | Fast scroll | 200ms |
| Warm | #7aa080 | Slow reading | 180ms |

**Animation:**
- Brightness flash to 1.15
- Duration under 150ms (subliminal)
- Reset to "present" after 3 seconds

### Personalized Hero

**Time-Aware Content:**
| Time | Tagline | Headline | CTA |
|------|---------|----------|-----|
| Late night (0-5) | "Can't sleep?" | "I'm here. Right now." | "Talk to me" |
| Early morning (5-9) | "Early riser?" | "Let's start together." | "Good morning" |
| Returning visitor | "Welcome back." | "Pick up where we left off?" | "Continue" |
| Default | "Better than human." | "Finally, someone who gets it." | "Start free" |

**Returning Visitor Detection:**
- localStorage visit count
- Top sections viewed
- Engagement sentiment

### Sentiment-Reactive Copy

**Thresholds:**
- Low sentiment: < 0.4 (skeptical/hesitant)
- High sentiment: > 0.7 (engaged/positive)
- Neutral: 0.4-0.7 (no change)

**Low Sentiment Adjustments:**
- CTA: "Just try talking—no pressure"
- Subhead: "Take your time. I'm not going anywhere."

**High Sentiment Adjustments:**
- CTA: "Let's do this"
- More energizing language

## Animation Standards

All AI landing animations follow these standards:

1. **Respect `prefers-reduced-motion`**
2. **Use design system easings** (EASING.SPRING, EASING.GENTLE)
3. **Keep micro-expressions subliminal** (< 150ms)
4. **Chain animations with proper delays**

## Accessibility

1. **ARIA labels** on all interactive elements
2. **Keyboard navigation** for chat widget (Escape to close)
3. **Focus management** when opening/closing panels
4. **Screen reader announcements** for new messages
5. **Color contrast** meets WCAG AA (especially in chat)

## Performance

1. **Lazy load** AI scripts after critical path
2. **Rate limit API calls** (one personalization per session)
3. **Cache hover previews** per session
4. **Debounce scroll-based triggers**

## Metrics to Track

| Metric | Target | Measures |
|--------|--------|----------|
| Chat engagement | > 5% of visitors | AI interaction appeal |
| Messages per session | 3-4 avg | Conversation quality |
| Demo → Signup | > 15% | Conversion effectiveness |
| Persona preview clicks | > 3% | Team discovery |
| FAQ asks | > 2% | Information needs |

## Anti-Patterns

❌ **Don't** make the chat widget intrusive  
❌ **Don't** use generic "AI Assistant" language  
❌ **Don't** compare to other AI products  
❌ **Don't** show technical limitations publicly  
❌ **Don't** make rate limits feel punitive  
❌ **Don't** use expressions longer than 150ms (loses subliminal effect)  
❌ **Don't** personalize aggressively (creepy factor)  

## Related Documentation

- `FERNI-BRAND-GUIDELINES.md` — Full brand identity
- `BETTER-THAN-HUMAN.md` — Emotional intelligence philosophy
- `FERNI-SCREEN-GUIDELINES.md` — Digital design standards
- `../tokens/ai-landing.json` — Component design tokens
- `../choreography/ai-landing-interactions.ts` — Animation specs

