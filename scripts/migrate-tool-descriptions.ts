#!/usr/bin/env npx tsx
/**
 * Tool Description Migration Script
 *
 * Migrates inline tool descriptions to the centralized tool-descriptions.json
 * following Google Vertex AI Function Calling best practices.
 *
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 *
 * Usage:
 *   npx tsx scripts/migrate-tool-descriptions.ts --extract [path]  # Extract descriptions from file
 *   npx tsx scripts/migrate-tool-descriptions.ts --update [path]   # Update file to use centralized descriptions
 *   npx tsx scripts/migrate-tool-descriptions.ts --report          # Show migration status
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, relative, join } from 'path';

// Simple recursive file finder (avoids glob dependency)
function findFiles(dir: string, pattern: RegExp, results: string[] = []): string[] {
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
  return results;
}

const ROOT = resolve(import.meta.dirname, '..');
const TOOL_DESCRIPTIONS_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ToolDescriptionsConfig {
  version: number;
  lastUpdated: string;
  defaults: { prefix: string; suffix: string };
  tools: Record<string, { description: string; parameters?: Record<string, string> }>;
  _comment?: string;
  _reference?: string;
  _notes?: string[];
}

// ============================================================================
// EXTRACTION: Find all tool descriptions in a file
// ============================================================================

interface ExtractedTool {
  toolId: string;
  description: string;
  file: string;
  lineNumber: number;
  parameters: Record<string, string>;
}

function extractToolsFromFile(filePath: string): ExtractedTool[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const tools: ExtractedTool[] = [];

  // Regex to match llm.tool({ description: "..." })
  const toolBlockRegex = /llm\.tool\(\{[\s\S]*?description:\s*[`'"]([\s\S]*?)[`'"],?[\s\S]*?\}\)/g;
  const paramDescRegex = /\.describe\(\s*[`'"]([\s\S]*?)[`'"]\s*\)/g;

  // Find the tool name by looking at the context
  const toolNameRegex = /(\w+):\s*llm\.tool\(/g;

  let match;
  while ((match = toolBlockRegex.exec(content)) !== null) {
    const description = match[1].trim();
    const matchPosition = match.index;

    // Find the line number
    const contentUpToMatch = content.substring(0, matchPosition);
    const lineNumber = contentUpToMatch.split('\n').length;

    // Find tool name by looking backwards
    let toolId = 'unknown';
    const beforeMatch = content.substring(Math.max(0, matchPosition - 200), matchPosition);
    const nameMatch = beforeMatch.match(/(\w+):\s*llm\.tool\(/);
    if (nameMatch) {
      toolId = nameMatch[1];
    }

    // Extract parameter descriptions
    const parameters: Record<string, string> = {};
    const toolBlock = match[0];
    let paramMatch;
    const paramNameRegex = /(\w+):\s*z\.\w+\([^)]*\)\.describe\(\s*[`'"]([\s\S]*?)[`'"]\s*\)/g;
    while ((paramMatch = paramNameRegex.exec(toolBlock)) !== null) {
      parameters[paramMatch[1]] = paramMatch[2].trim();
    }

    tools.push({
      toolId,
      description,
      file: relative(ROOT, filePath),
      lineNumber,
      parameters,
    });
  }

  return tools;
}

// ============================================================================
// REPORT: Show migration status
// ============================================================================

async function generateReport(): Promise<void> {
  console.log('🔍 Scanning for tool definitions...\n');

  // Find all TypeScript files that might have tools
  const srcDir = resolve(ROOT, 'src');
  const allFiles = findFiles(srcDir, /\.ts$/);
  const files = allFiles
    .filter((f) => !f.includes('.test.ts'))
    .map((f) => relative(ROOT, f));

  let totalTools = 0;
  let migratedTools = 0;
  const toolsByFile: Record<string, number> = {};

  // Load current centralized descriptions
  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  const centralizedToolIds = new Set(Object.keys(config.tools));

  for (const file of files) {
    const fullPath = resolve(ROOT, file);
    const content = readFileSync(fullPath, 'utf-8');

    if (!content.includes('llm.tool(')) continue;

    const tools = extractToolsFromFile(fullPath);
    if (tools.length > 0) {
      toolsByFile[file] = tools.length;
      totalTools += tools.length;

      // Check which ones are already using centralized descriptions
      for (const tool of tools) {
        if (content.includes(`getToolDescription('${tool.toolId}')`)) {
          migratedTools++;
        }
      }
    }
  }

  console.log('📊 Migration Status:\n');
  console.log(`   Total tools found: ${totalTools}`);
  console.log(`   Using centralized descriptions: ${migratedTools}`);
  console.log(`   Pending migration: ${totalTools - migratedTools}`);
  console.log(`   Centralized definitions: ${centralizedToolIds.size}\n`);

  console.log('📁 Files with tools:\n');
  const sortedFiles = Object.entries(toolsByFile).sort((a, b) => b[1] - a[1]);
  for (const [file, count] of sortedFiles.slice(0, 20)) {
    const isMigrated = readFileSync(resolve(ROOT, file), 'utf-8').includes('getToolDescription(');
    const status = isMigrated ? '✅' : '⏳';
    console.log(`   ${status} ${file}: ${count} tools`);
  }

  if (sortedFiles.length > 20) {
    console.log(`   ... and ${sortedFiles.length - 20} more files\n`);
  }
}

// ============================================================================
// EXTRACT: Generate JSON entries from a file
// ============================================================================

function extractToJson(filePath: string): void {
  const fullPath = resolve(ROOT, filePath);

  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const tools = extractToolsFromFile(fullPath);

  if (tools.length === 0) {
    console.log(`No tools found in ${filePath}`);
    return;
  }

  console.log(`\n📝 Extracted ${tools.length} tools from ${filePath}:\n`);
  console.log('Add these to src/tools/config/tool-descriptions.json:\n');
  console.log('```json');

  const output: Record<string, { description: string; parameters?: Record<string, string> }> = {};
  for (const tool of tools) {
    output[tool.toolId] = {
      description: tool.description.replace(/\n\s*/g, ' ').trim(),
    };
    if (Object.keys(tool.parameters).length > 0) {
      output[tool.toolId].parameters = tool.parameters;
    }
  }

  console.log(JSON.stringify(output, null, 2));
  console.log('```\n');
}

