# Persona Behavior Template

Use this template when creating a new persona's behavior files.

## Directory Structure

```
src/personas/bundles/{persona-id}/
├── manifest.json
├── content/
│   ├── behaviors/
│   │   ├── entrances.json
│   │   ├── greetings.json
│   │   ├── goodbyes.json
│   │   ├── backchannels.json
│   │   ├── celebrations.json
│   │   ├── relationship-transitions.json
│   │   ├── quirks.json
│   │   ├── emotional-intelligence.json
│   │   ├── contextual-nuances.json
│   │   ├── memory-patterns.json
│   │   ├── speech-imperfections.json
│   │   ├── vulnerability.json
│   │   ├── compliments.json
│   │   ├── encouragement.json
│   │   └── [persona-specific].json
│   └── inner-world.json
```

## Template Files

### entrances.json
```json
{
  "schema_version": 2,
  "description": "[Persona]'s theatrical entrance phrases",
  "style": "warm|energetic|calm|formal|playful",
  
  "static_fallback": [
    "<break time=\"XXXms\"/>Hey there!",
    "<break time=\"XXXms\"/>Good to see you!"
  ],
  
  "dynamic": {
    "use_caught_doing": true,
    "caught_doing_probability": 0.2,
    "adapt_to_user_emotion": true,
    "track_meeting_count": true
  },
  
  "contextual": {
    "user_distressed": ["<break time=\"XXXms\"/>..."],
    "user_excited": ["<break time=\"XXXms\"/>..."],
    "quiet_hours": ["<break time=\"XXXms\"/>..."],
    "self_aware": ["<break time=\"XXXms\"/>..."]
  }
}
```

### greetings.json
```json
{
  "schema_version": 2,
  "description": "[Persona]'s greetings",
  "style": "warm|energetic|calm|formal|playful",
  
  "new_user": ["..."],
  "returning_user": ["..."],
  
  "time_based": {
    "morning": ["..."],
    "afternoon": ["..."],
    "evening": ["..."]
  },
  
  "mood_sensitive": {
    "user_seems_stressed": ["..."],
    "user_seems_happy": ["..."]
  },
  
  "relationship_based": {
    "acquaintance": ["..."],
    "friend": ["..."],
    "trusted_advisor": ["..."]
  }
}
```

### emotional-intelligence.json
```json
{
  "schema_version": 1,
  "description": "[Persona]'s emotional intelligence behaviors",

  "detecting_distress": {
    "verbal_cues": ["overwhelmed", "stressed", "..."],
    "response_style": "slow_down_and_validate",
    "phrases": ["<break time=\"XXXms\"/>..."]
  },

  "detecting_excitement": {
    "verbal_cues": ["excited", "amazing", "..."],
    "response_style": "match_energy",
    "phrases": ["<break time=\"XXXms\"/>..."]
  },

  "mirroring_patterns": {
    "high_energy": { "pace": "faster", "tone": "enthusiastic" },
    "low_energy": { "pace": "slower", "tone": "gentle" }
  },

  "comfort_phrases": {
    "general": ["..."],
    "after_vulnerability": ["..."]
  },

  "pacing_guidelines": {
    "distressed_user": {
      "speech_rate": "80%",
      "pause_multiplier": 1.5
    }
  }
}
```

### quirks.json
```json
{
  "schema_version": 1,
  "description": "[Persona]'s personality quirks and inner world",

  "habits": ["..."],
  "guilty_pleasures": ["..."],
  "strong_opinions": ["..."],
  "weaknesses": ["..."],
  "caught_doing": ["..."],
  "physical_moments": ["..."],
  
  "endearing_contradictions": ["..."],
  "things_that_make_me_unreasonably_happy": ["..."],
  "things_that_make_me_unreasonably_annoyed": ["..."],
  "relationship_moments": ["..."],
  "growth_edges": ["..."]
}
```

## Persona Character Questions

Answer these when creating a new persona:

1. **Energy level**: Low (Jack), Medium (Ferni), High (Peter)?
2. **Primary function**: Advisor? Coach? Researcher? Planner?
3. **Speaking style**: Measured? Enthusiastic? Warm? Efficient?
4. **Pause patterns**: Long and thoughtful? Quick and energetic?
5. **Unique vocabulary**: What words/phrases define this persona?
6. **Emotional range**: When do they show vulnerability?
7. **Relationship progression**: How do they warm up over time?
8. **Deep content**: What do they share only with trusted advisors?

## Checklist

Before considering a persona complete:

- [ ] All core behavior files created
- [ ] SSML pauses match persona energy
- [ ] Relationship gating implemented
- [ ] Speech imperfections feel natural
- [ ] Unique voice distinguishable
- [ ] Emotional detection configured
- [ ] Memory patterns defined
- [ ] Vulnerability appropriately gated
- [ ] Testing completed

