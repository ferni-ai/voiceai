#!/usr/bin/env npx tsx
/**
 * Auto-generate SCRIPTS.md from package.json
 *
 * Reads all npm scripts and generates comprehensive documentation.
 *
 * Usage:
 *   npx tsx scripts/generate-scripts-doc.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// ============================================================================
// SCRIPT CATEGORIES
// ============================================================================

interface ScriptCategory {
  name: string;
  icon: string;
  description: string;
  patterns: RegExp[];
}

const CATEGORIES: ScriptCategory[] = [
  {
    name: 'Core Development',
    icon: '🛠️',
    description: 'Primary development commands',
    patterns: [/^dev/, /^start/, /^build$/],
  },
  {
    name: 'Testing',
    icon: '🧪',
    description: 'Test runners and validation',
    patterns: [/^test/, /^validate/],
  },
  {
    name: 'Code Quality',
    icon: '📊',
    description: 'Linting, formatting, and audits',
    patterns: [/^lint/, /^format/, /^quality/, /^audit/, /^typecheck/],
  },
  {
    name: 'Deployment',
    icon: '🚀',
    description: 'Deploy services to cloud',
    patterns: [/^deploy/],
  },
  {
    name: 'Setup & Configuration',
    icon: '⚙️',
    description: 'Environment setup',
    patterns: [/^setup/],
  },
  {
    name: 'Generation',
    icon: '🏗️',
    description: 'Code and asset generation',
    patterns: [/^generate/, /^build:(?!frontend)/],
  },
  {
    name: 'Rollout & Release',
    icon: '🎯',
    description: 'Feature rollout management',
    patterns: [/^rollout/],
  },
  {
    name: 'Environment',
    icon: '🌍',
    description: 'Environment management',
    patterns: [/^env/],
  },
  {
    name: 'Design System',
    icon: '🎨',
    description: 'Design tokens and components',
    patterns: [/^design-system/],
  },
  {
    name: 'Utilities',
    icon: '🔧',
    description: 'Miscellaneous utilities',
    patterns: [/^ferni/, /^token-server/, /^restart/, /^sandbox/, /^sync/],
  },
];

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('📝 Generating SCRIPTS.md...\n');

  // Read package.json
  const pkgPath = join(PROJECT_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const scripts = pkg.scripts as Record<string, string>;

  // Group scripts by category
  const categorized = new Map<string, { name: string; command: string }[]>();
  const uncategorized: { name: string; command: string }[] = [];

  for (const [name, command] of Object.entries(scripts)) {
    let found = false;
    
    for (const category of CATEGORIES) {
      if (category.patterns.some(p => p.test(name))) {
        const existing = categorized.get(category.name) || [];
        existing.push({ name, command });
        categorized.set(category.name, existing);
        found = true;
        break;
      }
    }
    
    if (!found) {
      uncategorized.push({ name, command });
    }
  }

  // Generate markdown
  let md = `# 📜 Ferni Scripts Reference

> **Auto-generated** - Do not edit directly. Run \`npm run generate scripts-doc\` to update.

This document lists all available npm scripts in the Ferni project.

## 🚀 Quick Start

\`\`\`bash
# Interactive CLI
npm run ferni

# Most common commands
npm run dev                 # Start development
npm run test:cli quick      # Quick validation
npm run deploy all          # Deploy everything
\`\`\`

---

`;

  // Add categorized scripts
  for (const category of CATEGORIES) {
    const scripts = categorized.get(category.name);
    if (!scripts || scripts.length === 0) continue;

    md += `## ${category.icon} ${category.name}\n\n`;
    md += `${category.description}\n\n`;
    md += `| Script | Command |\n`;
    md += `|--------|----------|\n`;

    for (const { name, command } of scripts.sort((a, b) => a.name.localeCompare(b.name))) {
      // Truncate long commands
      const shortCmd = command.length > 60 ? command.slice(0, 57) + '...' : command;
      md += `| \`npm run ${name}\` | \`${shortCmd}\` |\n`;
    }

    md += '\n';
  }

  // Add uncategorized
  if (uncategorized.length > 0) {
    md += `## 📦 Other Scripts\n\n`;
    md += `| Script | Command |\n`;
    md += `|--------|----------|\n`;

    for (const { name, command } of uncategorized.sort((a, b) => a.name.localeCompare(b.name))) {
      const shortCmd = command.length > 60 ? command.slice(0, 57) + '...' : command;
      md += `| \`npm run ${name}\` | \`${shortCmd}\` |\n`;
    }

    md += '\n';
  }

  // Add CLI reference
  md += `## 🎯 Unified CLI Reference

The \`ferni\` CLI provides interactive access to all commands:

\`\`\`bash
# Interactive mode
npm run ferni

# Direct commands
npm run ferni deploy ui
npm run ferni test quick
npm run ferni setup local
npm run ferni generate all
npm run ferni health
\`\`\`

### Available CLI Modules

| Module | Description | Example |
|--------|-------------|---------|
| \`deploy\` | Deploy services | \`ferni deploy ui\` |
| \`setup\` | Configure environment | \`ferni setup local\` |
| \`test\` | Run tests | \`ferni test quick\` |
| \`validate\` | Run validations | \`ferni validate all\` |
| \`audit\` | Code audits | \`ferni audit quality\` |
| \`build\` | Build apps | \`ferni build apps\` |
| \`generate\` | Generate code/assets | \`ferni generate all\` |
| \`rollout\` | Feature rollouts | \`ferni rollout status\` |
| \`health\` | System health check | \`ferni health\` |

---

## 📚 Additional Resources

- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Development Setup](./docs/DEVELOPMENT.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)

---

*Generated on ${new Date().toISOString().split('T')[0]}*
`;

  // Write file
  const outPath = join(PROJECT_ROOT, 'SCRIPTS.md');
  writeFileSync(outPath, md);

  console.log(`✓ Generated SCRIPTS.md with ${Object.keys(scripts).length} scripts`);
  console.log(`  Categories: ${categorized.size}`);
  console.log(`  Uncategorized: ${uncategorized.length}`);
}

main();

