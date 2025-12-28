/**
 * Gemini E2E Test Report Generator
 *
 * Generates comprehensive insights about:
 * - Tool calling behavior and success rates
 * - System prompt compliance
 * - Response timing and rate limiting
 * - Recommendations for improvements
 *
 * @module tests/e2e/gemini-integration/report-generator
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'GeminiTestReport' });

// ============================================================================
// TYPES
// ============================================================================

export interface TestRunResult {
  scenarioId: string;
  category: string;
  passed: boolean;
  toolCalled?: string;
  expectedTool?: string;
  spokeInsteadOfCalling: boolean;
  responseLength: number;
  latencyMs: number;
  error?: string;
  antiPatternViolations: string[];
}

export interface CategorySummary {
  category: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgLatencyMs: number;
  toolCallSuccessRate: number;
  spokeInsteadOfCallingCount: number;
  commonFailures: string[];
}

export interface TestReport {
  timestamp: string;
  duration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
  categories: CategorySummary[];
  toolAnalysis: ToolAnalysis;
  promptAnalysis: PromptAnalysis;
  recommendations: string[];
  rawResults: TestRunResult[];
}

export interface ToolAnalysis {
  totalToolCalls: number;
  successfulToolCalls: number;
  spokeInsteadOfCalling: number;
  toolBreakdown: Record<
    string,
    {
      called: number;
      expected: number;
      successRate: number;
    }
  >;
  handoffAnalysis: {
    total: number;
    successful: number;
    mostMissed: string[];
  };
}

export interface PromptAnalysis {
  stageDirectionViolations: number;
  thinkingNarrationViolations: number;
  aiAdmissionViolations: number;
  avgResponseLength: number;
  tooLongResponses: number;
  tooShortResponses: number;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export class RateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly delayMs: number;

  constructor(
    options: {
      maxRequestsPerMinute?: number;
      minimumDelayMs?: number;
    } = {}
  ) {
    this.maxRequests = options.maxRequestsPerMinute || 8; // Conservative for gemini-2.0-flash-exp
    this.windowMs = 60 * 1000; // 1 minute window
    this.delayMs = options.minimumDelayMs || 8000; // 8 seconds between requests
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Clean up old requests outside the window
    this.requestTimes = this.requestTimes.filter((t) => now - t < this.windowMs);

    // If we're at the limit, wait until oldest request expires
    if (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 1000;
      log.info(
        { waitTime, queuedRequests: this.requestTimes.length },
        'Rate limit reached, waiting'
      );
      await this.sleep(waitTime);
    }

    // Always add minimum delay between requests
    const lastRequest = this.requestTimes[this.requestTimes.length - 1];
    if (lastRequest) {
      const timeSinceLast = now - lastRequest;
      if (timeSinceLast < this.delayMs) {
        const waitTime = this.delayMs - timeSinceLast;
        log.debug({ waitTime }, 'Adding delay between requests');
        await this.sleep(waitTime);
      }
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
  }

  getStatus(): { requestsInWindow: number; maxRequests: number; canProceed: boolean } {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter((t) => now - t < this.windowMs);
    return {
      requestsInWindow: this.requestTimes.length,
      maxRequests: this.maxRequests,
      canProceed: this.requestTimes.length < this.maxRequests,
    };
  }
}

// ============================================================================
// REPORT GENERATOR
// ============================================================================

export class ReportGenerator {
  private results: TestRunResult[] = [];
  private startTime = 0;

  startRun(): void {
    this.results = [];
    this.startTime = Date.now();
  }

  addResult(result: TestRunResult): void {
    this.results.push(result);
  }

  generateReport(): TestReport {
    const duration = Date.now() - this.startTime;

    const summary = this.generateSummary();
    const categories = this.generateCategorySummaries();
    const toolAnalysis = this.generateToolAnalysis();
    const promptAnalysis = this.generatePromptAnalysis();
    const recommendations = this.generateRecommendations(toolAnalysis, promptAnalysis, categories);

    return {
      timestamp: new Date().toISOString(),
      duration,
      summary,
      categories,
      toolAnalysis,
      promptAnalysis,
      recommendations,
      rawResults: this.results,
    };
  }

  private generateSummary() {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed && !r.error).length;
    const skipped = this.results.filter((r) => !!r.error).length;

    return {
      total: this.results.length,
      passed,
      failed,
      skipped,
      passRate: this.results.length > 0 ? (passed / this.results.length) * 100 : 0,
    };
  }

  private generateCategorySummaries(): CategorySummary[] {
    const categories = new Map<string, TestRunResult[]>();

    for (const result of this.results) {
      const cat = result.category || 'uncategorized';
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(result);
    }

    return Array.from(categories.entries()).map(([category, results]) => {
      const passed = results.filter((r) => r.passed).length;
      const toolCallTests = results.filter((r) => r.expectedTool);
      const toolCallSuccesses = toolCallTests.filter((r) => r.toolCalled === r.expectedTool).length;
      const spokeInsteadCount = results.filter((r) => r.spokeInsteadOfCalling).length;

      // Find common failures
      const failedTests = results.filter((r) => !r.passed);
      const failureReasons = failedTests.map((r) => {
        if (r.spokeInsteadOfCalling) return 'Spoke instead of calling tool';
        if (r.expectedTool && r.toolCalled !== r.expectedTool)
          return `Expected ${r.expectedTool}, got ${r.toolCalled || 'nothing'}`;
        if (r.antiPatternViolations.length > 0) return r.antiPatternViolations.join(', ');
        return 'Unknown';
      });

      const failureCounts = new Map<string, number>();
      for (const reason of failureReasons) {
        failureCounts.set(reason, (failureCounts.get(reason) || 0) + 1);
      }

      const commonFailures = Array.from(failureCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${reason} (${count}x)`);

      return {
        category,
        total: results.length,
        passed,
        failed: results.length - passed,
        passRate: results.length > 0 ? (passed / results.length) * 100 : 0,
        avgLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
        toolCallSuccessRate:
          toolCallTests.length > 0 ? (toolCallSuccesses / toolCallTests.length) * 100 : 100,
        spokeInsteadOfCallingCount: spokeInsteadCount,
        commonFailures,
      };
    });
  }

  private generateToolAnalysis(): ToolAnalysis {
    const toolResults = this.results.filter((r) => r.expectedTool);
    const toolBreakdown: ToolAnalysis['toolBreakdown'] = {};

    for (const result of toolResults) {
      const tool = result.expectedTool!;
      if (!toolBreakdown[tool]) {
        toolBreakdown[tool] = { called: 0, expected: 0, successRate: 0 };
      }
      toolBreakdown[tool].expected++;
      if (result.toolCalled === tool) {
        toolBreakdown[tool].called++;
      }
    }

    // Calculate success rates
    for (const tool of Object.keys(toolBreakdown)) {
      const data = toolBreakdown[tool];
      data.successRate = data.expected > 0 ? (data.called / data.expected) * 100 : 0;
    }

    // Handoff analysis
    const handoffTools = Object.keys(toolBreakdown).filter((t) => t.startsWith('handoff'));
    const handoffTotal = handoffTools.reduce((sum, t) => sum + toolBreakdown[t].expected, 0);
    const handoffSuccess = handoffTools.reduce((sum, t) => sum + toolBreakdown[t].called, 0);
    const mostMissed = handoffTools
      .filter((t) => toolBreakdown[t].successRate < 100)
      .sort((a, b) => toolBreakdown[a].successRate - toolBreakdown[b].successRate)
      .slice(0, 3);

    return {
      totalToolCalls: toolResults.length,
      successfulToolCalls: toolResults.filter((r) => r.toolCalled === r.expectedTool).length,
      spokeInsteadOfCalling: this.results.filter((r) => r.spokeInsteadOfCalling).length,
      toolBreakdown,
      handoffAnalysis: {
        total: handoffTotal,
        successful: handoffSuccess,
        mostMissed,
      },
    };
  }

  private generatePromptAnalysis(): PromptAnalysis {
    const stageDirectionPatterns = [/\*[^*]+\*/g, /\[[^\]]+\]/g, /\([^)]*sighs?[^)]*\)/gi];
    const thinkingPatterns = [
      /hmm.*let me think/i,
      /good question.*let me/i,
      /that's.*interesting/i,
    ];
    const aiPatterns = [/i'm an ai/i, /as an ai/i, /i'm a language model/i, /i'm programmed/i];

    let stageViolations = 0;
    let thinkingViolations = 0;
    let aiViolations = 0;
    let totalLength = 0;
    let tooLong = 0;
    let tooShort = 0;

    for (const result of this.results) {
      // We'd need the actual response text for this analysis
      // For now, use antiPatternViolations
      if (
        result.antiPatternViolations.some((v) => v.includes('asterisk') || v.includes('bracket'))
      ) {
        stageViolations++;
      }
      if (result.antiPatternViolations.some((v) => v.includes('thinking') || v.includes('hmm'))) {
        thinkingViolations++;
      }
      if (result.antiPatternViolations.some((v) => v.includes('AI') || v.includes('artificial'))) {
        aiViolations++;
      }

      totalLength += result.responseLength;
      if (result.responseLength > 500) tooLong++;
      if (result.responseLength < 10 && result.responseLength > 0) tooShort++;
    }

    return {
      stageDirectionViolations: stageViolations,
      thinkingNarrationViolations: thinkingViolations,
      aiAdmissionViolations: aiViolations,
      avgResponseLength: this.results.length > 0 ? totalLength / this.results.length : 0,
      tooLongResponses: tooLong,
      tooShortResponses: tooShort,
    };
  }

  private generateRecommendations(
    toolAnalysis: ToolAnalysis,
    promptAnalysis: PromptAnalysis,
    categories: CategorySummary[]
  ): string[] {
    const recommendations: string[] = [];

    // Tool calling recommendations
    if (toolAnalysis.spokeInsteadOfCalling > 0) {
      recommendations.push(
        `🔧 CRITICAL: Model spoke about tools ${toolAnalysis.spokeInsteadOfCalling} times instead of calling them. ` +
          `Add more explicit "CALL this tool, do NOT speak about it" in tool descriptions.`
      );
    }

    // Check individual tool success rates
    for (const [tool, data] of Object.entries(toolAnalysis.toolBreakdown)) {
      if (data.successRate < 70) {
        recommendations.push(
          `⚠️ Tool "${tool}" only called ${data.successRate.toFixed(0)}% of the time. ` +
            `Consider adding more trigger keywords to the tool description.`
        );
      }
    }

    // Handoff recommendations
    if (toolAnalysis.handoffAnalysis.mostMissed.length > 0) {
      recommendations.push(
        `🤝 Handoffs frequently missed: ${toolAnalysis.handoffAnalysis.mostMissed.join(', ')}. ` +
          `Add more specific trigger words (e.g., "wedding" for Jordan).`
      );
    }

    // Prompt compliance recommendations
    if (promptAnalysis.stageDirectionViolations > 0) {
      recommendations.push(
        `📝 Stage directions still appearing (${promptAnalysis.stageDirectionViolations}x). ` +
          `Strengthen the "NEVER use asterisks" section in system prompt.`
      );
    }

    if (promptAnalysis.thinkingNarrationViolations > 0) {
      recommendations.push(
        `💭 Thinking narration detected (${promptAnalysis.thinkingNarrationViolations}x). ` +
          `Add more examples of what NOT to say in the "SOUNDING REAL" section.`
      );
    }

    // Category-specific recommendations
    for (const cat of categories) {
      if (cat.passRate < 70) {
        recommendations.push(
          `📊 Category "${cat.category}" has ${cat.passRate.toFixed(0)}% pass rate. ` +
            `Common failures: ${cat.commonFailures.join('; ')}`
        );
      }
    }

    // Response length recommendations
    if (promptAnalysis.tooLongResponses > this.results.length * 0.2) {
      recommendations.push(
        `📏 ${promptAnalysis.tooLongResponses} responses were too long (>500 chars). ` +
          `Consider adding guidance about response brevity.`
      );
    }

    return recommendations;
  }

  formatReport(report: TestReport): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    GEMINI E2E TEST REPORT                      ');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`📅 Timestamp: ${report.timestamp}`);
    lines.push(`⏱️  Duration: ${(report.duration / 1000).toFixed(1)}s`);
    lines.push('');

    // Summary
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                        SUMMARY                               │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    const statusIcon =
      report.summary.passRate >= 80 ? '✅' : report.summary.passRate >= 50 ? '⚠️' : '❌';
    lines.push(
      `│  ${statusIcon} Pass Rate: ${report.summary.passRate.toFixed(1)}%                                      │`
    );
    lines.push(
      `│  Total: ${report.summary.total} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Skipped: ${report.summary.skipped}    │`
    );
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Tool Analysis
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                    TOOL ANALYSIS                             │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(
      `│  Tool Calls: ${report.toolAnalysis.successfulToolCalls}/${report.toolAnalysis.totalToolCalls} successful`
    );
    lines.push(`│  Spoke Instead of Calling: ${report.toolAnalysis.spokeInsteadOfCalling}`);
    lines.push('│');
    lines.push('│  Tool Breakdown:');
    for (const [tool, data] of Object.entries(report.toolAnalysis.toolBreakdown)) {
      const icon = data.successRate >= 80 ? '✅' : data.successRate >= 50 ? '⚠️' : '❌';
      lines.push(
        `│    ${icon} ${tool}: ${data.called}/${data.expected} (${data.successRate.toFixed(0)}%)`
      );
    }
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Category Results
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                  CATEGORY RESULTS                            │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    for (const cat of report.categories) {
      const icon = cat.passRate >= 80 ? '✅' : cat.passRate >= 50 ? '⚠️' : '❌';
      lines.push(
        `│  ${icon} ${cat.category.padEnd(25)} ${cat.passed}/${cat.total} (${cat.passRate.toFixed(0)}%)`
      );
      if (cat.commonFailures.length > 0) {
        lines.push(`│     └─ Issues: ${cat.commonFailures[0]}`);
      }
    }
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('┌─────────────────────────────────────────────────────────────┐');
      lines.push('│                  RECOMMENDATIONS                             │');
      lines.push('├─────────────────────────────────────────────────────────────┤');
      for (const rec of report.recommendations) {
        // Wrap long lines
        const wrapped = this.wrapText(rec, 55);
        for (const line of wrapped) {
          lines.push(`│  ${line}`);
        }
        lines.push('│');
      }
      lines.push('└─────────────────────────────────────────────────────────────┘');
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }
}

