# Agent Extensibility System

> Extend personas with custom commands, hooks, MCP servers, and embeddable widgets.

The Agent Extensibility System allows personas to be extended without modifying core code. All extensions are **opt-in** and **per-persona**.

---

## Quick Reference

| Feature | Location | Purpose |
|---------|----------|---------|
| **Commands** | `src/personas/bundles/{persona}/commands/*.md` | Slash commands in UI |
| **Shell Hooks** | `src/personas/bundles/{persona}/hooks/` | Pre/post execution scripts |
| **MCP Servers** | `src/personas/bundles/{persona}/mcp/` | Model Context Protocol integrations |
| **Widget SDK** | `src/api/widget-routes.ts` | Embed Ferni on external websites |

---

## 1. Slash Commands

Commands are markdown files that define prompts users can invoke from the UI.

### File Structure

```
src/personas/bundles/ferni/commands/
├── morning-ritual.md
├── evening-reflection.md
├── weekly-review.md
└── energy-check.md
```

### Command Format

```markdown
---
title: Morning Ritual
description: Start your day with intention
category: rituals
icon: sunrise
arguments:
  - name: focus
    description: What to focus on today
    required: false
---

Guide me through a morning ritual focused on {{focus | "general wellbeing"}}.
Help me set intentions for the day ahead.
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display name in UI |
| `description` | Yes | Brief explanation |
| `category` | Yes | One of: `rituals`, `reflection`, `planning`, `wellness`, `custom` |
| `icon` | No | Icon name: `sunrise`, `moon`, `calendar`, `heart`, `clock`, `star` |
| `arguments` | No | Array of `{name, description, required}` |

### API Endpoints

```bash
# List commands for a persona
GET /api/commands/:personaId

# Get specific command
GET /api/commands/:personaId/:commandId

# Render command with arguments
POST /api/commands/:personaId/:commandId/render
Content-Type: application/json
{"focus": "productivity"}
```

### Adding Commands to a Persona

1. Create `commands/` folder in persona bundle
2. Add markdown files with frontmatter
3. Commands auto-load on server start (cached)

---

## 2. Shell Hooks

Execute scripts before/after persona actions.

### File Structure

```
src/personas/bundles/ferni/hooks/
├── pre-session.sh      # Before session starts
├── post-session.sh     # After session ends
├── pre-tool.sh         # Before tool execution
└── post-tool.sh        # After tool execution
```

### Hook Environment Variables

| Variable | Description |
|----------|-------------|
| `FERNI_USER_ID` | Current user ID |
| `FERNI_SESSION_ID` | Current session ID |
| `FERNI_PERSONA_ID` | Active persona |
| `FERNI_TOOL_NAME` | Tool being executed (tool hooks only) |
| `FERNI_TOOL_RESULT` | Tool result JSON (post-tool only) |

### Example Hook

```bash
#!/bin/bash
# post-tool.sh - Log tool usage to external system

curl -X POST https://analytics.example.com/tool-usage \
  -H "Content-Type: application/json" \
  -d "{\"user\": \"$FERNI_USER_ID\", \"tool\": \"$FERNI_TOOL_NAME\"}"
```

### Security

- Hooks run in sandboxed subprocess
- 30-second timeout
- No access to process environment beyond FERNI_* vars
- Failures are logged but don't block operations

---

## 3. MCP Integration

Connect personas to Model Context Protocol servers.

### Configuration

```
src/personas/bundles/ferni/mcp/
└── servers.json
```

```json
{
  "servers": [
    {
      "name": "calendar",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-google-calendar"],
      "env": {
        "GOOGLE_CALENDAR_CREDENTIALS": "${GOOGLE_CALENDAR_CREDENTIALS}"
      }
    },
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/home/user/documents"]
    }
  ]
}
```

### Server Lifecycle

- Servers start lazily on first tool call
- Auto-restart on crash (max 3 retries)
- Graceful shutdown on session end
- Tool names prefixed with server name: `calendar_list_events`

### Available MCP Servers

See [Anthropic MCP Servers](https://github.com/anthropics/mcp-servers) for official servers.

---

## 4. Embeddable Widget SDK

Embed Ferni on any website.

### Integration (2 lines of code)

```html
<script src="https://your-domain.com/api/widget/embed.js"
        data-widget-id="widget_abc123"
        async></script>
```

### Widget Registration (Admin)

```bash
POST /api/widget/register
Content-Type: application/json

