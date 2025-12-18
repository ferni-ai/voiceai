#!/usr/bin/env npx tsx
/**
 * Migrate Domain Tool Files v2
 *
 * Handles multi-line backtick descriptions in src/tools/domains/
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

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
  
  if (fileRel.includes('domains/engagement/') ||
      fileRel.includes('domains/simple-utilities/')) {
    return '../../../utils/tool-descriptions.js';
  } else if (fileRel.includes('domains/')) {
    return '../../utils/tool-descriptions.js';
  }
  return './utils/tool-descriptions.js';
}

function migrateDomainFile(filePath: string, config: ToolDescriptionsConfig): number {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Skip if already fully migrated
  if (!content.includes('llm.tool(')) {
    return 0;
  }

  // Skip files already using getToolDescription for all tools
  const llmToolCount = (content.match(/llm\.tool\(\{/g) || []).length;
  const getToolDescCount = (content.match(/getToolDescription\(/g) || []).length;
  if (getToolDescCount >= llmToolCount && getToolDescCount > 0) {
    return 0;
  }

  let updatedCount = 0;

  // Find all tool IDs defined in this file
  const idMatches = [...content.matchAll(/id:\s*['"](\w+)['"]/g)];
  const toolIds = idMatches.map(m => m[1]);

  for (const toolId of toolIds) {
    if (!config.tools[toolId]) {
      console.log(`      ⚠️ ${toolId} not in config, skipping`);
      continue;
    }

    // Already migrated this tool?
    if (content.includes(`getToolDescription('${toolId}')`)) {
      continue;
    }

    // Find the ToolDefinition block for this tool ID
    // Then find the llm.tool({ description: ... }) within it
    
    // Strategy: Find `id: 'toolId'` then find the next `llm.tool({` after it
    // Then replace the description value
    
    const idIndex = content.indexOf(`id: '${toolId}'`) !== -1 
      ? content.indexOf(`id: '${toolId}'`)
      : content.indexOf(`id: "${toolId}"`);
    
    if (idIndex === -1) continue;

    // Find llm.tool({ after this id
    const afterId = content.slice(idIndex);
    const llmToolMatch = afterId.match(/llm\.tool\(\{[\s\S]*?description:\s*/);
    
    if (!llmToolMatch) continue;

    const descStartInAfterBlock = llmToolMatch.index! + llmToolMatch[0].length;
    const descStartGlobal = idIndex + descStartInAfterBlock;

    // Now find what type of quote is used and extract the full description
    const charAtDesc = content[descStartGlobal];
    
    let descEndGlobal: number;
    let oldDescValue: string;

    if (charAtDesc === '`') {
      // Backtick - find matching closing backtick (not escaped)
      let depth = 0;
      let i = descStartGlobal + 1;
      while (i < content.length) {
        if (content[i] === '\\' && content[i + 1] === '`') {
          i += 2; // Skip escaped backtick
          continue;
        }
        if (content[i] === '$' && content[i + 1] === '{') {
          depth++;
          i += 2;
          continue;
        }
        if (depth > 0 && content[i] === '}') {
          depth--;
          i++;
          continue;
        }
        if (content[i] === '`' && depth === 0) {
          descEndGlobal = i + 1;
          oldDescValue = content.slice(descStartGlobal, descEndGlobal);
          break;
        }
        i++;
      }
    } else if (charAtDesc === "'" || charAtDesc === '"') {
      // Single or double quote - find matching close (handle escapes)
      const quote = charAtDesc;
      let i = descStartGlobal + 1;
      while (i < content.length) {
        if (content[i] === '\\') {
          i += 2; // Skip escaped char
          continue;
        }
        if (content[i] === quote) {
          descEndGlobal = i + 1;
          oldDescValue = content.slice(descStartGlobal, descEndGlobal);
          break;
        }
        i++;
      }
    } else {
      // Already getToolDescription or something else
      continue;
    }

    if (!oldDescValue! || !descEndGlobal!) continue;

    // Replace the old description with getToolDescription call
    const newDescValue = `getToolDescription('${toolId}')`;
    content = content.slice(0, descStartGlobal) + newDescValue + content.slice(descEndGlobal!);
    updatedCount++;
  }

  if (updatedCount > 0 && content !== originalContent) {
    // Add import if not present
    if (!content.includes("from '../../utils/tool-descriptions.js'") &&
        !content.includes("from '../../../utils/tool-descriptions.js'") &&
        !content.includes("from './utils/tool-descriptions.js'")) {
      
      const importPath = getImportPath(filePath);
      
      // Find last import
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
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔄 Migrating domain tool files (v2 - handles multi-line)...\n');
  if (dryRun) {
    console.log('   (DRY RUN - checking what would be updated)\n');
  }

  const config: ToolDescriptionsConfig = JSON.parse(readFileSync(TOOL_DESCRIPTIONS_PATH, 'utf-8'));
  console.log(`📚 Loaded ${Object.keys(config.tools).length} tool definitions\n`);

  const domainsDir = resolve(ROOT, 'src/tools/domains');
  const files = findFiles(domainsDir, /\.ts$/);

  let totalUpdated = 0;
  let filesModified = 0;

  for (const file of files) {
    if (file.includes('.test.ts')) continue;
    
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

  if (totalUpdated > 0) {
    console.log('\n🔍 Run `pnpm typecheck` to verify no errors.');
  }
}

main().catch(console.error);

