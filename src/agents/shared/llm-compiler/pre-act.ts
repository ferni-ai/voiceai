/**
 * Pre-Act Planning Module
 *
 * Implements upfront planning before tool execution.
 * Based on research showing 70% improvement on multi-step tasks.
 *
 * Format detected:
 * ```
 * <think>
 * [reasoning about what needs to be done]
 * </think>
 * <plan>
 * [
 *   {"id":"t1","fn":"getWeather","args":{...},"dependsOn":[]},
 *   ...
 * ]
 * </plan>
 * ```
 *
 * Or simpler format:
 * ```
 * THINK: [reasoning]
 * PLAN: [DAG JSON array]
 * ```
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { LLMCompilerPlan, LLMCompilerTask } from './types.js';
import { parseLLMCompilerPlan, validateDAG } from './planner.js';

const log = createLogger({ module: 'pre-act' });

/**
 * Pre-Act plan with reasoning
 */
export interface PreActPlan {
  /** The reasoning/thinking before planning */
  reasoning: string;
  /** The execution plan (DAG of tasks) */
  plan: LLMCompilerPlan;
  /** Confidence in the plan (0-1) */
  confidence: number;
  /** Original format detected */
  format: 'xml' | 'keyword' | 'inline';
}

/**
 * Pre-Act detection result
 */
export interface PreActDetectionResult {
  /** Whether Pre-Act format was detected */
  detected: boolean;
  /** The reasoning text if found */
  reasoning?: string;
  /** The plan JSON text if found */
  planText?: string;
  /** Format used */
  format?: 'xml' | 'keyword' | 'inline';
}

// Pattern for XML-style Pre-Act format
const XML_THINK_PATTERN = /<think>([\s\S]*?)<\/think>/i;
const XML_PLAN_PATTERN = /<plan>([\s\S]*?)<\/plan>/i;

// Pattern for keyword-style Pre-Act format
const KEYWORD_THINK_PATTERN = /THINK:\s*([\s\S]*?)(?=PLAN:|$)/i;
// Match PLAN: followed by a JSON array (greedy to capture full array)
const KEYWORD_PLAN_PATTERN = /PLAN:\s*(\[[\s\S]*\])/i;

// Pattern for inline reasoning before DAG
const INLINE_REASON_PATTERN = /^([\s\S]*?)(\[\s*\{[^}]*"id"\s*:\s*"[^"]+[\s\S]*\])/;

/**
 * Detect if text contains Pre-Act format
 */
export function containsPreActPlan(text: string): boolean {
  // Check XML format
  if (XML_THINK_PATTERN.test(text) && XML_PLAN_PATTERN.test(text)) {
    return true;
  }

  // Check keyword format
  if (KEYWORD_THINK_PATTERN.test(text) && KEYWORD_PLAN_PATTERN.test(text)) {
    return true;
  }

  // Check for inline reasoning before DAG
  // Only if there's substantial text before the DAG
  const inlineMatch = text.match(INLINE_REASON_PATTERN);
  if (inlineMatch && inlineMatch[1].trim().length > 20) {
    return true;
  }

  return false;
}

/**
 * Detect and extract Pre-Act components
 */
export function detectPreActFormat(text: string): PreActDetectionResult {
  // Try XML format first
  const xmlThinkMatch = text.match(XML_THINK_PATTERN);
  const xmlPlanMatch = text.match(XML_PLAN_PATTERN);

  if (xmlThinkMatch && xmlPlanMatch) {
    return {
      detected: true,
      reasoning: xmlThinkMatch[1].trim(),
      planText: xmlPlanMatch[1].trim(),
      format: 'xml',
    };
  }

  // Try keyword format
  const keywordThinkMatch = text.match(KEYWORD_THINK_PATTERN);
  const keywordPlanMatch = text.match(KEYWORD_PLAN_PATTERN);

  if (keywordThinkMatch && keywordPlanMatch) {
    return {
      detected: true,
      reasoning: keywordThinkMatch[1].trim(),
      planText: keywordPlanMatch[1].trim(),
      format: 'keyword',
    };
  }

  // Try inline format
  const inlineMatch = text.match(INLINE_REASON_PATTERN);
  if (inlineMatch && inlineMatch[1].trim().length > 20) {
    return {
      detected: true,
      reasoning: inlineMatch[1].trim(),
      planText: inlineMatch[2].trim(),
      format: 'inline',
    };
  }

  return { detected: false };
}

/**
 * Parse Pre-Act plan from text
 */
export function parsePreActPlan(text: string): PreActPlan | null {
  const detection = detectPreActFormat(text);

  if (!detection.detected || !detection.planText) {
    return null;
  }

  // Parse the plan using LLMCompiler planner
  const plan = parseLLMCompilerPlan(detection.planText);

  if (!plan) {
    log.warn({ planText: detection.planText.slice(0, 100) }, 'Failed to parse Pre-Act plan');
    return null;
  }

  // Validate the DAG
  const validation = validateDAG(plan.tasks);
  if (!validation.valid) {
    log.warn({ error: validation.error }, 'Pre-Act plan has invalid DAG');
    return null;
  }

  // Calculate confidence based on:
  // - Presence of reasoning (more reasoning = more thought = higher confidence)
  // - Number of tasks (reasonable number = higher confidence)
  // - Format clarity (XML format = more structured = higher confidence)
  let confidence = 0.5;

  if (detection.reasoning && detection.reasoning.length > 50) {
    confidence += 0.2;
  }

  if (plan.tasks.length >= 1 && plan.tasks.length <= 10) {
    confidence += 0.2;
  }

  if (detection.format === 'xml') {
    confidence += 0.1;
  }

  return {
    reasoning: detection.reasoning || '',
    plan,
    confidence: Math.min(confidence, 1.0),
    format: detection.format!,
  };
}

