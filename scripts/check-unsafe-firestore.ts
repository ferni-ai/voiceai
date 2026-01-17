#!/usr/bin/env npx tsx
/**
 * Check for Unsafe Firestore Writes
 *
 * Scans the codebase for direct Firestore .set(), .update(), .add() calls
 * that don't use cleanForFirestore or safe wrappers.
 *
 * Run: npx tsx scripts/check-unsafe-firestore.ts
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

interface UnsafeWrite {
  file: string;
  line: number;
  code: string;
  type: 'set' | 'update' | 'add';
}

const UNSAFE_PATTERNS = [
  /\.doc\([^)]*\)\.set\(/g,
  /\.set\([^)]*\{/g, // .set({ ... })
  /\.update\([^)]*\{/g,
  /\.add\([^)]*\{/g,
];

const SAFE_PATTERNS = [
  'cleanForFirestore',
  'safeSet',
  'safeUpdate',
  'safeAdd',
  'removeUndefined',
  'deepRemoveUndefined',
  'createSafeBatch',
];

const EXCLUDE_PATTERNS = [
  'node_modules',
  '__tests__',
  '.test.',
  '.spec.',
  'safe-firestore.ts', // The safe wrapper itself
  'firestore-utils.ts', // Utilities
  '.d.ts',
];

async function scanDirectory(dir: string): Promise<UnsafeWrite[]> {
  const results: UnsafeWrite[] = [];

  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const entryStat = await stat(fullPath);

    if (entryStat.isDirectory()) {
      if (!EXCLUDE_PATTERNS.some((p) => fullPath.includes(p))) {
        results.push(...(await scanDirectory(fullPath)));
      }
    } else if (entry.endsWith('.ts') && !EXCLUDE_PATTERNS.some((p) => fullPath.includes(p))) {
      const fileResults = await scanFile(fullPath);
      results.push(...fileResults);
    }
  }

  return results;
}

async function scanFile(filePath: string): Promise<UnsafeWrite[]> {
  const results: UnsafeWrite[] = [];
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Skip if file imports safe utilities
  const hasFirestoreImport =
    content.includes('firestore') ||
    content.includes('Firestore') ||
    content.includes('.collection(') ||
    content.includes('.doc(');

  if (!hasFirestoreImport) return results;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check if this line or surrounding context uses safe patterns
    const contextStart = Math.max(0, i - 3);
    const contextEnd = Math.min(lines.length, i + 3);
    const context = lines.slice(contextStart, contextEnd).join('\n');

    const usesSafePattern = SAFE_PATTERNS.some((p) => context.includes(p));
    if (usesSafePattern) continue;

    // Check for .set() on Firestore doc
    if (line.includes('.set(') && (line.includes('.doc(') || context.includes('.doc('))) {
      // Skip Map.set() operations
      if (line.includes('Map') || line.includes('cache.') || line.includes('Cache')) continue;
      // Skip if it's in-memory (not Firestore)
      if (context.includes('new Map') || context.includes('= new')) continue;

      results.push({
        file: filePath,
        line: lineNum,
        code: line.trim(),
        type: 'set',
      });
    }

    // Check for .update() on Firestore doc
    if (line.includes('.update(') && context.includes('.doc(')) {
      results.push({
        file: filePath,
        line: lineNum,
        code: line.trim(),
        type: 'update',
      });
    }

    // Check for .add() on Firestore collection
    if (line.includes('.add(') && context.includes('.collection(')) {
      results.push({
        file: filePath,
        line: lineNum,
        code: line.trim(),
        type: 'add',
      });
    }
  }

  return results;
}

async function main() {
  console.log('\n🔍 Scanning for unsafe Firestore writes...\n');

  const srcDir = join(process.cwd(), 'src');
  const results = await scanDirectory(srcDir);

  if (results.length === 0) {
    console.log('✅ No unsafe Firestore writes detected!\n');
    return;
  }

  console.log(`⚠️  Found ${results.length} potentially unsafe Firestore writes:\n`);

  // Group by file
  const byFile = new Map<string, UnsafeWrite[]>();
  for (const result of results) {
    const existing = byFile.get(result.file) || [];
    existing.push(result);
    byFile.set(result.file, existing);
  }

  for (const [file, writes] of byFile) {
    const relPath = file.replace(process.cwd() + '/', '');
    console.log(`📄 ${relPath}`);
    for (const write of writes) {
      console.log(`   Line ${write.line}: ${write.code.substring(0, 80)}${write.code.length > 80 ? '...' : ''}`);
    }
    console.log();
  }

  console.log('\n📋 How to fix:');
  console.log('   1. Import: import { safeSet, safeUpdate, safeAdd } from "../../utils/index.js";');
  console.log('   2. Replace: await docRef.set(data) → await safeSet(docRef, data)');
  console.log('   3. Or use:  cleanForFirestore(data) before .set()');
  console.log('\nSee: src/utils/safe-firestore.ts for documentation\n');

  // Exit with error code if there are issues (for CI)
  if (process.argv.includes('--strict')) {
    process.exit(1);
  }
}

main().catch(console.error);

