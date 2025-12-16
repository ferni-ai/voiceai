#!/usr/bin/env npx tsx
/**
 * Complexity Metrics Check Script
 *
 * Calculates cyclomatic complexity and cognitive complexity metrics:
 * - Functions with too many branches/paths
 * - Deeply nested code
 * - Long parameter lists
 *
 * High complexity suggests:
 * - Hard to test
 * - Hard to understand
 * - Bug-prone code
 *
 * Run: npx tsx scripts/complexity-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  maxCyclomaticComplexity: 15,    // Max branches per function
  maxCognitiveComplexity: 20,    // Max cognitive load score
  maxNestingDepth: 5,            // Max levels of nesting
  maxParameterCount: 6,          // Max function parameters
  maxComplexFunctions: 30,       // Max functions exceeding thresholds
};

// Patterns to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  'dist/',
  'coverage/',
  '__tests__',
  '__mocks__',
  '.test.ts',
  '.spec.ts',
];

// ============================================================================
// TYPES
// ============================================================================

interface FunctionComplexity {
  name: string;
  file: string;
  line: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  parameterCount: number;
}

interface ComplexityReport {
  complexFunctions: FunctionComplexity[];
  deeplyNestedFunctions: FunctionComplexity[];
  manyParameterFunctions: FunctionComplexity[];
  totalFunctions: number;
  averageComplexity: number;
  maxComplexity: number;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getAllTypeScriptFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (shouldIgnore(fullPath)) continue;

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        getAllTypeScriptFiles(fullPath, files);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }
  return files;
}

// ============================================================================
// COMPLEXITY ANALYSIS
// ============================================================================

/**
 * Count decision points for cyclomatic complexity
 * +1 for each: if, else if, case, for, while, do, &&, ||, ?, catch
 */
function countCyclomaticComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Control flow keywords
  const controlFlow = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bcase\s+/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcatch\s*\(/g,
  ];

  for (const pattern of controlFlow) {
    const matches = code.match(pattern);
    complexity += matches ? matches.length : 0;
  }

  // Logical operators (outside strings)
  // Simple approximation: count && and ||
  const logicalAnd = code.match(/&&/g);
  const logicalOr = code.match(/\|\|/g);
  const ternary = code.match(/\?(?!=)/g); // ? but not ?=

  complexity += logicalAnd ? logicalAnd.length : 0;
  complexity += logicalOr ? logicalOr.length : 0;
  complexity += ternary ? ternary.length : 0;

  return complexity;
}

/**
 * Count cognitive complexity (weighted by nesting)
 * Harder to understand = higher score
 */
function countCognitiveComplexity(code: string): number {
  let complexity = 0;
  let currentNesting = 0;
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || !trimmed) {
      continue;
    }

    // Track nesting increases
    if (trimmed.match(/\b(if|for|while|switch|try)\s*\(/)) {
      complexity += 1 + currentNesting; // Base + nesting penalty
      if (trimmed.includes('{')) currentNesting++;
    } else if (trimmed.match(/\belse\s*(if\s*\()?\s*\{?/)) {
      complexity += 1; // else adds 1 (no nesting penalty for else)
      if (trimmed.includes('{') && !trimmed.includes('}')) currentNesting++;
    } else if (trimmed.match(/\bcatch\s*\(/)) {
      complexity += 1 + currentNesting;
    }

    // Logical operators add complexity
    const andOr = trimmed.match(/&&|\|\|/g);
    if (andOr) {
      complexity += andOr.length;
    }

    // Recursion detection (simplified)
    if (trimmed.match(/\bthis\.\w+\(/)) {
      // Could be recursive method call
      // Don't add penalty here, too many false positives
    }

    // Track nesting decreases
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    currentNesting += openBraces - closeBraces;
    if (currentNesting < 0) currentNesting = 0;
  }

  return complexity;
}

/**
 * Find maximum nesting depth in code
 */
function findMaxNestingDepth(code: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of code) {
    if (char === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}') {
      currentDepth--;
    }
  }

  return maxDepth;
}

/**
 * Count function parameters
 */
function countParameters(paramString: string): number {
  if (!paramString || paramString.trim() === '') return 0;

  // Handle complex parameter types with nested generics
  let depth = 0;
  let count = 1;

  for (const char of paramString) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
    } else if (char === '>' || char === ')' || char === '}' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 0) {
      count++;
    }
  }

  return count;
}

/**
 * Extract functions from a file and analyze complexity
 */
