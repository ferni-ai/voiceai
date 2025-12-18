#!/usr/bin/env npx tsx
/**
 * Batch Migrate ALL Tool Files
 *
 * Migrates all files with llm.tool() calls to use centralized descriptions.
 *
 * Usage:
 *   npx tsx scripts/migrate-all-tools.ts
 *   npx tsx scripts/migrate-all-tools.ts --dry-run  # Preview changes
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const TOOL_DESCRIPTIONS_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ToolDescriptionsConfig {
  tools: Record<string, { description: string; file?: string }>;
}

// Simple recursive file finder
function findFiles(dir: string, pattern: RegExp, results: string[] = []): string[] {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        findFiles(fullPath, pattern, results);
      } else if (pattern.test(entry)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }
  return results;
}

function migrateFile(filePath: string, config: ToolDescriptionsConfig, dryRun: boolean): { updated: number; file: string } {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  let updatedCount = 0;

  // Skip if no llm.tool calls
  if (!content.includes('llm.tool(')) {
    return { updated: 0, file: relative(ROOT, filePath) };
  }

  // Skip if already migrated (has getToolDescription import)
  if (content.includes('getToolDescription(')) {
    return { updated: 0, file: relative(ROOT, filePath) };
  }

  // Find all tool IDs in this file by looking at the pattern:
  // toolName: llm.tool({ description: '...' })
  // OR: id: 'toolName' ... llm.tool({ description: '...' })
  
  const toolIdMatches: string[] = [];
  
  // Pattern 1: Direct object property - toolName: llm.tool({
  const directPattern = /(\w+):\s*llm\.tool\(\{/g;
  let match;
  while ((match = directPattern.exec(content)) !== null) {
    toolIdMatches.push(match[1]);
  }
  
  // Pattern 2: ToolDefinition with id field
  const defPattern = /id:\s*['"](\w+)['"]/g;
  while ((match = defPattern.exec(content)) !== null) {
    if (!toolIdMatches.includes(match[1])) {
      toolIdMatches.push(match[1]);
    }
  }

  // For each tool ID that exists in config, replace the inline description
  for (const toolId of toolIdMatches) {
    if (!config.tools[toolId]) continue;

    // Pattern to match: description: 'anything' or description: `anything` or description: "anything"
    // After toolId: llm.tool({ or after id: 'toolId' ... llm.tool({
    
    // Try to replace description in llm.tool({ description: '...' }) context
    // This regex finds llm.tool blocks and replaces the description
    const descriptionPatterns = [
      // Single quotes
      new RegExp(`(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)'([^']*)'`, 'g'),
      // Double quotes
      new RegExp(`(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)"([^"]*)"`, 'g'),
      // Backticks (template literals)
      new RegExp(`(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)\`([^\`]*)\``, 'g'),
      // Multi-line with newlines inside
      new RegExp(`(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)['\`]([\\s\\S]*?)['\`](?=,?\\s*\\n)`, 'g'),
    ];

    for (const pattern of descriptionPatterns) {
      const newContent = content.replace(pattern, `$1getToolDescription('${toolId}')`);
      if (newContent !== content) {
        content = newContent;
        updatedCount++;
        break; // Only replace once per tool
      }
    }
  }

  // If we made changes, add the import
  if (content !== originalContent && updatedCount > 0) {
    // Check if import already exists
    if (!content.includes("from './utils/tool-descriptions.js'") && 
        !content.includes("from '../utils/tool-descriptions.js'") &&
        !content.includes("from '../../utils/tool-descriptions.js'")) {
      
      // Determine relative path based on file location
      const fileDir = relative(ROOT, filePath);
      let importPath: string;
      
      if (fileDir.startsWith('src/tools/domains/')) {
        importPath = '../../../utils/tool-descriptions.js';
      } else if (fileDir.startsWith('src/tools/scheduling/') || 
                 fileDir.startsWith('src/tools/habit-coaching/') ||
                 fileDir.startsWith('src/tools/shared/') ||
                 fileDir.startsWith('src/tools/factories/')) {
        importPath = '../../utils/tool-descriptions.js';
      } else if (fileDir.startsWith('src/tools/')) {
        importPath = './utils/tool-descriptions.js';
      } else if (fileDir.startsWith('src/tasks/')) {
        importPath = '../tools/utils/tool-descriptions.js';
      } else if (fileDir.startsWith('src/agents/')) {
        importPath = '../tools/utils/tool-descriptions.js';
      } else if (fileDir.startsWith('src/personas/')) {
        importPath = '../tools/utils/tool-descriptions.js';
      } else {
        importPath = './tools/utils/tool-descriptions.js';
      }

      // Find the last import statement and add after it
      const importRegex = /^import .* from ['"][^'"]+['"];?\s*$/gm;
      let lastImportEnd = 0;
      let importMatch;
      while ((importMatch = importRegex.exec(content)) !== null) {
        lastImportEnd = importMatch.index + importMatch[0].length;
      }

      if (lastImportEnd > 0) {
        const importStatement = `\nimport { getToolDescription } from '${importPath}';`;
        content = content.slice(0, lastImportEnd) + importStatement + content.slice(lastImportEnd);
      }
    }

    if (!dryRun) {
      writeFileSync(filePath, content);
    }
  }

  return { updated: updatedCount, file: relative(ROOT, filePath) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`🔄 Migrating all tool files to centralized descriptions...`);
  if (dryRun) {
    console.log('   (DRY RUN - no files will be modified)\n');
  } else {
    console.log('');
  }

  // Load centralized config
  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  console.log(`📚 Loaded ${Object.keys(config.tools).length} tool definitions\n`);

  // Find all TypeScript files
  const srcDir = resolve(ROOT, 'src');
  const allFiles = findFiles(srcDir, /\.ts$/);
  const tsFiles = allFiles.filter((f) => !f.includes('.test.ts') && !f.includes('.d.ts'));

  let totalUpdated = 0;
  let filesModified = 0;
  const results: { file: string; updated: number }[] = [];

  for (const file of tsFiles) {
    const result = migrateFile(file, config, dryRun);
    if (result.updated > 0) {
      results.push(result);
      totalUpdated += result.updated;
      filesModified++;
    }
  }

  // Sort by number of updates
  results.sort((a, b) => b.updated - a.updated);

  console.log('📁 Files updated:\n');
  for (const { file, updated } of results) {
    console.log(`   ✅ ${file}: ${updated} tool(s)`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total tools migrated: ${totalUpdated}`);
  console.log(`   Files modified: ${filesModified}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No files were actually modified.');
    console.log('   Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration complete!');
    console.log('   Run `pnpm typecheck` to verify no errors.');
  }
}

main().catch(console.error);

