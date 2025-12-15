# Agent Extensibility System

This document describes the agent extensibility system that allows marketplace agents to have custom commands, tools, hooks, themes, and MCP integration - similar to how Claude Code marketplace extensions work.

## Overview

Agents can now bundle:

| Feature | Directory | Description |
|---------|-----------|-------------|
| **Commands** | `commands/` | Slash commands (e.g., `/morning-check-in`) |
| **Local Tools** | `tools/` | Agent-specific tools |
| **Assets** | `assets/` | Theme, sounds, icons, images |
| **Hooks** | `hooks.json` | Lifecycle event handlers |
| **MCP Config** | `mcp.json` | External tool server connections |

## Bundle Structure

```
marketplace-agents/agents/{agent-name}/
├── persona.manifest.json       # Core agent configuration
├── identity/
│   ├── system-prompt.md        # LLM system prompt
│   └── biography.md            # Character backstory
├── content/
│   ├── behaviors/              # Greetings, backchannels, etc.
│   ├── knowledge/              # Domain expertise
│   └── stories/                # Personal anecdotes
├── commands/                   # NEW: Slash commands
│   ├── _index.json             # Command metadata (optional)
│   ├── morning-check-in.md
│   └── weekly-review.md
├── tools/                      # NEW: Local tools
│   ├── _index.json             # Tool metadata (optional)
│   └── custom-tool.json
├── assets/                     # NEW: Theme & assets
│   ├── theme.json
│   ├── sounds.json
│   ├── icons/
│   └── images/
├── hooks.json                  # NEW: Lifecycle hooks
└── mcp.json                    # NEW: MCP server config
```

---

## Phase 1: Commands

Commands are slash commands that users can invoke to trigger specific prompts.

### Command File Format

Commands are markdown files with optional YAML frontmatter:

```markdown
---
name: Morning Check-In
description: Start your day with a structured check-in
category: check-in
icon: "🌅"
---

Let's do our morning check-in! I'd like to hear about:

1. How are you feeling this morning?
2. What's your main focus for today?
3. Is there anything weighing on your mind?
```

### Command Index (Optional)

Create `commands/_index.json` to customize command metadata:

```json
{
  "version": 1,
  "commands": [
    {
      "id": "morning-check-in",
      "file": "morning-check-in.md",
      "name": "Morning Check-In",
      "description": "Start your day with energy",
      "category": "check-in",
      "icon": "🌅",
      "enabled": true
    }
  ]
}
```

### Command Categories

- `check-in` - Daily/regular check-ins
- `review` - Weekly/monthly reviews
- `planning` - Goal setting and planning
- `reflection` - Journaling and reflection
- `action` - Take immediate action
- `custom` - Anything else

### Using Commands

Commands are loaded via `bundle.getCommands()`:

```typescript
const bundle = await loadBundleById('moxie');
const commands = await bundle.getCommands?.();

// Find a specific command
const checkIn = commands?.find(c => c.id === 'morning-check-in');

// Execute the command
import { executeCommand } from './command-loader.js';
const result = await executeCommand({
  command: checkIn,
  args: {},
  userId: 'user-123',
  sessionId: 'session-456',
  personaId: 'moxie',
});
```

---

## Phase 2: Local Tools

Local tools are agent-specific tools that extend the agent's capabilities.

### Tool Types

| Type | Description |
|------|-------------|
| `prompt` | Injects a prompt into the conversation |
| `webhook` | Calls an external HTTP endpoint |
| `script` | Runs a local script (not yet implemented) |
| `mcp` | Delegates to an MCP server |

### Tool Definition

Create `tools/{tool-name}.json`:

```json
{
  "id": "moxie-moment",
  "name": "triggerMoxieMoment",
  "description": "Celebrate when the user shows grit",
  "type": "prompt",
  "parameters": {
    "type": "object",
    "properties": {
      "momentType": {
        "type": "string",
        "enum": ["showed_up", "returned_after_absence"],
        "description": "The type of moment to celebrate"
      }
    },
    "required": ["momentType"]
  },
  "prompt": "This is a MOXIE MOMENT! Celebrate {{momentType}} with enthusiasm."
}
```

### Using Local Tools

```typescript
const bundle = await loadBundleById('moxie');
const tools = await bundle.getLocalTools?.();

// Get tool definitions for LLM
import { getLocalToolDefinitions } from './local-tools-loader.js';
const definitions = await getLocalToolDefinitions(bundle.bundlePath);

// Execute a tool
import { executeLocalTool } from './local-tools-loader.js';
const result = await executeLocalTool({
  tool: tools[0],
  params: { momentType: 'showed_up' },
  userId: 'user-123',
  sessionId: 'session-456',
  personaId: 'moxie',
});
```

---

## Phase 3: Themes & Assets

Agents can bundle custom themes, sounds, and visual assets.

### Theme Configuration

Create `assets/theme.json`:

```json
{
  "id": "moxie-fire",
  "name": "Moxie Fire Theme",
  "colors": {
    "primary": "#FF6B35",
    "secondary": "#F7C59F",
    "accent": "#EFEFD0",
    "background": "#1A1A2E",
    "text": "#FFFFFF",
    "muted": "#A3A3A3"
  },
  "avatar": {
    "animationStyle": "energetic"
  },
  "typography": {
    "fontSize": "medium"
  }
}
```

### Sound Configuration

Create `assets/sounds.json`:

