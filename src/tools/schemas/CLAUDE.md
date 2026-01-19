# Tool Schemas

Single source of truth for Ferni tool definitions, aligned with Gemini's native `functionDeclarations` format.

## Quick Reference

```bash
# Validate all schemas
pnpm tools:schemas:validate

# Generate markdown and declarations
pnpm tools:schemas:generate

# Check for drift (CI/pre-commit)
pnpm tools:schemas:check
```

## Directory Structure

```
schemas/
├── tool.schema.json              # JSON Schema for tool definitions
├── core/                         # Core tools (all personas)
│   ├── music.schema.json         # 3 tools: playMusic, musicControl, musicInfo
│   ├── weather.schema.json       # 1 tool: getWeather
│   ├── news.schema.json          # 1 tool: getNews
│   ├── time.schema.json          # 3 tools: getCurrentTime, getCalendar, scheduleReminder
│   ├── tasks.schema.json         # 3 tools: addTask, getTasks, completeTask
│   ├── memory.schema.json        # 2 tools: rememberAboutUser, recallFromMemory
│   └── outreach.schema.json      # 2 tools: reachOut, callOnBehalf
├── handoff/
│   └── handoffs.schema.json      # 6 tools: handoffTo{Maya,Alex,Peter,Jordan,Nayan,Ferni}
├── persona-specific/
│   ├── ferni.schema.json         # 3 tools: teamIntro, checkIn, getUserSnapshot
│   ├── maya.schema.json          # 4 tools: createHabit, checkHabit, etc.
│   ├── alex.schema.json          # 4 tools: draftEmail, prepareConversation, etc.
│   ├── peter.schema.json         # 4 tools: researchTopic, analyzeStock, etc.
│   ├── jordan.schema.json        # 4 tools: planEvent, trackMilestone, etc.
│   └── nayan.schema.json         # 5 tools: reflectOn, findMeaning, etc.
└── generated/                    # Auto-generated files (do NOT edit directly)
    ├── function-calling-base.generated.md
    └── gemini-declarations.generated.ts
```

## Adding a New Tool

1. **Find the right schema file**:
   - Core tool (all personas): `core/<domain>.schema.json`
   - Persona-specific tool: `persona-specific/<persona>.schema.json`
   - Handoff tool: `handoff/handoffs.schema.json`

2. **Add the tool definition**:

```json
{
  "name": "toolName",
  "description": "What this tool does - be specific about triggers",
  "parameters": {
    "type": "object",
    "properties": {
      "param1": {
        "type": "string",
        "description": "Parameter description with examples"
      }
    },
    "required": ["param1"]
  },
  "examples": [
    {
      "userSays": "Example user input",
      "output": "{\"fn\":\"toolName\",\"args\":{\"param1\":\"value\"}}"
    }
  ]
}
```

3. **Validate and regenerate**:

```bash
pnpm tools:schemas:validate  # Check for errors
pnpm tools:schemas:generate  # Regenerate all files
```

4. **Commit all files**:

```bash
git add src/tools/schemas/
git commit -m "feat(tools): add toolName"
```

## Feature Flags

| Flag | Effect |
|------|--------|
| `USE_GENERATED_TOOL_DOCS=true` | Use generated markdown for prompts |
| `USE_GEMINI_NATIVE_FC=true` | Use generated native function declarations |

## Generated Files

### function-calling-base.generated.md

Used by the prompt loader to teach the LLM the JSON workaround format.
Loaded at runtime when `USE_GENERATED_TOOL_DOCS=true`.

### gemini-declarations.generated.ts

TypeScript file exporting native Gemini function declarations.
Imported dynamically when `USE_GEMINI_NATIVE_FC=true`.

Exports:
- `functionDeclarations`: Array of all tool declarations
- `toolsByDomain`: Record<string, string[]> grouping tools by domain
- `allToolNames`: Array of all tool names
- `getDeclarationsForDomains(domains)`: Get declarations for specific domains
- `getDeclaration(name)`: Get a single declaration by name

## Key Files

| File | Purpose |
|------|---------|
| `scripts/tools/validate-tool-schemas.ts` | Validates schemas against JSON Schema |
| `scripts/tools/generate-markdown-docs.ts` | Generates markdown documentation |
| `scripts/tools/generate-gemini-declarations.ts` | Generates TypeScript declarations |
| `scripts/tools/generate-all.ts` | Runs all generators in sequence |
| `src/agents/personas/prompt-loader.ts` | Loads generated markdown (with flag) |
| `src/agents/model-provider/gemini-live.ts` | Loads generated declarations (with flag) |

## Relationship to Existing System

This schema system runs **parallel** to the existing manual markdown files:

- **Manual**: `src/personas/bundles/shared/function-calling-base.md`
- **Generated**: `src/tools/schemas/generated/function-calling-base.generated.md`

The feature flags allow gradual migration. See `MIGRATION.md` for the full deprecation plan.

## Important Notes

1. **Never edit generated files** - they will be overwritten
2. **Always run `pnpm tools:validate`** after editing schemas
3. **Commit generated files** with schema changes
4. **Pre-commit hook** will auto-regenerate if schemas are modified
5. **CI** validates schemas and checks for drift on every PR
