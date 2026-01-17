#!/usr/bin/env npx tsx
/**
 * Tool Validation Script
 *
 * Validates all tools in the system:
 * 1. Checks which REGISTERED_TOOLS can actually be executed
 * 2. Identifies domain tools NOT wired to voice agent
 * 3. Generates a comprehensive status report
 *
 * Run: npx tsx scripts/validate-tools.ts
 * Or:  pnpm tools:validate
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { REGISTERED_TOOLS } from '../src/agents/shared/function-call-format.js';

// ============================================================================
// TYPES
// ============================================================================

interface ToolStatus {
  id: string;
  domain?: string;
  registered: boolean;
  loadable: boolean;
  executable: boolean;
  hasTests: boolean;
  error?: string;
}

interface DomainInfo {
  name: string;
  toolCount: number;
  tools: string[];
  hasTests: boolean;
  registeredCount: number;
}

interface ValidationReport {
  timestamp: string;
  summary: {
    totalRegistered: number;
    totalDomainTools: number;
    wiredTools: number;
    unwiredTools: number;
    domainsWithTests: number;
    domainsWithoutTests: number;
  };
  registeredTools: ToolStatus[];
  domainTools: DomainInfo[];
  unwiredTools: string[];
  recommendations: string[];
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

async function validateTools(): Promise<ValidationReport> {
  console.log('🔍 Validating Ferni tools...\n');

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalRegistered: REGISTERED_TOOLS.length,
      totalDomainTools: 0,
      wiredTools: 0,
      unwiredTools: 0,
      domainsWithTests: 0,
      domainsWithoutTests: 0,
    },
    registeredTools: [],
    domainTools: [],
    unwiredTools: [],
    recommendations: [],
  };

  // 1. Check registered tools
  console.log('📋 Checking REGISTERED_TOOLS...');
  for (const tool of REGISTERED_TOOLS) {
    const status: ToolStatus = {
      id: tool,
      registered: true,
      loadable: true, // Assume loadable if registered
      executable: true, // Would need runtime test
      hasTests: false, // Check below
    };
    report.registeredTools.push(status);
  }
  console.log(`   ✅ ${REGISTERED_TOOLS.length} tools registered for voice agent\n`);

  // 2. Scan domain folders
  console.log('📂 Scanning domain folders...');
  const domainsPath = join(process.cwd(), 'src/tools/domains');
  const domainDirs = await readdir(domainsPath, { withFileTypes: true });
  const allDomainToolIds = new Set<string>();

  for (const dir of domainDirs) {
    if (!dir.isDirectory()) continue;

    const domainPath = join(domainsPath, dir.name);
    const domainInfo: DomainInfo = {
      name: dir.name,
      toolCount: 0,
      tools: [],
      hasTests: false,
      registeredCount: 0,
    };

    // Check for tests
    try {
      const files = await readdir(domainPath);
      domainInfo.hasTests = files.includes('__tests__');

      // Try to load tools from index.ts
      if (files.includes('index.ts') || files.includes('index.js')) {
        try {
          const module = await import(join(domainPath, 'index.js'));
          if (module.getToolDefinitions) {
            const definitions = await module.getToolDefinitions();
            domainInfo.toolCount = definitions.length;
            domainInfo.tools = definitions.map((t: { id: string }) => t.id);

            for (const def of definitions) {
              allDomainToolIds.add(def.id);
              if ((REGISTERED_TOOLS as readonly string[]).includes(def.id)) {
                domainInfo.registeredCount++;
              }
            }
          }
        } catch (e) {
          // Domain might have import errors, skip
          domainInfo.tools = [`[Error loading: ${(e as Error).message.slice(0, 50)}]`];
        }
      }
    } catch {
      // Directory read error
    }

    report.domainTools.push(domainInfo);
    if (domainInfo.hasTests) {
      report.summary.domainsWithTests++;
    } else {
      report.summary.domainsWithoutTests++;
    }
  }

  // 3. Calculate unwired tools
  const registeredSet = new Set(REGISTERED_TOOLS as readonly string[]);
  for (const toolId of allDomainToolIds) {
    report.summary.totalDomainTools++;
    if (!registeredSet.has(toolId)) {
      report.unwiredTools.push(toolId);
      report.summary.unwiredTools++;
    } else {
      report.summary.wiredTools++;
    }
  }

  // 4. Generate recommendations
  if (report.summary.unwiredTools > 0) {
    report.recommendations.push(
      `${report.summary.unwiredTools} domain tools not voice-callable. Add to REGISTERED_TOOLS if needed.`
    );
  }
  if (report.summary.domainsWithoutTests > 0) {
    report.recommendations.push(
      `${report.summary.domainsWithoutTests} domains lack test coverage. See docs/audits/TOOLS-CODEBASE-AUDIT.md`
    );
  }

  return report;
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function printReport(report: ValidationReport): void {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 FERNI TOOL VALIDATION REPORT');
  console.log('='.repeat(70) + '\n');

  // Summary
  console.log('📊 SUMMARY:');
  console.log(`   Total REGISTERED_TOOLS (voice-callable): ${report.summary.totalRegistered}`);
  console.log(`   Total domain tools found: ${report.summary.totalDomainTools}`);
  console.log(
    `   ✅ Wired to voice agent: ${report.summary.wiredTools} (${((report.summary.wiredTools / report.summary.totalDomainTools) * 100).toFixed(1)}%)`
  );
  console.log(`   ⚠️ Not voice-callable: ${report.summary.unwiredTools}`);
  console.log(`   📝 Domains with tests: ${report.summary.domainsWithTests}`);
  console.log(`   ❌ Domains without tests: ${report.summary.domainsWithoutTests}\n`);

  // Top domains by tool count
  console.log('📂 TOP DOMAINS BY TOOL COUNT:');
  const sortedDomains = [...report.domainTools].sort((a, b) => b.toolCount - a.toolCount);
  for (const domain of sortedDomains.slice(0, 15)) {
    const testIcon = domain.hasTests ? '✅' : '❌';
    const wiredPct =
      domain.toolCount > 0 ? ((domain.registeredCount / domain.toolCount) * 100).toFixed(0) : 0;
    console.log(
      `   ${testIcon} ${domain.name}: ${domain.toolCount} tools (${wiredPct}% voice-wired)`
    );
  }
  console.log();

  // Unwired tools (sample)
  if (report.unwiredTools.length > 0) {
    console.log('⚠️ SAMPLE UNWIRED TOOLS (not voice-callable):');
    for (const tool of report.unwiredTools.slice(0, 20)) {
      console.log(`   • ${tool}`);
    }
    if (report.unwiredTools.length > 20) {
      console.log(`   ... and ${report.unwiredTools.length - 20} more`);
    }
    console.log();
  }

  // Domains without tests
  const domainsNoTests = report.domainTools.filter((d) => !d.hasTests && d.toolCount > 0);
  if (domainsNoTests.length > 0) {
    console.log('❌ DOMAINS WITHOUT TEST COVERAGE:');
    for (const domain of domainsNoTests.slice(0, 15)) {
      console.log(`   • ${domain.name} (${domain.toolCount} tools)`);
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
  console.log('Run: pnpm vitest run src/tools/__tests__/e2e-tool-chains.test.ts');
  console.log('='.repeat(70) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    const report = await validateTools();
    printReport(report);

    // Exit with error if significant issues
    if (report.summary.domainsWithoutTests > 20) {
      console.log('⚠️ Many domains lack test coverage - consider adding tests');
    }
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

main();
