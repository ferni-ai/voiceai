# Personas Architecture v2 - Bundle-Based

A **bundle-based** persona system where each persona is a self-contained directory with all their content, behaviors, and configuration.

## 🎯 Philosophy: Self-Contained Bundles

Each persona is a complete "bundle" containing:
1. **Manifest** - Identity, voice config, personality traits, team membership
2. **Content** - Stories, knowledge documents, behaviors (JSON + Markdown)
3. **Identity** - Biography, system prompt

This makes personas:
- **Portable** - Copy a bundle folder to add a persona
- **Versionable** - Each bundle can have its own version
- **Hot-reloadable** - Content changes without code changes
- **Self-documenting** - Everything about a persona is in one place

## Architecture Overview

```
src/personas/
├── bundles/                # Persona bundles (the main system)
│   ├── jack-bogle/
│   │   ├── persona.manifest.json
│   │   ├── identity/
│   │   │   ├── biography.md
│   │   │   └── system-prompt.md
│   │   └── content/
│   │       ├── behaviors/
│   │       │   ├── catchphrases.json
│   │       │   ├── greetings.json
│   │       │   ├── backchannels.json
│   │       │   └── pet-peeves.json
│   │       ├── stories/
│   │       │   ├── _index.json
│   │       │   └── *.json
│   │       └── knowledge/
│   │           ├── _index.json
│   │           └── *.md
│   │
│   ├── peter-john/
│   ├── alex-chen/
│   ├── maya-santos/
│   ├── jordan-taylor/
│   └── ferni/
│
├── team/                   # Team coordination and handoffs
│   ├── team-config.ts
│   ├── prompt-injection.ts
│   └── types.ts
│
├── index.ts               # Central registry and API
├── types.ts               # PersonaConfig and related types
├── behaviors.ts           # Persona-parameterized behavior functions
├── greetings.ts           # Greeting generation by style
├── theatrical.ts          # Entrances, celebrations, goodbyes
├── meaningful-silence.ts  # Silence handling
├── easter-eggs.ts         # Quirks and delighters
└── base-identity.ts       # Shared base rules for all personas
```

## Available Personas

| ID | Name | Role | Description |
|----|------|------|-------------|
| `jack-bogle` | Jack Bogle | Investment sage | Wise grandfather energy, index fund philosophy |
| `peter-john` | Peter John | Stock analyst | Energetic, enthusiastic stock picker |
| `alex-chen` | Alex Chen | Communications | Efficient, organized, inbox zero |
| `maya-santos` | Maya Santos | Spend/save coach | Warm, non-judgmental money coach |
| `jordan-taylor` | Jordan Taylor | Event planner | Enthusiastic milestone coordinator |
| `ferni` | Ferni | Life coach | Team coordinator, holistic coach |

## Quick Start

### Loading Personas

```typescript
import { 
  initializeFromBundles, 
  getPersona, 
  getPersonaAsync,
  listPersonas 
} from './personas';

// Initialize all bundles at startup (call once)
await initializeFromBundles();

// Get a persona synchronously (after initialization)
const jack = getPersona('jack-bogle');

// Get a persona async (loads from bundle if not cached)
const peter = await getPersonaAsync('peter-john');

// List all registered personas
const allPersonas = listPersonas();
// ['jack-bogle', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'ferni', ...]
```

### Using Behaviors

```typescript
import { 
  getThinkingPhrase,
  getVerbalBackchannel,
  getSilenceFiller,
  checkPetPeeve,
  findSemanticStory 
} from './personas';

// Get persona-appropriate thinking phrase
const thinking = getThinkingPhrase(persona);
// "Hmm, let me think about that..."

// Get backchannel based on user emotion
const backchannel = getVerbalBackchannel(persona, messageLength, 'sadness');
// "I hear you..."

// Find a relevant story using semantic search
const match = await findSemanticStory(persona, "I lost money in the market");
if (match) {
  console.log(match.story.content);  // The story
  console.log(match.similarity);      // 0.0-1.0 relevance score
}
```

### Using Theatrical Elements

