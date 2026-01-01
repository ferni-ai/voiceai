#!/usr/bin/env npx tsx
/**
 * Tool Usage Analysis Script
 *
 * Analyzes 892+ unwired tools to determine:
 * 1. Tools used by context builders (don't need voice-wiring)
 * 2. Tools called by services (internal use)
 * 3. Truly orphaned tools (candidates for deprecation)
 * 4. Duplicates across domains
 *
 * Run: npx tsx scripts/analyze-tool-usage.ts
 * Or:  pnpm tools:analyze
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { REGISTERED_TOOLS } from '../src/agents/shared/function-call-format.js';

// ============================================================================
// TYPES
// ============================================================================

interface ToolAnalysis {
  id: string;
  domain: string;
  usedBy: string[];
  isRegistered: boolean;
  isOrphaned: boolean;
  recommendation: 'keep' | 'wire' | 'deprecate' | 'review';
  reason: string;
}

interface UsageReport {
  timestamp: string;
  summary: {
    totalTools: number;
    registered: number;
    usedByContextBuilders: number;
    usedByServices: number;
    usedByTests: number;
    orphaned: number;
    duplicates: number;
  };
  byCategory: Record<string, ToolAnalysis[]>;
  duplicates: Array<{ toolId: string; domains: string[] }>;
  recommendations: string[];
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

async function findToolUsageInFile(filePath: string, toolIds: Set<string>): Promise<Map<string, string[]>> {
  const usages = new Map<string, string[]>();
  
  try {
    const content = await readFile(filePath, 'utf-8');
    
    for (const toolId of toolIds) {
      // Check for various usage patterns
      const patterns = [
        new RegExp(`['"\`]${toolId}['"\`]`, 'g'),  // String references
        new RegExp(`\\.${toolId}\\(`, 'g'),         // Method calls
        new RegExp(`toolId.*['"\`]${toolId}['"\`]`, 'gi'),
      ];
      
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          const existing = usages.get(toolId) || [];
          if (!existing.includes(filePath)) {
            existing.push(filePath);
            usages.set(toolId, existing);
          }
          break;
        }
      }
    }
  } catch {
    // File read error, skip
  }
  
  return usages;
}

async function scanDirectory(dir: string, toolIds: Set<string>): Promise<Map<string, string[]>> {
  const allUsages = new Map<string, string[]>();
  
  async function scanRecursive(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip certain directories
          if (['node_modules', 'dist', '.git', '__tests__', 'test'].includes(entry.name)) {
            continue;
          }
          await scanRecursive(fullPath);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
          const fileUsages = await findToolUsageInFile(fullPath, toolIds);
          
          for (const [toolId, paths] of fileUsages) {
            const existing = allUsages.get(toolId) || [];
            allUsages.set(toolId, [...existing, ...paths]);
          }
        }
      }
    } catch {
      // Directory read error, skip
    }
  }
  
  await scanRecursive(dir);
  return allUsages;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

async function analyzeToolUsage(): Promise<UsageReport> {
  console.log('🔍 Analyzing tool usage across codebase...\n');
  
  const report: UsageReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTools: 0,
      registered: REGISTERED_TOOLS.length,
      usedByContextBuilders: 0,
      usedByServices: 0,
      usedByTests: 0,
      orphaned: 0,
      duplicates: 0,
    },
    byCategory: {
      'keep': [],
      'wire': [],
      'deprecate': [],
      'review': [],
    },
    duplicates: [],
    recommendations: [],
  };
  
  // 1. Collect all domain tools
  console.log('📂 Scanning domain folders...');
  const domainsPath = join(process.cwd(), 'src/tools/domains');
  const domainDirs = await readdir(domainsPath, { withFileTypes: true });
  
  const allTools: ToolAnalysis[] = [];
  const toolIdToDomains = new Map<string, string[]>();
  const allToolIds = new Set<string>();
  
  for (const dir of domainDirs) {
    if (!dir.isDirectory()) continue;
    
    const domainPath = join(domainsPath, dir.name);
    
    try {
      const files = await readdir(domainPath);
      if (files.includes('index.ts') || files.includes('index.js')) {
        const module = await import(join(domainPath, 'index.js'));
        if (module.getToolDefinitions) {
          const definitions = await module.getToolDefinitions();
          
          for (const def of definitions) {
            allToolIds.add(def.id);
            
            // Track domains per tool (for duplicate detection)
            const domains = toolIdToDomains.get(def.id) || [];
            domains.push(dir.name);
            toolIdToDomains.set(def.id, domains);
            
            allTools.push({
              id: def.id,
              domain: dir.name,
              usedBy: [],
              isRegistered: (REGISTERED_TOOLS as readonly string[]).includes(def.id),
              isOrphaned: false,
              recommendation: 'review',
              reason: '',
            });
          }
        }
      }
    } catch {
      // Domain import error, skip
    }
  }
  
  report.summary.totalTools = allTools.length;
  console.log(`   Found ${allTools.length} tools across domains\n`);
  
  // 2. Find duplicates
  console.log('🔄 Finding duplicates...');
  for (const [toolId, domains] of toolIdToDomains) {
    if (domains.length > 1) {
      report.duplicates.push({ toolId, domains });
      report.summary.duplicates++;
    }
  }
  console.log(`   Found ${report.summary.duplicates} duplicate tool IDs\n`);
  
  // 3. Scan for usage in context builders
  console.log('🔍 Scanning context builders...');
  const contextBuilderUsages = await scanDirectory(
    join(process.cwd(), 'src/intelligence/context-builders'),
    allToolIds
  );
  
  // 4. Scan for usage in services
  console.log('🔍 Scanning services...');
  const serviceUsages = await scanDirectory(
    join(process.cwd(), 'src/services'),
    allToolIds
  );
  
  // 5. Categorize tools
  console.log('📊 Categorizing tools...\n');
  
  for (const tool of allTools) {
    const contextUsages = contextBuilderUsages.get(tool.id) || [];
    const serviceUsed = serviceUsages.get(tool.id) || [];
    
    tool.usedBy = [...contextUsages, ...serviceUsed];
    
    if (tool.isRegistered) {
      tool.recommendation = 'keep';
      tool.reason = 'Voice-callable (registered)';
    } else if (contextUsages.length > 0) {
      tool.recommendation = 'keep';
      tool.reason = `Used by context builders: ${contextUsages.map(p => p.split('/').pop()).join(', ')}`;
      report.summary.usedByContextBuilders++;
    } else if (serviceUsed.length > 0) {
      tool.recommendation = 'keep';
      tool.reason = `Used by services: ${serviceUsed.map(p => p.split('/').pop()).join(', ')}`;
      report.summary.usedByServices++;
    } else {
      // Check if it's a high-value domain that should be voice-wired
      const highValueDomains = ['career', 'grief', 'research', 'coaching-support', 'relationships'];
      
      if (highValueDomains.includes(tool.domain)) {
        tool.recommendation = 'wire';
        tool.reason = `High-value domain (${tool.domain}) - consider voice-wiring`;
      } else {
        tool.recommendation = 'review';
        tool.reason = 'Not used - review for deprecation';
        tool.isOrphaned = true;
        report.summary.orphaned++;
      }
    }
    
    report.byCategory[tool.recommendation].push(tool);
  }
  
  // 6. Generate recommendations
  if (report.summary.orphaned > 100) {
    report.recommendations.push(`${report.summary.orphaned} tools appear unused - review for deprecation`);
  }
  if (report.summary.duplicates > 0) {
    report.recommendations.push(`${report.summary.duplicates} duplicate tool IDs found - consolidate`);
  }
  if (report.byCategory['wire'].length > 0) {
    report.recommendations.push(`${report.byCategory['wire'].length} tools in high-value domains could be voice-wired`);
  }
  
  return report;
}

// ============================================================================
// OUTPUT
// ============================================================================

function printReport(report: UsageReport): void {
  console.log('='.repeat(70));
  console.log('📊 TOOL USAGE ANALYSIS REPORT');
  console.log('='.repeat(70) + '\n');
  
  console.log('📈 SUMMARY:');
  console.log(`   Total domain tools: ${report.summary.totalTools}`);
  console.log(`   Voice-callable (REGISTERED_TOOLS): ${report.summary.registered}`);
  console.log(`   Used by context builders: ${report.summary.usedByContextBuilders}`);
  console.log(`   Used by services: ${report.summary.usedByServices}`);
  console.log(`   ⚠️ Potentially orphaned: ${report.summary.orphaned}`);
  console.log(`   🔄 Duplicates: ${report.summary.duplicates}\n`);
  
  // Categories breakdown
  console.log('📂 BY RECOMMENDATION:');
  console.log(`   ✅ Keep as-is: ${report.byCategory['keep'].length}`);
  console.log(`   🔧 Consider voice-wiring: ${report.byCategory['wire'].length}`);
  console.log(`   🔍 Review needed: ${report.byCategory['review'].length}`);
  console.log(`   ❌ Deprecate candidates: ${report.byCategory['deprecate'].length}\n`);
  
  // High-value tools to wire
  if (report.byCategory['wire'].length > 0) {
    console.log('🔧 TOOLS TO CONSIDER VOICE-WIRING:');
    const byDomain = new Map<string, string[]>();
    for (const tool of report.byCategory['wire']) {
      const existing = byDomain.get(tool.domain) || [];
      existing.push(tool.id);
      byDomain.set(tool.domain, existing);
    }
    for (const [domain, tools] of byDomain) {
      console.log(`   ${domain}:`);
      for (const tool of tools.slice(0, 5)) {
        console.log(`      • ${tool}`);
      }
      if (tools.length > 5) {
        console.log(`      ... and ${tools.length - 5} more`);
      }
    }
    console.log();
  }
  
  // Duplicates
  if (report.duplicates.length > 0) {
    console.log('🔄 DUPLICATE TOOL IDs:');
    for (const dup of report.duplicates.slice(0, 10)) {
      console.log(`   • ${dup.toolId}: ${dup.domains.join(', ')}`);
    }
    if (report.duplicates.length > 10) {
      console.log(`   ... and ${report.duplicates.length - 10} more`);
    }
    console.log();
  }
  
  // Sample orphaned tools
  const orphaned = report.byCategory['review'].filter(t => t.isOrphaned);
  if (orphaned.length > 0) {
    console.log('⚠️ SAMPLE ORPHANED TOOLS (not used anywhere):');
    for (const tool of orphaned.slice(0, 15)) {
      console.log(`   • ${tool.domain}/${tool.id}`);
    }
    if (orphaned.length > 15) {
      console.log(`   ... and ${orphaned.length - 15} more`);
    }
    console.log();
  }
  
  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('💡 RECOMMENDATIONS:');
    for (const rec of report.recommendations) {
      console.log(`   → ${rec}`);
    }
    console.log();
  }
  
  console.log('='.repeat(70));
  console.log(`Report generated: ${report.timestamp}`);
  console.log('='.repeat(70) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    const report = await analyzeToolUsage();
    printReport(report);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

main();
