# Static Phrase Audit - Guidance Over Scripts

> **The problem isn't what we say. It's that we're telling the LLM what to say.**

## Philosophy

This audit follows the principles established in `docs/architecture/DYNAMIC-DIALOGUE-PHILOSOPHY.md`:
- Give the LLM WHO the persona is, not WHAT they say
- Provide behavioral GUIDANCE, not phrase SCRIPTS
- Let authentic responses emerge from character

## The Pattern: Phrases → Guidance

### ❌ Before (Script-based)

```json
"false_fine": [
  "You said 'fine' but that didn't land as fine. What's underneath?",
  "I'm not buying 'fine' today. What's actually going on?",
  "Hey. That sounded automatic. How are you really?"
]
```

### ✅ After (Guidance-based)

```json
"false_fine": {
  "guidance": "When the user's words contradict their tone, gently call out the mismatch.",
  "intent": "Invite deeper sharing without confrontation.",
  "signals_to_notice": ["Verbal 'fine' with heavy voice", "Quick dismissals"],
  "your_approach": "Use a soft, curious tone. 'Something tells me...' 'I noticed...'",
  "avoid": ["'How are you really?' (scripted)", "'Not the polite version' (cliché)"]
}
```

## Phrases to ELIMINATE

These phrases should NEVER appear in persona content:

| Phrase | Why It's Bad |
|--------|--------------|
| "How are you really?" | Scripted, applies to anyone |
| "Not the polite version" | Cliché, we've overused it |
| "What's on your mind?" | Generic, no specificity |
| "Tell me more about that" | Therapist cliché |
| "How does that make you feel?" | Clinical |
| "I understand" / "I hear you" | Empty validation |
| "That's interesting" | AI tell |

## Files Status

### ✅ CONVERTED (Completed - December 2024)

| File Type | Personas | Notes |
|-----------|----------|-------|
| `trust-phrases.json` | ALL 6 personas | `false_fine`, `deflection`, `growth_reflection`, `thinking_of_you` converted to guidance |
| `emotional-intelligence.json` | ALL 6 personas | All `detecting_*` sections converted from phrase arrays to guidance |
| `thinking-of-you.json` | ALL 5 personas (Ferni, Maya, Peter, Jordan, Nayan) | Converted all outreach phrase arrays |
| `greetings.json` | ALL 6 personas | Already used `_examples_not_scripts` pattern |
| `voice-dna.json` (Ferni) | Ferni | `pushing_gently` converted |
| `core-identity.md` (Ferni) | Ferni | Push Gently section updated |
| `llm-expression-generator.ts` (Ferni) | Ferni | Removed static phrase |
| `catchphrases.json` (Ferni) | Ferni | `mental_health_advocacy` converted |

### ✅ ALREADY CORRECT (No Change Needed)

| File | Why It's Fine |
|------|---------------|
| `*/content/behaviors/greetings.json` | Already guidance-based with `_examples_not_scripts` |
| `*/identity/system-prompt.md` | Lists bad phrases in "NEVER say" section |
| `*/content/behaviors/backchannels.json` | Backchannels ARE static by nature |
| `small-talk.ts` | Lists phrases as anti-patterns (deprecated) |
| `base-identity.ts` | Lists phrases as anti-patterns |

### 🔍 OPTIONAL REVIEW (Low Priority)

| File | Notes |
|------|-------|
| `*/content/behaviors/i-notice-power.json` | Uses placeholders like `{emotion}` - intentionally contextual |
| `*/content/behaviors/superhuman-insights.json` | Uses placeholders - intentionally contextual |
| `*/content/behaviors/predictive-intelligence.json` | Has some phrase arrays - review if issues arise |

## Conversion Guide

### Step 1: Identify phrase arrays

Look for patterns like:
```json
"category_name": [
  "Phrase one...",
  "Phrase two...",
  "Phrase three..."
]
```

### Step 2: Extract the INTENT

For each phrase array, ask:
- What SIGNAL triggers this?
- What's the APPROACH?
- What's the persona-specific FLAVOR?
- What should be AVOIDED?

### Step 3: Convert to guidance object

```json
"category_name": {
  "guidance": "Brief description of what to do",
  "intent": "The underlying purpose",
  "signals_to_notice": ["What triggers this behavior"],
  "your_approach": "How to respond - style, not scripts",
  "[persona]_brings": {
    "from_backstory": "Relevant backstory element",
    "her_gift": "What makes this persona unique here"
  },
  "avoid": ["Scripts to not use", "Patterns to avoid"]
}
```

### Step 4: Validate JSON

```bash
node -e "JSON.parse(require('fs').readFileSync('path/to/file.json', 'utf8'))"
```

## Migration Commands

```bash
# Find all files with "phrases" arrays
grep -c '"phrases":' src/personas/bundles/*/content/behaviors/*.json

# Find "How are you really" variants
grep -ri "how are you.*really\|not the polite\|what's on your mind" src/personas/bundles/

# Validate all JSON files after changes
for f in src/personas/bundles/*/content/behaviors/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f', 'utf8'))" 2>&1 || echo "❌ $f"
done
```

## Success Criteria

After full migration:
1. ✅ No greeting should be recognizable from the last conversation
2. ✅ Questions should feel specific to the moment
3. ✅ "How are you really?" variants are in AVOID sections only
4. ✅ Users should feel like the persona actually noticed something about THEM
5. ✅ All JSON files validate
6. ✅ Guidance objects have `intent`, `approach`, `avoid`, and persona-specific flavor

---

*Remember: The goal isn't better scripts. It's NO scripts. Trust the model. Guide the behavior.*

