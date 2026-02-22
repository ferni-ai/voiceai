/**
 * Speculative LLM Execution
 *
 * On partial transcript with >70% completion confidence:
 * - Start LLM inference speculatively
 * - On final transcript: if prefix matches (>80% overlap), continue existing generation
 * - If mismatch: abort and restart
 *
 * Part of Stream 2: Sub-200ms Pipeline Latency.
 *
 * @module agents/shared/performance/speculative-llm
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'speculative-llm' });

interface SpeculativeSession {
  partialTranscript: string;
  completionConfidence: number;
  abortController: AbortController;
  generationPromise: Promise<string> | null;
  startedAt: number;
}

const activeSessions = new Map<string, SpeculativeSession>();

/** Calculate overlap ratio between partial and final transcript */
export function calculateOverlap(partial: string, final_: string): number {
  const p = partial.toLowerCase().trim();
  const f = final_.toLowerCase().trim();
  if (!p || !f) return 0;
  if (f.startsWith(p)) return 1.0;
  let matching = 0;
  const minLen = Math.min(p.length, f.length);
  for (let i = 0; i < minLen; i++) {
    if (p[i] === f[i]) matching++;
    else break;
  }
  return matching / p.length;
}

/** Start speculative LLM execution on a high-confidence partial transcript */
export function startSpeculativeExecution(
  sessionId: string,
  partialTranscript: string,
  completionConfidence: number,
  generateFn: (transcript: string, signal: AbortSignal) => Promise<string>
): void {
  if (completionConfidence < 0.7) return;

  const existing = activeSessions.get(sessionId);
  if (existing) {
    existing.abortController.abort();
    log.debug({ sessionId }, 'Cancelled previous speculative execution');
  }

  const abortController = new AbortController();
  const session: SpeculativeSession = {
    partialTranscript,
    completionConfidence,
    abortController,
    generationPromise: null,
    startedAt: Date.now(),
  };

  session.generationPromise = generateFn(partialTranscript, abortController.signal);
  activeSessions.set(sessionId, session);

  log.debug(
    { sessionId, confidence: completionConfidence, len: partialTranscript.length },
    'Started speculative LLM execution'
  );
}

/**
 * Resolve speculative execution against final transcript.
 * Returns the speculative result if overlap is sufficient, null otherwise.
 */
export async function resolveSpeculativeExecution(
  sessionId: string,
  finalTranscript: string
): Promise<string | null> {
  const session = activeSessions.get(sessionId);
  if (!session || !session.generationPromise) {
    return null;
  }

  const overlap = calculateOverlap(session.partialTranscript, finalTranscript);

  if (overlap >= 0.8) {
    try {
      const result = await session.generationPromise;
      const savedMs = Date.now() - session.startedAt;
      log.info(
        { sessionId, overlap: overlap.toFixed(2), savedMs },
        'Speculative hit! Reusing LLM result'
      );
      activeSessions.delete(sessionId);
      return result;
    } catch {
      activeSessions.delete(sessionId);
      return null;
    }
  } else {
    session.abortController.abort();
    activeSessions.delete(sessionId);
    log.debug({ sessionId, overlap: overlap.toFixed(2) }, 'Speculative miss, aborting');
    return null;
  }
}

/** Cancel all speculative executions for a session */
export function cancelSpeculativeExecution(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.abortController.abort();
    activeSessions.delete(sessionId);
  }
}

/** Get stats for monitoring */
export function getSpeculativeStats(): { activeCount: number } {
  return { activeCount: activeSessions.size };
}