```json
{
  "messageReceived": "sounds/hey.mp3",
  "celebration": "sounds/celebration.mp3",
  "notification": "sounds/ping.mp3",
  "custom": {
    "streak_milestone": "sounds/streak.mp3",
    "moxie_moment": "sounds/moment.mp3"
  }
}
```

### Using Assets

```typescript
const bundle = await loadBundleById('moxie');
const assets = await bundle.getAssets?.();

if (assets?.theme) {
  // Apply theme colors
  const css = themeToCSSVariables(assets.theme, 'agent');
}

if (assets?.sounds?.celebration) {
  // Play celebration sound
}
```

---

## Phase 4: Hooks

Hooks allow agents to inject behavior at key lifecycle points.

### Hook Events

| Event | When |
|-------|------|
| `session_start` | When a session begins |
| `before_response` | Before generating a response |
| `after_response` | After generating a response |
| `before_tool_call` | Before executing a tool |
| `after_tool_call` | After executing a tool |
| `on_handoff` | When a handoff occurs |
| `session_end` | When a session ends |
| `on_command` | When a slash command is invoked |

### Hook Configuration

Create `hooks.json`:

```json
{
  "session_start": {
    "type": "prompt",
    "enabled": true,
    "prompt": "Check if the user has any active streaks and acknowledge their progress."
  },
  "before_response": {
    "type": "prompt",
    "enabled": true,
    "prompt": "Remember: Be direct but warm. Celebrate wins loudly."
  },
  "on_handoff": {
    "type": "webhook",
    "enabled": true,
    "webhook": "https://api.example.com/hooks/handoff"
  }
}
```

### Using Hooks

```typescript
const bundle = await loadBundleById('moxie');
const hooks = await bundle.getHooks?.();

// Check if a hook exists
import { hasHook, getHookPrompt } from './hooks-loader.js';
if (hasHook(hooks, 'session_start')) {
  const prompt = getHookPrompt(hooks, 'session_start');
  // Inject prompt into context
}
```

---

## Phase 5: MCP Integration

Connect to external Model Context Protocol (MCP) servers for additional tools.

### MCP Configuration

Create `mcp.json`:

```json
{
  "servers": [
    {
      "id": "my-tools",
      "name": "My Custom Tools",
      "transport": "stdio",
      "command": "node",
      "args": ["./mcp-server.js"],
      "autoConnect": true
    },
    {
      "id": "external-api",
      "name": "External API",
      "transport": "http",
      "url": "https://api.example.com/mcp",
      "timeout": 30000
    }
  ]
}
```

### Transport Types

| Transport | Description |
|-----------|-------------|
| `stdio` | Spawn a child process |
| `http` | HTTP endpoint |
| `websocket` | WebSocket connection |

### Using MCP

```typescript
const bundle = await loadBundleById('moxie');
const mcpConfig = await bundle.getMCPConfig?.();

import { getAutoConnectServers, connectToMCPServer } from './mcp-loader.js';
const servers = getAutoConnectServers(mcpConfig);

for (const server of servers) {
  const connection = await connectToMCPServer(server);
  // Use MCP tools...
}
```

> **Note**: Full MCP integration requires the MCP SDK. The current implementation provides the configuration loading infrastructure.

---

## Complete Example: Moxie Accountability Partner

Here's the complete extensibility bundle for Moxie:

```
marketplace-agents/agents/moxie-accountability/
├── persona.manifest.json
├── identity/
│   ├── system-prompt.md
│   └── biography.md
├── content/
│   ├── behaviors/
│   ├── knowledge/
│   └── stories/
├── commands/
│   ├── _index.json
│   ├── morning-check-in.md
│   ├── evening-reflection.md
│   ├── comeback.md
│   └── streak-check.md
├── tools/
│   ├── _index.json
│   ├── moxie-moment.json
│   └── excuse-detector.json
├── assets/
│   ├── theme.json
│   └── sounds.json
└── hooks.json
```

---

## API Reference

### LoadedPersonaBundle Extensions

```typescript
interface LoadedPersonaBundle {
  // ... existing methods ...

  /** Phase 1: Agent Commands */
  getCommands?: () => Promise<BundleCommand[]>;

  /** Phase 2: Local Tools */
  getLocalTools?: () => Promise<BundleLocalTool[]>;

  /** Phase 3: Theme & Assets */
  getAssets?: () => Promise<BundleAssets | null>;

  /** Phase 4: Hooks */
  getHooks?: () => Promise<BundleAgentHooks | null>;

  /** Phase 5: MCP Config */
  getMCPConfig?: () => Promise<BundleMCPConfig | null>;
}
```

### Type Exports

All types are exported from `src/personas/bundles/types/commands.ts`:

```typescript
// Commands
export type { BundleCommand, BundleCommandIndex, CommandExecutionContext };

// Local Tools
export type { BundleLocalTool, LocalToolExecutionContext };

// Assets
export type { BundleTheme, BundleSounds, BundleAssets };

// Hooks
export type { BundleAgentHooks, BundleHook };

// MCP
export type { BundleMCPConfig, BundleMCPServer };
```

---

## Best Practices

1. **Commands**: Keep prompts focused on a single purpose
2. **Local Tools**: Prefer `prompt` type for simplicity; use `webhook` for external integrations
3. **Assets**: Use consistent color themes that match agent personality
4. **Hooks**: Don't overuse - each hook adds latency
5. **MCP**: Reserve for complex external integrations

## See Also

- [Creating Personas](./guides/creating-personas.md)
- [Tool Development](./tools/CLAUDE.md)
- [Context Builders](../src/intelligence/context-builders/CLAUDE.md)
