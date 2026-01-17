# VS Code Extension Spec

> **Specification for a VS Code extension that provides IntelliSense, preview, and deploy capabilities for Ferni agents.**

---

## Overview

### Extension Name
`ferni-agent-builder`

### Description
Build, preview, and deploy voice AI agents directly from VS Code. IntelliSense for agent configs, one-click preview, integrated deployment.

### VS Code Marketplace Tags
- AI
- Voice
- Developer Tools
- JSON
- Markdown

---

## Features

### 1. IntelliSense for Agent Configs

#### persona.manifest.json
- Schema validation
- Autocomplete for all fields
- Hover documentation
- Error highlighting

```jsonc
{
  "identity": {
    "id": "my-agent",  // ✓ Valid
    "name": "|"        // Autocomplete: suggests fields
  },
  "personality": {
    "warmth": 1.5      // ❌ Error: must be 0-1
  }
}
```

#### system-prompt.md
- Section header autocomplete
- Linting for common mistakes
- Link to docs

### 2. Voice Preview

**Command:** `Ferni: Preview Voice`

- Plays TTS sample of selected text
- Uses agent's configured voice
- Keyboard shortcut: `Cmd+Shift+V`

```markdown
# System Prompt

Hello! I'm Alex, your career coach.
     │
     └─> Right-click → "Preview Voice" → Hear Alex say this
```

### 3. Agent Explorer

**View:** Sidebar panel

```
🎙️ FERNI AGENTS
├── career-coach ✓
│   ├── persona.manifest.json
│   ├── identity/
│   │   ├── system-prompt.md
│   │   └── biography.md
│   └── content/
│       └── behaviors/
├── wellness-guide ✗ (invalid)
│   └── [Click to see errors]
└── + Create New Agent
```

Features:
- Tree view of all agents
- Validation status indicators
- Quick navigation to files
- Create new agent button

### 4. Preview Server Integration

**Command:** `Ferni: Start Preview`

- Starts `ferni agent preview` in integrated terminal
- Opens browser to localhost:3333
- Shows status in status bar

**Status Bar:**
```
🎙️ career-coach @ localhost:3333  [Stop]
```

### 5. Deploy Command

**Command:** `Ferni: Deploy Agent`

- Runs `ferni agent publish`
- Shows progress notification
- Opens deployed URL on success

```
┌─────────────────────────────────────────┐
│ 🚀 Deploying career-coach...            │
│ ████████████░░░░░░░░ 60%                │
│                                          │
│ ✓ Validated                             │
│ ✓ Generated landing page                │
│ ◇ Deploying to Cloud Run...             │
└─────────────────────────────────────────┘
```

### 6. Snippets

#### persona.manifest.json
```json
// Trigger: ferni-manifest
{
  "$schema": "https://voiceai.example.com/schemas/persona-manifest.v2.json",
  "version": "1.0.0",
  "identity": {
    "id": "${1:agent-id}",
    "name": "${2:Agent Name}",
    "display_name": "${3:Display Name}",
    "description": "${4:description}"
  },
  "voice": {
    "provider": "cartesia",
    "voice_id": "${5:voice-id}"
  },
  "personality": {
    "warmth": ${6:0.8},
    "directness": ${7:0.6},
    "energy": ${8:0.6},
    "humor_level": ${9:0.4}
  }
}
```

#### system-prompt.md
```markdown
// Trigger: ferni-prompt
# ${1:Agent Name}

> ${2:One-line tagline}

You are ${1}, a ${3:description of role}.

## Your Style
- ${4:Style point 1}
- ${5:Style point 2}
- ${6:Style point 3}

## What You Do
- ${7:Capability 1}
- ${8:Capability 2}

## What You Don't Do
- ${9:Limitation 1}
- ${10:Limitation 2}
```

### 7. Diagnostics

Real-time validation showing:
- Missing required fields
- Invalid field values
- Voice ID validation (API check)
- File structure issues

```
PROBLEMS
─────────────────────────────────────────
career-coach/persona.manifest.json
  Line 5: "voice_id" is not a valid Cartesia voice ID
  Line 12: "warmth" must be between 0 and 1

career-coach/identity/system-prompt.md
  Missing "## What You Don't Do" section (recommended)
```

