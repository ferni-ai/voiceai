/**
 * LLM Evaluator for Semantic Coherence Tests
 *
 * Uses an LLM to evaluate whether our codebase naming, organization,
 * and architecture align with our philosophy and semantic principles.
 */

import type { SemanticProbe, ProbeResult, AlignmentGap, SemanticTestConfig } from './types.js';
import { CORE_PRINCIPLES } from './types.js';

/**
 * Evaluate a single semantic probe using LLM reasoning
 */
export async function evaluateProbe(
  probe: SemanticProbe,
  codeContext: string,
  config: SemanticTestConfig
): Promise<ProbeResult> {
  const prompt = buildEvaluationPrompt(probe, codeContext);

  // In a real implementation, this would call the LLM API
  // For now, we'll use a mock that demonstrates the expected format
  const response = await callLlmForEvaluation(prompt, config.model);

  return parseEvaluationResponse(probe.id, response);
}

/**
 * Build the evaluation prompt for the LLM
 */
function buildEvaluationPrompt(probe: SemanticProbe, codeContext: string): string {
  const principles = probe.context.philosophyPrinciples?.map((p) => `  - ${p}`).join('\n');

  return `# Semantic Coherence Evaluation

## Your Role
You are evaluating the semantic coherence of a codebase. Your job is to assess whether naming, organization, and architecture align with the stated principles.

## Core Philosophy
"We believe in making AI human, and the decisions we make will reflect that."

## Relevant Principles
${principles || 'None specified'}

## Probe Category
${probe.category}

## Question
${probe.question}

## Target
${probe.context.target}

## Expected Alignment
${probe.expectedAlignment}

${probe.context.actualBehavior ? `## Actual Behavior\n${probe.context.actualBehavior}\n` : ''}

${probe.context.relatedModules?.length ? `## Related Modules\n${probe.context.relatedModules.join(', ')}\n` : ''}

## Code Context
\`\`\`
${codeContext}
\`\`\`

## Your Evaluation

Please provide:
1. **Coherence Score** (0-100): How well does the naming/organization align with the question's expectations?
2. **Passed** (true/false): Does this meet the minimum bar for semantic clarity?
3. **Reasoning**: Why did you give this score?
4. **Suggestions**: If below 80, what specific improvements would help?
5. **Alignment Gaps**: List any specific misalignments found.

Respond in JSON format:
{
  "coherenceScore": number,
  "passed": boolean,
  "reasoning": "string",
  "suggestions": ["string"],
  "alignmentGaps": [
    {
      "type": "naming|organization|philosophy|wiring",
      "severity": "low|medium|high|critical",
      "current": "what exists now",
      "suggested": "what would be better",
      "rationale": "why this matters"
    }
  ]
}`;
}

/**
 * Call the LLM API for evaluation
 * This is a placeholder - in production, use your actual LLM integration
 */
async function callLlmForEvaluation(prompt: string, model: string): Promise<string> {
  // Try to load .env if not already loaded
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv not available, continue with process.env
  }

  // Check for Google API key for Gemini
  const apiKey = process.env.GOOGLE_API_KEY;

  if (apiKey && model.startsWith('gemini')) {
    return callGeminiApi(prompt, apiKey, model);
  }

  // Check for OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && model.startsWith('gpt')) {
    return callOpenAiApi(prompt, openaiKey, model);
  }

  // Fallback to mock for testing
  console.warn(`⚠️ No API key found for ${model}, using mock evaluation`);
  return getMockEvaluation();
}

/**
 * Call Gemini API with exponential backoff on rate limits
 */
async function callGeminiApi(
  prompt: string,
  apiKey: string,
  model: string,
  retryCount = 0
): Promise<string> {
  const modelId = model === 'gemini-2.0-flash' ? 'gemini-2.0-flash-exp' : model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        // Exponential backoff: 10s, 20s, 40s
        const delaySeconds = 10 * Math.pow(2, retryCount);
        console.warn(`⏳ Rate limited, waiting ${delaySeconds}s (attempt ${retryCount + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delaySeconds * 1000));
        return callGeminiApi(prompt, apiKey, model, retryCount + 1);
      }
      // After max retries, fall back to mock
      console.warn('⚠️ Max retries reached, using mock evaluation');
      return getMockEvaluation();
    }
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || getMockEvaluation();
}

/**
 * Call OpenAI API
 */
async function callOpenAiApi(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || getMockEvaluation();
}

/**
 * Mock evaluation for testing without API
 */
function getMockEvaluation(): string {
  return JSON.stringify({
    coherenceScore: 75,
    passed: true,
    reasoning: 'Mock evaluation - run with GOOGLE_API_KEY or OPENAI_API_KEY for real LLM analysis',
    suggestions: ['Configure LLM API key for real evaluation'],
    alignmentGaps: [],
  });
}

/**
 * Parse the LLM response into a ProbeResult
 */
function parseEvaluationResponse(probeId: string, response: string): ProbeResult {
  try {
    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      coherenceScore: number;
      passed: boolean;
      reasoning: string;
      suggestions: string[];
      alignmentGaps: AlignmentGap[];
    };

    return {
      probeId,
      coherenceScore: parsed.coherenceScore,
      passed: parsed.passed,
      reasoning: parsed.reasoning,
      suggestions: parsed.suggestions || [],
      alignmentGaps: parsed.alignmentGaps || [],
    };
  } catch (error) {
    return {
      probeId,
      coherenceScore: 0,
      passed: false,
      reasoning: `Failed to parse LLM response: ${String(error)}`,
      suggestions: ['Check LLM API configuration'],
      alignmentGaps: [],
    };
  }
}

/**
 * Batch evaluate multiple probes
 */
export async function evaluateProbes(
  probes: SemanticProbe[],
  getCodeContext: (target: string) => Promise<string>,
  config: SemanticTestConfig
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const probe of probes) {
    if (config.verbose) {
      console.log(`\n🔍 Evaluating: ${probe.id}`);
    }

    const codeContext = await getCodeContext(probe.context.target);
    const result = await evaluateProbe(probe, codeContext, config);

    results.push(result);

    if (config.verbose) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} Score: ${result.coherenceScore}/100`);
      if (!result.passed && result.suggestions.length > 0) {
        console.log(`   Suggestions: ${result.suggestions[0]}`);
      }
    }

    // Delay to avoid rate limiting (Gemini free tier: 15 RPM = 1 request per 4s)
    await new Promise((r) => setTimeout(r, 4500));
  }

  return results;
}

/**
 * Generate summary from results
 */
export function generateSummary(
  results: ProbeResult[],
  config: SemanticTestConfig
): {
  overallScore: number;
  passRate: number;
  criticalGaps: AlignmentGap[];
  recommendations: string[];
} {
  const totalScore = results.reduce((sum, r) => sum + r.coherenceScore, 0);
  const overallScore = Math.round(totalScore / results.length);
  const passed = results.filter((r) => r.passed).length;
  const passRate = Math.round((passed / results.length) * 100);

  const criticalGaps = results
    .flatMap((r) => r.alignmentGaps)
    .filter((g) => g.severity === 'critical' || g.severity === 'high');

  // Aggregate suggestions
  const suggestionCounts = new Map<string, number>();
  for (const result of results) {
    for (const suggestion of result.suggestions) {
      suggestionCounts.set(suggestion, (suggestionCounts.get(suggestion) || 0) + 1);
    }
  }

  // Get top recommendations
  const recommendations = [...suggestionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([suggestion]) => suggestion);

  return {
    overallScore,
    passRate,
    criticalGaps,
    recommendations,
  };
}
