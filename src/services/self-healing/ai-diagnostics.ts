/**
 * AI-Powered Diagnostics
 *
 * Uses Gemini to analyze failures and suggest fixes.
 * This is the "brain" of the self-healing system.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getDefaultModel } from '../model-config.js';

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
  // =========================================================================
  // LiveKit / Voice Infrastructure
  // =========================================================================
  {
    pattern: /assignment.*timed?\s*out/i,
    diagnosis: {
      rootCause: 'LiveKit Cloud did not respond to availability message within 7.5 seconds',
      confidence: 0.95,
      suggestedFix: 'Retry the dispatch or check LiveKit Cloud status',
      humanExplanation: 'I had trouble connecting - the conversation system was slow to respond.',
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
      humanExplanation: 'I needed extra time to get ready and it took too long.',
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
      humanExplanation: 'A small internal process ended unexpectedly.',
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
      humanExplanation: 'I lost track of what I was doing for a moment.',
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /livekit.*websocket.*closed|livekit.*disconnected/i,
    diagnosis: {
      rootCause: 'LiveKit WebSocket connection was closed unexpectedly',
      confidence: 0.9,
      suggestedFix: 'Check network connectivity and LiveKit Cloud status',
      humanExplanation: 'Our voice connection got interrupted briefly.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /room not found|room.*doesn.*exist/i,
    diagnosis: {
      rootCause: 'LiveKit room was not found or has been deleted',
      confidence: 0.95,
      suggestedFix: 'Create a new room or verify room name',
      humanExplanation: 'The conversation room closed before I could join.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /participant.*disconnected|track.*ended/i,
    diagnosis: {
      rootCause: 'Remote participant disconnected or their audio track ended',
      confidence: 0.85,
      suggestedFix: 'Wait for reconnection or handle graceful disconnect',
      humanExplanation: 'Looks like we got disconnected for a moment.',
      autoFixable: false,
      fixType: 'escalate',
    },
  },

  // =========================================================================
  // TTS / Audio (Cartesia)
  // =========================================================================
  {
    pattern: /cartesia.*error|tts.*failed|speech.*synthesis.*error/i,
    diagnosis: {
      rootCause: 'Text-to-speech service (Cartesia) returned an error',
      confidence: 0.9,
      suggestedFix: 'Retry with exponential backoff, check API status',
      humanExplanation: 'I had trouble finding my voice for a moment.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /voice.*not found|invalid.*voice.*id/i,
    diagnosis: {
      rootCause: 'Requested voice ID does not exist in Cartesia',
      confidence: 0.95,
      suggestedFix: 'Verify voice ID is correct and available',
      humanExplanation: "I couldn't find the right voice to use.",
      autoFixable: false,
      fixType: 'escalate',
    },
  },
  {
    pattern: /audio.*buffer.*overflow|audio.*queue.*full/i,
    diagnosis: {
      rootCause: 'Audio processing buffer overflowed, likely due to slow processing',
      confidence: 0.85,
      suggestedFix: 'Increase buffer size or optimize audio processing',
      humanExplanation: 'I was talking too fast and got ahead of myself.',
      autoFixable: true,
      fixType: 'restart',
    },
  },

  // =========================================================================
  // STT / Transcription (Deepgram)
  // =========================================================================
  {
    pattern: /deepgram.*error|stt.*failed|transcription.*error/i,
    diagnosis: {
      rootCause: 'Speech-to-text service (Deepgram) returned an error',
      confidence: 0.9,
      suggestedFix: 'Retry connection, check API status',
      humanExplanation: 'I had trouble hearing you for a moment.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /no.*speech.*detected|silence.*timeout/i,
    diagnosis: {
      rootCause: 'No speech was detected in the audio stream',
      confidence: 0.8,
      suggestedFix: 'Check microphone input, prompt user to speak',
      humanExplanation: "I couldn't hear anything - are you still there?",
      autoFixable: false,
      fixType: 'escalate',
    },
  },

  // =========================================================================
  // AI / LLM (Gemini, OpenAI)
  // =========================================================================
  {
    pattern: /gemini.*error|generative.*ai.*error/i,
    diagnosis: {
      rootCause: 'Gemini AI service returned an error',
      confidence: 0.9,
      suggestedFix: 'Retry with exponential backoff, check API quotas',
      humanExplanation: 'I had a little thinking hiccup.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /openai.*error|gpt.*error/i,
    diagnosis: {
      rootCause: 'OpenAI service returned an error',
      confidence: 0.9,
      suggestedFix: 'Retry with exponential backoff, check API status',
      humanExplanation: 'I got a bit confused for a moment.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /context.*length.*exceeded|token.*limit/i,
    diagnosis: {
      rootCause: 'LLM context window was exceeded',
      confidence: 0.95,
      suggestedFix: 'Truncate conversation history or summarize',
      humanExplanation: "We've covered so much ground! Let me catch up.",
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /safety.*filter|content.*blocked|content.*policy/i,
    diagnosis: {
      rootCause: 'LLM safety filter blocked the response',
      confidence: 0.9,
      suggestedFix: 'Rephrase request or adjust safety settings',
      humanExplanation: 'I need to be careful about how I respond to that.',
      autoFixable: false,
      fixType: 'escalate',
    },
  },
  {
    pattern: /rate.*limit.*exceeded|quota.*exceeded|429/i,
    diagnosis: {
      rootCause: 'API rate limit or quota was exceeded',
      confidence: 0.95,
      suggestedFix: 'Wait and retry, implement rate limiting',
      humanExplanation: "I've been too chatty - give me a moment to catch my breath.",
      autoFixable: true,
      fixType: 'retry',
    },
  },

  // =========================================================================
  // Database (Firestore)
  // =========================================================================
  {
    pattern: /firestore.*error|database.*unavailable/i,
    diagnosis: {
      rootCause: 'Firestore database returned an error or is unavailable',
      confidence: 0.9,
      suggestedFix: 'Retry operation, check Firestore status',
      humanExplanation: 'I had trouble remembering something. Let me try again.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /permission.*denied|unauthorized/i,
    diagnosis: {
      rootCause: 'Database permission denied - missing authentication or rules block',
      confidence: 0.9,
      suggestedFix: 'Check authentication and Firestore security rules',
      humanExplanation: "I wasn't able to access that information.",
      autoFixable: false,
      fixType: 'escalate',
    },
  },
  {
    pattern: /transaction.*aborted|optimistic.*lock/i,
    diagnosis: {
      rootCause: 'Database transaction conflict - concurrent modification',
      confidence: 0.85,
      suggestedFix: 'Retry the transaction',
      humanExplanation: 'I stumbled over my notes - let me try that again.',
      autoFixable: true,
      fixType: 'retry',
    },
  },

  // =========================================================================
  // Network / Connection
  // =========================================================================
  {
    pattern: /ECONNRESET|socket hang up/i,
    diagnosis: {
      rootCause: 'Network connection was reset by the remote server',
      confidence: 0.8,
      suggestedFix: 'Retry the operation with exponential backoff',
      humanExplanation: 'The connection dropped briefly.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /ETIMEDOUT|connection.*timed?\s*out/i,
    diagnosis: {
      rootCause: 'Network request timed out waiting for response',
      confidence: 0.85,
      suggestedFix: 'Increase timeout or check network connectivity',
      humanExplanation: 'Things are running a bit slow - let me try again.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /ENOTFOUND|DNS.*error|getaddrinfo/i,
    diagnosis: {
      rootCause: 'DNS resolution failed - hostname not found',
      confidence: 0.9,
      suggestedFix: 'Check DNS configuration and network connectivity',
      humanExplanation: "I couldn't find the service I needed.",
      autoFixable: true,
      fixType: 'circuit_break',
    },
  },
  {
    pattern: /ECONNREFUSED|connection.*refused/i,
    diagnosis: {
      rootCause: 'Connection refused by the remote server',
      confidence: 0.9,
      suggestedFix: 'Check if the target service is running',
      humanExplanation: "The service I needed isn't responding.",
      autoFixable: true,
      fixType: 'circuit_break',
    },
  },
  {
    pattern: /SSL.*error|certificate.*error|TLS.*handshake/i,
    diagnosis: {
      rootCause: 'SSL/TLS certificate or handshake error',
      confidence: 0.85,
      suggestedFix: 'Check certificate validity and TLS configuration',
      humanExplanation: 'I had trouble establishing a secure connection.',
      autoFixable: false,
      fixType: 'escalate',
    },
  },

  // =========================================================================
  // Memory / Resources
  // =========================================================================
  {
    pattern: /out of memory|heap.*out|javascript.*heap/i,
    diagnosis: {
      rootCause: 'Process ran out of memory',
      confidence: 0.95,
      suggestedFix: 'Increase memory limits or optimize memory usage',
      humanExplanation: 'I was thinking about too many things at once.',
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /EMFILE|too many open files/i,
    diagnosis: {
      rootCause: 'Process exceeded file descriptor limit',
      confidence: 0.9,
      suggestedFix: 'Close unused connections, increase ulimit',
      humanExplanation: 'I got overwhelmed with tasks. Let me reset.',
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /ENOMEM|cannot allocate memory/i,
    diagnosis: {
      rootCause: 'System out of memory, allocation failed',
      confidence: 0.95,
      suggestedFix: 'Restart container, check memory leaks',
      humanExplanation: 'The system is running low on resources.',
      autoFixable: true,
      fixType: 'restart',
    },
  },

  // =========================================================================
  // Authentication
  // =========================================================================
  {
    pattern: /invalid.*token|token.*expired|authentication.*failed/i,
    diagnosis: {
      rootCause: 'Authentication token is invalid or expired',
      confidence: 0.9,
      suggestedFix: 'Refresh authentication token',
      humanExplanation: 'I need to re-verify my credentials.',
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /api.*key.*invalid|invalid.*api.*key/i,
    diagnosis: {
      rootCause: 'API key is invalid or missing',
      confidence: 0.95,
      suggestedFix: 'Check API key configuration',
      humanExplanation: "I can't access that service right now.",
      autoFixable: false,
      fixType: 'escalate',
    },
  },

  // =========================================================================
  // External APIs / Integrations
  // =========================================================================
  {
    pattern: /spotify.*error|spotify.*unavailable/i,
    diagnosis: {
      rootCause: 'Spotify API returned an error',
      confidence: 0.85,
      suggestedFix: 'Check Spotify authentication and API status',
      humanExplanation: "I'm having trouble with the music service.",
      autoFixable: true,
      fixType: 'circuit_break',
    },
  },
  {
    pattern: /calendar.*error|google.*calendar.*error/i,
    diagnosis: {
      rootCause: 'Google Calendar API returned an error',
      confidence: 0.85,
      suggestedFix: 'Check calendar permissions and API status',
      humanExplanation: "I couldn't check your calendar right now.",
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /weather.*error|weather.*unavailable/i,
    diagnosis: {
      rootCause: 'Weather API returned an error',
      confidence: 0.8,
      suggestedFix: 'Retry request or use fallback provider',
      humanExplanation: "I couldn't get the weather information.",
      autoFixable: true,
      fixType: 'retry',
    },
  },
  {
    pattern: /smart.*home.*error|home.*assistant.*error/i,
    diagnosis: {
      rootCause: 'Smart home integration returned an error',
      confidence: 0.8,
      suggestedFix: 'Check smart home hub connectivity',
      humanExplanation: 'I had trouble controlling your smart home.',
      autoFixable: true,
      fixType: 'retry',
    },
  },

  // =========================================================================
  // Process / Container
  // =========================================================================
  {
    pattern: /SIGKILL|killed|OOMKilled/i,
    diagnosis: {
      rootCause: 'Process was killed, likely by OOM killer',
      confidence: 0.9,
      suggestedFix: 'Increase memory limits, check for memory leaks',
      humanExplanation: "I got shut down unexpectedly. I'm back now!",
      autoFixable: true,
      fixType: 'restart',
    },
  },
  {
    pattern: /SIGTERM|graceful.*shutdown/i,
    diagnosis: {
      rootCause: 'Process received shutdown signal',
      confidence: 0.95,
      suggestedFix: 'This is expected during deployments',
      humanExplanation: 'I needed to restart briefly. All good now!',
      autoFixable: false,
      fixType: 'escalate',
    },
  },
  {
    pattern: /container.*crashed|pod.*restart/i,
    diagnosis: {
      rootCause: 'Container crashed and was restarted',
      confidence: 0.85,
      suggestedFix: 'Check container logs for root cause',
      humanExplanation: "I had to take a quick restart. I'm back!",
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
  const { GoogleGenAI } = await import('@google/genai');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const genai = new GoogleGenAI({ apiKey });

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

  const response = await genai.models.generateContent({
    model: getDefaultModel(),
    contents: prompt,
  });

  const responseText = response.text ?? '';

  // Extract JSON from response (in case of markdown wrapping)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Gemini response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as DiagnosticResult;

  return {
    ...parsed,
    metadata: {
      analyzedBy: getDefaultModel(),
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
