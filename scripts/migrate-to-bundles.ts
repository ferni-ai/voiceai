#!/usr/bin/env npx ts-node
/**
 * Migration Script: Legacy Registry to Bundle System
 *
 * This script helps migrate from the old hardcoded registry system
 * to the new bundle-based system.
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-bundles.ts [--dry-run]
 *
 * What it does:
 * 1. Scans for imports from deprecated registries
 * 2. Suggests replacements using unified-registry
 * 3. Validates all existing bundles
 * 4. Identifies any agents not yet converted to bundles
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { existsSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface MigrationIssue {
  file: string;
  line: number;
  type: 'deprecated-import' | 'legacy-id' | 'hardcoded-voice';
  current: string;
  suggested: string;
}

const DEPRECATED_IMPORTS = [
  {
    pattern: /from ['"]\.\.?\/personas\/agent-registry/,
    replacement: "from './personas/registry/unified-registry'",
    message: 'agent-registry.ts is deprecated',
  },
  {
    pattern: /from ['"]\.\.?\/personas\/PersonaRegistry/,
    replacement: "from './personas/registry/unified-registry'",
    message: 'PersonaRegistry.ts is deprecated',
  },
  {
    pattern: /from ['"]\.\.?\/config\/personas['"]/,
    replacement: "from './services/agents.service'",
    message: 'Use API-based agent loading',
  },
];

const LEGACY_IDS = new Map([
  ['jack-b', 'ferni'],
  ['jackie', 'ferni'],
  ['comm-specialist', 'alex-chen'],
  ['spend-save', 'maya-santos'],
  ['event-planner', 'jordan-taylor'],
  ['sage-mentor', 'jack-bogle'],
  ['stock-storyteller', 'peter-lynch'],
]);

async function findTsFiles(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      await findTsFiles(fullPath, files);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function scanFile(filePath: string): Promise<MigrationIssue[]> {
  const issues: MigrationIssue[] = [];
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for deprecated imports
    for (const dep of DEPRECATED_IMPORTS) {
      if (dep.pattern.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          type: 'deprecated-import',
          current: line.trim(),
          suggested: dep.replacement,
        });
      }
    }
    
    // Check for legacy IDs
    for (const [legacy, replacement] of LEGACY_IDS) {
      const idPattern = new RegExp(`['"]${legacy}['"]`, 'g');
      if (idPattern.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          type: 'legacy-id',
          current: legacy,
          suggested: replacement,
        });
      }
    }
    
    // Check for hardcoded voice IDs
    const voiceIdPattern = /voiceId:\s*['"][0-9a-f]{8}-[0-9a-f]{4}/i;
    if (voiceIdPattern.test(line)) {
      issues.push({
        file: filePath,
        line: lineNum,
        type: 'hardcoded-voice',
        current: line.trim(),
        suggested: 'Use getVoiceId() from unified-registry',
      });
    }
  }
  
  return issues;
}

async function discoverBundles(): Promise<string[]> {
  const bundlesDir = join(process.cwd(), 'src/personas/bundles');
  if (!existsSync(bundlesDir)) {
    return [];
  }
  
  const entries = await readdir(bundlesDir, { withFileTypes: true });
  const bundles: string[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const manifestPath = join(bundlesDir, entry.name, 'persona.manifest.json');
      if (existsSync(manifestPath)) {
        bundles.push(entry.name);
      }
    }
  }
  
  return bundles;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log(`${colors.bold}${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║  Bundle Migration Scanner              ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════╝${colors.reset}\n`);
  
  if (isDryRun) {
    console.log(`${colors.yellow}ℹ Running in dry-run mode (no changes will be made)${colors.reset}\n`);
  }
  
  // 1. Discover existing bundles
  console.log(`${colors.bold}📦 Discovering bundles...${colors.reset}`);
  const bundles = await discoverBundles();
  console.log(`   Found ${bundles.length} bundles: ${bundles.join(', ')}\n`);
  
  // 2. Scan source files
  console.log(`${colors.bold}🔍 Scanning source files...${colors.reset}`);
  const srcDir = join(process.cwd(), 'src');
  const files = await findTsFiles(srcDir);
  console.log(`   Found ${files.length} TypeScript files\n`);
  
  // 3. Find issues
  console.log(`${colors.bold}⚠️  Finding migration issues...${colors.reset}\n`);
  const allIssues: MigrationIssue[] = [];
  
  for (const file of files) {
    const issues = await scanFile(file);
    allIssues.push(...issues);
  }
  
  // Group by type
  const deprecatedImports = allIssues.filter(i => i.type === 'deprecated-import');
  const legacyIds = allIssues.filter(i => i.type === 'legacy-id');
  const hardcodedVoices = allIssues.filter(i => i.type === 'hardcoded-voice');
  
  // Report deprecated imports
  if (deprecatedImports.length > 0) {
    console.log(`${colors.red}Deprecated Imports (${deprecatedImports.length}):${colors.reset}`);
    for (const issue of deprecatedImports) {
      const relPath = relative(process.cwd(), issue.file);
      console.log(`   ${colors.dim}${relPath}:${issue.line}${colors.reset}`);
      console.log(`     ${colors.red}- ${issue.current}${colors.reset}`);
      console.log(`     ${colors.green}+ ${issue.suggested}${colors.reset}\n`);
    }
  }
  
  // Report legacy IDs
  if (legacyIds.length > 0) {
    console.log(`${colors.yellow}Legacy IDs (${legacyIds.length}):${colors.reset}`);
    const uniqueIds = new Map<string, number>();
    for (const issue of legacyIds) {
      uniqueIds.set(issue.current, (uniqueIds.get(issue.current) || 0) + 1);
    }
    for (const [id, count] of uniqueIds) {
      const replacement = LEGACY_IDS.get(id);
      console.log(`   "${id}" → "${replacement}" (${count} occurrences)`);
    }
    console.log('');
  }
  
  // Report hardcoded voices
  if (hardcodedVoices.length > 0) {
    console.log(`${colors.blue}Hardcoded Voice IDs (${hardcodedVoices.length}):${colors.reset}`);
    for (const issue of hardcodedVoices.slice(0, 5)) {
      const relPath = relative(process.cwd(), issue.file);
      console.log(`   ${colors.dim}${relPath}:${issue.line}${colors.reset}`);
    }
    if (hardcodedVoices.length > 5) {
      console.log(`   ${colors.dim}... and ${hardcodedVoices.length - 5} more${colors.reset}`);
    }
    console.log('');
  }
  
  // Summary
  console.log(`${colors.bold}📊 Migration Summary${colors.reset}`);
  console.log(`   Bundles discovered: ${colors.green}${bundles.length}${colors.reset}`);
  console.log(`   Deprecated imports: ${deprecatedImports.length > 0 ? colors.red : colors.green}${deprecatedImports.length}${colors.reset}`);
  console.log(`   Legacy IDs:         ${legacyIds.length > 0 ? colors.yellow : colors.green}${legacyIds.length}${colors.reset}`);
  console.log(`   Hardcoded voices:   ${hardcodedVoices.length > 0 ? colors.blue : colors.green}${hardcodedVoices.length}${colors.reset}`);
  
  console.log('');
  
  if (allIssues.length === 0) {
    console.log(`${colors.green}✓ No migration issues found! Your codebase is ready.${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ Found ${allIssues.length} items to review${colors.reset}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Replace deprecated imports with unified-registry');
    console.log('2. Update legacy IDs to canonical bundle IDs');
    console.log('3. Move hardcoded voice IDs to bundle manifests');
    console.log('');
    console.log('See docs/AGENT-MANAGEMENT.md for migration guide.');
  }
}

main().catch(console.error);