```typescript
import { 
  getTheatricalEntrance,
  getCelebration,
  getTheatricalGoodbye 
} from './personas';

// Get dramatic entrance when switching personas
const entrance = getTheatricalEntrance('peter-john');
// "<emotion value=\"excited\"/>Whoa whoa whoa! Did someone say stock picking?!"

// Celebrate user achievements
const celebration = getCelebration('jack-bogle', 'goal_reached');
// "You did it. And you did it the right way. Congratulations."
```

## Creating a New Persona Bundle

### 1. Create Bundle Structure

```
bundles/my-persona/
├── persona.manifest.json
├── identity/
│   ├── biography.md
│   └── system-prompt.md
└── content/
    ├── behaviors/
    │   ├── catchphrases.json
    │   ├── greetings.json
    │   ├── backchannels.json
    │   └── pet-peeves.json
    ├── stories/
    │   ├── _index.json
    │   └── my-story.json
    └── knowledge/
        ├── _index.json
        └── my-topic.md
```

### 2. Create the Manifest

**persona.manifest.json:**
```json
{
  "$schema": "https://voiceai.example.com/schemas/persona-manifest.v1.json",
  "version": "1.0.0",
  "manifest_version": 1,
  
  "identity": {
    "id": "my-persona",
    "name": "My Persona",
    "display_name": "My Persona",
    "description": "A helpful assistant with a unique personality",
    "self_reference": "I"
  },
  
  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_PERSONA_VOICE_ID}",
    "default_rate": "medium"
  },
  
  "speech_characteristics": {
    "base_speed_multiplier": 0.9,
    "pause_multiplier": 1.0,
    "thinking_sound_frequency": 0.3,
    "emphasis_style": "moderate"
  },
  
  "personality": {
    "warmth": 0.8,
    "humor_level": 0.5,
    "directness": 0.6,
    "energy": 0.7,
    "traits": ["Friendly", "Helpful", "Patient"]
  },
  
  "role": {
    "id": "my-persona",
    "domains": ["general assistance", "conversation"],
    "can_handoff": true,
    "handoff_targets": ["ferni"]
  },
  
  "team": {
    "membership": "ferni-team",
    "role_in_team": "specialist"
  },
  
  "content": {
    "stories": { "directory": "content/stories", "lazy_load": true },
    "knowledge": { "directory": "content/knowledge", "lazy_load": true },
    "behaviors": { "directory": "content/behaviors" }
  },
  
  "metadata": {
    "author": "Your Name",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### 3. Add Content Files

**content/behaviors/greetings.json:**
```json
{
  "new_user": [
    "Hello! Nice to meet you. I'm here to help.",
    "Hey there! What can I do for you today?"
  ],
  "returning_user": [
    "Welcome back! Good to see you again.",
    "Hey! I was hoping you'd come back."
  ]
}
```

**content/stories/_index.json:**
```json
{
  "stories": [
    {
      "id": "origin-story",
      "file": "origin-story.json",
      "triggers": ["how did you start", "your background"],
      "category": "personal"
    }
  ]
}
```

### 4. The Bundle Will Auto-Load

Once created, the bundle will be discovered automatically by `initializeFromBundles()`.

## Bundle Manifest Schema

### identity
- `id` - Unique persona ID (kebab-case)
- `name` - Display name
- `description` - Short description
- `self_reference` - How they refer to themselves ("I", "we")

### voice
- `provider` - Voice provider (`cartesia`)
- `voice_id` - Voice ID (can use `${env:VAR}` syntax)
- `default_rate` - `slow` | `medium` | `fast`

### speech_characteristics
- `base_speed_multiplier` - 0.65-1.1 (lower = slower)
- `pause_multiplier` - 0.7-1.6 (higher = longer pauses)
- `thinking_sound_frequency` - 0.0-1.0 (frequency of "hmm", "ah")
- `emphasis_style` - `subtle` | `moderate` | `pronounced`

### personality
- `warmth` - 0-1
- `humor_level` - 0-1
- `directness` - 0-1
- `energy` - 0-1
- `traits` - Array of personality traits

### role
- `domains` - Knowledge domains
- `can_handoff` - Whether can hand off to other personas
- `handoff_targets` - Array of persona IDs to hand off to

### team (optional)
- `membership` - Team ID
- `role_in_team` - Role within the team
- `coordinator` - Whether this persona coordinates the team

## Creating Advisor-Type Personas

For creating advisors, coaches, mentors, or guidance-focused personas, use the **Generic Advisor Template**:

```
src/personas/generic-advisor/index.ts
```

This template includes:
- Comprehensive domain examples (financial, career, wellness, parenting, executive, creative, academic, life coaching)
- All optional fields documented with examples
- A fully customized Career Coach example you can copy
- Domain-specific examples for every customizable field

### Quick Start with Generic Advisor

```typescript
import { extendPersona, registerPersona } from './personas';

