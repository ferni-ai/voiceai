#!/usr/bin/env npx tsx
/**
 * Fix broken imports from the automated Firestore safety script
 *
 * The pattern "import {" followed by "import { cleanForFirestore..." on next line is broken
 */

import { readFile, writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getBrokenFiles(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `cd /Users/sethford/Documents/voiceai && pnpm typecheck 2>&1 | grep "error TS" | cut -d'(' -f1 | sort -u`
    );
    return stdout
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

async function fixFile(filePath: string): Promise<boolean> {
  const fullPath = `/Users/sethford/Documents/voiceai/${filePath}`;

  try {
    let content = await readFile(fullPath, 'utf-8');
    const original = content;

    // Pattern 1: import { followed by import { cleanForFirestore on next line
    // Fix: Move cleanForFirestore import to its own line before the broken import
    content = content.replace(
      /import \{(\s*\n)?import \{ cleanForFirestore \} from ['"]([^'"]+)['"];/g,
      (match, _, path) => {
        return `import { cleanForFirestore } from '${path}';\nimport {`;
      }
    );

    // Pattern 2: Line starting with "import { cleanForFirestore" inside an import block
    // This is a malformed line that needs to be extracted
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this line is a broken import pattern
      if (line.trim().startsWith('import { cleanForFirestore }') && i > 0) {
        // Check if previous line was start of a different import
        const prevLine = fixedLines[fixedLines.length - 1];
        if (prevLine && (prevLine.trim().startsWith('import {') || prevLine.trim().startsWith('import type {'))) {
          // Previous line is an incomplete import statement
          // Insert the cleanForFirestore import BEFORE the incomplete import
          const cleanForFirestoreImport = line.trim();
          const incompleteImport = fixedLines.pop()!;
          fixedLines.push(cleanForFirestoreImport);
          fixedLines.push(incompleteImport);
          i++;
          continue;
        }
      }

      fixedLines.push(line);
      i++;
    }

    content = fixedLines.join('\n');

    if (content !== original) {
      await writeFile(fullPath, content);
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error);
  }
  return false;
}

async function main() {
  console.log('🔧 Fixing broken imports from automated Firestore safety script...\n');

  const files = await getBrokenFiles();
  console.log(`Found ${files.length} files with potential issues\n`);

  let fixed = 0;
  for (const file of files) {
    if (await fixFile(file)) {
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} files`);
  console.log('💡 Run `pnpm typecheck` to verify');
}

main().catch(console.error);
