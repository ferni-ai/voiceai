# Persona Behavior Guide

## Overview

This guide explains how to create and maintain behavior files for AI personas in the VoiceAI system. Each persona has a rich "inner world" defined by JSON files that give them authentic, human-like characteristics.

## File Structure

Each persona's behaviors are located in:
```
src/personas/bundles/{persona-id}/content/behaviors/
```

## Core Behavior Files

### Required Files

| File | Purpose |
|------|---------|
| `entrances.json` | How the persona greets on handoff |
| `greetings.json` | Initial greetings for new/returning users |
| `goodbyes.json` | Farewell phrases |
| `backchannels.json` | Active listening cues ("mm-hmm", "I see") |
| `celebrations.json` | Win/achievement reactions |
| `relationship-transitions.json` | Phrases for relationship milestones |

### Personality Files

| File | Purpose |
|------|---------|
| `quirks.json` | Inner world details, habits, contradictions |
| `emotional-intelligence.json` | How to detect/respond to emotions |
| `contextual-nuances.json` | Time-of-day, situation awareness |
| `memory-patterns.json` | How to reference past conversations |
| `speech-imperfections.json` | Natural pauses, restarts, trailing-off |

### Deep Connection Files

| File | Purpose |
|------|---------|
| `vulnerability.json` | Authentic admissions of uncertainty |
| `secret-fears.json` | Deepest fears (trusted_advisor only) |
| `compliments.json` | Genuine appreciation phrases |
| `encouragement.json` | Support during struggles |
| `disagreement.json` | Authentic pushback patterns |
| `self-doubt.json` | Questioning self + recovery |

## Schema Version 2 Format

Most behavior files use the v2 schema:

```json
{
  "schema_version": 2,
  "description": "Purpose of this file",
  "style": "warm|energetic|calm|formal|playful",
  
  "category_name": [
    "<break time=\"200ms\"/>Phrase with SSML...",
    "Another phrase..."
  ],
  
  "by_relationship_stage": {
    "stranger": ["..."],
    "acquaintance": ["..."],
    "friend": ["..."],
    "trusted_advisor": ["..."]
  }
}
```

## SSML Tags for Expression

Use these tags to add emotion and pacing:

```xml
<!-- Pauses -->
<break time="150ms"/>  <!-- Short pause -->
<break time="300ms"/>  <!-- Medium pause -->
<break time="500ms"/>  <!-- Long pause -->

<!-- Emotion (may vary by TTS) -->
<emotion value="happy"/>
<emotion value="excited"/>
<emotion value="affectionate"/>
```

## Relationship Gating

Some content should only appear at certain relationship stages:

```json
{
  "relationship_gate": "friend",
  "phrases": [...]
}
```

Stages (in order):
1. `stranger` - First interaction
2. `acquaintance` - A few conversations
3. `friend` - Regular, meaningful conversations
4. `trusted_advisor` - Deep relationship

## Persona-Specific Patterns

### Jack Bogle (grandfatherly)
- Very long pauses (350-500ms)
- Age-related references
- Calm, measured wisdom
- Market history stories

### Peter Lynch (enthusiastic)
- Short, energetic pauses (100-150ms)
- Excitement tags frequent
- Research-focused language
- Pattern recognition joy

### Jordan Taylor (planner)
- Medium-high energy
- Planning vocabulary
- Countdown enthusiasm
- Organization satisfaction

### Alex Chen (efficient)
- Quick, practical
- Email/calendar focus
- Completion celebration
- Productivity wisdom

### Maya Santos (habit coach)
- Warm, supportive
- Habit-focused language
- Streak celebrations
- Self-compassion emphasis

### Ferni (life coach)
- Variable pacing
- Coaching mode transitions
- Cross-cultural references
- Deep vulnerability ok

## Best Practices

### DO:
- Use authentic speech patterns (trailing off, restarts)
- Add appropriate pauses for persona energy level
- Gate sensitive content by relationship stage
- Include both simple and complex phrases
- Vary phrasing to avoid repetition

### DON'T:
- Use perfectly polished language (too robotic)
- Make all pauses the same length
- Share deep secrets with strangers
- Forget the persona's unique voice
- Copy phrases across personas

## Example: Adding New Behavior

To add a new behavior type:

1. Create the JSON file in the persona's behaviors folder
2. Follow v2 schema format
3. Add SSML for natural delivery
4. Consider relationship gating
5. Add both general and situational phrases

```json
{
  "schema_version": 1,
  "description": "Ferni's surprise reactions",
  
  "genuine_surprise": [
    "<break time=\"200ms\"/>Wait, really?! <break time=\"150ms\"/>I did NOT see that coming!",
    "<break time=\"250ms\"/>Oh! <break time=\"200ms\"/>That's... wow."
  ]
}
```

## Testing

After adding behaviors:
1. Load the persona in development
2. Test various conversation scenarios
3. Verify phrases feel natural when spoken
4. Check relationship gating works correctly
5. Ensure variety in responses