// Option 1: Extend for light customization
const myCoach = extendPersona('generic-advisor', {
  id: 'wellness-coach',
  name: 'Wellness Coach',
  description: 'A holistic wellness mentor focused on sustainable health',
  knowledge: { 
    domains: ['nutrition', 'fitness', 'sleep', 'stress management'],
    qualifiedTopics: ['meal planning', 'exercise routines', 'sleep hygiene'],
    outOfScopeTopics: ['medical diagnosis', 'prescriptions'],
    outOfScopeResponse: "That's medical territory - see your doctor. But I can help with lifestyle!",
  },
});
registerPersona(myCoach);

// Option 2: Copy and fully customize the template
// See the Career Coach example at the bottom of generic-advisor/index.ts
```

### Supported Advisor Domains

| Category | Examples |
|----------|----------|
| **Financial & Business** | Financial advisors, business consultants, startup mentors, real estate advisors |
| **Career & Professional** | Career coaches, executive coaches, interview coaches, public speaking coaches |
| **Health & Wellness** | Wellness coaches, fitness trainers, nutrition coaches, sleep coaches |
| **Life & Personal** | Life coaches, productivity coaches, relationship coaches, parenting coaches |
| **Education** | Academic advisors, study coaches, college counselors, ADHD coaches |
| **Creative & Spiritual** | Writing coaches, art mentors, meditation teachers, mindfulness coaches |

## Migration from Legacy Personas

The bundle system has replaced the old TypeScript-based persona definitions. The `generic-advisor` 
template remains for creating new TypeScript-based personas, but main personas are bundle-based.

To convert a legacy PersonaConfig to a bundle:

```typescript
import { convertLegacyToBundle } from './personas/bundles';

await convertLegacyToBundle(MY_PERSONA_CONFIG, './bundles');
```

## API Reference

### Registry Functions

| Function | Description |
|----------|-------------|
| `initializeFromBundles()` | Load all bundles into registry |
| `getPersona(id)` | Get persona by ID (sync) |
| `getPersonaAsync(id)` | Get persona by ID, loading from bundle if needed |
| `listPersonas()` | List all registered persona IDs |
| `hasPersona(id)` | Check if persona exists |
| `registerPersona(config)` | Register a persona manually |
| `extendPersona(baseId, overrides)` | Create variant of existing persona |

### Behavior Functions

| Function | Description |
|----------|-------------|
| `getThinkingPhrase(persona)` | Get persona-appropriate thinking sound |
| `getListeningCue(persona)` | Get active listening phrase |
| `getVerbalBackchannel(persona, length, emotion)` | Get acknowledgment |
| `getSilenceFiller(persona, turnCount)` | Get silence filler |
| `checkPetPeeve(persona, text)` | Check if text triggers pet peeve |
| `findSemanticStory(persona, text)` | Find relevant story semantically |

### Theatrical Functions

| Function | Description |
|----------|-------------|
| `getTheatricalEntrance(personaId)` | Get dramatic handoff entrance |
| `getCelebration(personaId, type)` | Get celebration response |
| `getTheatricalGoodbye(personaId)` | Get memorable goodbye |
| `getEnhancedBackchannel(personaId, context)` | Get enhanced acknowledgment |

### Bundle Functions

| Function | Description |
|----------|-------------|
| `discoverAndLoadBundles()` | Discover and load all bundles |
| `loadBundleById(id)` | Load a specific bundle |
| `loadBundleAsPersona(id)` | Load bundle as PersonaConfig |
| `bundleToPersonaConfig(bundle)` | Convert loaded bundle to PersonaConfig |
