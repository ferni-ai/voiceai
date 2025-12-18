#!/usr/bin/env npx tsx
/**
 * Extract Remaining Inline Tool Descriptions
 *
 * Finds all tools that still have inline descriptions and adds them to the config
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const TOOL_DESCRIPTIONS_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ToolDescriptionsConfig {
  tools: Record<string, { description: string; file?: string }>;
  [key: string]: unknown;
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

function extractInlineDescriptions(content: string, filePath: string): Array<{ id: string; description: string }> {
  const tools: Array<{ id: string; description: string }> = [];
  const fileRel = relative(ROOT, filePath);

  // Skip if already using getToolDescription everywhere
  if (!content.includes('llm.tool(')) return tools;

  // Pattern: id: 'toolName' ... description: '...' or `...`
  // We need to find tool definitions and their descriptions
  
  // First, find all tool-like patterns
  // Pattern 1: { id: 'name', ... description: '...'
  const idPatterns = [...content.matchAll(/id:\s*['"](\w+)['"]/g)];
  
  for (const match of idPatterns) {
    const toolId = match[1];
    const startIndex = match.index!;
    
    // Look for description after this id
    const afterId = content.slice(startIndex, startIndex + 2000);
    
    // Find description: followed by quote/backtick
    const descMatch = afterId.match(/description:\s*(['"`])([\s\S]*?)\1/);
    
    if (descMatch && !descMatch[0].includes('getToolDescription')) {
      let desc = descMatch[2];
      // Clean up
      desc = desc
        .replace(/\n\s*/g, ' ')
        .replace(/\$\{[^}]+\}/g, '') // Remove template vars
        .replace(/\s+/g, ' ')
        .trim();
      
      if (desc.length > 10) {
        tools.push({ id: toolId, description: desc });
      }
    }
  }

  // Pattern 2: toolName: llm.tool({ description: '...'
  const directPattern = /(\w+):\s*llm\.tool\(\{[\s\S]*?description:\s*(['"`])([\s\S]*?)\2/g;
  let match;
  while ((match = directPattern.exec(content)) !== null) {
    const toolId = match[1];
    if (tools.some(t => t.id === toolId)) continue;
    if (match[0].includes('getToolDescription')) continue;
    
    let desc = match[3];
    desc = desc
      .replace(/\n\s*/g, ' ')
      .replace(/\$\{[^}]+\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (desc.length > 10) {
      tools.push({ id: toolId, description: desc });
    }
  }

  return tools;
}

async function main(): Promise<void> {
  console.log('🔍 Extracting remaining inline descriptions...\n');

  // Load existing config
  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  const existingCount = Object.keys(config.tools).length;
  console.log(`📚 Existing config has ${existingCount} tools\n`);

  const srcDir = resolve(ROOT, 'src');
  const allFiles = findFiles(srcDir, /\.ts$/);
  const tsFiles = allFiles.filter((f) => 
    !f.includes('.test.ts') && 
    !f.includes('.d.ts') &&
    !f.includes('tool-descriptions.ts')
  );

  let newToolsCount = 0;
  const newTools: Array<{ id: string; description: string; file: string }> = [];

  for (const file of tsFiles) {
    const content = readFileSync(file, 'utf-8');
    const tools = extractInlineDescriptions(content, file);
    
    for (const tool of tools) {
      if (!config.tools[tool.id]) {
        config.tools[tool.id] = {
          description: tool.description,
          file: relative(ROOT, file),
        };
        newTools.push({ ...tool, file: relative(ROOT, file) });
        newToolsCount++;
      }
    }
  }

  if (newToolsCount > 0) {
    console.log(`🆕 Found ${newToolsCount} NEW tools:\n`);
    for (const tool of newTools) {
      console.log(`   + ${tool.id} (${tool.file})`);
    }

    // Sort tools alphabetically
    const sortedTools: Record<string, { description: string; file?: string }> = {};
    for (const key of Object.keys(config.tools).sort()) {
      sortedTools[key] = config.tools[key];
    }
    config.tools = sortedTools;

    // Update stats
    if (config._stats && typeof config._stats === 'object') {
      (config._stats as { totalTools: number }).totalTools = Object.keys(config.tools).length;
    }

    writeFileSync(TOOL_DESCRIPTIONS_PATH, JSON.stringify(config, null, 2));
    console.log(`\n✅ Added ${newToolsCount} tools to config (now ${Object.keys(config.tools).length} total)`);
  } else {
    console.log('✅ All tools already in config!');
  }
}

main().catch(console.error);

