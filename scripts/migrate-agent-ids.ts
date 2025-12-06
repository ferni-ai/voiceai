#!/usr/bin/env npx ts-node
/**
 * Migration Script: Legacy String IDs → AgentRole Enum
 *
 * This script automatically replaces legacy string-based agent IDs
 * with the new AgentRole enum values.
 *
 * Usage:
 *   npx ts-node scripts/migrate-agent-ids.ts --dry-run     # Preview changes
 *   npx ts-node scripts/migrate-agent-ids.ts               # Apply changes
 *   npx ts-node scripts/migrate-agent-ids.ts --file src/services/team-engagement.ts
 *
 * Options:
 *   --dry-run    Show what would change without modifying files
 *   --file       Migrate a specific file only
 *   --verbose    Show detailed replacement info
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SRC_DIR = path.join(__dirname, '..', 'src');

/**
 * Mapping from legacy string IDs to AgentRole enum values
 */
const LEGACY_TO_ENUM: Record<string, string> = {
  // Ferni / Coach
  "'ferni'": 'AgentRole.COACH',
  '"ferni"': 'AgentRole.COACH',
  "'jack-b'": 'AgentRole.COACH',
  '"jack-b"': 'AgentRole.COACH',

  // Jordan / Planner
  "'jordan'": 'AgentRole.PLANNER',
  '"jordan"': 'AgentRole.PLANNER',
  "'jordan-taylor'": 'AgentRole.PLANNER',
  '"jordan-taylor"': 'AgentRole.PLANNER',
  "'event-planner'": 'AgentRole.PLANNER',
  '"event-planner"': 'AgentRole.PLANNER',

  // Maya / Habits
  "'maya'": 'AgentRole.HABITS',
  '"maya"': 'AgentRole.HABITS',
  "'maya-santos'": 'AgentRole.HABITS',
  '"maya-santos"': 'AgentRole.HABITS',
  "'spend-save'": 'AgentRole.HABITS',
  '"spend-save"': 'AgentRole.HABITS',

  // Alex / Communicator
  "'alex'": 'AgentRole.COMMUNICATOR',
  '"alex"': 'AgentRole.COMMUNICATOR',
  "'alex-chen'": 'AgentRole.COMMUNICATOR',
  '"alex-chen"': 'AgentRole.COMMUNICATOR',
  "'comm-specialist'": 'AgentRole.COMMUNICATOR',
  '"comm-specialist"': 'AgentRole.COMMUNICATOR',

  // Peter / Researcher
  "'peter'": 'AgentRole.RESEARCHER',
  '"peter"': 'AgentRole.RESEARCHER',
  "'peter-john'": 'AgentRole.RESEARCHER',
  '"peter-john"': 'AgentRole.RESEARCHER',

  // Nayan / Sage
  "'nayan'": 'AgentRole.SAGE',
  '"nayan"': 'AgentRole.SAGE',
  "'nayan-patel'": 'AgentRole.SAGE',
  '"nayan-patel"': 'AgentRole.SAGE',
};

/**
 * Patterns that should NOT be replaced (false positives)
 */