// ============================================================================
// UPDATE: Modify file to use centralized descriptions
// ============================================================================

function updateFileToUseCentralized(filePath: string): void {
  const fullPath = resolve(ROOT, filePath);

  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  let content = readFileSync(fullPath, 'utf-8');
  const originalContent = content;

  // Check if import already exists
  if (!content.includes('tool-descriptions')) {
    // Add import after other imports
    const lastImportMatch = content.match(/^import .* from ['"].*['"];?\s*$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const insertPosition = content.lastIndexOf(lastImport) + lastImport.length;
      content =
        content.slice(0, insertPosition) +
        "\nimport { getToolDescription, getParameterDescription } from './utils/tool-descriptions.js';" +
        content.slice(insertPosition);
    }
  }

  // Extract tools and update their descriptions
  const tools = extractToolsFromFile(fullPath);
  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));

  let updatedCount = 0;
  for (const tool of tools) {
    if (!config.tools[tool.toolId]) {
      console.log(`   ⚠️  ${tool.toolId} not in centralized config, skipping`);
      continue;
    }

    // Replace inline description with getToolDescription call
    const descriptionPattern = new RegExp(
      `(${tool.toolId}:\\s*llm\\.tool\\(\\{[\\s\\S]*?description:\\s*)['\`"]([\\s\\S]*?)['\`"]`,
      'g'
    );

    const newContent = content.replace(descriptionPattern, (match, prefix) => {
      return `${prefix}getToolDescription('${tool.toolId}')`;
    });

    if (newContent !== content) {
      content = newContent;
      updatedCount++;
      console.log(`   ✅ Updated ${tool.toolId}`);
    }
  }

  if (content !== originalContent) {
    writeFileSync(fullPath, content);
    console.log(`\n✅ Updated ${filePath} (${updatedCount} tools)`);
  } else {
    console.log(`\n⏸️  No changes made to ${filePath}`);
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Tool Description Migration Script

Usage:
  npx tsx scripts/migrate-tool-descriptions.ts --report              Show migration status
  npx tsx scripts/migrate-tool-descriptions.ts --extract <path>      Extract descriptions from file
  npx tsx scripts/migrate-tool-descriptions.ts --update <path>       Update file to use centralized

Examples:
  npx tsx scripts/migrate-tool-descriptions.ts --report
  npx tsx scripts/migrate-tool-descriptions.ts --extract src/tools/music.ts
  npx tsx scripts/migrate-tool-descriptions.ts --update src/tools/music.ts
`);
    return;
  }

  switch (args[0]) {
    case '--report':
      await generateReport();
      break;
    case '--extract':
      if (!args[1]) {
        console.error('❌ Please provide a file path');
        process.exit(1);
      }
      extractToJson(args[1]);
      break;
    case '--update':
      if (!args[1]) {
        console.error('❌ Please provide a file path');
        process.exit(1);
      }
      updateFileToUseCentralized(args[1]);
      break;
    default:
      console.error(`❌ Unknown command: ${args[0]}`);
      process.exit(1);
  }
}

main().catch(console.error);

