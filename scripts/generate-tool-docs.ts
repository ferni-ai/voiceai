#!/usr/bin/env npx tsx
/**
 * Generate Tool Documentation
 * 
 * Generates a comprehensive tool reference from the actual tool registry.
 * Similar to Gemini 3's tool documentation style.
 * 
 * Usage: npx tsx scripts/generate-tool-docs.ts
 */

import { toolRegistry } from '../src/tools/registry/index.js';
import { autoRegisterAllDomains, initializeToolRegistry } from '../src/tools/registry/loader.js';
import { ALL_TOOL_DOMAINS, DOMAIN_TO_CATEGORY, type ToolDomain } from '../src/tools/registry/types.js';
import * as fs from 'fs';
import * as path from 'path';

interface ToolDoc {
  id: string;
  name: string;
  description: string;
  domain: ToolDomain;
  category: string;
  tags: string[];
  parameters?: Record<string, unknown>;
}

async function generateToolDocs(): Promise<void> {
  console.log('🔧 Registering domain loaders...');
  await autoRegisterAllDomains();
  
  console.log('🔧 Initializing tool registry...');
  await initializeToolRegistry({ lazyLoading: false });
  
  const allTools = toolRegistry.getAll();
  console.log(`📦 Found ${allTools.length} registered tools`);
  
  // Group tools by domain
  const toolsByDomain: Record<string, ToolDoc[]> = {};
  
  for (const toolDef of allTools) {
    const domain = toolDef.domain;
    if (!toolsByDomain[domain]) {
      toolsByDomain[domain] = [];
    }
    
    toolsByDomain[domain].push({
      id: toolDef.id,
      name: toolDef.name,
      description: toolDef.description,
      domain: toolDef.domain,
      category: DOMAIN_TO_CATEGORY[toolDef.domain] || 'other',
      tags: toolDef.tags || [],
    });
  }
  
  // Generate markdown
  let markdown = `# Ferni Tool Registry

> Auto-generated from tool registry. ${allTools.length} tools across ${Object.keys(toolsByDomain).length} domains.
> Generated: ${new Date().toISOString()}

## Summary

| Domain | Category | Tool Count |
|--------|----------|------------|
`;
  
  // Summary table
  for (const domain of ALL_TOOL_DOMAINS) {
    const tools = toolsByDomain[domain] || [];
    if (tools.length > 0) {
      const category = DOMAIN_TO_CATEGORY[domain];
      markdown += `| \`${domain}\` | ${category} | ${tools.length} |\n`;
    }
  }
  
  markdown += `\n---\n\n`;
  
  // Detailed sections by domain
  for (const domain of ALL_TOOL_DOMAINS) {
    const tools = toolsByDomain[domain] || [];
    if (tools.length === 0) continue;
    
    const category = DOMAIN_TO_CATEGORY[domain];
    markdown += `## ${domain} (${category})\n\n`;
    
    for (const tool of tools) {
      markdown += `### \`${tool.id}\`\n\n`;
      markdown += `${tool.description}\n\n`;
      if (tool.tags.length > 0) {
        markdown += `**Tags:** ${tool.tags.join(', ')}\n\n`;
      }
    }
    
    markdown += `---\n\n`;
  }
  
  // Write to file
  const outputPath = path.join(process.cwd(), 'src/personas/shared/TOOL-REGISTRY.generated.md');
  fs.writeFileSync(outputPath, markdown);
  console.log(`✅ Generated ${outputPath}`);
  
  // Also generate JSON for programmatic use
  const jsonOutput = {
    generatedAt: new Date().toISOString(),
    totalTools: allTools.length,
    domains: Object.keys(toolsByDomain).length,
    tools: allTools.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      domain: t.domain,
      category: DOMAIN_TO_CATEGORY[t.domain],
      tags: t.tags || [],
    })),
  };
  
  const jsonPath = path.join(process.cwd(), 'src/personas/shared/tool-registry.generated.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`✅ Generated ${jsonPath}`);
}

generateToolDocs().catch(console.error);