const SKIP_PATTERNS = [
  // Display names in strings
  /displayName.*['"].*['"]/,
  /shortName.*['"].*['"]/,
  /name:.*['"].*['"]/,
  // Bundle IDs
  /bundleId.*['"].*['"]/,
  // Log messages
  /log\.(debug|info|warn|error)/,
  // Comments
  /^\s*\/\//,
  /^\s*\*/,
  // Import statements for persona bundles
  /from.*bundles/,
  // Aliases array in id-mapping.ts
  /aliases:\s*\[/,
  // Voice registry mappings (keep strings for voice IDs)
  /voiceId/i,
  // Already using enum
  /AgentRole\./,
  // Object keys (strings followed by colon) - these need special handling
  /^\s*['"][a-z-]+['"]\s*:/,
  // Unquoted object keys (identifier followed by colon at start of trimmed line)
  /^\s*(ferni|jordan|maya|alex|peter|nayan)\s*:/,
  // Object literal keys without quotes
  /{\s*(ferni|jordan|maya|alex|peter|nayan)\s*:/,
  /,\s*(ferni|jordan|maya|alex|peter|nayan)\s*:/,
];

/**
 * Files to skip entirely
 */
const SKIP_FILES = [
  'id-mapping.ts', // Source of truth - has intentional string literals
  'migrate-agent-ids.ts', // This script
  '.test.ts', // Skip test files by default (can be enabled)
  '.spec.ts',
];

/**
 * Context patterns where we SHOULD replace
 * (overrides SKIP_PATTERNS if matched)
 */
const REPLACE_CONTEXTS = [
  /personaId\s*[=:]\s*['"]/, // personaId = 'jordan'
  /agentId\s*[=:]\s*['"]/, // agentId: 'maya'
  /fromAgent\s*[=:]\s*['"]/, // fromAgent = 'ferni'
  /toAgent\s*[=:]\s*['"]/, // toAgent: 'alex'
  /currentAgent\s*[=:]\s*['"]/, // currentAgent = 'peter'
  /targetAgent\s*[=:]\s*['"]/, // targetAgent: 'nayan'
  /AgentId\]\s*=\s*['"]/, // as AgentId] = 'jordan'
  /:\s*AgentId\s*=\s*['"]/, // : AgentId = 'jordan'
  /getPersonaId\(['"]/, // getPersonaId('jordan')
  /getAgentRole\(['"]/, // getAgentRole('maya')
  /isSamePersona\(['"]/, // isSamePersona('jordan', ...)
  /handoffTo\w+.*['"]/, // handoffToJordan or similar patterns
];

// ============================================================================
// HELPERS
// ============================================================================

interface Replacement {
  file: string;
  line: number;
  original: string;
  replacement: string;
  context: string;
}

function shouldSkipFile(filePath: string): boolean {
  return SKIP_FILES.some((skip) => filePath.includes(skip));
}

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(line));
}

function shouldReplaceLine(line: string): boolean {
  return REPLACE_CONTEXTS.some((pattern) => pattern.test(line));
}

/**
 * Check if a string occurrence at a position is an object key
 * Object keys look like: `'jordan': {` or `jordan: {` or `'jordan-taylor': [`
 */
function isObjectKey(line: string, matchIndex: number, matchLength: number): boolean {
  // Look at what comes after the match
  const afterMatch = line.substring(matchIndex + matchLength).trim();
  
  // If followed by a colon (with optional whitespace), it's an object key
  if (afterMatch.startsWith(':')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a string occurrence is in a safe replacement context
 */
function isSafeToReplace(line: string, matchIndex: number, matchLength: number): boolean {
  // Don't replace object keys
  if (isObjectKey(line, matchIndex, matchLength)) {
    return false;
  }
  
  // Look at what comes before the match
  const beforeMatch = line.substring(0, matchIndex).trim();
  
  // Safe contexts:
  // - After assignment: `= 'jordan'`
  // - After type assertion: `as AgentId] = 'jordan'`
  // - Function arguments: `('jordan'` or `, 'jordan'`
  // - Array elements: `['jordan'` or `, 'jordan'`
  // - After comparison: `=== 'jordan'` or `!== 'jordan'`
  // - Property value: `personaId: 'jordan'`
  
  const safeEndings = [
    '=',           // assignment
    '(',           // function arg start
    ',',           // function arg or array element
    '[',           // array element or computed property
    ':',           // property value (but NOT if the string is the key)
    '===',         // comparison
    '!==',
    '==',
    '!=',
    '||',          // logical operators
    '&&',
    '?',           // ternary
    'return',      // return statement
  ];
  
  for (const ending of safeEndings) {
    if (beforeMatch.endsWith(ending)) {
      return true;
    }
  }
  
  // Check for property value pattern: `someProp: 'jordan'`
  // The key here is that beforeMatch ends with `: ` (colon space)
  if (/:\s*$/.test(beforeMatch)) {
    // Make sure this isn't the start of an object (where our match would be a key)
    // by checking if there's content before the colon
    const colonIndex = beforeMatch.lastIndexOf(':');
    const beforeColon = beforeMatch.substring(0, colonIndex).trim();
    if (beforeColon.length > 0 && !beforeColon.endsWith('{') && !beforeColon.endsWith(',')) {
      return true;
    }
  }
  
  return false;
}

function findReplacements(content: string, filePath: string): Replacement[] {
  const replacements: Replacement[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Skip if line matches skip patterns (unless it matches replace contexts)
    if (shouldSkipLine(line) && !shouldReplaceLine(line)) {
      return;
    }

    // Check each legacy ID
    for (const [legacy, enumValue] of Object.entries(LEGACY_TO_ENUM)) {
      // Find all occurrences of this legacy ID in the line
      let searchPos = 0;
      while (true) {
        const matchIndex = line.indexOf(legacy, searchPos);
        if (matchIndex === -1) break;
        
        // Move search position for next iteration
        searchPos = matchIndex + legacy.length;
        
        // Additional check for short IDs: make sure it's not part of a longer one
        const shortIds = ["'jordan'", '"jordan"', "'maya'", '"maya"', "'alex'", '"alex"', "'peter'", '"peter"', "'nayan'", '"nayan"', "'ferni'", '"ferni"'];
        
        if (shortIds.includes(legacy)) {
          // Check if this is actually the full ID or part of a longer one like 'jordan-taylor'
          const charAfter = line[matchIndex + legacy.length - 1 + 1]; // char after closing quote
          if (charAfter === '-') {
            continue; // Skip, this is part of a longer ID
          }
        }
        
        // Check if it's safe to replace at this position
        if (!isSafeToReplace(line, matchIndex, legacy.length)) {
          continue;
        }

        replacements.push({
          file: filePath,
          line: index + 1,
          original: legacy,
          replacement: enumValue,
          context: line.trim().substring(0, 80),
        });
        
        // Only record one replacement per legacy ID per line
        // (we'll replace all occurrences at once anyway)
        break;
      }
    }
  });

  return replacements;
}

function applyReplacements(content: string, replacements: Replacement[]): string {
  const lines = content.split('\n');
  
  // Group replacements by line
  const replacementsByLine = new Map<number, Replacement[]>();
  for (const r of replacements) {
    const lineReplacements = replacementsByLine.get(r.line) || [];
    lineReplacements.push(r);
    replacementsByLine.set(r.line, lineReplacements);
  }
  
  // Apply replacements line by line, being careful about context
  for (const [lineNum, lineReplacements] of replacementsByLine) {
    let line = lines[lineNum - 1];
    
    // Sort by length (longest first) to avoid partial replacements
    const sortedReplacements = [...new Set(lineReplacements.map((r) => r.original))]
      .sort((a, b) => b.length - a.length);
    
    for (const original of sortedReplacements) {
      const replacement = LEGACY_TO_ENUM[original];
      if (replacement) {
        // Only replace in safe contexts - look for patterns like:
        // = 'jordan' -> = AgentRole.PLANNER
        // ('jordan' -> (AgentRole.PLANNER
        // , 'jordan' -> , AgentRole.PLANNER
        // : 'jordan' (but only for values, not keys)
        
        // Replace after these safe prefixes
        const safePrefixes = ['= ', '(', ', ', ': ', '=== ', '!== ', '|| ', '&& ', '? ', '[ '];
        
        for (const prefix of safePrefixes) {
          const pattern = prefix + original;
          if (line.includes(pattern)) {
            line = line.split(pattern).join(prefix + replacement);
          }
        }
        
        // Also handle cases without space after prefix
        const tightPrefixes = ['=', '(', ',', '['];
        for (const prefix of tightPrefixes) {
          const pattern = prefix + original;
          // Make sure we don't double-replace (check if already replaced)
          if (line.includes(pattern) && !line.includes(prefix + replacement)) {
            line = line.split(pattern).join(prefix + replacement);
          }
        }
      }
    }
    
    lines[lineNum - 1] = line;
  }

  return lines.join('\n');
}

function addImportIfNeeded(content: string, filePath: string): string {
  // Check if AgentRole is already imported (look for import statement with AgentRole)
  const importRegex = /import\s+\{[^}]*AgentRole[^}]*\}\s+from/;
  if (importRegex.test(content)) {
    return content;
  }

  // Calculate relative path from file to src/personas/id-mapping.js
  const fileDir = path.dirname(filePath);
  const idMappingPath = path.join(SRC_DIR, 'personas', 'id-mapping.js');
  
  let importPath: string;
  
  // Calculate the relative path
  const relPath = path.relative(fileDir, path.dirname(idMappingPath));
  
  if (relPath === '') {
    // Same directory
    importPath = './id-mapping.js';
  } else if (relPath.startsWith('..')) {
    // Going up directories
    importPath = relPath.replace(/\\/g, '/') + '/id-mapping.js';
  } else {
    // Going down directories (shouldn't happen often)
    importPath = './' + relPath.replace(/\\/g, '/') + '/id-mapping.js';
  }

  // Find the best place to add the import (after last import statement)
  const lines = content.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ') || lines[i].trim().startsWith('import{')) {
      lastImportIndex = i;
    }
  }

  const importStatement = `import { AgentRole } from '${importPath}';`;

  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importStatement);
  } else {
    lines.unshift(importStatement);
  }

  return lines.join('\n');
}

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const includeTests = args.includes('--include-tests');
  
  const fileIndex = args.indexOf('--file');
  const specificFile = fileIndex >= 0 ? args[fileIndex + 1] : null;

  console.log('🔄 Agent ID Migration Script');
  console.log('============================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify files)'}`);
  console.log(`Include tests: ${includeTests}`);
  console.log('');

  // Get files to process
  let files: string[];
  if (specificFile) {
    const fullPath = path.resolve(specificFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${specificFile}`);
      process.exit(1);
    }
    files = [fullPath];
  } else {
    files = getAllTsFiles(SRC_DIR);
  }

  // Filter out skip files
  if (!includeTests) {
    files = files.filter((f) => !f.includes('.test.') && !f.includes('.spec.'));
  }
  files = files.filter((f) => !shouldSkipFile(f));

  console.log(`📁 Processing ${files.length} files...\n`);

  let totalReplacements = 0;
  let filesModified = 0;
  const summary: { file: string; count: number }[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const replacements = findReplacements(content, file);

    if (replacements.length === 0) continue;

    const relativePath = path.relative(SRC_DIR, file);
    summary.push({ file: relativePath, count: replacements.length });
    totalReplacements += replacements.length;
    filesModified++;

    if (verbose) {
      console.log(`\n📄 ${relativePath} (${replacements.length} replacements)`);
      for (const r of replacements) {
        console.log(`   Line ${r.line}: ${r.original} → ${r.replacement}`);
        console.log(`   Context: ${r.context}`);
      }
    }

    if (!dryRun) {
      let newContent = applyReplacements(content, replacements);
      newContent = addImportIfNeeded(newContent, file);
      fs.writeFileSync(file, newContent, 'utf-8');
    }
  }

  // Print summary
  console.log('\n============================');
  console.log('📊 Summary');
  console.log('============================');
  console.log(`Files with changes: ${filesModified}`);
  console.log(`Total replacements: ${totalReplacements}`);
  console.log('');

  if (summary.length > 0) {
    console.log('Files to modify:');
    summary
      .sort((a, b) => b.count - a.count)
      .forEach(({ file, count }) => {
        console.log(`  ${count.toString().padStart(3)} │ ${file}`);
      });
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No files were modified');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Migration complete!');
    console.log('Run `npm run build` to verify the changes compile correctly.');
  }
}

main();

