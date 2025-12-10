# 🚨 CRITICAL: Intro & Greeting Audit

**Date:** December 9, 2024  
**Status:** 🔴 CRITICAL - Immediate fixes required  
**Impact:** First impressions are cold, robotic, and lengthy

---

## Executive Summary

Ferni's intro feels **static, long, and cold**. Users report:

1. Greetings are too verbose with choppy SSML pauses
2. Service-agent language ("anything I can help with?") appears repeatedly
3. First impression lacks warmth and humanity

This directly violates our core brand promise: **"Better than human."**

---

## 🔴 Critical Issues Identified

### Issue 1: Service-Agent Language

**The Problem:** Phrases like "How can I help?" and "What can I do for you?" position Ferni as a customer service chatbot, not a friend.

**Locations Found:**

| File                              | Line | Offending Text                                                   |
| --------------------------------- | ---- | ---------------------------------------------------------------- |
| `greetings.json`                  | 19   | "What can I do for you?"                                         |
| `greetings.json`                  | 52   | "What can I help with?"                                          |
| `entrances.json`                  | 53   | "What can I help with?"                                          |
| `persona-mood.ts`                 | 273  | "What can I help you figure out?"                                |
| `persona-mood.ts`                 | 387  | "I'm here. What can I help you organize?"                        |
| `conversation-state.ts`           | 132  | `shouldAsk: ['Is there anything else?', 'Any other questions?']` |
| `relationship-behaviors.ts`       | 103  | "How can I help?"                                                |
| `shared/relationship-building.ts` | 27   | "Is there anything else I can help with?"                        |
| `shared/relationship-building.ts` | 34   | "How can I help you?"                                            |

**Brand Violation:** See `.cursorrules` → FORBIDDEN WORDS section:

> NEVER say "How can I help you?" - this positions us as a service agent, not a friend.

**Fix Required:** Replace with conversational alternatives:

- "What's going on?" ✅
- "What's on your mind?" ✅
- "What brings you here?" ✅
- "Tell me what's happening." ✅
- "What's up?" ✅

---

### Issue 2: Overly Long Greetings

**The Problem:** Greetings have too many SSML break tags, creating choppy, robotic speech. Many are 3-4 sentences when 1-2 would feel warmer.

**Example of Verbose Greeting:**

```
"<break time=\"200ms\"/>Welcome. <break time=\"150ms\"/>I'm Ferni—<break time=\"100ms\"/>your partner in figuring things out. <break time=\"200ms\"/>What brings you here?"
```

- 4 SSML breaks in one greeting
- "your partner in figuring things out" is corporate-speak
- Takes ~3-4 seconds to deliver

**Better Alternative:**

```
"<break time=\"150ms\"/>Hey. <break time=\"200ms\"/>I'm Ferni. <break time=\"150ms\"/>What's going on?"
```

- 2 SSML breaks (natural pacing)
- Direct, warm, human
- Takes ~2 seconds to deliver

**Files Needing Shortening:**

- `src/personas/bundles/ferni/content/behaviors/greetings.json`
- `src/personas/greetings.ts` (template sets)
- `src/conversation/proactive-starters.ts`

---

### Issue 3: Greeting Cascade Complexity

**The Problem:** The greeting system has 6 layers of fallback logic that can produce overly long outputs:

1. Life event acknowledgment (prepended)
2. Milestone message (appended)
3. Thread starter (appended)
4. Proactive insight (appended)
5. Emotional memory check-in (appended)
6. Music callback (appended)

**Result:** A greeting can become:

```
"[life event] [base greeting] [thread starter] [proactive insight]"
```

This creates greetings that are 4+ sentences long.

**Fix Required:** Cap greeting length and make appending mutually exclusive.

---

### Issue 4: Cold Static Templates

**The Problem:** Some templates feel like form letters, not friends:

```json
"<break time=\"200ms\"/>Hello. <break time=\"150ms\"/>I'm ${name}. <break time=\"150ms\"/>It's good to meet you."
```

**Warmth Score:** 2/10 - Could be a bank teller.

**Better Alternative:**

```json
"<emotion value=\"happy\"/><break time=\"150ms\"/>Hey! <break time=\"200ms\"/>I'm ${name}. <break time=\"150ms\"/>Pull up a chair."
```

**Warmth Score:** 8/10 - Feels like meeting a friend.

---

## 📋 Action Items

### Immediate (Today)

- [ ] Remove ALL instances of "How can I help?" from greeting files
- [ ] Remove "What can I do for you?" from greetings.json
- [ ] Remove "Is there anything else?" from conversation-state.ts
- [ ] Reduce SSML breaks in greetings to max 2-3 per greeting

### Short-term (This Week)

- [ ] Rewrite cold templates in greetings.json to be warmer
- [ ] Add greeting length cap (max 2 sentences for base greeting)
- [ ] Make greeting appenders mutually exclusive (only one add-on)
- [ ] Add warmth scoring to greeting selection

### Medium-term (This Sprint)

- [ ] Create A/B test for greeting warmth
- [ ] Add user feedback mechanism for first impression
- [ ] Build greeting analytics dashboard
- [ ] Create "warmth linter" for greeting templates

---

## 🎯 Success Metrics

| Metric                   | Current     | Target       |
| ------------------------ | ----------- | ------------ |
| Avg greeting length      | ~4 seconds  | <2.5 seconds |
| Service-agent phrases    | 9 instances | 0 instances  |
| SSML breaks per greeting | 4-6         | 2-3          |
| User warmth rating       | Unknown     | 8+/10        |

---

## Files to Modify

| File                                                          | Type of Change                   |
| ------------------------------------------------------------- | -------------------------------- |
| `src/personas/bundles/ferni/content/behaviors/greetings.json` | Remove service language, shorten |
| `src/personas/bundles/ferni/content/behaviors/entrances.json` | Remove service language          |
| `src/intelligence/context-builders/persona-mood.ts`           | Remove "help" patterns           |
| `src/intelligence/conversation-state.ts`                      | Remove "anything else" patterns  |
| `src/personas/shared/relationship-building.ts`                | Remove service patterns          |
| `src/personas/greetings.ts`                                   | Shorten templates                |
| `src/agents/voice-agent.ts`                                   | Add greeting length cap          |

---

## Brand Guidelines Reminder

From `.cursorrules`:

> **FORBIDDEN COMPARISONS:**
>
> - "chatbot" - Positions us as low-value tool
> - "AI assistant" - Generic, commoditized
>
> **Lead with EMOTION, not features:**
>
> - ❌ "Ferni has infinite memory capabilities"
> - ✅ "That thing you mentioned six months ago? We remember."
>
> **Frame as RELATIONSHIP, not product:**
>
> - ❌ "Start using Ferni today"
> - ✅ "Finally, someone who gets it."

The intro is the first moment of relationship. It should feel like a friend who's genuinely happy to see you, not a service counter.

---

## Next Steps

1. Implement immediate fixes (service language removal)
2. Test with real users
3. Iterate based on feedback
4. Document pattern for future greetings
