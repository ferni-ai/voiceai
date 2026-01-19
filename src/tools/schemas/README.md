# Tool Schemas

Single source of truth for Ferni tool definitions, aligned with Gemini's native `functionDeclarations` format.

## Directory Structure

```
schemas/
  tool.schema.json          # JSON Schema for tool definitions
  core/                     # Core tools (all personas)
    music.schema.json       # Music playback tools
    weather.schema.json     # Weather tools
    news.schema.json        # News tools
    time.schema.json        # Time/calendar tools
  handoff/
    handoffs.schema.json    # Team handoff tools
  persona-specific/
    ferni.schema.json       # Ferni-only tools
    maya.schema.json        # Maya-only tools
    alex.schema.json        # Alex-only tools
    peter.schema.json       # Peter-only tools
    jordan.schema.json      # Jordan-only tools
    nayan.schema.json       # Nayan-only tools
  generated/                # Auto-generated files (do not edit)
    function-calling-base.md
    declarations.ts
```

## Schema Format

Each tool schema file contains:

```json
{
  "$schema": "../tool.schema.json",
  "domain": "music",
  "tools": [
    {
      "name": "playMusic",
      "description": "Play music by search query",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Song, artist, genre, or mood"
          }
        },
        "required": ["query"]
      },
      "examples": [
        {
          "userSays": "Play jazz",
          "output": "{\"fn\":\"playMusic\",\"args\":{\"query\":\"jazz\"}}"
        }
      ]
    }
  ]
}
```

## Commands

```bash
# Validate all schemas
pnpm tools:schemas:validate

# Generate markdown and declarations
pnpm tools:schemas:generate

# Check for drift (CI/pre-commit)
pnpm tools:schemas:check
```

## Adding a New Tool

1. Add the tool definition to the appropriate schema file
2. Run `pnpm tools:validate` to check for errors
3. Run `pnpm tools:generate` to update generated files
4. Commit both the schema and generated files

## Gemini Native Format

The schema aligns with Gemini's native `functionDeclarations` format:

```json
{
  "name": "toolName",
  "description": "What this tool does",
  "parameters": {
    "type": "object",
    "properties": {
      "param1": { "type": "string", "description": "..." }
    },
    "required": ["param1"]
  }
}
```

The `examples` field is Ferni-specific and used to generate the markdown documentation
that teaches the LLM the `{"fn":"...", "args":{...}}` workaround format.
