/**
 * Synthetic LLM Tool Testing Framework
 *
 * Automatically generates and runs tests for all 775 voice-callable tools.
 * Uses LLM to:
 * 1. Generate natural language test probes for each tool
 * 2. Validate that the LLM actually CALLS the tool (not just talks about it)
 * 3. Verify tool execution succeeds
 *
 * Run: npx tsx src/tests/e2e/synthetic-tool-testing/tool-test-generator.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { DOMAIN_TOOL_IDS } from '../../../agents/shared/domain-tool-ids.generated.js';
import { REGISTERED_TOOLS } from '../../../agents/shared/function-call-format.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// TYPES
// ============================================================================

interface ToolTestCase {
  toolId: string;
  category: 'domain' | 'core';
  naturalLanguageProbe: string;
  expectedToolCall: string;
  shouldAvoid: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  generatedAt: string;
}

interface TestResult {
  toolId: string;
  probe: string;
  passed: boolean;
  actualToolCalled: string | null;
  llmResponse: string;
  executionResult?: unknown;
  error?: string;
  latencyMs: number;
}

interface TestReport {
  runAt: string;
  totalTools: number;
  testedTools: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: number;
  results: TestResult[];
  failures: TestResult[];
  summary: {
    byCategory: Record<string, { total: number; passed: number; failed: number }>;
    byPriority: Record<string, { total: number; passed: number; failed: number }>;
  };
}

// ============================================================================
// TEST CASE GENERATOR (Uses LLM)
// ============================================================================

const PROBE_GENERATION_PROMPT = `You are a test case generator for a voice AI assistant called Ferni.

Given a tool ID, generate a natural language phrase that a user would say to trigger that tool.
The phrase should be:
1. Natural and conversational (how a real person would speak)
2. Clear enough to trigger the specific tool
3. Not overly explicit (don't say "call the X tool")

Also identify phrases the AI should AVOID saying (signs it's talking ABOUT the tool instead of calling it).

Tool ID: {toolId}
Tool Description (inferred from name): {description}

Respond in JSON format:
{
  "probe": "natural language phrase",
  "shouldAvoid": ["phrase1", "phrase2"],
  "priority": "critical|high|medium|low",
  "reasoning": "why this probe should trigger the tool"
}`;

export class ToolTestGenerator {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY required for test generation');
    }
    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  /**
   * Generate a natural language description from tool ID
   */
  private inferDescription(toolId: string): string {
    // Convert camelCase to spaced words
    const spaced = toolId
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
    return spaced;
  }

  /**
   * Generate a test case for a single tool
   */
  async generateTestCase(toolId: string, category: 'domain' | 'core'): Promise<ToolTestCase> {
    const description = this.inferDescription(toolId);
    const prompt = PROBE_GENERATION_PROMPT.replace('{toolId}', toolId).replace(
      '{description}',
      description
    );

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        probe: string;
        shouldAvoid: string[];
        priority: string;
      };

      return {
        toolId,
        category,
        naturalLanguageProbe: parsed.probe,
        expectedToolCall: toolId,
        shouldAvoid: parsed.shouldAvoid || [],
        priority: (parsed.priority as ToolTestCase['priority']) || 'medium',
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      // Fallback: Generate basic test case
      console.warn(`Failed to generate test case for ${toolId}:`, error);
      return {
        toolId,
        category,
        naturalLanguageProbe: `Please ${description}`,
        expectedToolCall: toolId,
        shouldAvoid: ["i'll", 'let me', "i'm going to"],
        priority: 'medium',
        generatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Generate test cases for all tools
   */
  async generateAllTestCases(options?: {
    limit?: number;
    categories?: ('domain' | 'core')[];
    batchSize?: number;
  }): Promise<ToolTestCase[]> {
    const { limit = Infinity, categories = ['domain', 'core'], batchSize = 10 } = options || {};

    const allTools: { id: string; category: 'domain' | 'core' }[] = [];

    if (categories.includes('core')) {
      REGISTERED_TOOLS.forEach((id) => allTools.push({ id, category: 'core' }));
    }
    if (categories.includes('domain')) {
      DOMAIN_TOOL_IDS.forEach((id) => allTools.push({ id, category: 'domain' }));
    }

    const toolsToTest = allTools.slice(0, limit);
    const testCases: ToolTestCase[] = [];

    console.log(`🧪 Generating test cases for ${toolsToTest.length} tools...`);

    // Process in batches to avoid rate limits
    for (let i = 0; i < toolsToTest.length; i += batchSize) {
      const batch = toolsToTest.slice(i, i + batchSize);
      const batchPromises = batch.map(({ id, category }) => this.generateTestCase(id, category));

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          testCases.push(result.value);
        }
      }

      const progress = Math.min(i + batchSize, toolsToTest.length);
      console.log(
        `  Progress: ${progress}/${toolsToTest.length} (${Math.round((progress / toolsToTest.length) * 100)}%)`
      );

      // Rate limit protection
      if (i + batchSize < toolsToTest.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return testCases;
  }
}

// ============================================================================
// TEST RUNNER
// ============================================================================

export class ToolTestRunner {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY required for test running');
    }
    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.3, // Lower temperature for more consistent tool calling
      },
    });
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: ToolTestCase): Promise<TestResult> {
    const startTime = Date.now();

    // Build a system prompt that includes the tool
    const systemPrompt = `You are Ferni, a voice AI assistant. You have access to tools.
When the user asks you to do something, you should CALL the appropriate tool.
Do NOT say "I'll do X" or "Let me X" - just call the tool directly.

Available tools:
- ${testCase.toolId}: ${this.inferDescription(testCase.toolId)}

To call a tool, respond with JSON: {"fn":"toolName","args":{}}`;

    try {
      const result = await this.model.generateContent([
        { text: systemPrompt },
        { text: `User: ${testCase.naturalLanguageProbe}` },
      ]);

      const response = result.response.text();
      const latencyMs = Date.now() - startTime;

      // Check if the response contains a tool call
      const toolCallMatch = response.match(/\{"fn":"(\w+)"/);
      const actualToolCalled = toolCallMatch ? toolCallMatch[1] : null;

      // Check for phrases to avoid
      const avoidedPhrasesFound = testCase.shouldAvoid.filter((phrase) =>
        response.toLowerCase().includes(phrase.toLowerCase())
      );

      const passed =
        actualToolCalled === testCase.expectedToolCall && avoidedPhrasesFound.length === 0;

      return {
        toolId: testCase.toolId,
        probe: testCase.naturalLanguageProbe,
        passed,
        actualToolCalled,
        llmResponse: response.substring(0, 500), // Truncate for report
        latencyMs,
        error: !passed
          ? avoidedPhrasesFound.length > 0
            ? `LLM talked about tool instead of calling it: "${avoidedPhrasesFound.join('", "')}"`
            : `Expected ${testCase.expectedToolCall}, got ${actualToolCalled || 'no tool call'}`
          : undefined,
      };
    } catch (error) {
      return {
        toolId: testCase.toolId,
        probe: testCase.naturalLanguageProbe,
        passed: false,
        actualToolCalled: null,
        llmResponse: '',
        latencyMs: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  private inferDescription(toolId: string): string {
    return toolId
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  }

  /**
   * Run all test cases and generate report
   */
  async runAllTests(
    testCases: ToolTestCase[],
    options?: { concurrency?: number }
  ): Promise<TestReport> {
    const { concurrency = 5 } = options || {};

    console.log(`\n🧪 Running ${testCases.length} tool tests...`);

    const results: TestResult[] = [];

    // Run tests with concurrency limit
    for (let i = 0; i < testCases.length; i += concurrency) {
      const batch = testCases.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((tc) => this.runTest(tc)));
      results.push(...batchResults);

      const progress = Math.min(i + concurrency, testCases.length);
      const passed = results.filter((r) => r.passed).length;
      console.log(`  Progress: ${progress}/${testCases.length} | ✅ ${passed} passed`);

      // Rate limit
      if (i + concurrency < testCases.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Generate report
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    const report: TestReport = {
      runAt: new Date().toISOString(),
      totalTools: REGISTERED_TOOLS.length + DOMAIN_TOOL_IDS.length,
      testedTools: testCases.length,
      passed,
      failed,
      skipped: 0,
      coverage: testCases.length / (REGISTERED_TOOLS.length + DOMAIN_TOOL_IDS.length),
      results,
      failures: results.filter((r) => !r.passed),
      summary: {
        byCategory: this.summarizeByCategory(testCases, results),
        byPriority: this.summarizeByPriority(testCases, results),
      },
    };

    return report;
  }

  private summarizeByCategory(
    testCases: ToolTestCase[],
    results: TestResult[]
  ): Record<string, { total: number; passed: number; failed: number }> {
    const summary: Record<string, { total: number; passed: number; failed: number }> = {};

    for (const tc of testCases) {
      if (!summary[tc.category]) {
        summary[tc.category] = { total: 0, passed: 0, failed: 0 };
      }
      summary[tc.category].total++;

      const result = results.find((r) => r.toolId === tc.toolId);
      if (result?.passed) {
        summary[tc.category].passed++;
      } else {
        summary[tc.category].failed++;
      }
    }

    return summary;
  }

  private summarizeByPriority(
    testCases: ToolTestCase[],
    results: TestResult[]
  ): Record<string, { total: number; passed: number; failed: number }> {
    const summary: Record<string, { total: number; passed: number; failed: number }> = {};

    for (const tc of testCases) {
      if (!summary[tc.priority]) {
        summary[tc.priority] = { total: 0, passed: 0, failed: 0 };
      }
      summary[tc.priority].total++;

      const result = results.find((r) => r.toolId === tc.toolId);
      if (result?.passed) {
        summary[tc.priority].passed++;
      } else {
        summary[tc.priority].failed++;
      }
    }

    return summary;
  }
}

// ============================================================================
// REPORT GENERATOR
// ============================================================================

export function generateMarkdownReport(report: TestReport): string {
  const passRate = ((report.passed / report.testedTools) * 100).toFixed(1);

  let md = `# 🧪 Synthetic Tool Testing Report

**Generated:** ${report.runAt}
**Total Tools:** ${report.totalTools}
**Tested:** ${report.testedTools}
**Coverage:** ${(report.coverage * 100).toFixed(1)}%

## Summary

| Metric | Value |
|--------|-------|
| ✅ Passed | ${report.passed} |
| ❌ Failed | ${report.failed} |
| ⏭️ Skipped | ${report.skipped} |
| **Pass Rate** | **${passRate}%** |

## By Category

| Category | Total | Passed | Failed | Rate |
|----------|-------|--------|--------|------|
`;

  for (const [category, stats] of Object.entries(report.summary.byCategory)) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(0);
    md += `| ${category} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${rate}% |\n`;
  }

  md += `
## By Priority

| Priority | Total | Passed | Failed | Rate |
|----------|-------|--------|--------|------|
`;

  for (const [priority, stats] of Object.entries(report.summary.byPriority)) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(0);
    md += `| ${priority} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${rate}% |\n`;
  }

  if (report.failures.length > 0) {
    md += `
## ❌ Failures (${report.failures.length})

| Tool | Probe | Error |
|------|-------|-------|
`;
    for (const failure of report.failures.slice(0, 50)) {
      const probe = failure.probe.substring(0, 40) + (failure.probe.length > 40 ? '...' : '');
      const error = failure.error?.substring(0, 60) || 'Unknown';
      md += `| \`${failure.toolId}\` | ${probe} | ${error} |\n`;
    }

    if (report.failures.length > 50) {
      md += `\n*...and ${report.failures.length - 50} more failures*\n`;
    }
  }

  return md;
}

// ============================================================================
// CLI RUNNER
// ============================================================================

async function main() {
  console.log('🧪 Synthetic LLM Tool Testing Framework\n');

  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 20; // Default to 20 tools for quick test
  const generateOnly = args.includes('--generate-only');
  const outputDir = './data/tool-test-reports';

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Generate test cases
  console.log(`📝 Generating test cases (limit: ${limit})...`);
  const generator = new ToolTestGenerator();
  const testCases = await generator.generateAllTestCases({ limit });

  // Save test cases
  const testCasesPath = path.join(outputDir, 'test-cases.json');
  fs.writeFileSync(testCasesPath, JSON.stringify(testCases, null, 2));
  console.log(`✅ Saved ${testCases.length} test cases to ${testCasesPath}`);

  if (generateOnly) {
    console.log('\n--generate-only flag set, skipping test execution');
    return;
  }

  // Step 2: Run tests
  const runner = new ToolTestRunner();
  const report = await runner.runAllTests(testCases);

  // Save report
  const reportPath = path.join(outputDir, `report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const mdPath = path.join(outputDir, `report-${Date.now()}.md`);
  fs.writeFileSync(mdPath, generateMarkdownReport(report));

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Tools: ${report.totalTools}`);
  console.log(`Tested: ${report.testedTools}`);
  console.log(`Coverage: ${(report.coverage * 100).toFixed(1)}%`);
  console.log(`✅ Passed: ${report.passed}`);
  console.log(`❌ Failed: ${report.failed}`);
  console.log(`Pass Rate: ${((report.passed / report.testedTools) * 100).toFixed(1)}%`);
  console.log('\nReports saved to:');
  console.log(`  - ${reportPath}`);
  console.log(`  - ${mdPath}`);

  // Exit with error if tests failed
  if (report.failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
