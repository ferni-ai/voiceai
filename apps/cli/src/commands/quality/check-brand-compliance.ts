#!/usr/bin/env npx tsx
/**
 * Brand Compliance Checker
 *
 * Scans files for brand violations. Can be used:
 * - As a pre-commit hook
 * - As a CI check
 * - Manually via `npx tsx scripts/check-brand-compliance.ts`
 *
 * @module scripts/check-brand-compliance
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Files/directories to check for copy
const COPY_PATHS = [
  'apps/website/ferni-website/src/**/*.html',
  'apps/website/ferni-website/src/**/*.js',
  'apps/web/src/**/*.ts',
  'src/services/outreach/**/*.ts',
  'src/services/experiments/variant-library.ts',
];

// Banned phrases (critical)
const BANNED_PHRASES = [
  'As an AI',
  "I'm designed to",
  'My programming',
  'Natural language processing',
  '24/7 availability',
  'Unlimited conversations',
  'Virtual assistant',
  'Digital companion',
  'AI assistant',
  'Unlike other AI',
  'Unlike other chatbots',
  'Not your typical AI',
  "I'm an AI",
  'I was programmed',
  'My algorithms',
  'Based on my training',
  "I don't have feelings",
  "I'm just a",
  'As a language model',
  'My creators',
];

// Words to avoid (warning)
const WORDS_TO_AVOID = [
  'chatbot',
  'bot ',
  ' bot',
  'virtual assistant',
  'AI assistant',
  'utilize',
  'leverage',
  'solution',
  'functionality',
  'best-in-class',
  'industry-leading',
  'revolutionary',
  'cutting-edge',
  'state-of-the-art',
  'game-chang',
  'innovative',
  'disruptive',
];

// ============================================================================
// HELPERS
// ============================================================================

interface Violation {
  file: string;
  line: number;
  column: number;
  text: string;
  severity: 'critical' | 'warning';
  context: string;
}

function getChangedFiles(): string[] {
  try {
    // Get staged files
    const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    return staged;
  } catch {
    return [];
  }
}

function getAllRelevantFiles(): string[] {
  const files: string[] = [];

  for (const pattern of COPY_PATHS) {
    try {
      const result = execSync(`find . -path "./${pattern}" -type f 2>/dev/null || true`, {
        encoding: 'utf-8',
      });
      files.push(...result.trim().split('\n').filter(Boolean));
    } catch {
      // Ignore errors
    }
  }

  return [...new Set(files)];
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, lineIndex) => {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        return;
      }

      // Check banned phrases (critical)
      for (const phrase of BANNED_PHRASES) {
        const lowerLine = line.toLowerCase();
        const lowerPhrase = phrase.toLowerCase();
        const index = lowerLine.indexOf(lowerPhrase);

        if (index !== -1) {
          violations.push({
            file: filePath,
            line: lineIndex + 1,
            column: index + 1,
            text: phrase,
            severity: 'critical',
            context: line.trim().slice(0, 80),
          });
        }
      }

      // Check avoided words (warning)
      for (const word of WORDS_TO_AVOID) {
        const lowerLine = line.toLowerCase();
        const lowerWord = word.toLowerCase();
        const index = lowerLine.indexOf(lowerWord);

        if (index !== -1) {
          violations.push({
            file: filePath,
            line: lineIndex + 1,
            column: index + 1,
            text: word.trim(),
            severity: 'warning',
            context: line.trim().slice(0, 80),
          });
        }
      }
    });
  } catch (error) {
    // File read error, skip
  }

  return violations;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const checkAll = args.includes('--all');
  const checkStaged = args.includes('--staged') || args.length === 0;

  console.log('\n🎨 FERNI BRAND COMPLIANCE CHECK\n');

  let filesToCheck: string[];

  if (checkAll) {
    console.log('Checking all relevant files...\n');
    filesToCheck = getAllRelevantFiles();
  } else if (checkStaged) {
    console.log('Checking staged files...\n');
    filesToCheck = getChangedFiles().filter((f) => {
      return f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json');
    });
  } else {
    filesToCheck = args;
  }

  if (filesToCheck.length === 0) {
    console.log('✅ No files to check\n');
    process.exit(0);
  }

  console.log(`Checking ${filesToCheck.length} file(s)...\n`);

  const allViolations: Violation[] = [];

  for (const file of filesToCheck) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }

  // Report results
  const criticalCount = allViolations.filter((v) => v.severity === 'critical').length;
  const warningCount = allViolations.filter((v) => v.severity === 'warning').length;

  if (allViolations.length === 0) {
    console.log('✅ No brand violations found!\n');
    console.log('Your copy is on-brand. Great work! 🌿\n');
    process.exit(0);
  }

  // Group by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    if (!byFile.has(v.file)) {
      byFile.set(v.file, []);
    }
    byFile.get(v.file)!.push(v);
  }

  // Print violations
  for (const [file, violations] of byFile) {
    console.log(`\n📄 ${file}`);
    console.log('─'.repeat(60));

    for (const v of violations) {
      const icon = v.severity === 'critical' ? '❌' : '⚠️';
      console.log(`  ${icon} Line ${v.line}: "${v.text}"`);
      console.log(`     ${v.context}`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 SUMMARY\n');

  if (criticalCount > 0) {
    console.log(`  ❌ Critical violations: ${criticalCount}`);
  }
  if (warningCount > 0) {
    console.log(`  ⚠️  Warnings: ${warningCount}`);
  }

  console.log('\n💡 BRAND REMINDERS:');
  console.log('  • We are companions, not bots or AI assistants');
  console.log('  • We notice, remember, and show up');
  console.log('  • Compare to human support, not other AI');
  console.log('  • Warm, not saccharine. Confident, not arrogant.');
  console.log('');

  // Exit with error if critical violations
  if (criticalCount > 0) {
    console.log('❌ Commit blocked due to critical brand violations.\n');
    console.log('Please fix the critical issues and try again.\n');
    process.exit(1);
  }

  // Warnings don't block commit
  console.log('⚠️  Warnings found but commit allowed.\n');
  console.log('Consider addressing these for better brand compliance.\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Error running brand check:', error);
  process.exit(1);
});

