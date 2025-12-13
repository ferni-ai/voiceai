/**
 * AI-Powered Diagnostics
 *
 * Uses Gemini to analyze failures and suggest fixes.
 * This is the "brain" of the self-healing system.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ai-diagnostics' });

export interface DiagnosticResult {
  /** Technical root cause */
  rootCause: string;
  /** Confidence in diagnosis (0-1) */
  confidence: number;
  /** Suggested fix */
  suggestedFix: string;
  /** Human-friendly explanation for Ferni to say */
  humanExplanation: string;
  /** Whether this can be auto-fixed */
  autoFixable: boolean;
  /** Type of fix if autoFixable */
  fixType?: 'retry' | 'restart' | 'circuit_break' | 'failover' | 'escalate';
  /** Additional context */
  metadata?: Record<string, unknown>;
}

interface FailureContext {
  jobId?: string;
  stage: 'dispatch' | 'accept' | 'assign' | 'spawn' | 'entry' | 'session' | 'unknown';
  timing?: Record<string, number>;
  errorType?: string;
  errorMessage?: string;
  stackTrace?: string;
}

// Known failure patterns with pre-computed diagnoses
// This avoids calling Gemini for common issues
const KNOWN_PATTERNS: Array<{
  pattern: RegExp;
  diagnosis: Omit<DiagnosticResult, 'metadata'>;
}> = [
  {
    pattern: /assignment.*timed?\s*out/i,
    diagnosis: {
      rootCause: 'LiveKit Cloud did not respond to availability message within 7.5 seconds',
      confidence: 0.95,
      suggestedFix: 'Retry the dispatch or check LiveKit Cloud status',
      humanExplanation: "I had trouble connecting - the conversation system was slow to respond.",
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /runner initialization timed out/i,
    diagnosis: {
      rootCause: 'Child process took too long to initialize (>5 minutes)',
      confidence: 0.9,
      suggestedFix: 'Check for slow dependency loading or resource constraints',
      humanExplanation: "I needed extra time to get ready and it took too long.",
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /No matching pid found/i,
    diagnosis: {
      rootCause: 'Child process crashed before memory monitoring could check it',
      confidence: 0.85,
      suggestedFix: 'Check child process error logs for the actual crash reason',
      humanExplanation: "A small internal process ended unexpectedly.",
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /ERR_IPC_CHANNEL_CLOSED/i,
    diagnosis: {
      rootCause: 'IPC channel between main and child process was closed unexpectedly',
      confidence: 0.9,
      suggestedFix: 'Child process likely crashed - check logs',
      humanExplanation: "I lost track of what I was doing for a moment.",
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /ECONNRESET|socket hang up/i,
    diagnosis: {
      rootCause: 'Network connection was reset by the remote server',
      confidence: 0.8,
      suggestedFix: 'Retry the operation with exponential backoff',
      humanExplanation: "The connection dropped briefly.",
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /out of memory|heap/i,
    diagnosis: {
      rootCause: 'Process ran out of memory',
      confidence: 0.95,
      suggestedFix: 'Increase memory limits or optimize memory usage',
      humanExplanation: "I was thinking about too many things at once.",
      autoFixable: true,
      fixType: 'restart',
    },
  },
];

/**
 * Analyze a failure and provide diagnostic information.
 *
 * First checks known patterns for instant diagnosis,
 * then falls back to Gemini for complex cases.
 */
export async function analyzeFailure(
  errorLogs: string[],
  context: FailureContext
): Promise<DiagnosticResult> {
  const combinedLogs = errorLogs.join('\n');

  // Check known patterns first (instant, no API call)
  for (const { pattern, diagnosis } of KNOWN_PATTERNS) {
    if (pattern.test(combinedLogs)) {
      log.debug(
        { pattern: pattern.toString(), stage: context.stage },
        'Matched known failure pattern'
      );
      return {
        ...diagnosis,
        metadata: {
          matchedPattern: pattern.toString(),
          stage: context.stage,
          jobId: context.jobId,
        },
      };
    }
  }

  // For unknown patterns, use Gemini
  log.info({ stage: context.stage }, 'Using Gemini for unknown failure analysis');

  try {
    return await analyzeWithGemini(errorLogs, context);
  } catch (geminiError) {
    // If Gemini fails, return a generic diagnosis
    log.warn({ error: String(geminiError) }, 'Gemini analysis failed, using fallback');
    return {
      rootCause: 'Unknown failure - Gemini analysis unavailable',
      confidence: 0.3,
      suggestedFix: 'Check logs manually',
      humanExplanation: "I'm not sure what happened, but I'm working on it.",
      autoFixable: false,
      fixType: 'escalate',
      metadata: {
        geminiError: String(geminiError),
        stage: context.stage,
        jobId: context.jobId,
      },
    };
  }
}

/**
 * Use Gemini to analyze complex failures
 */
async function analyzeWithGemini(
  errorLogs: string[],
  context: FailureContext
): Promise<DiagnosticResult> {
  // Dynamic import to avoid loading Gemini unless needed
  // @ts-expect-error - Optional dependency, may not be installed
  const { GoogleGenerativeAI } = await import('@google/generative-ai');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `You are a voice AI systems expert analyzing a failure in the Ferni voice agent.

## Error Context
- Stage: ${context.stage}
- Job ID: ${context.jobId || 'unknown'}
- Timing: ${JSON.stringify(context.timing || {})}

## Error Logs
\`\`\`
${errorLogs.slice(0, 50).join('\n')}
\`\`\`

## Your Task
Analyze the failure and respond with ONLY valid JSON (no markdown, no explanation):
{
  "rootCause": "Brief technical explanation of what went wrong",
  "confidence": 0.0 to 1.0,
  "suggestedFix": "What should be done to fix this",
  "humanExplanation": "What Ferni should say to a user if asked (warm, friendly, not technical)",
  "autoFixable": true or false,
  "fixType": "retry" | "restart" | "circuit_break" | "failover" | "escalate"
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // Extract JSON from response (in case of markdown wrapping)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Gemini response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as DiagnosticResult;

  return {
    ...parsed,
    metadata: {
      analyzedBy: 'gemini-2.0-flash-exp',
      stage: context.stage,
      jobId: context.jobId,
    },
  };
}

/**
 * Quick diagnosis without Gemini (pattern matching only)
 */
export function quickDiagnose(errorMessage: string): DiagnosticResult | null {
  for (const { pattern, diagnosis } of KNOWN_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        ...diagnosis,
        metadata: { matchedPattern: pattern.toString() },
      };
    }
  }
  return null;
}

