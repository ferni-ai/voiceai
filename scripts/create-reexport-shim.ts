#!/usr/bin/env npx tsx
/**
 * Re-export Shim Generator
 *
 * Creates a re-export shim file at an old module path that forwards all
 * exports to the new canonical location. This ensures backward compatibility
 * during the services layer DDD refactor.
 *
 * Usage:
 *   npx tsx scripts/create-reexport-shim.ts <old-path> <new-import-path>
 *
 * Example:
 *   npx tsx scripts/create-reexport-shim.ts \
 *     src/services/session-manager.ts \
 *     ./session/index.js
 *
 * This generates:
 *   // src/services/session-manager.ts
 *   // @deprecated Moved to services/session/. Import from './session/index.js' instead.
 *   export * from './session/index.js';
 *
 * Options:
 *   --dry-run    Preview without writing
 *   --named      Also re-export specific named exports (comma-separated)
 *   --default    Re-export a default export
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, relative, resolve } from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface ShimConfig {
  oldPath: string;
  newImportPath: string;
  dryRun: boolean;
  namedExports: string[];
  hasDefault: boolean;
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(): ShimConfig {
  const args = process.argv.slice(2);
  const flags = new Set<string>();
  const positional: string[] = [];
  let namedExports: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      flags.add('dry-run');
    } else if (arg === '--default') {
      flags.add('default');
    } else if (arg === '--named' && i + 1 < args.length) {
      namedExports = args[++i].split(',').map(s => s.trim());
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error('Usage: npx tsx scripts/create-reexport-shim.ts <old-path> <new-import-path> [--dry-run] [--named exports] [--default]');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/create-reexport-shim.ts src/services/session-manager.ts ./session/index.js');
    console.error('  npx tsx scripts/create-reexport-shim.ts src/services/contacts.ts ./identity/contacts/index.js --default');
    process.exit(1);
  }

  return {
    oldPath: positional[0],
    newImportPath: positional[1],
    dryRun: flags.has('dry-run'),
    namedExports,
    hasDefault: flags.has('default'),
  };
}

// ============================================================================
// SHIM GENERATION
// ============================================================================

function generateShimContent(config: ShimConfig): string {
  const oldRelative = config.oldPath.replace(/^src\//, '');
  const newClean = config.newImportPath.replace(/\.ts$/, '.js');

  const lines: string[] = [
    `/**`,
    ` * @deprecated This module has moved.`,
    ` * Import from '${newClean}' instead.`,
    ` *`,
    ` * This shim exists for backward compatibility during the services DDD refactor.`,
    ` * It will be removed once all consumers are updated.`,
    ` *`,
    ` * Old path: ${oldRelative}`,
    ` */`,
    ``,
    `export * from '${newClean}';`,
  ];

  if (config.hasDefault) {
    lines.push(`export { default } from '${newClean}';`);
  }

  // Add specific named re-exports if requested
  if (config.namedExports.length > 0) {
    lines.push(`export { ${config.namedExports.join(', ')} } from '${newClean}';`);
  }

  lines.push(''); // trailing newline

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const config = parseArgs();
  const shimContent = generateShimContent(config);

  console.log(`📦 Re-export Shim Generator`);
  console.log(`   Old path:    ${config.oldPath}`);
  console.log(`   New import:  ${config.newImportPath}`);
  console.log(`   Has default: ${config.hasDefault}`);
  if (config.namedExports.length > 0) {
    console.log(`   Named:       ${config.namedExports.join(', ')}`);
  }
  console.log();

  if (config.dryRun) {
    console.log('--- DRY RUN (would write): ---');
    console.log(shimContent);
    console.log('--- END DRY RUN ---');
    return;
  }

  // Check if old path exists and has real content (not already a shim)
  const fullOldPath = resolve(config.oldPath);
  if (existsSync(fullOldPath)) {
    const existing = readFileSync(fullOldPath, 'utf-8');
    if (existing.includes('@deprecated This module has moved')) {
      console.log('⚠️  File is already a shim. Skipping.');
      return;
    }

    // Back up existing file
    const backupPath = fullOldPath + '.bak';
    writeFileSync(backupPath, existing);
    console.log(`📋 Backed up existing file to ${relative(process.cwd(), backupPath)}`);
  }

  // Ensure directory exists
  mkdirSync(dirname(fullOldPath), { recursive: true });

  // Write shim
  writeFileSync(fullOldPath, shimContent);
  console.log(`✅ Shim written to ${relative(process.cwd(), fullOldPath)}`);
}

main();
