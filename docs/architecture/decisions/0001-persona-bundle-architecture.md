# ADR-0001: Persona Bundle Architecture

**Status**: Accepted  
**Date**: 2024-12-01  
**Decision Makers**: Engineering Team  
**Technical Story**: Multi-persona voice AI system design

## Context

Ferni AI needs to support multiple AI personas (Ferni, Alex, Maya, Peter, Jordan, Nayan) with distinct personalities, knowledge domains, and behaviors. The system needed a way to:

1. Define each persona's unique characteristics
2. Allow personas to be added/modified without code changes
3. Enable auto-discovery of available personas
4. Support lazy loading of persona content for performance
5. Maintain clear separation between persona definition and runtime behavior

## Decision Drivers

* **Extensibility**: Easy to add new personas without modifying core code
* **Performance**: Large persona content shouldn't slow down startup
* **Maintainability**: Each persona should be self-contained
* **Type Safety**: Persona configurations should be validated
* **Developer Experience**: Clear structure for creating personas

## Considered Options

1. **Hardcoded Persona Classes** - Each persona as a TypeScript class
2. **JSON Configuration Files** - Personas as JSON with a schema
3. **Bundle Architecture** - Self-contained directories with manifest + content

## Decision Outcome

Chosen option: **Bundle Architecture**, because it provides the best balance of flexibility, performance, and developer experience.

### Positive Consequences

* Personas are fully self-contained in `src/personas/bundles/{id}/`
* Auto-discovery eliminates hardcoding persona lists
* Lazy loading of content (stories, knowledge) improves startup
* Manifest schema provides validation
* Clear separation of configuration vs. content

### Negative Consequences

* More complex directory structure
* Requires understanding of manifest format
* Some runtime overhead for bundle loading

## Pros and Cons of the Options

### Option 1: Hardcoded Persona Classes

Each persona defined as a TypeScript class with all properties.

* ✅ Good, because full type safety
* ✅ Good, because IDE autocomplete
* ❌ Bad, because requires code changes to add personas
* ❌ Bad, because large content bloats class files
* ❌ Bad, because no clear separation of config vs. behavior

### Option 2: JSON Configuration Files

Personas as JSON files loaded at runtime.

* ✅ Good, because no code changes needed
* ✅ Good, because easy to edit
* ❌ Bad, because no type safety without schema
* ❌ Bad, because content (stories, knowledge) mixed with config
* ❌ Bad, because all loaded at once

### Option 3: Bundle Architecture (Chosen)

Self-contained directories with manifest + content subdirectories.

* ✅ Good, because self-contained and portable
* ✅ Good, because manifest provides typed configuration
* ✅ Good, because content can be lazy-loaded
* ✅ Good, because auto-discovery via directory scan
* ✅ Good, because clear separation (manifest vs. identity vs. content)
* ❌ Bad, because more complex structure to learn

## Implementation

### Bundle Structure
```
src/personas/bundles/{persona-id}/
├── persona.manifest.json      # Required: Configuration
├── identity/
│   ├── biography.md           # Background story
│   └── system-prompt.md       # Behavioral instructions
└── content/
    ├── behaviors/             # Response patterns (eager loaded)
    ├── stories/               # Anecdotes (lazy loaded)
    ├── knowledge/             # Domain expertise (lazy loaded)
    └── voice/                 # Expression patterns
```

### Manifest Schema Key Fields
- `identity`: ID, name, description, aliases
- `voice`: Provider, voice_id, speech characteristics
- `personality`: Warmth, humor, directness, traits
- `role`: Domains, capabilities, handoff targets
- `team`: Membership, handoff triggers, phrases
- `tools`: Domain assignments, required/optional/forbidden

## Links

* [Agent Management Guide](../../guides/AGENT-MANAGEMENT.md)
* [Persona CLAUDE.md](../../../src/personas/CLAUDE.md)
* [Cognitive Intelligence Architecture](../COGNITIVE-INTELLIGENCE-ARCHITECTURE.md)

