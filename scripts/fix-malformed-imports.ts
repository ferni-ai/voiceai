#!/usr/bin/env npx tsx
/**
 * Fix malformed imports from the automated Firestore safety script
 *
 * Pattern to fix: import { followed by import { cleanForFirestore... on next line
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

const PATTERN_TO_FIX = /^(import\s+(?:type\s+)?)\{(\s*)\nimport \{ cleanForFirestore \} from ['"]([^'"]+)['"];/gm;

async function fixFile(filePath: string): Promise<boolean> {
  try {
    let content = await readFile(filePath, 'utf-8');
    const original = content;

    // Fix the pattern: import { (or import type {) followed by cleanForFirestore import on next line
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';

      // Pattern 1: Current line is "import {" or "import type {" 
      // and next line is "import { cleanForFirestore ..."
      if (
        (line.trim() === 'import {' || line.trim() === 'import type {') &&
        nextLine.trim().startsWith('import { cleanForFirestore }')
      ) {
        // Insert cleanForFirestore import before the broken one
        fixedLines.push(nextLine.trim());
        fixedLines.push(line);
        i++; // Skip the next line since we already processed it
        modified = true;
        continue;
      }

      // Pattern 2: Line ends with "import {" or "import type {" without closing brace
      // and next line is cleanForFirestore import
      if (
        (line.trim().endsWith('import {') || line.trim().endsWith('import type {')) &&
        nextLine.trim().startsWith('import { cleanForFirestore }')
      ) {
        // The line has code before "import {"
        const prefix = line.substring(0, line.lastIndexOf('import'));
        const importStart = line.substring(line.lastIndexOf('import'));
        
        // Extract the cleanForFirestore import
        fixedLines.push(prefix.trim() ? prefix : '');
        fixedLines.push(nextLine.trim());
        fixedLines.push(importStart);
        i++;
        modified = true;
        continue;
      }

      fixedLines.push(line);
    }

    content = fixedLines.join('\n');

    // Clean up any double blank lines that might have been introduced
    content = content.replace(/\n\n\n+/g, '\n\n');

    if (content !== original || modified) {
      await writeFile(filePath, content);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error);
    return false;
  }
}

async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);

    if (s.isDirectory()) {
      files.push(...await findTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  console.log('🔧 Fixing malformed imports...\n');

  // Find all TypeScript files
  const files = await findTsFiles('/Users/sethford/Documents/voiceai/src');

  let fixed = 0;
  let checked = 0;

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    
    // Quick check if file has the broken pattern
    if (content.includes('import {\nimport { cleanForFirestore }') || 
        content.includes('import type {\nimport { cleanForFirestore }') ||
        content.includes('import { cleanForFirestore } from') && content.match(/import\s+(type\s+)?\{\s*\n/)) {
      if (await fixFile(file)) {
        console.log(`✅ ${file.replace('/Users/sethford/Documents/voiceai/', '')}`);
        fixed++;
      }
      checked++;
    }
  }

  console.log(`\n📊 Checked ${checked} files, fixed ${fixed}`);
  console.log('💡 Run `pnpm typecheck` to verify');
}

main().catch(console.error);
