#!/usr/bin/env npx tsx
/**
 * Migrate Domain Tool Files
 *
 * Handles the ToolDefinition pattern used in src/tools/domains/
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const TOOL_DESCRIPTIONS_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ToolDescriptionsConfig {
  tools: Record<string, { description: string }>;
}

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
    // Ignore
  }
  return results;
}

function migrateDomainFile(filePath: string, config: ToolDescriptionsConfig): number {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Skip if already migrated
  if (content.includes('getToolDescription(')) {
    return 0;
  }

  // Skip if no llm.tool
  if (!content.includes('llm.tool(')) {
    return 0;
  }

  let updatedCount = 0;

  // Find all tool IDs in this file
  const idMatches = content.matchAll(/id:\s*['"](\w+)['"]/g);
  const toolIds = [...idMatches].map(m => m[1]);

  for (const toolId of toolIds) {
    if (!config.tools[toolId]) continue;

    // Pattern: description: 'text' or description: `text` after llm.tool({
    // We need to find the llm.tool block that belongs to this toolId

    // Look for the ToolDefinition block with this id, then find its llm.tool description
    const defBlockRegex = new RegExp(
      `id:\\s*['"]${toolId}['"][\\s\\S]*?llm\\.tool\\(\\{[\\s\\S]*?description:\\s*['\`]([\\s\\S]*?)['\`]`,
      'g'
    );

    const match = defBlockRegex.exec(content);
    if (match) {
      const fullMatch = match[0];
      const oldDescription = match[1];

      // Replace the description with getToolDescription call
      const newBlock = fullMatch.replace(
        /description:\s*['\`][^'\`]*['\`]/,
        `description: getToolDescription('${toolId}')`
      );

      content = content.replace(fullMatch, newBlock);
      updatedCount++;
    }
  }

  if (updatedCount > 0 && content !== originalContent) {
    // Add import if needed
    if (!content.includes("getToolDescription")) {
      // Determine correct import path based on file location
      const fileRel = relative(ROOT, filePath);
      let importPath: string;

      if (fileRel.includes('domains/engagement/') ||
          fileRel.includes('domains/simple-utilities/')) {
        importPath = '../../../utils/tool-descriptions.js';
      } else if (fileRel.includes('domains/')) {
        importPath = '../../utils/tool-descriptions.js';
      } else {
        importPath = './utils/tool-descriptions.js';
      }

      // Find last import and add after it
      const importRegex = /^import .* from ['"][^'"]+['"];?\s*$/gm;
      let lastImportEnd = 0;
      let importMatch;
      while ((importMatch = importRegex.exec(content)) !== null) {
        lastImportEnd = importMatch.index + importMatch[0].length;
      }

      if (lastImportEnd > 0) {
        content = content.slice(0, lastImportEnd) +
          `\nimport { getToolDescription } from '${importPath}';` +
          content.slice(lastImportEnd);
      }
    }

    writeFileSync(filePath, content);
  }

  return updatedCount;
}

async function main(): Promise<void> {
  console.log('🔄 Migrating domain tool files...\n');

  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  console.log(`📚 Loaded ${Object.keys(config.tools).length} tool definitions\n`);

  const domainsDir = resolve(ROOT, 'src/tools/domains');
  const files = findFiles(domainsDir, /\.ts$/);

  let totalUpdated = 0;
  let filesModified = 0;

  for (const file of files) {
    const count = migrateDomainFile(file, config);
    if (count > 0) {
      console.log(`   ✅ ${relative(ROOT, file)}: ${count} tool(s)`);
      totalUpdated += count;
      filesModified++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Tools migrated: ${totalUpdated}`);
  console.log(`   Files modified: ${filesModified}`);
}

main().catch(console.error);

