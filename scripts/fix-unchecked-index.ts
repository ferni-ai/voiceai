#!/usr/bin/env ts-node
/**
 * Automated codemod to fix noUncheckedIndexedAccess errors
 *
 * Usage: npx ts-node scripts/fix-unchecked-index.ts [--dry-run] [path]
 *
 * This script adds null-coalescing operators (??) to array/object index access
 * where the expected type is a primitive (string, number, boolean).
 */

import { Project, SyntaxKind, Node, ElementAccessExpression, Type } from 'ts-morph';
import * as path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_PATH = process.argv.find(arg => !arg.startsWith('-') && arg !== process.argv[0] && arg !== process.argv[1]) || 'src';

console.log(`🔧 Fix noUncheckedIndexedAccess errors`);
console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
console.log(`   Path: ${TARGET_PATH}`);
console.log('');

// Initialize project
const project = new Project({
  tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
});

// Statistics
let totalFixed = 0;
let totalSkipped = 0;
const fileStats: Record<string, number> = {};

/**
 * Get the default value for a type
 */
function getDefaultForType(type: Type): string | null {
  const typeText = type.getText();

  // String types
  if (type.isString() || typeText === 'string') {
    return "''";
  }

  // Number types
  if (type.isNumber() || typeText === 'number') {
    return '0';
  }

  // Boolean types
  if (type.isBoolean() || typeText === 'boolean') {
    return 'false';
  }

  // For complex types, we can't auto-fix safely
  return null;
}

/**
 * Check if an expression is already null-safe
 */
function isAlreadyNullSafe(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;

  // Check if already has nullish coalescing
  if (Node.isBinaryExpression(parent)) {
    const operator = parent.getOperatorToken().getText();
    if (operator === '??' || operator === '||') {
      return true;
    }
  }

  // Check if has optional chaining after
  if (Node.isPropertyAccessExpression(parent) || Node.isCallExpression(parent)) {
    const text = parent.getText();
    if (text.includes('?.')) {
      return true;
    }
  }

  // Check if in a conditional/guard
  if (Node.isIfStatement(parent) || Node.isConditionalExpression(parent)) {
    return true;
  }

  return false;
}

/**
 * Process a single file
 */
function processFile(filePath: string): number {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) return 0;

  let fixCount = 0;

  // Find all element access expressions (array[index] or obj[key])
  const elementAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression);

  for (const access of elementAccesses) {
    // Skip if already null-safe
    if (isAlreadyNullSafe(access)) {
      totalSkipped++;
      continue;
    }

    try {
      // Get the type of the whole expression
      const type = access.getType();

      // Check if type includes undefined
      if (!type.isUndefined() && !type.getText().includes('undefined')) {
        continue; // No fix needed
      }

      // Get the non-undefined type
      const nonNullType = type.getNonNullableType();
      const defaultValue = getDefaultForType(nonNullType);

      if (!defaultValue) {
        totalSkipped++;
        continue; // Can't auto-fix complex types
      }

      // Apply fix
      if (!DRY_RUN) {
        const currentText = access.getText();
        access.replaceWithText(`(${currentText} ?? ${defaultValue})`);
      }

      fixCount++;
      totalFixed++;

      if (DRY_RUN) {
        console.log(`  Would fix: ${access.getText()} → ... ?? ${defaultValue}`);
      }
    } catch (e) {
      // Skip on error
      totalSkipped++;
    }
  }

  return fixCount;
}

// Get all TypeScript files
const files = project.getSourceFiles(`${TARGET_PATH}/**/*.ts`);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  const filePath = file.getFilePath();
  const relativePath = path.relative(process.cwd(), filePath);

  const fixCount = processFile(filePath);

  if (fixCount > 0) {
    fileStats[relativePath] = fixCount;
    console.log(`✅ ${relativePath}: ${fixCount} fixes`);
  }
}

// Save changes if not dry run
if (!DRY_RUN) {
  console.log('\n💾 Saving changes...');
  project.saveSync();
}

// Summary
console.log('\n📊 Summary:');
console.log(`   Total fixed: ${totalFixed}`);
console.log(`   Total skipped (complex types): ${totalSkipped}`);
console.log(`   Files modified: ${Object.keys(fileStats).length}`);

if (DRY_RUN) {
  console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
}
