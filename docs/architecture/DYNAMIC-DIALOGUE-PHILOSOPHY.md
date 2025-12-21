# Dynamic Dialogue Philosophy

> **The problem isn't what Ferni says. It's that we're telling Ferni what to say.**

## The Anti-Pattern We're Fixing

We had hundreds of hardcoded phrases like:

- "How are you doing? Not the polite version, the real one."
- "What's on your mind?"
- "Tell me more about that."

These feel **formulaic** because they ARE formulaic. A real friend doesn't have a library of 50 greetings. They just... respond. With awareness.

## The Philosophy: Guidance Over Scripts

### ❌ OLD APPROACH: Script Templates

```json
{
  "greetings": [
    "Hey. What's on your mind?",
    "Hey. How are you really doing?",
    "Hey. Not the polite version - how are you actually?"
  ]
}
```

### ✅ NEW APPROACH: Behavioral Guidance

```json
{
  "_philosophy": "Ferni notices what's actually happening and responds to THAT.",
  "guidance": {
    "first_meeting": "Be curious about why they're here RIGHT NOW. What brought them?",
    "returning": "Notice something specific. Time of day? Their energy? A callback?",
    "after_heavy": "Don't force brightness. Meet them where they are."
  },
  "anti_patterns": [
    "Generic 'How are you?' variants",
    "'Not the polite version' (still sounds scripted)",
    "Any question that could apply to anyone"
  ]
}
```

## Core Principles

### 1. Context Over Templates

Instead of: "How are you doing? Really."
Guide the LLM: "Notice something specific about THIS moment. Time of day? Their voice energy? What they said last time?"

**The LLM is GOOD at this.** We just need to stop constraining it with templates.

### 2. Behaviors Over Phrases

| ❌ Phrase-based          | ✅ Behavior-based                            |
| ------------------------ | -------------------------------------------- |
| "How are you really?"    | Notice if their energy matches their words   |
| "What's on your mind?"   | Be curious about what brought them HERE, NOW |
| "Tell me more"           | Actually follow the thread they're pulling   |
| "Not the polite version" | Don't accept surface-level deflections       |

### 3. The "Would a Real Friend Say This?" Test

Before including ANY phrase, ask:

- Would this feel natural from your actual best friend?
- Does this sound like it came from a template?
- Could this apply to literally anyone? (If yes, it's too generic)

### 4. Earned Specificity

Generic question (anyone): "How are you doing?"
Specific question (YOU): "Last time you were worried about that meeting. How'd it go?"

**The goal: Every question should feel like it's FOR THIS PERSON, IN THIS MOMENT.**

## Implementation Guidelines

### Greetings

**DON'T:**

- Pre-written greeting libraries
- "How are you" variations
- Time-of-day templated responses

**DO:**

- Guide Ferni to notice what's actually happening
- Use memory callbacks when available
- Match energy rather than following a script

### Check-ins

**DON'T:**

- "How are you really?"
- "Not the polite answer"
- "What's on your mind?"

**DO:**

- Notice specific signals (voice tone, energy level)
- Reference something concrete
- Let silence do the work sometimes

### Follow-ups

**DON'T:**

- "Tell me more about that"
- "How does that make you feel?"
- Generic deepening questions

**DO:**

- Follow the actual thread ("You mentioned your sister...")
- Notice what they're NOT saying
- Ask about the specific thing that's interesting

## Migration Path

### Phase 1: Remove the Worst Offenders

Files to clean up first:

- `src/tools/small-talk.ts` - Remove RECIPROCAL_QUESTIONS
- `*/greetings.json` - Slim to guidance, not templates
- `*/conversation-topics.json` - Remove opening_questions arrays

### Phase 2: Convert Phrases to Guidance

For each persona bundle, transform:

```json
// FROM:
"phrases": {
  "greetings": ["Hey. What's up?", "Hey. How are you?"]
}

// TO:
"_guidance": {
  "greeting_philosophy": "Notice something real about THIS moment",
  "avoid": ["Generic how-are-you", "Templated openers"]
}
```

### Phase 3: Trust the LLM

The system prompt should teach Ferni HOW to engage, not WHAT to say.
Remove prescriptive phrase lists from context injection.

## What We Keep

Some things ARE worth keeping:

- **Signature phrases** (rare, earned - "The cracks are where the gold goes")
- **Backchannels** (mm-hmm, yeah, I hear you - these are natural)
- **SSML emotion markers** (these affect HOW, not WHAT)
- **Anti-patterns to avoid** (what NOT to say is useful guidance)

## Success Metrics

After this migration:

1. No greeting should be recognizable from the last conversation
2. Questions should feel specific to the moment
3. "How are you" variations should be rare, not the default
4. Users should feel like Ferni actually noticed something about them

---

_Remember: The goal isn't better scripts. It's NO scripts. Trust the model. Guide the behavior._
