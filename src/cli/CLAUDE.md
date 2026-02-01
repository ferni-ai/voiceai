# CLI Tools (Internal)

> **Development and operations CLI tools for the Ferni platform.**

This directory contains internal CLI tools for development, debugging, and operations. These are NOT the main Ferni CLI (`apps/cli/`) - they're internal utilities.

---

## Tools Overview

| Tool | File | Purpose |
|------|------|---------|
| **Agent Manager** | `agent-manager.ts` | Manage agent processes (start/stop/status) |
| **Experiments CLI** | `experiments-cli.ts` | A/B testing and feature flags |
| **Persona CLI** | `persona-cli.ts` | Persona management and testing |
| **Tools Report** | `tools-report.ts` | Generate tool usage reports |
| **Diagnose Tools** | `commands/diagnose-tools.ts` | Tool diagnostics |
| **Synthetic E2E** | `commands/synthetic-e2e.ts` | Synthetic end-to-end tests |
| **Test Agents** | `commands/test-agents.ts` | Agent testing utilities |

### Commands Subdirectory

The `commands/` directory contains additional CLI commands:

```
cli/
├── agent-manager.ts
├── experiments-cli.ts
├── persona-cli.ts
├── tools-report.ts
└── commands/
    ├── diagnose-tools.ts
    ├── synthetic-e2e.ts
    └── test-agents.ts
```

---

## Agent Manager

Manage voice agent processes during development:

```bash
# Start agent
npx ts-node src/cli/agent-manager.ts start

# Check status
npx ts-node src/cli/agent-manager.ts status

# Stop agent
npx ts-node src/cli/agent-manager.ts stop

# Restart with fresh state
npx ts-node src/cli/agent-manager.ts restart --fresh
```

---

## Experiments CLI

Manage A/B tests and feature flags:

```bash
# List active experiments
npx ts-node src/cli/experiments-cli.ts list

# Enable experiment for user
npx ts-node src/cli/experiments-cli.ts enable --experiment="new-greeting" --user="user123"

# Check experiment status
npx ts-node src/cli/experiments-cli.ts status --experiment="new-greeting"

# Generate experiment report
npx ts-node src/cli/experiments-cli.ts report --experiment="new-greeting"
```

---

## Persona CLI

Test and manage personas:

```bash
# List all personas
npx ts-node src/cli/persona-cli.ts list

# Test persona greeting
npx ts-node src/cli/persona-cli.ts test --persona="ferni" --scenario="greeting"

# Validate persona bundle
npx ts-node src/cli/persona-cli.ts validate --persona="maya-santos"

# Generate persona report
npx ts-node src/cli/persona-cli.ts report
```

---

## Tools Report

Generate reports on tool usage across domains:

```bash
# Generate full report
npx ts-node src/cli/tools-report.ts

# Generate report for specific domain
npx ts-node src/cli/tools-report.ts --domain="habit-coaching"

# Output as JSON
npx ts-node src/cli/tools-report.ts --format=json

# Check for unused tools
npx ts-node src/cli/tools-report.ts --unused
```

---

## vs. Ferni CLI (`apps/cli/`)

| This Directory (`src/cli/`) | Ferni CLI (`apps/cli/`) |
|-----------------------------|-------------------------|
| Internal dev tools | User-facing CLI |
| Run with `npx ts-node` | Run with `ferni` command |
| Not published | Published to npm |
| For developers | For all users |

---

## Adding a New CLI Tool

1. Create `src/cli/{tool-name}.ts`
2. Use Commander.js for argument parsing
3. Add to this documentation
4. Consider if it should be in `apps/cli/` instead (user-facing)

### Template

```typescript
import { Command } from 'commander';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'my-cli-tool' });
const program = new Command();

program
  .name('my-tool')
  .description('What this tool does')
  .version('1.0.0');

program
  .command('action')
  .description('Perform action')
  .option('-o, --option <value>', 'Option description')
  .action(async (options) => {
    try {
      // Tool logic
      log.info({ options }, 'Running action');
    } catch (error) {
      log.error({ error: String(error) }, 'Action failed');
      process.exit(1);
    }
  });

program.parse();
```

---

## Related Documentation

- `apps/cli/CLAUDE.md` - Ferni CLI (user-facing)
- `../CLAUDE.md` - Main project docs
- `../../CLAUDE.md` - Root project docs

---

*Last updated: January 2026*
