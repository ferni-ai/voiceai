#!/usr/bin/env npx tsx
/**
 * Extract ALL Tool Descriptions
 *
 * Scans the entire codebase and generates a complete tool-descriptions.json
 * with ALL tool IDs and their current descriptions.
 *
 * Usage:
 *   npx tsx scripts/extract-all-tools.ts
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions-extracted.json');

interface ExtractedTool {
  id: string;
  innerDescription: string;  // From llm.tool({ description })
  outerDescription?: string; // From ToolDefinition.description
  file: string;
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

function extractToolsFromFile(filePath: string): ExtractedTool[] {
  const content = readFileSync(filePath, 'utf-8');
  const tools: ExtractedTool[] = [];

  // Pattern 1: ToolDefinition with id field, then llm.tool with description
  // export const xyzDef: ToolDefinition = {
  //   id: 'xyz',
  //   ...
  //   create: () => llm.tool({ description: '...' })
  // }

  const toolDefRegex = /export const (\w+)(?:Def)?:\s*ToolDefinition\s*=\s*\{[\s\S]*?id:\s*['"](\w+)['"][\s\S]*?description:\s*['"`]([\s\S]*?)['"`][\s\S]*?create:[\s\S]*?llm\.tool\(\{[\s\S]*?description:\s*['"`]([\s\S]*?)['"`]/g;

  let match;
  while ((match = toolDefRegex.exec(content)) !== null) {
    tools.push({
      id: match[2],
      outerDescription: match[3].replace(/\n\s*/g, ' ').trim(),
      innerDescription: match[4].replace(/\n\s*/g, ' ').trim(),
      file: filePath.replace(ROOT + '/', ''),
    });
  }

  // Pattern 2: Direct llm.tool in object (like createMusicTools)
  // toolName: llm.tool({ description: '...' })
  const directToolRegex = /(\w+):\s*llm\.tool\(\{[\s\S]*?description:\s*['"`]([\s\S]*?)['"`]/g;

  while ((match = directToolRegex.exec(content)) !== null) {
    // Skip if already captured by pattern 1
    if (tools.some(t => t.id === match[1])) continue;

    tools.push({
      id: match[1],
      innerDescription: match[2].replace(/\n\s*/g, ' ').trim(),
      file: filePath.replace(ROOT + '/', ''),
    });
  }

  return tools;
}

async function main(): Promise<void> {
  console.log('🔍 Extracting ALL tool descriptions...\n');

  const srcDir = resolve(ROOT, 'src');
  const allFiles = findFiles(srcDir, /\.ts$/);
  const tsFiles = allFiles.filter((f) => !f.includes('.test.ts'));

  const allTools: ExtractedTool[] = [];
  const fileStats: Record<string, number> = {};

  for (const file of tsFiles) {
    const content = readFileSync(file, 'utf-8');
    if (!content.includes('llm.tool(')) continue;

    const tools = extractToolsFromFile(file);
    if (tools.length > 0) {
      allTools.push(...tools);
      fileStats[file.replace(ROOT + '/', '')] = tools.length;
    }
  }

  console.log(`📊 Found ${allTools.length} tools across ${Object.keys(fileStats).length} files\n`);

  // Build output JSON following Google's best practices
  const output: Record<string, unknown> = {
    $schema: './tool-descriptions.schema.json',
    version: 1,
    lastUpdated: new Date().toISOString().split('T')[0],
    _comment: 'Auto-extracted tool descriptions. Edit these to improve function calling.',
    _reference: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling',
    _stats: {
      totalTools: allTools.length,
      filesScanned: Object.keys(fileStats).length,
    },
    defaults: {
      prefix: '',
      suffix: '',
    },
    tools: {} as Record<string, { description: string; file: string; original?: string }>,
  };

  // Sort tools alphabetically
  allTools.sort((a, b) => a.id.localeCompare(b.id));

  for (const tool of allTools) {
    // Convert verbose descriptions to cleaner versions following Google's guidelines
    let cleanDescription = tool.innerDescription
      // Remove command-style prefixes
      .replace(/^(CALL|EXECUTE|DO NOT|SILENT ACTION|TRIGGERS?)[\s:-]*/gi, '')
      .replace(/immediately/gi, '')
      .replace(/silently/gi, '')
      .replace(/without announcing/gi, '')
      .replace(/Do not (say|announce|output|read)[^.]+\./gi, '')
      .replace(/Execute (and )?respond naturally[^.]*\./gi, '')
      .replace(/Call (and )?respond naturally[^.]*\./gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Capitalize first letter
    if (cleanDescription.length > 0) {
      cleanDescription = cleanDescription.charAt(0).toUpperCase() + cleanDescription.slice(1);
    }

    // Ensure it ends with a period
    if (cleanDescription && !cleanDescription.endsWith('.')) {
      cleanDescription += '.';
    }

    (output.tools as Record<string, unknown>)[tool.id] = {
      description: cleanDescription || tool.innerDescription,
      file: tool.file,
      // Keep original for reference during migration
      _original: tool.innerDescription !== cleanDescription ? tool.innerDescription : undefined,
    };
  }

  // Write output
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`✅ Wrote ${allTools.length} tool descriptions to:`);
  console.log(`   ${OUTPUT_PATH}\n`);

  console.log('📁 Top files by tool count:');
  const sortedFiles = Object.entries(fileStats).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [file, count] of sortedFiles) {
    console.log(`   ${count.toString().padStart(3)} tools: ${file}`);
  }

  console.log('\n📝 Next steps:');
  console.log('   1. Review src/tools/config/tool-descriptions-extracted.json');
  console.log('   2. Edit descriptions to follow Google best practices');
  console.log('   3. Rename to tool-descriptions.json when ready');
  console.log('   4. Run: npx tsx scripts/migrate-tool-descriptions.ts --update <file>');
}

main().catch(console.error);

