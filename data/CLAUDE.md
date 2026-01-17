# Data Configuration

**Runtime configuration files** for agents, tools, and feature flags.

## Files

| File | Purpose |
|------|---------|
| `model-config.json` | LLM model configuration and tool selection |
| `feature-flags.json` | Feature flag definitions |
| `agent-config.json` | Agent runtime settings |
| `domain-tool-patterns.json` | Tool domain patterns for semantic routing (~120KB) |
| `dora-metrics.json` | DORA metrics configuration |
| `tool-test-reports/` | Tool execution test reports |

## model-config.json

Controls tool selection for LLM:

```json
{
  "toolDefaults": {
    "enabledDomains": [],     // Empty = all domains (semantic selection)
    "maxTools": 60,           // Max tools per LLM turn
    "includedTools": [...]    // Always-include tools
  }
}
```

Key settings:
- `enabledDomains: []` - All 95 domains available, semantic router picks relevant ones
- `maxTools: 60` - Cap on tools sent to LLM per turn
- `includedTools` - Always included regardless of semantic match

## feature-flags.json

Feature toggles for gradual rollout:

```json
{
  "featureName": {
    "enabled": true,
    "percentage": 100,
    "allowlist": []
  }
}
```

## domain-tool-patterns.json

Generated file mapping tool patterns to domains. Used by semantic router for tool selection.

**Do not edit directly** - regenerate with:
```bash
npx tsx scripts/generate-tool-patterns.ts
```

## tool-test-reports/

Contains test execution reports for tool validation:
- Execution success/failure rates
- Latency metrics
- Error patterns

## Related

- `src/tools/` - Tool implementations
- `src/tools/orchestrator/` - Tool selection logic
- `src/tools/semantic-router/` - Semantic matching
