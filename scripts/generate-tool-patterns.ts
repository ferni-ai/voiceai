#!/usr/bin/env npx tsx
/**
 * Generate Tool Name Patterns
 *
 * Scans all domain tool definitions and generates the TOOL_NAME_PATTERNS array
 * for tool-call-sanitizer.ts. This ensures all domain tools are voice-callable.
 *
 * Usage:
 *   npx tsx scripts/generate-tool-patterns.ts
 *   npx tsx scripts/generate-tool-patterns.ts --output  # Write to sanitizer file
 *
 * @module scripts/generate-tool-patterns
 */

import * as fs from 'fs';
import * as path from 'path';

const DOMAINS_DIR = path.join(process.cwd(), 'src/tools/domains');
const SANITIZER_FILE = path.join(process.cwd(), 'src/agents/shared/tool-call-sanitizer.ts');

interface ToolDefinition {
  id: string;
  name: string;
  domain: string;
}

/**
 * Recursively find all index.ts files in domains
 */
function findDomainIndexFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Check for index.ts in this directory
        const indexPath = path.join(fullPath, 'index.ts');
        if (fs.existsSync(indexPath)) {
          files.push(indexPath);
        }
        // Also check subdirectories
        files.push(...findDomainIndexFiles(fullPath));
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  
  return files;
}

/**
 * Extract tool IDs from a domain index file
 */