/**
 * Validate Pre-Act reasoning quality
 */
export function validateReasoning(reasoning: string): {
  valid: boolean;
  quality: 'high' | 'medium' | 'low';
  warnings: string[];
} {
  const warnings: string[] = [];
  let quality: 'high' | 'medium' | 'low' = 'high';

  // Check minimum length
  if (reasoning.length < 20) {
    warnings.push('Reasoning is too short');
    quality = 'low';
  } else if (reasoning.length < 50) {
    quality = 'medium';
  }

  // Check for thinking indicators
  const thinkingIndicators = [
    'need to',
    'should',
    'first',
    'then',
    'because',
    'in order to',
    'to accomplish',
    'the user wants',
    'I will',
  ];

  const hasThinkingIndicators = thinkingIndicators.some((indicator) =>
    reasoning.toLowerCase().includes(indicator)
  );

  if (!hasThinkingIndicators) {
    warnings.push('Reasoning lacks clear thinking indicators');
    if (quality === 'high') quality = 'medium';
  }

  // Check for step planning
  const stepIndicators = ['first', 'second', 'then', 'next', 'finally', 'after', '1.', '2.'];
  const hasStepPlanning = stepIndicators.some((indicator) =>
    reasoning.toLowerCase().includes(indicator)
  );

  if (!hasStepPlanning && warnings.length === 0) {
    warnings.push('Consider adding step-by-step reasoning');
  }

  return {
    valid: warnings.length < 2,
    quality,
    warnings,
  };
}

/**
 * Strip Pre-Act format from text, returning clean text and plan
 */
export function stripPreActFormat(text: string): {
  cleanText: string;
  preActPlan: PreActPlan | null;
} {
  const detection = detectPreActFormat(text);

  if (!detection.detected) {
    return { cleanText: text, preActPlan: null };
  }

  const preActPlan = parsePreActPlan(text);

  // Remove the Pre-Act format from the text
  let cleanText = text;

  if (detection.format === 'xml') {
    cleanText = cleanText.replace(XML_THINK_PATTERN, '');
    cleanText = cleanText.replace(XML_PLAN_PATTERN, '');
  } else if (detection.format === 'keyword') {
    cleanText = cleanText.replace(KEYWORD_THINK_PATTERN, '');
    cleanText = cleanText.replace(KEYWORD_PLAN_PATTERN, '');
  } else if (detection.format === 'inline') {
    const match = text.match(INLINE_REASON_PATTERN);
    if (match) {
      // Keep any speech that might come after the plan
      const afterPlan = text.slice(text.indexOf(match[2]) + match[2].length);
      cleanText = afterPlan;
    }
  }

  return {
    cleanText: cleanText.trim(),
    preActPlan,
  };
}

/**
 * Generate Pre-Act prompt instructions
 */
export function getPreActPromptInstructions(): string {
  return `
## Pre-Act Planning (for complex multi-step tasks)

For complex tasks requiring multiple tools, use Pre-Act format:

<think>
[Your reasoning about what needs to be done and in what order]
</think>
<plan>
[
  {"id":"t1","fn":"toolA","args":{...},"dependsOn":[]},
  {"id":"t2","fn":"toolB","args":{"input":"$t1"},"dependsOn":["t1"]}
]
</plan>

The <think> section helps you plan before executing. This improves accuracy on multi-step tasks.
`;
}

/**
 * Analyze Pre-Act plan for potential issues
 */
export function analyzePreActPlan(preActPlan: PreActPlan): {
  issues: string[];
  suggestions: string[];
  score: number;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Check reasoning quality
  const reasoningValidation = validateReasoning(preActPlan.reasoning);
  if (!reasoningValidation.valid) {
    issues.push('Poor reasoning quality');
    score -= 20;
  }
  suggestions.push(...reasoningValidation.warnings);

  // Check plan size
  const taskCount = preActPlan.plan.tasks.length;
  if (taskCount === 0) {
    issues.push('Empty plan');
    score -= 50;
  } else if (taskCount > 10) {
    suggestions.push('Consider breaking down into smaller plans');
    score -= 10;
  }

  // Check for overly sequential plans (could be more parallel)
  const sequentialTasks = preActPlan.plan.tasks.filter((t) => t.dependsOn.length > 0).length;
  const parallelRatio = 1 - sequentialTasks / Math.max(taskCount, 1);

  if (parallelRatio < 0.3 && taskCount > 2) {
    suggestions.push('Consider if some tasks could run in parallel');
    score -= 5;
  }

  // Check reasoning-to-plan alignment
  const reasoningMentionsTools = preActPlan.plan.tasks.some(
    (t) =>
      preActPlan.reasoning.toLowerCase().includes(t.fn.toLowerCase()) ||
      preActPlan.reasoning.toLowerCase().includes(t.fn.replace(/([A-Z])/g, ' $1').toLowerCase())
  );

  if (!reasoningMentionsTools && taskCount > 0) {
    suggestions.push('Reasoning should mention the tools being used');
    score -= 10;
  }

  return {
    issues,
    suggestions,
    score: Math.max(0, score),
  };
}
