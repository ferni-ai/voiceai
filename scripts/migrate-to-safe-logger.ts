#!/usr/bin/env npx tsx
/**
 * Migration Script: Update all files to use safe-logger
 *
 * This script finds all TypeScript files with the unsafe logger pattern
 * and updates them to use the safe-logger utility.
 *
 * Run with: npx tsx scripts/migrate-to-safe-logger.ts
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, relative, dirname } from 'path';

const SRC_DIR = join(process.cwd(), 'src');
const SAFE_LOGGER_PATH = 'utils/safe-logger.js';

// Pattern to find: const getLogger = () => log();
const UNSAFE_PATTERN = /const getLogger = \(\) => log\(\);/g;
const UNDERSCORE_PATTERN = /const _getLogger = \(\) => log\(\);/g;

// Files we've already manually fixed (skip these)
const ALREADY_FIXED = new Set([
  'src/tools/handoff/handoff-factory.ts',
  'src/personas/registry/unified-registry.ts',
  'src/personas/bundles/index.ts',
  'src/personas/bundles/loader.ts',
  'src/personas/bundles/adapter.ts',
  'src/conversation/humanizing-config.ts',
  'src/utils/safe-logger.ts',
]);

interface UpdateResult {
  file: string;
  success: boolean;
  error?: string;
}

/**
 * Calculate the relative import path from a file to safe-logger
 */
function getRelativeImportPath(filePath: string): string {
  const fileDir = dirname(filePath);
  const relativePath = relative(fileDir, join(SRC_DIR, SAFE_LOGGER_PATH));
  // Ensure it starts with ./ or ../
  if (!relativePath.startsWith('.')) {
    return './' + relativePath;
  }
  return relativePath;
}

/**
 * Update a single file to use safe-logger
 */
async function updateFile(filePath: string): Promise<UpdateResult> {
  try {
    const content = await readFile(filePath, 'utf-8');
    
    // Check if file has the unsafe pattern
    if (!UNSAFE_PATTERN.test(content) && !UNDERSCORE_PATTERN.test(content)) {
      return { file: filePath, success: true }; // No changes needed
    }

    // Reset regex state
    UNSAFE_PATTERN.lastIndex = 0;
    UNDERSCORE_PATTERN.lastIndex = 0;

    const importPath = getRelativeImportPath(filePath);
    
    // Check if already has safe-logger import
    if (content.includes('safe-logger')) {
      // Just remove the unsafe pattern
      let updated = content.replace(UNSAFE_PATTERN, '// Using safe-logger import above');
      updated = updated.replace(UNDERSCORE_PATTERN, '// Using safe-logger import above');
      await writeFile(filePath, updated);
      return { file: filePath, success: true };
    }

    // Strategy: 
    // 1. Find where `import { log } from '@livekit/agents'` is
    // 2. Add our import after it
    // 3. Remove the unsafe getLogger definition

    let updated = content;

    // Check if there's a log import from @livekit/agents
    const livekitImportRegex = /import\s*\{([^}]*)\}\s*from\s*['"]@livekit\/agents['"];?/;
    const match = updated.match(livekitImportRegex);

    if (match) {
      // Add our import after the livekit import
      const safeLoggerImport = `import { getLogger } from '${importPath}';`;
      updated = updated.replace(
        livekitImportRegex,
        `$&\n${safeLoggerImport}`
      );
    } else {
      // No livekit import found, add both imports at the top after other imports
      const safeLoggerImport = `import { getLogger } from '${importPath}';\n`;
      // Find the last import statement
      const lastImportMatch = updated.match(/^import .+;?\s*$/gm);
      if (lastImportMatch && lastImportMatch.length > 0) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        updated = updated.replace(lastImport, lastImport + '\n' + safeLoggerImport);
      } else {
        // No imports found, add at the top
        updated = safeLoggerImport + '\n' + updated;
      }
    }

    // Remove the unsafe getLogger definition
    updated = updated.replace(UNSAFE_PATTERN, '');
    updated = updated.replace(UNDERSCORE_PATTERN, '');
    
    // Clean up any double blank lines created
    updated = updated.replace(/\n{3,}/g, '\n\n');

    await writeFile(filePath, updated);
    return { file: filePath, success: true };
  } catch (error) {
    return { 
      file: filePath, 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Recursively find all TypeScript files
 */
async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and test directories
      if (entry.name === 'node_modules' || entry.name === '__tests__') {
        continue;
      }
      files.push(...await findTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🔍 Finding TypeScript files with unsafe logger pattern...\n');
  
  const allFiles = await findTsFiles(SRC_DIR);
  const filesToUpdate: string[] = [];
  
  for (const file of allFiles) {
    const relativePath = relative(process.cwd(), file);
    
    // Skip already fixed files
    if (ALREADY_FIXED.has(relativePath)) {
      continue;
    }
    
    const content = await readFile(file, 'utf-8');
    if (UNSAFE_PATTERN.test(content) || UNDERSCORE_PATTERN.test(content)) {
      filesToUpdate.push(file);
    }
    
    // Reset regex state
    UNSAFE_PATTERN.lastIndex = 0;
    UNDERSCORE_PATTERN.lastIndex = 0;
  }
  
  console.log(`📁 Found ${filesToUpdate.length} files to update\n`);
  
  if (filesToUpdate.length === 0) {
    console.log('✅ No files need updating!');
    return;
  }
  
  // Preview mode - show what would be changed
  if (process.argv.includes('--dry-run')) {
    console.log('DRY RUN - Files that would be updated:');
    for (const file of filesToUpdate) {
      console.log(`  - ${relative(process.cwd(), file)}`);
    }
    console.log('\nRun without --dry-run to apply changes.');
    return;
  }
  
  // Actually update files
  console.log('🔄 Updating files...\n');
  
  const results: UpdateResult[] = [];
  for (const file of filesToUpdate) {
    const result = await updateFile(file);
    results.push(result);
    
    const relativePath = relative(process.cwd(), file);
    if (result.success) {
      console.log(`  ✅ ${relativePath}`);
    } else {
      console.log(`  ❌ ${relativePath}: ${result.error}`);
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Updated: ${successful}`);
  console.log(`  ❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed files:');
    for (const result of results.filter(r => !r.success)) {
      console.log(`  - ${result.file}: ${result.error}`);
    }
  }
}

// Run migration
migrate().catch(console.error);

