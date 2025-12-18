#!/usr/bin/env npx tsx
/**
 * Extract ALL Tool Descriptions v2
 *
 * Comprehensive extraction that handles all patterns:
 * - ToolDefinition with id: 'toolName' and create: () => llm.tool({...})
 * - Direct toolName: llm.tool({...})
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions-all.json');
const EXISTING_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ExtractedTool {
  id: string;
  description: string;
  file: string;
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

function extractFromFile(filePath: string): ExtractedTool[] {
  const content = readFileSync(filePath, 'utf-8');
  const tools: ExtractedTool[] = [];
  const fileRel = relative(ROOT, filePath);

  if (!content.includes('llm.tool(')) return tools;

  // Pattern 1: ToolDefinition pattern
  // id: 'toolId' ... llm.tool({ description: '...' or `...` })
  const toolDefRegex = /id:\s*['"](\w+)['"][\s\S]*?llm\.tool\(\{[\s\S]*?description:\s*(['"`])([\s\S]*?)\2/g;
  let match;
  while ((match = toolDefRegex.exec(content)) !== null) {
    const id = match[1];
    let desc = match[3];
    
    // Handle backtick templates - find the real end
    if (match[2] === '`') {
      // Find the actual closing backtick by parsing from the start
      const descStartIndex = match.index + match[0].indexOf('description:');
      const afterDesc = content.slice(descStartIndex);
      const descMatch = afterDesc.match(/description:\s*`([\s\S]*?)`/);
      if (descMatch) {
        desc = descMatch[1];
      }
    }

    // Clean description
    desc = desc
      .replace(/\n\s*/g, ' ')
      .replace(/^(CALL|EXECUTE|DO NOT|SILENT ACTION)[\s:-]*/gi, '')
      .replace(/immediately/gi, '')
      .replace(/silently/gi, '')
      .replace(/without announcing/gi, '')
      .replace(/Do not (say|announce|output|read)[^.]*\./gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (desc && !desc.startsWith('getToolDescription')) {
      tools.push({ id, description: desc, file: fileRel });
    }
  }

  // Pattern 2: Direct assignment pattern
  // toolName: llm.tool({ description: '...' })
  const directRegex = /(\w+):\s*llm\.tool\(\{[\s\S]*?description:\s*(['"`])([\s\S]*?)\2/g;
  while ((match = directRegex.exec(content)) !== null) {
    const id = match[1];
    
    // Skip if already found via pattern 1
    if (tools.some(t => t.id === id)) continue;
    // Skip if it's using getToolDescription
    if (match[0].includes('getToolDescription')) continue;
    
    let desc = match[3];
    
    if (match[2] === '`') {
      const descStartIndex = match.index + match[0].indexOf('description:');
      const afterDesc = content.slice(descStartIndex);
      const descMatch = afterDesc.match(/description:\s*`([\s\S]*?)`/);
      if (descMatch) {
        desc = descMatch[1];
      }
    }

    desc = desc
      .replace(/\n\s*/g, ' ')
      .replace(/^(CALL|EXECUTE|DO NOT|SILENT ACTION)[\s:-]*/gi, '')
      .replace(/immediately/gi, '')
      .replace(/silently/gi, '')
      .replace(/without announcing/gi, '')
      .replace(/Do not (say|announce|output|read)[^.]*\./gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (desc && !desc.startsWith('getToolDescription')) {
      tools.push({ id, description: desc, file: fileRel });
    }
  }

  return tools;
}

async function main(): Promise<void> {
  console.log('🔍 Extracting ALL tool descriptions (v2)...\n');

  // Load existing config
  let existingConfig: Record<string, unknown> = { tools: {} };
  try {
    existingConfig = JSON.parse(readFileSync(EXISTING_PATH, 'utf-8'));
  } catch {
    // Ignore
  }

  const existingTools = (existingConfig.tools || {}) as Record<string, { description: string }>;
  console.log(`📚 Existing config has ${Object.keys(existingTools).length} tools\n`);

  const srcDir = resolve(ROOT, 'src');
  const allFiles = findFiles(srcDir, /\.ts$/);
  const tsFiles = allFiles.filter((f) => !f.includes('.test.ts') && !f.includes('.d.ts'));

  const allTools: ExtractedTool[] = [];
  const newTools: ExtractedTool[] = [];

  for (const file of tsFiles) {
    const tools = extractFromFile(file);
    allTools.push(...tools);
    
    for (const tool of tools) {
      if (!existingTools[tool.id]) {
        newTools.push(tool);
      }
    }
  }

  console.log(`📊 Found ${allTools.length} total tool definitions`);
  console.log(`🆕 ${newTools.length} NEW tools not in existing config\n`);

  if (newTools.length > 0) {
    console.log('New tools to add:');
    for (const tool of newTools.slice(0, 30)) {
      console.log(`   + ${tool.id} (${tool.file})`);
    }
    if (newTools.length > 30) {
      console.log(`   ... and ${newTools.length - 30} more\n`);
    }
  }

  // Merge new tools into existing config
  const mergedTools = { ...existingTools };
  for (const tool of newTools) {
    mergedTools[tool.id] = {
      description: tool.description || `Tool: ${tool.id}`,
      file: tool.file,
    };
  }

  // Build output
  const output = {
    $schema: './tool-descriptions.schema.json',
    version: 2,
    lastUpdated: new Date().toISOString().split('T')[0],
    _comment: 'Centralized tool descriptions - edit here to change LLM behavior',
    _reference: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling',
    _stats: {
      totalTools: Object.keys(mergedTools).length,
      newlyAdded: newTools.length,
    },
    defaults: {
      prefix: '',
      suffix: '',
    },
    tools: mergedTools,
  };

  // Sort tools alphabetically
  const sortedTools: Record<string, unknown> = {};
  for (const key of Object.keys(output.tools).sort()) {
    sortedTools[key] = output.tools[key];
  }
  output.tools = sortedTools as typeof output.tools;

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote ${Object.keys(output.tools).length} tools to:`);
  console.log(`   ${OUTPUT_PATH}`);
  console.log(`\n📝 Next: mv src/tools/config/tool-descriptions-all.json src/tools/config/tool-descriptions.json`);
}

main().catch(console.error);