---

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Ferni: Create Agent` | - | Open creation wizard |
| `Ferni: Start Preview` | `Cmd+Shift+P` | Start preview server |
| `Ferni: Stop Preview` | - | Stop preview server |
| `Ferni: Deploy Agent` | `Cmd+Shift+D` | Deploy to production |
| `Ferni: Preview Voice` | `Cmd+Shift+V` | Hear selected text |
| `Ferni: Validate Agent` | - | Run validation checks |
| `Ferni: Open Docs` | - | Open documentation |

---

## Settings

```json
{
  "ferni.defaultVoice": "bf991597-...",
  "ferni.previewPort": 3333,
  "ferni.autoValidate": true,
  "ferni.showStatusBar": true,
  "ferni.apiEndpoint": "https://api.ferni.ai"
}
```

---

## Implementation

### Tech Stack
- VS Code Extension API
- Language Server Protocol (for IntelliSense)
- JSON Schema validation
- Tree View API
- Webview API (for wizard)

### Project Structure
```
ferni-vscode/
├── src/
│   ├── extension.ts           # Main entry point
│   ├── language/
│   │   ├── manifestSchema.ts  # JSON schema
│   │   └── promptLinter.ts    # Markdown linting
│   ├── views/
│   │   ├── AgentExplorer.ts   # Sidebar tree
│   │   └── CreateWizard.ts    # Webview wizard
│   ├── commands/
│   │   ├── preview.ts         # Preview command
│   │   ├── deploy.ts          # Deploy command
│   │   └── voice.ts           # Voice preview
│   └── utils/
│       ├── ferniCli.ts        # CLI wrapper
│       └── api.ts             # API client
├── schemas/
│   └── persona.manifest.schema.json
├── snippets/
│   ├── json.json
│   └── markdown.json
├── package.json
└── README.md
```

### Dependencies
- `vscode` - Extension API
- `vscode-languageserver` - LSP
- `ajv` - JSON validation
- `@ferni/cli` - CLI commands

---

## Development Phases

### Phase 1: MVP (2 weeks)
- [ ] JSON schema validation
- [ ] Basic snippets
- [ ] Tree view for agents
- [ ] Preview command (shell out to CLI)
- [ ] Deploy command (shell out to CLI)

### Phase 2: Polish (2 weeks)
- [ ] IntelliSense with hover docs
- [ ] Voice preview (API integration)
- [ ] Progress notifications
- [ ] Status bar integration
- [ ] Settings page

### Phase 3: Advanced (2 weeks)
- [ ] Markdown linting for prompts
- [ ] Creation wizard (webview)
- [ ] Inline voice IDs with preview
- [ ] Diff view for deployments

---

## Marketing

### Marketplace Description
```
# Ferni Agent Builder

Build voice AI agents without leaving VS Code.

## Features

✨ **IntelliSense** - Autocomplete and validation for agent configs
🎙️ **Voice Preview** - Hear how your agent will sound
🚀 **One-Click Deploy** - Publish to production instantly
📁 **Agent Explorer** - Manage all your agents in the sidebar

## Quick Start

1. Install the extension
2. Open a folder with Ferni agents (or create one)
3. Start building!

## Requirements

- Node.js 18+
- @ferni/cli (`npm install -g @ferni/cli`)

## Documentation

[Full docs](https://developers.ferni.ai)
```

### Screenshots
1. IntelliSense autocomplete
2. Agent Explorer sidebar
3. Voice preview in action
4. Deploy progress notification
5. Diagnostics panel

---

## Competitive Analysis

| Feature | Ferni Extension | Cursor | GitHub Copilot |
|---------|-----------------|--------|----------------|
| Agent-specific IntelliSense | ✅ | ❌ | ❌ |
| Voice preview | ✅ | ❌ | ❌ |
| Integrated deploy | ✅ | ❌ | ❌ |
| Schema validation | ✅ | Generic | Generic |

---

## Success Metrics

- 1,000 installs in first month
- 4.5+ star rating
- < 50ms IntelliSense response time
- 0 critical bugs at launch

---

*Target release: 4 weeks after CLI stable*
