#!/usr/bin/env npx tsx
/**
 * Final Migration - Migrate ALL Remaining Tool Descriptions
 *
 * Handles:
 * - Files with mixed migrated/unmigrated tools
 * - All patterns of description definitions
 * - Adds missing imports
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative, dirname } from 'path';

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

function getImportPath(filePath: string): string {
  const fileRel = relative(ROOT, filePath);
  
  // Determine correct import path based on file location
  if (fileRel.startsWith('src/tools/domains/engagement/') ||
      fileRel.startsWith('src/tools/domains/simple-utilities/')) {
    return '../../utils/tool-descriptions.js';
  } else if (fileRel.startsWith('src/tools/domains/')) {
    return '../../utils/tool-descriptions.js';
  } else if (fileRel.startsWith('src/tools/scheduling/') ||
             fileRel.startsWith('src/tools/habit-coaching/') ||
             fileRel.startsWith('src/tools/shared/') ||
             fileRel.startsWith('src/tools/factories/') ||
             fileRel.startsWith('src/tools/handoff/')) {
    return '../utils/tool-descriptions.js';
  } else if (fileRel.startsWith('src/tools/')) {
    return './utils/tool-descriptions.js';
  } else if (fileRel.startsWith('src/tasks/')) {
    return '../tools/utils/tool-descriptions.js';
  } else if (fileRel.startsWith('src/agents/')) {
    return '../../tools/utils/tool-descriptions.js';
  } else if (fileRel.startsWith('src/personas/')) {
    return '../tools/utils/tool-descriptions.js';
  }
  return '../tools/utils/tool-descriptions.js';
}

function migrateFile(filePath: string, config: ToolDescriptionsConfig): number {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Skip if no llm.tool
  if (!content.includes('llm.tool(')) {
    return 0;
  }

  let updatedCount = 0;

  // Find all patterns of description: followed by quote/backtick
  // Pattern: description: 'text' or description: "text" or description: `text`
  const descriptionPattern = /description:\s*(['"`])([\s\S]*?)\1/g;
  
  // Find tool IDs in the file
  const toolIdMatches = [...content.matchAll(/(?:id:\s*['"](\w+)['"]|(\w+):\s*llm\.tool\(\{)/g)];
  const toolIds = toolIdMatches.map(m => m[1] || m[2]).filter(Boolean);

  // For each tool in config that's in this file, migrate if not already done
  for (const toolId of toolIds) {
    if (!config.tools[toolId]) continue;
    
    // Check if already migrated
    if (content.includes(`getToolDescription('${toolId}')`)) continue;

    // Find this tool's description and replace it
    // Strategy: Find the tool definition, then find its description

    // Pattern 1: toolId: llm.tool({ description: '...'
    const pattern1 = new RegExp(
      `(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)(['"\`])([\\s\\S]*?)\\2`,
      'g'
    );
    
    let newContent = content.replace(pattern1, (match, prefix, _quote, _desc) => {
      return `${prefix}getToolDescription('${toolId}')`;
    });

    if (newContent !== content) {
      content = newContent;
      updatedCount++;
      continue;
    }

    // Pattern 2: id: 'toolId' ... llm.tool({ description: '...'
    // This is trickier - need to find the id declaration first, then the next description
    const idIndex = content.indexOf(`id: '${toolId}'`) !== -1 
      ? content.indexOf(`id: '${toolId}'`)
      : content.indexOf(`id: "${toolId}"`);
    
    if (idIndex !== -1) {
      // Find the llm.tool after this id
      const afterId = content.slice(idIndex);
      const llmToolIndex = afterId.indexOf('llm.tool({');
      
      if (llmToolIndex !== -1) {
        const afterLlmTool = afterId.slice(llmToolIndex);
        const descMatch = afterLlmTool.match(/description:\s*(['"`])([\s\S]*?)\1/);
        
        if (descMatch && !descMatch[2].includes('getToolDescription')) {
          const descStartGlobal = idIndex + llmToolIndex + afterLlmTool.indexOf(descMatch[0]);
          const descEndGlobal = descStartGlobal + descMatch[0].length;
          
          content = content.slice(0, descStartGlobal) + 
                    `description: getToolDescription('${toolId}')` +
                    content.slice(descEndGlobal);
          updatedCount++;
        }
      }
    }
  }

  // Also handle any tool that has a simple pattern: toolName: llm.tool({ description: '...' })
  // but isn't in our toolIds list yet
  const directToolPattern = /(\w+):\s*llm\.tool\(\{[\s\S]*?description:\s*(['"`])([^]*?)\2/g;
  let match;
  while ((match = directToolPattern.exec(content)) !== null) {
    const toolId = match[1];
    if (!config.tools[toolId]) continue;
    if (content.includes(`getToolDescription('${toolId}')`)) continue;
    
    // Replace this specific occurrence
    const fullMatch = match[0];
    const prefix = fullMatch.slice(0, fullMatch.indexOf('description:'));
    const newMatch = `${prefix}description: getToolDescription('${toolId}')`;
    
    content = content.replace(fullMatch, newMatch);
    updatedCount++;
  }

  if (updatedCount > 0 && content !== originalContent) {
    // Add import if not present
    const importPath = getImportPath(filePath);
    if (!content.includes(`from '${importPath}'`) && 
        !content.includes('getToolDescription')) {
      // This shouldn't happen since we're adding getToolDescription calls
    }
    
    // Check if import exists
    if (!content.includes("from '") || !content.includes("tool-descriptions")) {
      // Find existing imports with getToolDescription
      if (!content.match(/import.*getToolDescription.*from/)) {
        // Add the import
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
    }

    writeFileSync(filePath, content);
  }

  return updatedCount;
}

async function main(): Promise<void> {
  console.log('🔄 Final migration - ALL remaining tool descriptions...\n');

  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  console.log(`📚 Loaded ${Object.keys(config.tools).length} tool definitions\n`);

  const srcDir = resolve(ROOT, 'src');
  const allFiles = findFiles(srcDir, /\.ts$/);
  const tsFiles = allFiles.filter((f) => 
    !f.includes('.test.ts') && 
    !f.includes('.d.ts') &&
    !f.includes('tool-descriptions.ts') // Don't modify the loader itself
  );

  let totalUpdated = 0;
  let filesModified = 0;
  const results: { file: string; count: number }[] = [];

  for (const file of tsFiles) {
    const count = migrateFile(file, config);
    if (count > 0) {
      results.push({ file: relative(ROOT, file), count });
      totalUpdated += count;
      filesModified++;
    }
  }

  results.sort((a, b) => b.count - a.count);

  if (results.length > 0) {
    console.log('📁 Files updated:\n');
    for (const { file, count } of results) {
      console.log(`   ✅ ${file}: ${count} tool(s)`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Tools migrated: ${totalUpdated}`);
  console.log(`   Files modified: ${filesModified}`);

  if (totalUpdated > 0) {
    console.log('\n🔍 Run `pnpm typecheck` to verify no errors.');
  } else {
    console.log('\n✅ All tools already migrated!');
  }
}

main().catch(console.error);

