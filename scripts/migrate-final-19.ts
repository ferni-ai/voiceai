#!/usr/bin/env npx tsx
/**
 * Final 19 Tools Migration
 *
 * Handles edge cases:
 * - Task files with nested tools (toolName: llm.tool({ description: '...'
 * - Dynamic descriptions in factories
 * - Multi-line backtick descriptions
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const TOOL_DESCRIPTIONS_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ToolDescriptionsConfig {
  tools: Record<string, { description: string; file?: string }>;
}

// Files and their specific tool IDs that need migration
const REMAINING_TOOLS: Record<string, string[]> = {
  'src/tasks/support-tasks.ts': ['checkIn'],
  'src/tasks/life-events.ts': ['offerGuidance'],
  'src/tasks/bogle-onboarding.ts': ['recordSituation', 'deferConversation'],
  'src/tasks/finance-tasks.ts': ['recordFinancialGoal'],
  'src/tasks/onboarding.ts': ['recordSituation', 'deferConversation'],
  'src/tasks/habits-tasks.ts': ['identifyBlocker', 'suggestLettingGo'],
  'src/tasks/relationship-tasks.ts': ['checkUnderstanding'],
  'src/tasks/advice-tasks.ts': ['clarifyDecision', 'recordGoal'],
  'src/tools/handoff/handoff-factory.ts': ['introduceMember'],
  'src/tools/factories/life-planning-tools.ts': [
    'createMilestone',
    'createGoal',
    'getCulturalTraditions',
    'manageGiftRegistry',
    'planRetirement',
    'coordinateWithTeam',
  ],
};

function getImportPath(filePath: string): string {
  if (filePath.includes('/tasks/')) return '../tools/utils/tool-descriptions.js';
  if (filePath.includes('/tools/handoff/')) return '../utils/tool-descriptions.js';
  if (filePath.includes('/tools/factories/')) return '../utils/tool-descriptions.js';
  return './utils/tool-descriptions.js';
}

function migrateFile(filePath: string, toolIds: string[], config: ToolDescriptionsConfig): number {
  const fullPath = resolve(ROOT, filePath);
  let content = readFileSync(fullPath, 'utf-8');
  const originalContent = content;
  let updatedCount = 0;

  for (const toolId of toolIds) {
    // Check if THIS SPECIFIC tool is already migrated
    // Need to check that the pattern toolId: llm.tool({ ... description: getToolDescription('toolId')
    const alreadyMigratedPattern = new RegExp(
      `${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*getToolDescription\\(['"]${toolId}['"]\\)`
    );
    if (alreadyMigratedPattern.test(content)) continue;

    // Add tool to config if not present
    if (!config.tools[toolId]) {
      // Extract existing description first
      const descMatch = content.match(
        new RegExp(`${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*(['"\`])([\\s\\S]*?)\\1`)
      );
      if (descMatch) {
        const desc = descMatch[2]
          .replace(/\n\s*/g, ' ')
          .replace(/\$\{[^}]+\}/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        config.tools[toolId] = { description: desc, file: filePath };
        console.log(`   + Added ${toolId} to config`);
      }
    }

    // Find and replace the inline description
    // Pattern: toolId: llm.tool({ ... description: '...' or `...`
    const patterns = [
      // Single/double quote
      new RegExp(
        `(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)(['"])([^'"]*?)\\2`,
        'g'
      ),
      // Backtick - simple
      new RegExp(
        `(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)\`([^\`]*)\``,
        'g'
      ),
    ];

    for (const pattern of patterns) {
      if (pattern.test(content) && !content.includes(`getToolDescription('${toolId}')`)) {
        content = content.replace(pattern, `$1getToolDescription('${toolId}')`);
        updatedCount++;
        break;
      }
    }

    // Handle multi-line backtick descriptions
    if (!content.includes(`getToolDescription('${toolId}')`) && config.tools[toolId]) {
      // Find the tool definition
      const toolDefMatch = content.match(new RegExp(`(${toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)\`([\\s\\S]*?)\``));
      if (toolDefMatch) {
        const prefix = toolDefMatch[1];
        const oldDesc = toolDefMatch[0];
        const newDesc = `${prefix}getToolDescription('${toolId}')`;
        content = content.replace(oldDesc, newDesc);
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0 && content !== originalContent) {
    // Add import if not present
    const importPath = getImportPath(filePath);
    if (!content.includes('getToolDescription') || !content.includes(importPath)) {
      if (!content.includes(`from '${importPath}'`)) {
        // Find existing imports
        const importRegex = /^import .* from ['"][^'"]+['"];?\s*$/gm;
        let lastImportEnd = 0;
        let importMatch;
        while ((importMatch = importRegex.exec(content)) !== null) {
          lastImportEnd = importMatch.index + importMatch[0].length;
        }

        if (lastImportEnd > 0) {
          content =
            content.slice(0, lastImportEnd) +
            `\nimport { getToolDescription } from '${importPath}';` +
            content.slice(lastImportEnd);
        }
      }
    }

    writeFileSync(fullPath, content);
  }

  return updatedCount;
}

async function main(): Promise<void> {
  console.log('🔄 Migrating final 19 tools...\n');

  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  console.log(`📚 Loaded ${Object.keys(config.tools).length} tool definitions\n`);

  let totalUpdated = 0;
  let filesModified = 0;

  for (const [filePath, toolIds] of Object.entries(REMAINING_TOOLS)) {
    console.log(`📁 ${filePath}:`);
    const count = migrateFile(filePath, toolIds, config);
    if (count > 0) {
      console.log(`   ✅ Migrated ${count} tool(s)`);
      totalUpdated += count;
      filesModified++;
    } else {
      console.log(`   ⏭️  Already migrated`);
    }
  }

  // Save updated config
  const sortedTools: Record<string, { description: string; file?: string }> = {};
  for (const key of Object.keys(config.tools).sort()) {
    sortedTools[key] = config.tools[key];
  }
  config.tools = sortedTools;
  writeFileSync(TOOL_DESCRIPTIONS_PATH, JSON.stringify(config, null, 2));

  console.log(`\n📊 Summary:`);
  console.log(`   Tools migrated: ${totalUpdated}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total tools in config: ${Object.keys(config.tools).length}`);

  if (totalUpdated > 0) {
    console.log('\n🔍 Run `pnpm typecheck` to verify no errors.');
  } else {
    console.log('\n✅ All tools already migrated!');
  }
}

main().catch(console.error);

