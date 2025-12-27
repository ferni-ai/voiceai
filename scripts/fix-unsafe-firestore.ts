#!/usr/bin/env npx tsx
/**
 * Auto-Fix Unsafe Firestore Writes
 *
 * Automatically adds cleanForFirestore() to Firestore .set(), .update(), .add() calls.
 *
 * Run: npx tsx scripts/fix-unsafe-firestore.ts
 * Dry run: npx tsx scripts/fix-unsafe-firestore.ts --dry-run
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';

interface FixResult {
  file: string;
  fixes: number;
  importAdded: boolean;
}

const EXCLUDE_PATTERNS = [
  'node_modules',
  '__tests__',
  '.test.',
  '.spec.',
  'safe-firestore.ts',
  'firestore-utils.ts',
  '.d.ts',
  'fix-unsafe-firestore.ts',
  'check-unsafe-firestore.ts',
];

const SAFE_PATTERNS = [
  'cleanForFirestore',
  'safeSet',
  'safeUpdate',
  'safeAdd',
  'removeUndefined',
  'deepRemoveUndefined',
];

const DRY_RUN = process.argv.includes('--dry-run');

async function scanDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const entryStat = await stat(fullPath);

    if (entryStat.isDirectory()) {
      if (!EXCLUDE_PATTERNS.some((p) => fullPath.includes(p))) {
        files.push(...(await scanDirectory(fullPath)));
      }
    } else if (entry.endsWith('.ts') && !EXCLUDE_PATTERNS.some((p) => fullPath.includes(p))) {
      files.push(fullPath);
    }
  }

  return files;
}

function calculateRelativeImport(filePath: string): string {
  const srcDir = join(process.cwd(), 'src');
  const fileDir = dirname(filePath);
  
  // Calculate relative path from file to src/utils/firestore-utils.js
  const utilsPath = join(srcDir, 'utils', 'firestore-utils.js');
  
  // Count directories up from file to src
  let relativePath = '';
  let currentDir = fileDir;
  
  while (!currentDir.endsWith('/src') && currentDir !== srcDir) {
    relativePath += '../';
    currentDir = dirname(currentDir);
  }
  
  if (relativePath === '') {
    relativePath = './';
  }
  
  return `${relativePath}utils/firestore-utils.js`;
}

async function fixFile(filePath: string): Promise<FixResult | null> {
  let content = await readFile(filePath, 'utf-8');
  const originalContent = content;
  let fixes = 0;
  let importAdded = false;

  // Check if file has Firestore operations
  const hasFirestoreOps =
    content.includes('.set(') ||
    content.includes('.update(') ||
    content.includes('.add(');

  if (!hasFirestoreOps) return null;

  // Check if file already uses safe patterns
  const alreadySafe = SAFE_PATTERNS.some((p) => content.includes(p));

  // Check if it's actually Firestore (not Map.set, etc.)
  const hasFirestoreImport =
    content.includes('firebase-admin') ||
    content.includes('firestore') ||
    content.includes('getFirestore') ||
    content.includes('Firestore') ||
    content.includes('.collection(');

  if (!hasFirestoreImport) return null;

  // Add import if not already present
  if (!content.includes('cleanForFirestore')) {
    const importPath = calculateRelativeImport(filePath);
    
    // Find the right place to add the import
    const lines = content.split('\n');
    let insertIndex = 0;
    
    // Find last import line
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') || lines[i].startsWith('import{')) {
        insertIndex = i + 1;
      }
    }
    
    // Check if there's already a firestore-utils import to extend
    const firestoreUtilsLine = lines.findIndex(l => 
      l.includes('firestore-utils') && l.includes('import')
    );
    
    if (firestoreUtilsLine >= 0) {
      // Extend existing import
      const line = lines[firestoreUtilsLine];
      if (line.includes('{') && !line.includes('cleanForFirestore')) {
        lines[firestoreUtilsLine] = line.replace(
          /import\s*\{([^}]+)\}/,
          (match, imports) => `import { ${imports.trim()}, cleanForFirestore }`
        );
        importAdded = true;
      }
    } else {
      // Add new import
      const newImport = `import { cleanForFirestore } from '${importPath}';`;
      lines.splice(insertIndex, 0, newImport);
      importAdded = true;
    }
    
    content = lines.join('\n');
  }

  // Fix .set() calls (but not Map.set or cache.set)
  const setPattern = /(\.\s*set\s*\(\s*)(\{[\s\S]*?\}|\w+)(\s*(?:,\s*\{[^}]*\})?\s*\))/g;
  content = content.replace(setPattern, (match, prefix, data, suffix) => {
    // Skip if already wrapped
    if (data.includes('cleanForFirestore')) return match;
    // Skip Map.set patterns
    if (match.includes('Map') || match.includes('cache')) return match;
    // Skip if it's a simple variable that's already cleaned
    if (/^\w+$/.test(data.trim()) && content.includes(`cleanForFirestore(${data.trim()})`)) return match;
    
    fixes++;
    return `${prefix}cleanForFirestore(${data})${suffix}`;
  });

  // Fix .add() calls
  const addPattern = /(\.\s*add\s*\(\s*)(\{[\s\S]*?\}|\w+)(\s*\))/g;
  content = content.replace(addPattern, (match, prefix, data, suffix) => {
    // Skip if already wrapped
    if (data.includes('cleanForFirestore')) return match;
    // Skip Set.add patterns
    if (match.includes('Set') || match.includes('add(userId)')) return match;
    
    fixes++;
    return `${prefix}cleanForFirestore(${data})${suffix}`;
  });

  // Fix .update() calls (simpler - just wrap the object)
  const updatePattern = /(\.\s*update\s*\(\s*)(\{[\s\S]*?\})(\s*\))/g;
  content = content.replace(updatePattern, (match, prefix, data, suffix) => {
    // Skip if already wrapped
    if (data.includes('cleanForFirestore')) return match;
    
    fixes++;
    return `${prefix}cleanForFirestore(${data})${suffix}`;
  });

  if (content !== originalContent) {
    if (!DRY_RUN) {
      await writeFile(filePath, content);
    }
    return { file: filePath, fixes, importAdded };
  }

  return null;
}

async function main() {
  console.log(`\n${DRY_RUN ? '🔍 DRY RUN - ' : '🔧 '}Fixing unsafe Firestore writes...\n`);

  const srcDir = join(process.cwd(), 'src');
  const files = await scanDirectory(srcDir);
  const results: FixResult[] = [];

  for (const file of files) {
    try {
      const result = await fixFile(file);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error);
    }
  }

  if (results.length === 0) {
    console.log('✅ No unsafe Firestore writes found!\n');
    return;
  }

  console.log(`${DRY_RUN ? 'Would fix' : 'Fixed'} ${results.length} files:\n`);

  let totalFixes = 0;
  let totalImports = 0;

  for (const result of results) {
    const relPath = result.file.replace(process.cwd() + '/', '');
    console.log(`📄 ${relPath}`);
    console.log(`   ${result.fixes} writes wrapped, ${result.importAdded ? 'import added' : 'import existed'}`);
    totalFixes += result.fixes;
    if (result.importAdded) totalImports++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files ${DRY_RUN ? 'to fix' : 'fixed'}: ${results.length}`);
  console.log(`   Writes wrapped: ${totalFixes}`);
  console.log(`   Imports added: ${totalImports}`);

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  } else {
    console.log('\n✅ All fixes applied!');
    console.log('💡 Run `pnpm lint:fix` to fix any formatting issues');
  }
}

main().catch(console.error);

