#!/usr/bin/env tsx
/**
 * Context Builder Sync Validator
 *
 * Validates that BUILDER_MANIFEST (loader.ts) and BUILDER_IMPORTS (builder-imports.ts) are in sync.
 * This prevents runtime failures where builders are in the manifest but can't be loaded.
 *
 * Run: pnpm validate:builders
 * Part of: pnpm quality
 *
 * Exit codes:
 * - 0: All builders in sync
 * - 1: Missing imports (CRITICAL - will fail at runtime)
 * - 2: Orphaned imports only (WARNING - dead code)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const LOADER_PATH = join(
  import.meta.dirname,
  '../src/intelligence/context-builders/core/loader.ts'
);
const IMPORTS_PATH = join(
  import.meta.dirname,
  '../src/intelligence/context-builders/core/builder-imports.ts'
);

/**
 * Extract builder names from BUILDER_MANIFEST in loader.ts
 * Handles commented-out builders (// 'name') and disabled builders
 */
function extractManifestBuilders(content: string): Set<string> {
  const builders = new Set<string>();

  // Find BUILDER_MANIFEST object
  const manifestMatch = content.match(
    /export const BUILDER_MANIFEST[^=]*=\s*\{([\s\S]*?)\n\};/
  );
  if (!manifestMatch) {
    console.error('Could not find BUILDER_MANIFEST in loader.ts');
    process.exit(1);
  }

  const manifestContent = manifestMatch[1];

  // Extract all string literals that are builder names (not commented out)
  // Match 'builder-name' that are NOT preceded by // on the same line
  const lines = manifestContent.split('\n');
  for (const line of lines) {
    // Skip fully commented lines
    if (line.trim().startsWith('//')) continue;

    // Extract quoted strings that look like builder names
    const matches = line.match(/'([a-z][a-z0-9-]*)'/g);
    if (matches) {
      for (const match of matches) {
        const name = match.replace(/'/g, '');
        // Skip if this specific entry is commented (inline comment before it)
        const beforeMatch = line.indexOf(match);
        const beforeText = line.slice(0, beforeMatch);
        if (!beforeText.includes('//')) {
          builders.add(name);
        }
      }
    }
  }

  return builders;
}

/**
 * Extract builder names from BUILDER_IMPORTS in builder-imports.ts
 */
function extractImportBuilders(content: string): Set<string> {
  const builders = new Set<string>();

  // Find BUILDER_IMPORTS object
  const importsMatch = content.match(
    /export const BUILDER_IMPORTS[^=]*=\s*\{([\s\S]*?)\n\};/
  );
  if (!importsMatch) {
    console.error('Could not find BUILDER_IMPORTS in builder-imports.ts');
    process.exit(1);
  }

  const importsContent = importsMatch[1];

  // Extract all keys (builder names)
  // Match 'builder-name': or "builder-name": at the start of a line (with whitespace)
  const keyMatches = importsContent.matchAll(/^\s*['"]?([a-z][a-z0-9-]*)['"]?\s*:/gm);
  for (const match of keyMatches) {
    builders.add(match[1]);
  }

  return builders;
}

function main() {
  console.log('🔍 Validating context builder sync...\n');

  // Read files
  const loaderContent = readFileSync(LOADER_PATH, 'utf-8');
  const importsContent = readFileSync(IMPORTS_PATH, 'utf-8');

  // Extract builder names
  const manifestBuilders = extractManifestBuilders(loaderContent);
  const importBuilders = extractImportBuilders(importsContent);

  console.log(`📋 BUILDER_MANIFEST: ${manifestBuilders.size} builders`);
  console.log(`📦 BUILDER_IMPORTS: ${importBuilders.size} builders\n`);

  // Find missing (in manifest but not in imports) - CRITICAL
  const missing = [...manifestBuilders].filter((b) => !importBuilders.has(b)).sort();

  // Find orphaned (in imports but not in manifest) - WARNING
  const orphaned = [...importBuilders].filter((b) => !manifestBuilders.has(b)).sort();

  // Report results
  let exitCode = 0;

  if (missing.length > 0) {
    console.error('🔴 CRITICAL: Builders in manifest but NOT in imports (will fail at runtime):');
    missing.forEach((b) => console.error(`   - ${b}`));
    console.error('');
    exitCode = 1;
  }

  if (orphaned.length > 0) {
    console.warn('🟡 WARNING: Orphaned imports (dead code, not in manifest):');
    orphaned.forEach((b) => console.warn(`   - ${b}`));
    console.warn('');
    if (exitCode === 0) exitCode = 2;
  }

  // Summary
  if (missing.length === 0 && orphaned.length === 0) {
    console.log('✅ All context builders are in sync!');
  } else {
    console.log('─'.repeat(60));
    console.log(`Summary: ${missing.length} missing, ${orphaned.length} orphaned`);

    if (missing.length > 0) {
      console.log('\n📝 To fix missing builders, add to builder-imports.ts:');
      console.log('```typescript');
      for (const name of missing) {
        // Guess the path based on naming conventions
        const guessedPath = guessImportPath(name);
        console.log(`  '${name}': async () => import('${guessedPath}'),`);
      }
      console.log('```');
    }

    if (orphaned.length > 0) {
      console.log('\n📝 To fix orphaned imports, remove from builder-imports.ts:');
      orphaned.forEach((b) => console.log(`   - ${b}`));
    }
  }

  process.exit(exitCode);
}

/**
 * Guess import path based on builder name conventions
 */
function guessImportPath(name: string): string {
  // Common patterns
  if (name.endsWith('-context')) {
    return `../${name.replace('-context', '')}/${name}.js`;
  }
  if (name.endsWith('-awareness')) {
    return `../awareness/${name}.js`;
  }
  if (name.includes('emotion') || name.includes('celebration')) {
    return `../emotional/${name}.js`;
  }
  if (name.includes('memory') || name.includes('recall')) {
    return `../memory/${name}.js`;
  }
  if (name.includes('persona') || name.includes('personality')) {
    return `../personas/${name}.js`;
  }
  if (name.includes('coaching') || name.includes('cognitive')) {
    return `../coaching/${name}.js`;
  }
  if (name.includes('team') || name.includes('handoff')) {
    return `../team/${name}.js`;
  }
  if (name.includes('humaniz')) {
    return `../humanization/${name}.js`;
  }
  // Default: assume it's in session/
  return `../session/${name}.js`;
}

main();