function extractToolIds(filePath: string): string[] {
  const toolIds: string[] = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Match patterns like: id: 'toolName' or id: "toolName"
    const idMatches = content.matchAll(/id:\s*['"](\w+)['"]/g);
    for (const match of idMatches) {
      toolIds.push(match[1]);
    }
    
    // Also match function exports like: export function toolName
    const exportMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const match of exportMatches) {
      const name = match[1];
      // Skip internal functions (starting with _ or common helpers)
      if (!name.startsWith('_') && !['getToolDefinitions', 'createDomainExport'].includes(name)) {
        // Convert function name to tool ID format
        toolIds.push(name);
      }
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  
  return [...new Set(toolIds)]; // Dedupe
}

/**
 * Generate variations of a tool name for pattern matching
 */
function generateVariations(toolId: string): string[] {
  const variations: string[] = [toolId];
  
  // Add lowercase version
  const lower = toolId.toLowerCase();
  if (lower !== toolId) {
    variations.push(lower);
  }
  
  // Convert camelCase to "word word" format
  const spaced = toolId.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (spaced !== lower && !spaced.includes('_')) {
    variations.push(spaced);
    // Also add with capital first word
    variations.push(spaced.charAt(0).toUpperCase() + spaced.slice(1));
  }
  
  // Add -ing form for action verbs
  const actionVerbs = ['play', 'get', 'set', 'add', 'create', 'update', 'delete', 'search', 'find', 'track', 'log', 'send', 'start', 'stop', 'pause', 'resume', 'skip', 'process', 'assess', 'clarify', 'practice', 'explore', 'navigate', 'acknowledge', 'discover'];
  for (const verb of actionVerbs) {
    if (lower.startsWith(verb)) {
      // E.g., playMusic -> "Playing music"
      const rest = lower.slice(verb.length);
      const ingForm = verb.replace(/e$/, '') + 'ing';
      const spacedRest = rest.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      variations.push(`${ingForm} ${spacedRest}`.trim());
      variations.push(`${ingForm.charAt(0).toUpperCase() + ingForm.slice(1)} ${spacedRest}`.trim());
    }
  }
  
  return [...new Set(variations)];
}

/**
 * Group tool IDs by domain/category for organized output
 */
function groupByDomain(toolIds: string[], domainPath: string): { domain: string; tools: string[] } {
  // Extract domain name from path
  const parts = domainPath.split(path.sep);
  const domainsIndex = parts.findIndex(p => p === 'domains');
  const domain = domainsIndex >= 0 && parts[domainsIndex + 1] 
    ? parts[domainsIndex + 1] 
    : 'unknown';
  
  return { domain, tools: toolIds };
}

/**
 * Main function
 */
async function main() {
  const shouldOutput = process.argv.includes('--output');
  
  console.log('🔍 Scanning domain tool definitions...\n');
  
  // Find all domain index files
  const indexFiles = findDomainIndexFiles(DOMAINS_DIR);
  console.log(`Found ${indexFiles.length} domain index files\n`);
  
  // Extract tool IDs from each domain
  const domainTools: Array<{ domain: string; tools: string[] }> = [];
  const allToolIds = new Set<string>();
  
  for (const file of indexFiles) {
    const toolIds = extractToolIds(file);
    if (toolIds.length > 0) {
      const grouped = groupByDomain(toolIds, file);
      domainTools.push(grouped);
      toolIds.forEach(id => allToolIds.add(id));
    }
  }
  
  // Sort domains
  domainTools.sort((a, b) => a.domain.localeCompare(b.domain));
  
  // Generate all variations
  const allPatterns = new Set<string>();
  for (const id of allToolIds) {
    const variations = generateVariations(id);
    variations.forEach(v => allPatterns.add(v));
  }
  
  // Print summary
  console.log('📊 Summary:');
  console.log(`   Total domains: ${domainTools.length}`);
  console.log(`   Total tool IDs: ${allToolIds.size}`);
  console.log(`   Total patterns (with variations): ${allPatterns.size}\n`);
  
  // Print by domain
  console.log('📦 Tools by Domain:\n');
  for (const { domain, tools } of domainTools) {
    console.log(`   ${domain}: ${tools.length} tools`);
    if (tools.length <= 10) {
      console.log(`      ${tools.join(', ')}`);
    } else {
      console.log(`      ${tools.slice(0, 10).join(', ')}... and ${tools.length - 10} more`);
    }
  }
  
  // Generate the patterns array
  const patternsCode = generatePatternsCode(domainTools);
  
  if (shouldOutput) {
    console.log('\n📝 Updating tool-call-sanitizer.ts...');
    // TODO: Implement file update
    console.log('   (Manual update required - copy the output below)\n');
  }
  
  console.log('\n📋 Generated TOOL_NAME_PATTERNS additions:\n');
  console.log('// ============================================================================');
  console.log('// AUTO-GENERATED DOMAIN TOOL PATTERNS');
  console.log('// Run: npx tsx scripts/generate-tool-patterns.ts');
  console.log('// ============================================================================');
  console.log(patternsCode);
  
  // Also output as JSON for programmatic use
  const outputPath = path.join(process.cwd(), 'data/domain-tool-patterns.json');
  const jsonOutput = {
    generated: new Date().toISOString(),
    totalDomains: domainTools.length,
    totalTools: allToolIds.size,
    totalPatterns: allPatterns.size,
    domains: domainTools.map(d => ({
      domain: d.domain,
      toolCount: d.tools.length,
      tools: d.tools,
    })),
    patterns: Array.from(allPatterns).sort(),
  };
  
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`\n💾 JSON output saved to: ${outputPath}`);
}

/**
 * Generate TypeScript code for the patterns array
 */
function generatePatternsCode(domainTools: Array<{ domain: string; tools: string[] }>): string {
  const lines: string[] = [];
  
  for (const { domain, tools } of domainTools) {
    lines.push(`\n  // ${domain.charAt(0).toUpperCase() + domain.slice(1)} tools`);
    for (const tool of tools.sort()) {
      lines.push(`  '${tool}',`);
      
      // Add lowercase if different
      const lower = tool.toLowerCase();
      if (lower !== tool) {
        lines.push(`  '${lower}',`);
      }
      
      // Add spaced version if camelCase
      const spaced = tool.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      if (spaced !== lower && spaced.includes(' ')) {
        lines.push(`  '${spaced}',`);
      }
    }
  }
  
  return lines.join('\n');
}

// Run
main().catch(console.error);
