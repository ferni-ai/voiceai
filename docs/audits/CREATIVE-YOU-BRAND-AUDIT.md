# Creative You Brand Audit

**Date:** December 2024  
**Status:** Action Required

---

## Executive Summary

Creative You is technically functional but **not yet on-brand**. The copy sounds like an algorithm talking, not Ferni as a friend. We need to infuse warmth, presence, and "Better Than Human" moments.

---

## 🚨 Critical Issues

### 1. Copy Sounds Algorithmic, Not Human

**Current (❌):**

- "This connects to our conversation about productivity"
- "Fresh content I just found about mindfulness"
- "Found this while looking for anxiety content"
- "Based on your interest in habits"

**Should Sound Like (✅):**

- "Remember when you mentioned feeling overwhelmed? This helped me think of you."
- "You've been on my mind since we talked about sleep. I found something."
- "This reminded me of what you said about wanting to be more present."
- "I noticed you keep coming back to this topic. There's a reason..."

**Why it matters:** The current copy positions Ferni as a content recommendation engine. Brand guidelines say we compare to _humans_, not algorithms. A friend doesn't say "based on your interests" - they say "this made me think of you."

### 2. Missing "Better Than Human" Moments

What makes Ferni superhuman for Creative You:

- **Perfect recall**: "You mentioned this 3 weeks ago..."
- **Pattern recognition**: "I've noticed you explore this topic when..."
- **Anticipation**: Suggesting content _before_ user asks
- **Emotional memory**: "Last time we talked about this, you seemed..."

**Current implementation:** None of these capabilities are surfaced in copy.

### 3. Discussion Prompts Are Interview Questions

**Current (❌):**

- "What stood out to you most in this video?"
- "How does this connect to something in your own life?"
- "What technique from this would help you most right now?"

**Should Sound Like (✅):**

- "What part made you pause?"
- "Does this land differently than you expected?"
- "I'm curious what you'd change about their approach..."
- "What would you tell them if you could?"

**Why it matters:** Current prompts sound like a therapist with a clipboard. Ferni should be curious like a friend who just watched something with you.

### 4. Transition Phrases Are Generic

**Current (❌):**

- "Speaking of X, I know a great video you might enjoy"
- "That reminds me - there's a video that connects to what we're discussing"

**Should Sound Like (✅):**

- "Oh, that made me think of something..."
- "Wait - have you seen that TED talk about exactly this?"
- "Okay, you have to watch this. It's like they were in the room with us."
- "I keep thinking about something we talked about. Let me show you."

---

## 📋 Action Items

### High Priority (Brand Violations)

| Issue                      | File                          | Fix                                    |
| -------------------------- | ----------------------------- | -------------------------------------- |
| Algorithmic copy           | `intelligent-curator.ts`      | Rewrite `generatePersonalizedReason()` |
| Generic discussion prompts | `youtube-api-client.ts`       | Rewrite `generateDiscussionPrompts()`  |
| Stiff transition phrases   | `conversation-integration.ts` | Rewrite `generateTransitionPhrase()`   |
| Missing memory context     | All services                  | Add "Better Than Human" memory recall  |

### Medium Priority (Brand Enhancement)

| Issue                       | File                           | Fix                                |
| --------------------------- | ------------------------------ | ---------------------------------- |
| Time-of-day copy is generic | `intelligent-curator.ts`       | More Ferni-voiced time phrases     |
| Mood labels are clinical    | `creative-you-dashboard.ui.ts` | Use warmer mood labels             |
| API responses have no voice | All routes                     | Add Ferni personality to responses |

### Low Priority (Polish)

| Issue                       | File                   | Fix                              |
| --------------------------- | ---------------------- | -------------------------------- |
| Learning track descriptions | `podcast-discovery.ts` | Make track intros conversational |
| Error messages              | All services           | Add warm error recovery copy     |

---

## 🎯 Brand-Compliant Copy Patterns

### Personalized Reasons

| Context          | Pattern                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| Topic match      | "Remember when we talked about [X]? This made me think of you."           |
| Emotional match  | "You seemed [emotion] last time. This might help."                        |
| Pattern detected | "I've noticed you keep coming back to [topic]. Here's why that might be." |
| Time-based       | "It's late. Something lighter?" / "Monday morning. Need a spark?"         |
| Growth recall    | "You've come so far on [habit]. This is the next step."                   |

### Discussion Prompts (Ferni Voice)

| Category    | Good Examples                        |
| ----------- | ------------------------------------ |
| Open        | "What part stuck with you?"          |
| Reflective  | "Does this change how you see it?"   |
| Challenging | "What would you push back on?"       |
| Personal    | "Who does this remind you of?"       |
| Forward     | "What would you do differently now?" |

### Transition Phrases (Natural)

| Context             | Pattern                                                |
| ------------------- | ------------------------------------------------------ |
| Mid-conversation    | "Oh, this made me think of something..."               |
| End of conversation | "Before you go - there's something I want you to see." |
| Check-in            | "Been thinking about what you said. Found this."       |
| Surprise            | "Okay, random - but you need to see this."             |

---

## 🔧 Implementation Priority

1. **Immediate**: Fix `generatePersonalizedReason()` in intelligent-curator.ts
2. **This week**: Fix discussion prompts and transition phrases
3. **Next sprint**: Add "Better Than Human" memory integration
4. **Ongoing**: Audit all user-facing copy for brand compliance

---

## ✅ Brand Checklist for Creative You Copy

Before shipping any user-facing text:

- [ ] Could a friend say this? (not an algorithm)
- [ ] Does it reference shared history naturally?
- [ ] Does it lead with emotion, not features?
- [ ] Is it genuinely curious, not clinical?
- [ ] Does it show we remember something specific?
- [ ] Would it sound weird spoken aloud?
- [ ] Does it avoid forbidden words? (platform, user, content, features)