// ============================================================================
// TOOL INVENTORY ANALYZER
// ============================================================================

export interface ToolInventory {
  personaId: string;
  totalTools: number;
  categories: Record<string, string[]>;
  handoffs: string[];
  duplicates: string[];
  systemPromptSize: number;
  estimatedTokens: number;
}

export async function analyzeToolInventory(personaId: string): Promise<ToolInventory> {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Load the persona's agent file to analyze tools
  const agentFiles: Record<string, string> = {
    ferni: 'ferni-agent.ts',
    'maya-santos': 'maya-agent.ts',
    'alex-chen': 'alex-agent.ts',
    'peter-john': 'peter-agent.ts',
    'jordan-taylor': 'jordan-agent.ts',
    'nayan-patel': 'nayan-agent.ts',
  };

  const fileName = agentFiles[personaId] || 'ferni-agent.ts';
  const agentPath = path.join(process.cwd(), 'src/agents/personas', fileName);

  let agentCode = '';
  try {
    agentCode = await fs.readFile(agentPath, 'utf-8');
  } catch {
    log.warn({ personaId }, 'Could not read agent file');
  }

  // Extract tool names from the agent code
  const toolMatches = agentCode.match(/(\w+):\s*(llm\.tool|[\w]+Tools\.\w+)/g) || [];
  const tools = toolMatches.map((m) => m.split(':')[0].trim());

  // Categorize tools
  const categories: Record<string, string[]> = {
    memory: tools.filter(
      (t) => t.includes('memory') || t.includes('recall') || t.includes('remember')
    ),
    music: tools.filter((t) => t.includes('Music') || t.includes('music')),
    information: tools.filter(
      (t) => t.includes('Weather') || t.includes('News') || t.includes('search')
    ),
    handoff: tools.filter((t) => t.startsWith('handoff')),
    other: [],
  };

  // Find uncategorized
  const categorized = new Set(Object.values(categories).flat());
  categories.other = tools.filter((t) => !categorized.has(t));

  // Load system prompt size
  const promptPath = path.join(
    process.cwd(),
    'src/personas/bundles',
    personaId,
    'identity',
    'system-prompt.md'
  );
  let promptSize = 0;
  try {
    const prompt = await fs.readFile(promptPath, 'utf-8');
    promptSize = prompt.length;
  } catch {
    log.warn({ personaId }, 'Could not read system prompt');
  }

  return {
    personaId,
    totalTools: tools.length,
    categories,
    handoffs: categories.handoff,
    duplicates: [], // Would need more sophisticated analysis
    systemPromptSize: promptSize,
    estimatedTokens: Math.round(promptSize / 4),
  };
}

export function formatToolInventory(inventory: ToolInventory): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`📦 TOOL INVENTORY: ${inventory.personaId.toUpperCase()}`);
  lines.push('─'.repeat(50));
  lines.push(`Total Tools: ${inventory.totalTools}`);
  lines.push(
    `System Prompt: ${inventory.systemPromptSize} chars (~${inventory.estimatedTokens} tokens)`
  );
  lines.push('');
  lines.push('Categories:');
  for (const [cat, tools] of Object.entries(inventory.categories)) {
    if (tools.length > 0) {
      lines.push(`  ${cat}: ${tools.length} tools`);
      tools.forEach((t) => lines.push(`    - ${t}`));
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const rateLimiter = new RateLimiter();
export const reportGenerator = new ReportGenerator();

export default {
  RateLimiter,
  ReportGenerator,
  analyzeToolInventory,
  formatToolInventory,
  rateLimiter,
  reportGenerator,
};
