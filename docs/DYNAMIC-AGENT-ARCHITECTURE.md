# Dynamic Agent Architecture

## Goal: Zero Hardcoding

When you run `npm run agents install <agent-id>`, the agent should "just work" without editing any other files.

## Key Principles

### 1. Everything Comes From Bundles

The `persona.manifest.json` is the **single source of truth**. No other file should hardcode agent IDs.

```json
// ❌ BAD: Hardcoded in voice-ids.ts
'jack-bogle': VOICE_IDS.JACK_BOGLE

// ✅ GOOD: Read from bundle manifest
const voiceId = await AgentRegistry.getVoiceId('jack-bogle');
// Returns manifest.voice.voice_id
```

### 2. Handoff Targets Use Patterns, Not IDs

Instead of listing specific agents:

```json
// ❌ BAD: Breaks when agent is removed
"handoff_targets": ["ferni", "jack-bogle", "peter-lynch"]

// ✅ GOOD: Dynamic patterns
"handoff_targets": ["@coordinator", "@team"]
// or
"handoff_targets": ["*"]  // Can handoff to anyone
// or
"handoff_targets": ["@role:researcher", "@domain:investing"]
```

**Pattern Reference:**
- `@coordinator` - The team coordinator
- `@team` - All active team members
- `*` - Any available agent
- `@role:<role-id>` - Agents with specific role
- `@domain:<domain>` - Agents handling specific domain

### 3. Handoff Tools Are Generated Dynamically

Instead of hardcoded tool definitions:

```typescript
// ❌ BAD: Hardcoded tool
handoffToJack: llm.tool({
  description: 'Hand off to Jack...',
  execute: async () => { ... }
})

// ✅ GOOD: Generated from registry
const tools = await generateHandoffToolsFromRegistry();
// Automatically creates handoffTo<Name> for each discovered agent
```

### 4. Team Coordination Uses Roles/Domains

```json
// ❌ BAD: Hardcoded agent ID
{
  "triggers": ["invest", "stock"],
  "suggested_persona": "jack-bogle"
}

// ✅ GOOD: Role-based routing
{
  "triggers": ["invest", "stock"],
  "suggested_domain": "investing",
  // OR
  "suggested_role": "sage-mentor"
}
```

The system finds the best available agent for that domain/role at runtime.

### 5. Colors Are Bundle-Defined or Generated

```json
// In persona.manifest.json
{
  "colors": {
    "primary": "#9a7b5a",
    "secondary": "#7d6348",
    "gradient": "linear-gradient(135deg, #7d6348 0%, #9a7b5a 100%)"
  }
}
```

If no colors defined, `color-generator.ts` creates them from personality traits.

## Implementation Checklist

### Phase 1: Remove Static Registries ✅ (Partially done)
- [x] Create unified-registry.ts that discovers bundles
- [ ] Remove AGENT_IDS from agent-registry.ts
- [ ] Remove hardcoded entries from PersonaRegistry.ts
- [ ] Remove VOICE_IDS mappings (use bundle manifests)

### Phase 2: Dynamic Handoff Targets
- [ ] Add pattern support to manifest schema (`@coordinator`, `@team`, `*`)
- [ ] Update handoff target resolution in unified-registry.ts
- [ ] Migrate existing manifests to use patterns

### Phase 3: Dynamic Tool Generation
- [ ] Refactor handoff.ts to generate tools from registry
- [ ] Remove hardcoded handoffToX functions
- [ ] Generate tool descriptions from bundle metadata

### Phase 4: Role-Based Routing
- [ ] Update team-coordination.json to use domains/roles
- [ ] Add domain-based agent lookup to registry
- [ ] Update Ferni's routing logic

### Phase 5: Test Infrastructure
- [ ] Update test mocks to use dynamic discovery
- [ ] Remove hardcoded agent expectations

## What "Install" Should Do

```bash
npm run agents install jack-bogle --from github:sethdford/voiceai-agents
```

1. Download bundle to `src/personas/bundles/jack-bogle/`
2. Validate manifest against schema
3. Check for required env vars (e.g., `JACK_BOGLE_VOICE_ID`)
4. Clear registry cache
5. **Done!** Agent is discoverable and routable

No manual edits needed because:
- Registry discovers bundles automatically
- Handoff tools generated at startup
- Handoff targets use patterns
- Colors come from bundle or are generated
- Voice IDs come from bundle manifest

## Migration Path

For existing bundles, update `handoff_targets`:

```bash
# Find all manifests
find src/personas/bundles -name "persona.manifest.json"

# Update each to use patterns instead of IDs
```

Example migration:
```json
// Before
"handoff_targets": ["ferni", "jack-bogle", "peter-lynch", "alex-chen"]

// After
"handoff_targets": ["@coordinator", "@team"]
```

## Bundle Manifest: Complete Example

```json
{
  "manifest_version": 2,
  
  "identity": {
    "id": "my-agent",
    "name": "My Agent",
    "display_name": "My Helpful Agent",
    "description": "Does helpful things",
    "aliases": ["my", "helper"]
  },
  
  "voice": {
    "provider": "cartesia",
    "voice_id": "${env:MY_AGENT_VOICE_ID|default-uuid}"
  },
  
  "role": {
    "id": "helper",
    "domains": ["assistance", "support"],
    "can_handoff": true,
    "handoff_targets": ["@coordinator", "@team"]
  },
  
  "team": {
    "membership": "ferni-team",
    "role_id": "helper",
    "role_description": "Helpful assistant",
    "coordinator": false,
    "handoff_triggers": ["help me", "assist", "support"],
    "handoff_phrases": {
      "to_coordinator": ["Back to Ferni!"],
      "receive": ["Helper here, what do you need?"]
    }
  },
  
  "colors": {
    "primary": "#5a8a6b",
    "secondary": "#4a7a5b"
  }
}
```

This agent would:
- Be discovered automatically
- Have `handoffToMy` tool generated
- Be routable via triggers "help me", "assist", "support"
- Have proper colors in UI
- Be able to handoff to coordinator or any team member

