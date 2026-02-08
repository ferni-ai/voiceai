# Voice-Driven Coding with Ferni + Claude Code

> Talk to Ferni about what you want to build. Ferni translates your voice to Claude Code commands and narrates the progress.

## Quick Start

```bash
ferni code
```

That's it! Services auto-start if needed.

## What Happens

1. **Services Start** - Token server (3001) and voice agent (8081) auto-start
2. **You Speak** - "Add a dark mode toggle to settings"
3. **Ferni Transcribes** - Gemini Live converts speech to text
4. **Claude Executes** - Claude Code runs with full tool access
5. **Ferni Narrates** - Claude uses MCP tools to have Ferni speak progress
6. **You Hear Results** - Cartesia TTS speaks Claude's updates

## Architecture

```
You speak → LiveKit → Gemini STT → Claude Code → MCP Tools → Ferni TTS → You hear
                                       │
                                       ├── mcp__ferni__narrate
                                       ├── mcp__ferni__report_progress
                                       └── mcp__ferni__task_complete
```

## Options

| Flag           | Description                                     |
| -------------- | ----------------------------------------------- |
| `--debug`      | Show raw MCP events and transcriptions          |
| `--dir ./path` | Work in a specific directory                    |
| `--cloud`      | Use production services (skip local auto-start) |

## MCP Tools Available to Claude

When Claude works on your request, it can use these tools to communicate:

### `mcp__ferni__narrate`

Have Ferni speak something aloud.

```json
{
  "text": "I'm about to create a new component",
  "emotion": "thoughtful" // neutral, excited, thoughtful, concerned, encouraging
}
```

### `mcp__ferni__report_progress`

Update on task progress with optional percentage.

```json
{
  "message": "Refactoring the user service",
  "percentage": 50,
  "status": "in_progress" // in_progress, completed, blocked, error
}
```

### `mcp__ferni__task_complete`

Mark task done and announce completion.

```json
{
  "summary": "Created the dark mode toggle with localStorage persistence",
  "next_steps": "You might want to add system preference detection"
}
```

### `mcp__ferni__request_voice_input`

Ask user a question via Ferni.

```json
{
  "question": "Should I use CSS variables or Tailwind for the theme?",
  "context": "Both approaches work, but have different trade-offs"
}
```

### `mcp__ferni__get_current_task`

Get the current task from the voice queue.

## Hooks (Automatic)

Claude Code hooks automatically notify Ferni:

| Hook           | When                   | What Ferni Says                   |
| -------------- | ---------------------- | --------------------------------- |
| `PostToolUse`  | After Edit/Write/Bash  | "Finished editing code"           |
| `Stop`         | Claude done responding | "I'm ready for your next request" |
| `SubagentStop` | Background task done   | "Finished the background task"    |

## Files

| File                                   | Purpose                         |
| -------------------------------------- | ------------------------------- |
| `scripts/ferni.ts`                     | CLI entry point                 |
| `scripts/cli/voice-claude.ts`          | Voice-to-Claude bridge          |
| `apps/cli/src/mcp/ferni-mcp-server.ts` | MCP server with narration tools |
| `scripts/mcp/hook-notify-ferni.ts`     | Hook script for queue updates   |
| `.mcp.json`                            | MCP server configuration        |
| `.claude/hooks.json`                   | Claude Code hooks               |
| `.ferni-mcp/narration.json`            | Narration queue (runtime)       |
| `.ferni-mcp/state.json`                | Task state (runtime)            |

## Example Session

```
You: "Create a function that validates email addresses"

Ferni: [transcribes and sends to Claude]

Claude: [uses mcp__ferni__narrate]
Ferni: "I'll create an email validation function for you"

Claude: [uses Edit tool to create file]

Claude: [uses mcp__ferni__report_progress]
Ferni: "Progress update: Created the validation function"

Claude: [uses mcp__ferni__task_complete]
Ferni: "All done! I created an isValidEmail function that checks
        format and common domains. You can find it in utils/validation.ts"

You: "Add tests for it"
...
```

## Troubleshooting

### Services won't start

```bash
# Check what's running
ferni status

# Manual start if needed
node token-server.js        # Terminal 1
pnpm agent:dev              # Terminal 2
ferni code --cloud          # Skip auto-start
```

### No voice output

- Check microphone permissions
- Verify Cartesia API key in `.env`
- Run `ferni debug voice "test"` to test TTS

### Claude not using MCP tools

- Verify `.mcp.json` exists in project root
- Check `--mcp-config` is being passed (see `--debug` output)
- MCP server must be running (auto-started by `ferni code`)

## How It Works Internally

### 1. Service Auto-Start

`handleCode()` in `ferni.ts` checks ports 3001/8081 and spawns detached processes if needed.

### 2. Voice Connection

`voice-claude.ts` connects to LiveKit, publishes microphone, subscribes to transcriptions.

### 3. Transcription → Claude

When you speak, Ferni transcribes via Gemini Live. Final transcriptions are sent to Claude Code via NDJSON stdin.

### 4. Claude → MCP → Narration Queue

Claude uses `mcp__ferni__*` tools. The MCP server writes to `.ferni-mcp/narration.json`.

### 5. Queue → Ferni TTS

`voice-claude.ts` polls the queue every 500ms, sends unprocessed messages to Ferni via LiveKit data channel.

### 6. Data Channel → TTS

`data-channel-handler.ts` receives `claude_narration` messages, calls `session.generateReply()` to make Ferni speak.

## Related Commands

| Command                    | Description                         |
| -------------------------- | ----------------------------------- |
| `ferni voice`              | Live voice conversation (no Claude) |
| `ferni debug voice "text"` | Test voice pipeline                 |
| `ferni voices preview`     | Preview available voices            |