{
  "personaId": "ferni",
  "displayName": "Ferni Assistant",
  "allowedDomains": ["example.com", "*.example.com"],
  "primaryColor": "#4a6741",
  "position": "bottom-right",
  "autoGreet": true,
  "greetingMessage": "Hi! I'm Ferni. How can I help?",
  "dailyLimit": 10,
  "sessionDurationMinutes": 30
}
```

### Widget Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `personaId` | Required | Which persona to use |
| `allowedDomains` | Required | Domains allowed to embed |
| `displayName` | Persona name | Name shown in widget |
| `primaryColor` | `#4a6741` | Theme color |
| `position` | `bottom-right` | `bottom-right` or `bottom-left` |
| `autoGreet` | `false` | Auto-open with greeting |
| `greetingMessage` | None | Initial message |
| `dailyLimit` | `5` | Max conversations per day |
| `sessionDurationMinutes` | `30` | Session timeout |

### Widget API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/widget/register` | POST | Register new widget (admin) |
| `/api/widget/list` | GET | List all widgets |
| `/api/widget/:id/config` | GET | Get widget config |
| `/api/widget/:id/session` | POST | Start/validate session |
| `/api/widget/:id` | DELETE | Delete widget |
| `/api/widget/embed.js` | GET | JavaScript SDK |

### Security Features

- **Origin validation**: Only allowed domains can load widget
- **Rate limiting**: Per-IP request limits
- **Daily limits**: Configurable conversation caps
- **Session expiry**: Auto-expire inactive sessions

---

## 5. after_tool_call Hook

Programmatic hook for tool execution analytics.

### Registration

```typescript
import { registerAfterToolHook } from '../personas/bundles/extensibility-integration.js';

registerAfterToolHook('analytics', async (context) => {
  const { toolName, result, duration, userId, sessionId } = context;

  await logToAnalytics({
    tool: toolName,
    success: result.success,
    latencyMs: duration,
    user: userId
  });
});
```

### Hook Context

```typescript
interface AfterToolContext {
  toolName: string;
  result: ToolResult;
  duration: number;      // milliseconds
  userId: string;
  sessionId: string;
  personaId: string;
  timestamp: Date;
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Persona Bundle                          │
│  src/personas/bundles/{persona}/                           │
├─────────────────────────────────────────────────────────────┤
│  commands/          │  Shell hooks       │  MCP servers    │
│  *.md files         │  *.sh scripts      │  servers.json   │
│  → UI slash cmds    │  → Pre/post exec   │  → Tool servers │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Extensibility Layer                      │
│  src/personas/bundles/                                     │
├─────────────────────────────────────────────────────────────┤
│  commands-loader.ts │  hooks-loader.ts   │  mcp-loader.ts  │
│  → Parse markdown   │  → Execute scripts │  → Start servers│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       API Layer                             │
│  src/api/                                                  │
├─────────────────────────────────────────────────────────────┤
│  commands-routes.ts │  widget-routes.ts                    │
│  → /api/commands/*  │  → /api/widget/*                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Frontend UI                            │
│  frontend-typescript/src/ui/                               │
├─────────────────────────────────────────────────────────────┤
│  commands.ui.ts     │  settings-menu.ui.ts                 │
│  → Slide-out panel  │  → "Start a Practice" menu item      │
└─────────────────────────────────────────────────────────────┘
```

---

## Adding Extensibility to a New Persona

### Minimal Setup (Commands Only)

```bash
mkdir -p src/personas/bundles/maya-santos/commands
cat > src/personas/bundles/maya-santos/commands/habit-check.md << 'EOF'
---
title: Habit Check-In
description: Review your habit progress
category: wellness
---

Let's check in on your habits. How have you been doing with your routines?
EOF
```

### Full Setup

```bash
persona=maya-santos
mkdir -p src/personas/bundles/$persona/{commands,hooks,mcp}

# Commands
echo "Add .md files to commands/"

# Hooks
echo "Add .sh scripts to hooks/"

# MCP
echo '{"servers": []}' > src/personas/bundles/$persona/mcp/servers.json
```

---

## Testing

```bash
# Run widget route tests
npm test -- --run src/tests/widget-routes.test.ts

# Test commands API locally
curl http://localhost:3002/api/commands/ferni

# Test widget embed script
curl http://localhost:3002/api/widget/embed.js
```

---

## Related Documentation

- [Persona Bundle Architecture](./adr/0001-persona-bundle-architecture.md)
- [Creating Personas Guide](../guides/creating-personas.md)
- [API Reference](../guides/api-reference.md)
