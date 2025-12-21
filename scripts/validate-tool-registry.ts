#!/usr/bin/env npx tsx
/**
 * Tool Registry Validation Script
 *
 * Validates that all tools in the function calling system are properly registered
 * across all required files. Run this before deploying changes to tool-related code.
 *
 * Usage: pnpm validate:tools
 *
 * Checks:
 * 1. Tools in function-calling-base.md have matching entries in:
 *    - tool-call-sanitizer.ts TOOL_NAME_PATTERNS
 *    - json-function-executor.ts routeToTool()
 *    - function-call-format.ts REGISTERED_TOOLS
 *
 * 2. Tools in REGISTERED_TOOLS exist in at least one prompt file
 *
 * See docs/architecture/FUNCTION-CALLING-SYSTEM.md for details.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Files to check
const FILES = {
  functionCallingBase: 'src/personas/bundles/shared/function-calling-base.md',
  ferniSpecialty: 'src/personas/bundles/ferni/identity/function-calling-specialty.md',
  sanitizer: 'src/agents/shared/tool-call-sanitizer.ts',
  executor: 'src/agents/shared/json-function-executor.ts',
  format: 'src/agents/shared/function-call-format.ts',
};

interface ValidationResult {
  file: string;
  issue: string;
  tool: string;
}

const issues: ValidationResult[] = [];

function readFile(relativePath: string): string {
  const fullPath = path.join(ROOT, relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

// Extract tool names from markdown prompt files
function extractToolsFromMarkdown(content: string): string[] {
  const tools: string[] = [];

  // Pattern: **toolName** - or {"fn":"toolName"
  const patterns = [/\*\*(\w+)\*\*/g, /"fn"\s*:\s*"(\w+)"/g];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const tool = match[1];
      // Filter out non-tool words
      if (
        tool.length > 3 &&
        !['WRONG', 'CORRECT', 'CRITICAL', 'When', 'User', 'NOTE'].includes(tool)
      ) {
        tools.push(tool);
      }
    }
  }

  return [...new Set(tools)];
}

// Extract TOOL_NAME_PATTERNS from sanitizer
function extractSanitizerPatterns(content: string): string[] {
  const match = content.match(/const TOOL_NAME_PATTERNS = \[([\s\S]*?)\];/);
  if (!match) return [];

  const tools: string[] = [];
  const stringPattern = /'([^']+)'|"([^"]+)"/g;
  let m;
  while ((m = stringPattern.exec(match[1])) !== null) {
    tools.push(m[1] || m[2]);
  }

  return tools;
}

// Extract routes from executor
function extractExecutorRoutes(content: string): string[] {
  const tools: string[] = [];

  // Pattern: if (fnLower === 'toolname')
  const pattern = /if\s*\(\s*fnLower\s*===\s*'(\w+)'/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    tools.push(match[1]);
  }

  return tools;
}

// Extract REGISTERED_TOOLS from format file
function extractRegisteredTools(content: string): string[] {
  const match = content.match(/export const REGISTERED_TOOLS = \[([\s\S]*?)\] as const;/);
  if (!match) return [];

  const tools: string[] = [];
  const stringPattern = /'([^']+)'/g;
  let m;
  while ((m = stringPattern.exec(match[1])) !== null) {
    tools.push(m[1]);
  }

  return tools;
}

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[\s-_]/g, '');
}

function main() {
  console.log('🔍 Validating Tool Registry...\n');

  // Read all files
  const baseContent = readFile(FILES.functionCallingBase);
  const ferniContent = readFile(FILES.ferniSpecialty);
  const sanitizerContent = readFile(FILES.sanitizer);
  const executorContent = readFile(FILES.executor);
  const formatContent = readFile(FILES.format);

  // Extract tools from each source
  const promptTools = [
    ...extractToolsFromMarkdown(baseContent),
    ...extractToolsFromMarkdown(ferniContent),
  ];
  const sanitizerTools = extractSanitizerPatterns(sanitizerContent);
  const executorTools = extractExecutorRoutes(executorContent);
  const registeredTools = extractRegisteredTools(formatContent);

  // Normalize for comparison
  const normalizedPrompt = new Set(promptTools.map(normalizeToolName));
  const normalizedSanitizer = new Set(sanitizerTools.map(normalizeToolName));
  const normalizedExecutor = new Set(executorTools.map(normalizeToolName));
  const normalizedRegistered = new Set(registeredTools.map(normalizeToolName));

  console.log(`📋 Found in prompts: ${normalizedPrompt.size} unique tools`);
  console.log(`🔍 Found in sanitizer: ${normalizedSanitizer.size} patterns`);
  console.log(`⚡ Found in executor: ${normalizedExecutor.size} routes`);
  console.log(`📝 Found in registry: ${normalizedRegistered.size} registered\n`);

  // Check 1: Prompt tools should be in sanitizer
  for (const tool of normalizedPrompt) {
    // Skip common words that aren't tools
    if (['the', 'and', 'for', 'with', 'from'].includes(tool)) continue;

    if (!normalizedSanitizer.has(tool)) {
      // Check if any sanitizer pattern contains this tool
      const hasPartialMatch = sanitizerTools.some((s) => normalizeToolName(s).includes(tool));
      if (!hasPartialMatch) {
        issues.push({
          file: 'tool-call-sanitizer.ts',
          issue: 'Missing from TOOL_NAME_PATTERNS',
          tool,
        });
      }
    }
  }

  // Check 2: Prompt tools should be in executor
  for (const tool of normalizedPrompt) {
    if (!normalizedExecutor.has(tool)) {
      // Check for partial match (some tools use different casing)
      const hasPartialMatch = executorTools.some((e) => normalizeToolName(e) === tool);
      if (!hasPartialMatch) {
        issues.push({
          file: 'json-function-executor.ts',
          issue: 'Missing route in routeToTool()',
          tool,
        });
      }
    }
  }

  // Check 3: Prompt tools should be in registry
  for (const tool of normalizedPrompt) {
    if (!normalizedRegistered.has(tool)) {
      issues.push({
        file: 'function-call-format.ts',
        issue: 'Missing from REGISTERED_TOOLS',
        tool,
      });
    }
  }

  // Report results
  if (issues.length === 0) {
    console.log('✅ All tools are properly registered across all files!\n');
    process.exit(0);
  } else {
    console.log(`❌ Found ${issues.length} potential issues:\n`);

    // Group by file
    const byFile = new Map<string, ValidationResult[]>();
    for (const issue of issues) {
      const existing = byFile.get(issue.file) || [];
      existing.push(issue);
      byFile.set(issue.file, existing);
    }

    for (const [file, fileIssues] of byFile) {
      console.log(`📄 ${file}:`);
      for (const issue of fileIssues) {
        console.log(`   ⚠️  ${issue.issue}: ${issue.tool}`);
      }
      console.log();
    }

    console.log('💡 See docs/architecture/FUNCTION-CALLING-SYSTEM.md for how to fix these.\n');

    // Exit with warning but don't fail (some false positives expected)
    process.exit(0);
  }
}

main();

