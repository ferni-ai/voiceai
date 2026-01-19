# Tool Schema Migration Guide

This document outlines the migration from manual markdown-based tool documentation to the new JSON Schema-based single source of truth.

## Current State (Post-Migration)

### What's Implemented

1. **JSON Schema definitions** (`tool.schema.json`)
   - Single source of truth for tool definitions
   - Validates tool name, description, parameters, and examples
   - Aligns with Gemini's native `functionDeclarations` format

2. **Tool schema files** (`core/`, `handoff/`, `persona-specific/`)
   - 14 schema files with 45 tools migrated
   - Core tools: music, weather, news, time, tasks, memory, outreach
   - Handoffs: all team handoff tools
   - Persona-specific: ferni, maya, alex, peter, jordan, nayan

3. **Validation script** (`scripts/tools/validate-tool-schemas.ts`)
   - Validates all schemas against JSON Schema
   - Checks for duplicate tool names
   - Validates example JSON outputs

4. **Generation scripts**
   - `generate-markdown-docs.ts`: Generates `function-calling-base.generated.md`
   - `generate-gemini-declarations.ts`: Generates `gemini-declarations.generated.ts`

5. **Integration**
   - Pre-commit hook validates schemas when modified
   - CI runs `tools:validate` and `tools:check`
   - Feature flags for opting into generated files

## Feature Flags

| Flag | Purpose |
|------|---------|
| `USE_GENERATED_TOOL_DOCS=true` | Use generated markdown instead of manual files |
| `USE_GEMINI_NATIVE_FC=true` | Use generated Gemini function declarations |

## Migration Path

### Phase 1: Parallel Operation (CURRENT)

Both manual and generated files exist:
- Manual: `src/personas/bundles/shared/function-calling-base.md`
- Generated: `src/tools/schemas/generated/function-calling-base.generated.md`

Default behavior uses **manual files**. Enable generated files with feature flags.

### Phase 2: Testing (RECOMMENDED NEXT)

1. Enable `USE_GENERATED_TOOL_DOCS=true` in development
2. Run voice agent E2E tests
3. Verify all tools execute correctly
4. Monitor for regressions

### Phase 3: Gradual Rollout

1. Enable `USE_GENERATED_TOOL_DOCS=true` in staging
2. Run production smoke tests
3. Enable in production behind feature flag
4. Monitor error rates and tool success rates

### Phase 4: Deprecation

Once generated files have proven stable in production:

1. **Remove manual function-calling-base.md**:
   ```bash
   rm src/personas/bundles/shared/function-calling-base.md
   ```

2. **Update prompt-loader.ts**:
   - Remove fallback to manual files
   - Make generated files the default

3. **Remove feature flags**:
   - `USE_GENERATED_TOOL_DOCS` becomes always-true
   - Can be removed entirely

4. **Update documentation**:
   - Remove references to manual markdown files
   - Update onboarding docs for new tool workflow

## Adding New Tools (Going Forward)

1. Add tool to appropriate schema file:
   ```bash
   # Core tool
   vim src/tools/schemas/core/[domain].schema.json
   
   # Persona tool
   vim src/tools/schemas/persona-specific/[persona].schema.json
   ```

2. Run validation:
   ```bash
   pnpm tools:schemas:validate
   ```

3. Regenerate files:
   ```bash
   pnpm tools:schemas:generate
   ```

4. Commit all files:
   ```bash
   git add src/tools/schemas/
   git commit -m "feat(tools): add [tool name]"
   ```

## Deprecation Checklist

Before removing manual files, verify:

- [ ] Generated markdown has been used in production for 2+ weeks
- [ ] No increase in tool execution errors
- [ ] E2E tests pass with generated files
- [ ] Persona specialty tools work correctly
- [ ] Handoff tools work correctly
- [ ] Music, weather, news tools work correctly
- [ ] Memory tools work correctly
- [ ] Team has been notified of migration

## Rollback

If issues occur after switching to generated files:

1. Set `USE_GENERATED_TOOL_DOCS=false` in environment
2. Redeploy
3. Investigate and fix schema issues
4. Re-enable and test

## Schema Format Reference

```json
{
  "$schema": "../tool.schema.json",
  "domain": "example",
  "persona": "ferni",           // Optional: for persona-specific tools
  "version": "1.0.0",
  "tools": [
    {
      "name": "exampleTool",
      "description": "What this tool does",
      "parameters": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string",
            "description": "Parameter description"
          }
        },
        "required": ["param1"]
      },
      "examples": [
        {
          "userSays": "Example user input",
          "output": "{\"fn\":\"exampleTool\",\"args\":{\"param1\":\"value\"}}"
        }
      ]
    }
  ]
}
```

## Questions?

See `docs/architecture/FUNCTION-CALLING-SYSTEM.md` for the full architecture documentation.
