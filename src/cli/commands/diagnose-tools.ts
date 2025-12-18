#!/usr/bin/env node
/**
 * Tool Diagnosis CLI
 *
 * Compares tool definitions between test harness and production agents.
 * Identifies discrepancies that could cause tools to not work correctly.
 *
 * Usage:
 *   npx tsx src/cli/commands/diagnose-tools.ts
 *   npx tsx src/cli/commands/diagnose-tools.ts --agent ferni
 *   npx tsx src/cli/commands/diagnose-tools.ts --diff
 *
 * @module cli/commands/diagnose-tools
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DiagnoseTools' });

// ============================================================================
// COLORS
// ============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

// ============================================================================
// EXTRACT PRODUCTION TOOLS
// ============================================================================

interface ToolInfo {
  name: string;
  description: string;
  parameters: string[];
  source: string;
}

async function extractProductionTools(agentId: string): Promise<ToolInfo[]> {
  const tools: ToolInfo[] = [];

  if (agentId === 'ferni') {
    try {
      // Music tools
      const { createMusicTools } = await import('../../tools/music.js');
      const musicTools = createMusicTools();

      for (const [name, tool] of Object.entries(musicTools)) {
        const t = tool as {
          description?: string;
          parameters?: { _def?: { shape?: () => unknown } };
        };
        const params = t.parameters?._def?.shape?.();
        tools.push({
          name,
          description: t.description?.slice(0, 100) || 'No description',
          parameters: params ? Object.keys(params) : [],
          source: 'music.ts',
        });
      }
    } catch (err) {
      console.log(`${c.yellow}⚠${c.reset} Could not load music tools: ${err}`);
    }

    try {
      // Memory tools
      const { rememberAboutUserDef, recallFromMemoryDef } =
        await import('../../tools/domains/memory/tools.js');

      tools.push({
        name: 'rememberAboutUser',
        description: rememberAboutUserDef.description.slice(0, 100),
        parameters: Object.keys(
          (rememberAboutUserDef as { parameters?: { shape?: object } }).parameters?.shape || {}
        ),
        source: 'domains/memory/tools.ts',
      });

      tools.push({
        name: 'recallFromMemory',
        description: recallFromMemoryDef.description.slice(0, 100),
        parameters: Object.keys(
          (recallFromMemoryDef as { parameters?: { shape?: object } }).parameters?.shape || {}
        ),
        source: 'domains/memory/tools.ts',
      });
    } catch (err) {
      console.log(`${c.yellow}⚠${c.reset} Could not load memory tools: ${err}`);
    }

    // Add handoff tools (these are inline in ferni-agent.ts)
    const handoffTools = [
      { name: 'handoffToMaya', description: 'Transfer to Maya for habits, budgeting...' },
      { name: 'handoffToAlex', description: 'Transfer to Alex for calendar, email...' },
      { name: 'handoffToPeter', description: 'Transfer to Peter for stocks, investments...' },
      { name: 'handoffToJordan', description: 'Transfer to Jordan for wedding, celebrations...' },
      { name: 'handoffToNayan', description: 'Transfer to Nayan for wisdom, philosophy...' },
    ];

    for (const h of handoffTools) {
      tools.push({
        name: h.name,
        description: h.description,
        parameters: [],
        source: 'ferni-agent.ts',
      });
    }
  }

  return tools;
}

// ============================================================================
// CHECK TOOL AVAILABILITY
// ============================================================================

interface DiagnosticResult {
  agentId: string;
  toolCount: number;
  tools: ToolInfo[];
  issues: string[];
  recommendations: string[];
}

async function diagnoseAgent(agentId: string): Promise<DiagnosticResult> {
  console.log(`\n${c.cyan}🔍 Diagnosing ${agentId} tools...${c.reset}\n`);

  const tools = await extractProductionTools(agentId);
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for music-related issues
  const musicTools = tools.filter(
    (t) =>
      t.name.toLowerCase().includes('music') ||
      t.name.toLowerCase().includes('play') ||
      t.name.toLowerCase().includes('spotify')
  );

  if (musicTools.length === 0) {
    issues.push('No music tools found - MUSIC_ENABLED may be false');
    recommendations.push('Set MUSIC_ENABLED=true in environment');
  } else {
    console.log(`${c.green}✓${c.reset} Found ${musicTools.length} music tools`);
    for (const t of musicTools) {
      console.log(`  ${c.dim}•${c.reset} ${t.name}`);
    }
  }

  // Check for handoff tools
  const handoffTools = tools.filter((t) => t.name.startsWith('handoff'));
  if (handoffTools.length < 5) {
    issues.push(`Only ${handoffTools.length}/5 handoff tools found`);
    recommendations.push('Check FerniAgent buildHandoffTools()');
  } else {
    console.log(`${c.green}✓${c.reset} Found all ${handoffTools.length} handoff tools`);
  }

  // Check tool descriptions for "ACT DON'T ANNOUNCE" pattern
  const missingImmediate = handoffTools.filter(
    (t) => !t.description.toLowerCase().includes('immediately')
  );
  if (missingImmediate.length > 0) {
    issues.push(`${missingImmediate.length} handoff tools missing IMMEDIATELY keyword`);
    recommendations.push('Update tool descriptions to include "IMMEDIATELY transfer"');
  }

  // Check for parameter mismatches
  const playMusicTool = tools.find((t) => t.name === 'playMusic');
  if (playMusicTool && !playMusicTool.parameters.includes('query')) {
    issues.push('playMusic tool missing "query" parameter');
    recommendations.push('Check createMusicTools() parameter definitions');
  }

  return {
    agentId,
    toolCount: tools.length,
    tools,
    issues,
    recommendations,
  };
}

// ============================================================================
// COMPARE TEST VS PRODUCTION
// ============================================================================

function compareTestVsProduction(production: ToolInfo[]): void {
  console.log(`\n${c.cyan}📊 Test vs Production Comparison${c.reset}\n`);
  console.log('─'.repeat(60));

  // Test harness tool names
  const testToolNames = [
    'playMusic',
    'pauseMusic',
    'stopMusic',
    'whatsPlaying',
    'rememberAboutUser',
    'recallFromMemory',
    'getWeather',
    'searchWeb',
    'handoffToMaya',
    'handoffToAlex',
    'handoffToPeter',
    'handoffToJordan',
    'handoffToNayan',
  ];

  const productionNames = production.map((t) => t.name);

  // Tools in test but not production
  const testOnly = testToolNames.filter((t) => !productionNames.includes(t));
  if (testOnly.length > 0) {
    console.log(`${c.yellow}⚠ In TEST but not PRODUCTION:${c.reset}`);
    for (const t of testOnly) {
      console.log(`  ${c.red}✗${c.reset} ${t}`);
    }
  }

  // Tools in production but not test
  const prodOnly = productionNames.filter((t) => !testToolNames.includes(t));
  if (prodOnly.length > 0) {
    console.log(`\n${c.yellow}⚠ In PRODUCTION but not TEST:${c.reset}`);
    for (const t of prodOnly) {
      console.log(`  ${c.yellow}+${c.reset} ${t}`);
    }
    console.log(`${c.dim}  Consider adding these to test harness${c.reset}`);
  }

  // Matching tools
  const matching = testToolNames.filter((t) => productionNames.includes(t));
  console.log(`\n${c.green}✓ ${matching.length} tools match between test and production${c.reset}`);
}

// ============================================================================
// CHECK ENVIRONMENT
// ============================================================================

function checkEnvironment(): void {
  console.log(`\n${c.cyan}🔐 Environment Check${c.reset}\n`);
  console.log('─'.repeat(60));

  const checks = [
    { key: 'MUSIC_ENABLED', expected: 'true', critical: true },
    { key: 'GOOGLE_API_KEY', expected: 'set', critical: true },
    { key: 'SPOTIFY_CLIENT_ID', expected: 'set', critical: false },
    { key: 'SPOTIFY_CLIENT_SECRET', expected: 'set', critical: false },
  ];

  for (const check of checks) {
    const value = process.env[check.key];
    const isSet = !!value;
    const icon = check.critical
      ? isSet
        ? `${c.green}✓${c.reset}`
        : `${c.red}✗${c.reset}`
      : isSet
        ? `${c.green}✓${c.reset}`
        : `${c.dim}○${c.reset}`;

    const status = isSet
      ? check.expected === 'true' && value !== 'true'
        ? `${c.yellow}(=${value})${c.reset}`
        : ''
      : check.critical
        ? `${c.red}MISSING${c.reset}`
        : `${c.dim}not set${c.reset}`;

    console.log(`${icon} ${check.key} ${status}`);

    if (check.key === 'MUSIC_ENABLED' && value !== 'true') {
      console.log(`  ${c.yellow}→ Music tools will be disabled!${c.reset}`);
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`\n${c.bold}🩺 Ferni Tool Diagnostics${c.reset}`);
  console.log('═'.repeat(60));

  // Check environment first
  checkEnvironment();

  // Diagnose Ferni agent
  const diagnosis = await diagnoseAgent('ferni');

  // Show tool inventory
  console.log(`\n${c.cyan}📦 Tool Inventory (${diagnosis.toolCount} tools)${c.reset}\n`);
  console.log('─'.repeat(60));

  const bySource = new Map<string, ToolInfo[]>();
  for (const tool of diagnosis.tools) {
    const existing = bySource.get(tool.source) || [];
    existing.push(tool);
    bySource.set(tool.source, existing);
  }

  for (const [source, tools] of bySource) {
    console.log(`\n${c.bold}${source}${c.reset}`);
    for (const t of tools) {
      const params = t.parameters.length > 0 ? `(${t.parameters.join(', ')})` : '()';
      console.log(`  ${c.dim}•${c.reset} ${t.name}${c.dim}${params}${c.reset}`);
    }
  }

  // Compare test vs production
  compareTestVsProduction(diagnosis.tools);

  // Issues and recommendations
  if (diagnosis.issues.length > 0) {
    console.log(`\n${c.red}🚨 Issues Found (${diagnosis.issues.length})${c.reset}\n`);
    for (const issue of diagnosis.issues) {
      console.log(`  ${c.red}✗${c.reset} ${issue}`);
    }

    console.log(`\n${c.yellow}📋 Recommendations:${c.reset}`);
    for (const rec of diagnosis.recommendations) {
      console.log(`  ${c.yellow}→${c.reset} ${rec}`);
    }
  } else {
    console.log(`\n${c.green}✅ No critical issues found${c.reset}`);
  }

  console.log('\n');
}

main().catch(console.error);
