# Semantic Router Internationalization (i18n)

## Architecture Overview

The semantic router uses a **locale-agnostic core** with **externalized language triggers**.

```
semantic-router/
├── i18n/
│   ├── locales/
│   │   ├── en.json         # English triggers
│   │   ├── es.json         # Spanish triggers
│   │   ├── fr.json         # French triggers
│   │   └── ...
│   ├── loader.ts           # Loads locale-specific triggers
│   ├── multilingual.ts     # Multilingual embedding support
│   └── intent-patterns.ts  # Universal patterns (numbers, dates)
│
├── tool-definitions/
│   └── *.semantic.ts       # Tool definitions (language-agnostic)
│
└── types.ts                # Core types
```

## How It Works

### 1. Tool Definitions are Language-Agnostic

```typescript
// weather.semantic.ts - NO hardcoded strings
export const weatherTool: SemanticToolDefinition = {
  id: 'weather_current',
  category: 'information',
  
  // Triggers loaded from locale files
  triggers: null, // Populated at runtime
  
  // Examples used for embedding similarity (can be multilingual)
  exampleEmbeddings: null, // Computed at initialization
  
  execute: async (args, ctx) => { ... }
};
```

### 2. Locale Files Define Triggers

```json
// locales/en.json
{
  "weather_current": {
    "phrases": [
      "what's the weather",
      "is it going to rain",
      "do I need an umbrella"
    ],
    "patterns": [
      "^what(?:'s| is) the weather",
      "^is it (?:raining|snowing|cold|hot)"
    ],
    "keywords": [
      { "word": "weather", "weight": 1.0 },
      { "word": "rain", "weight": 0.8 }
    ]
  }
}
```

```json
// locales/es.json
{
  "weather_current": {
    "phrases": [
      "qué tiempo hace",
      "va a llover",
      "necesito un paraguas"
    ],
    "patterns": [
      "^(?:qué|cual es el) tiempo",
      "^va a (?:llover|nevar)"
    ],
    "keywords": [
      { "word": "tiempo", "weight": 1.0 },
      { "word": "lluvia", "weight": 0.8 }
    ]
  }
}
```

### 3. Multilingual Embeddings

Instead of relying on keywords, use **multilingual embedding models**:

| Model | Languages | Speed |
|-------|-----------|-------|
| `paraphrase-multilingual-MiniLM-L12-v2` | 50+ | Fast |
| `multilingual-e5-large` | 100+ | Medium |
| OpenAI `text-embedding-3-small` | ~100 | Fast (API) |

The embedding model computes similarity between user input and tool descriptions
**regardless of language**.

### 4. Fallback Chain

```
User Input (any language)
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Embedding Similarity (multilingual) │  ← Language-agnostic
│    Compare to tool descriptions        │
└─────────────────────────────────────┘
    │ confidence < 0.8
    ▼
┌─────────────────────────────────────┐
│ 2. Locale-Specific Pattern Match    │  ← Language-specific
│    Check phrases/patterns/keywords   │
└─────────────────────────────────────┘
    │ no match
    ▼
┌─────────────────────────────────────┐
│ 3. LLM Fallback                      │  ← Universal
│    Let Gemini/OpenAI handle it       │
└─────────────────────────────────────┘
```

## Adding a New Language

1. Create `locales/{lang}.json` with translations
2. No code changes needed
3. Embeddings automatically work

## Mixed-Language Support

The system handles code-switching naturally:

- "What's el weather en Madrid?" → `weather_current` + location: Madrid
- "Play algo de jazz" → `spotify_play` + query: jazz

Embedding similarity catches intent even with mixed languages.

## Performance Considerations

| Approach | Latency | Accuracy | Maintenance |
|----------|---------|----------|-------------|
| **Keyword only** | ~1ms | Low | High per language |
| **Embedding only** | ~50ms | High | Low |
| **Hybrid (current)** | ~20ms | High | Medium |

Recommended: **Embedding-first with locale keyword fallback**

## Migration Path

1. ✅ Current: English-only hardcoded triggers
2. 🔄 Next: Extract English to `locales/en.json`
3. 🔄 Then: Add multilingual embedding model
4. 🔜 Finally: Add more locale files

## Testing

```bash
# Test specific locale
SEMANTIC_ROUTER_LOCALE=es pnpm test semantic-router

# Test multilingual embeddings
pnpm test semantic-router/i18n
```

