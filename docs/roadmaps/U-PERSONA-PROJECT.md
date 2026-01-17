# "U" Persona Project - Voice Clone Feature

> **Status:** 📋 Planned (Not Started)  
> **Priority:** Future Feature  
> **Estimated Effort:** 2 weeks  
> **Last Updated:** December 2024

---

## Overview

Let users clone their own voice and have Ferni make calls **as them**.

**Use Cases:**
- Wait on hold for businesses
- Make awkward calls (cancellations, complaints)
- Handle routine calls (appointments, RSVPs)
- Accessibility support for users who have difficulty speaking

---

## Documents

| Document | Description |
|----------|-------------|
| [Architecture Plan](../architecture/VOICE-CLONE-U-PERSONA.md) | Full implementation plan with UI mockups, API design, and sprint breakdown |
| [API Research](../research/VOICE-CLONE-API-RESEARCH.md) | Deep research on Cartesia voice cloning API, pricing, and technical requirements |

---

## Quick Summary

### Why Cartesia?
- ✅ Already integrated (we use Cartesia for all TTS)
- ✅ Instant voice cloning (3-10 sec audio)
- ✅ Clone creation is FREE
- ✅ Lowest latency (90ms TTFA)
- ✅ High quality voice reproduction

### Key Numbers
| Metric | Value |
|--------|-------|
| Min audio required | 3 seconds |
| Optimal audio | 10 seconds |
| Clone creation cost | FREE |
| TTS cost | 1 credit/char (~$0.15/5-min call) |
| Time to create clone | ~1-2 seconds |

### Implementation Phases

1. **Voice Recording & Cloning** (Week 1)
   - Recording UI with waveform
   - Audio quality validation
   - Cartesia API integration

2. **"U" Persona Configuration** (Week 1)
   - Settings UI (greeting, personality traits)
   - Avoid phrases, signature phrases

3. **Call Integration** (Week 2)
   - `callAsUser` tool for LLM
   - Hold handling logic
   - Result reporting

4. **Safety & Polish** (Week 2)
   - Rate limiting
   - Legal disclosures
   - Consent flow

---

## Prerequisites

Before starting:
- [ ] Verify Cartesia Pro tier or higher (for instant cloning)
- [ ] Design review of configuration UI
- [ ] Legal review of consent flow and disclosures
- [ ] Decide on subscription tier integration (Friend/Partner feature?)

---

## When to Build

Consider building when:
1. Core voice experience is stable
2. User demand signal is clear
3. Subscription/monetization is in place
4. Legal framework is reviewed

---

## Related Features

- Voice referral calls (implemented ✅)
- Two-way conversational calls (implemented ✅)
- Proactive outreach system (implemented ✅)