function analyzeFunctions(filePath: string): FunctionComplexity[] {
  const content = readFileSync(filePath, 'utf-8');
  const functions: FunctionComplexity[] = [];
  const relativePath = relative(ROOT_DIR, filePath);

  // Match function declarations and expressions
  const functionPatterns = [
    // function name(params) or async function name(params)
    /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/g,
    // const name = (params) => or const name = async (params) =>
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/g,
    // method(params) { in class
    /^\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/gm,
  ];

  const lines = content.split('\n');
  const processedFunctions = new Set<string>();

  for (const pattern of functionPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const params = match[2];
      const matchIndex = match.index;

      // Find line number
      const upToMatch = content.substring(0, matchIndex);
      const lineNumber = upToMatch.split('\n').length;

      // Create unique key to avoid duplicates
      const key = `${name}:${lineNumber}`;
      if (processedFunctions.has(key)) continue;
      processedFunctions.add(key);

      // Extract function body (simplified: from { to matching })
      const startIndex = content.indexOf('{', matchIndex);
      if (startIndex === -1) continue;

      let depth = 1;
      let endIndex = startIndex + 1;
      while (depth > 0 && endIndex < content.length) {
        if (content[endIndex] === '{') depth++;
        if (content[endIndex] === '}') depth--;
        endIndex++;
      }

      const functionBody = content.substring(startIndex, endIndex);

      functions.push({
        name,
        file: relativePath,
        line: lineNumber,
        cyclomaticComplexity: countCyclomaticComplexity(functionBody),
        cognitiveComplexity: countCognitiveComplexity(functionBody),
        nestingDepth: findMaxNestingDepth(functionBody),
        parameterCount: countParameters(params),
      });
    }
  }

  return functions;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(files: string[]): ComplexityReport {
  const allFunctions: FunctionComplexity[] = [];

  for (const file of files) {
    const functions = analyzeFunctions(file);
    allFunctions.push(...functions);
  }

  const complexFunctions = allFunctions
    .filter(f =>
      f.cyclomaticComplexity > THRESHOLDS.maxCyclomaticComplexity ||
      f.cognitiveComplexity > THRESHOLDS.maxCognitiveComplexity
    )
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);

  const deeplyNestedFunctions = allFunctions
    .filter(f => f.nestingDepth > THRESHOLDS.maxNestingDepth)
    .sort((a, b) => b.nestingDepth - a.nestingDepth);

  const manyParameterFunctions = allFunctions
    .filter(f => f.parameterCount > THRESHOLDS.maxParameterCount)
    .sort((a, b) => b.parameterCount - a.parameterCount);

  const totalComplexity = allFunctions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0);

  return {
    complexFunctions,
    deeplyNestedFunctions,
    manyParameterFunctions,
    totalFunctions: allFunctions.length,
    averageComplexity: allFunctions.length > 0
      ? Math.round(totalComplexity / allFunctions.length * 10) / 10
      : 0,
    maxComplexity: Math.max(0, ...allFunctions.map(f => f.cyclomaticComplexity)),
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: ComplexityReport): void {
  console.log('\n======================================================================');
  console.log('  COMPLEXITY METRICS REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total functions analyzed: ${report.totalFunctions}`);
  console.log(`  Average cyclomatic complexity: ${report.averageComplexity}`);
  console.log(`  Maximum cyclomatic complexity: ${report.maxComplexity}`);
  console.log(`  Complex functions (>${THRESHOLDS.maxCyclomaticComplexity} cyclomatic): ${report.complexFunctions.length}`);
  console.log(`  Deeply nested functions (>${THRESHOLDS.maxNestingDepth} levels): ${report.deeplyNestedFunctions.length}`);
  console.log(`  Functions with many params (>${THRESHOLDS.maxParameterCount}): ${report.manyParameterFunctions.length}`);
  console.log();

  if (report.complexFunctions.length > 0) {
    console.log(`⚠️  High Complexity Functions`);
    console.log('----------------------------------------------------------------------');
    for (const func of report.complexFunctions.slice(0, 15)) {
      console.log(`  ${func.name} (${func.file}:${func.line})`);
      console.log(`    Cyclomatic: ${func.cyclomaticComplexity}, Cognitive: ${func.cognitiveComplexity}`);
    }
    if (report.complexFunctions.length > 15) {
      console.log(`  ... and ${report.complexFunctions.length - 15} more`);
    }
    console.log();
  }

  if (report.deeplyNestedFunctions.length > 0) {
    console.log(`📁 Deeply Nested Functions (>${THRESHOLDS.maxNestingDepth} levels)`);
    console.log('----------------------------------------------------------------------');
    for (const func of report.deeplyNestedFunctions.slice(0, 10)) {
      console.log(`  ${func.name} (${func.file}:${func.line}) - ${func.nestingDepth} levels`);
    }
    if (report.deeplyNestedFunctions.length > 10) {
      console.log(`  ... and ${report.deeplyNestedFunctions.length - 10} more`);
    }
    console.log();
  }

  if (report.manyParameterFunctions.length > 0) {
    console.log(`🔢 Functions with Many Parameters (>${THRESHOLDS.maxParameterCount})`);
    console.log('----------------------------------------------------------------------');
    for (const func of report.manyParameterFunctions.slice(0, 10)) {
      console.log(`  ${func.name} (${func.file}:${func.line}) - ${func.parameterCount} params`);
    }
    if (report.manyParameterFunctions.length > 10) {
      console.log(`  ... and ${report.manyParameterFunctions.length - 10} more`);
    }
    console.log();
  }

  // Status
  const hasBlockingIssues = report.complexFunctions.length > THRESHOLDS.maxComplexFunctions;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    console.log(`  ✗ Too many complex functions: ${report.complexFunctions.length}`);
    console.log(`    Maximum allowed: ${THRESHOLDS.maxComplexFunctions}`);
    console.log('  Consider refactoring functions with high complexity scores');
  } else {
    console.log('  STATUS: PASSED');
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Analyzing code complexity...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const report = generateReport(files);

  printReport(report);

  const hasBlockingIssues = report.complexFunctions.length > THRESHOLDS.maxComplexFunctions;
  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
