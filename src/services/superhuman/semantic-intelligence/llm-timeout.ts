/**
 * The timed model call behind llm-detector.ts.
 *
 * Prod logged 84 `LLM call failed` warnings in 12 days, every one a timeout (#4404). The call
 * raced the model against a `setTimeout` that was never cleared when the model won, so each call
 * left a live timer for the full timeout, and the request that lost the race kept running. A
 * timeout is also an expected outcome: the detector falls back and the member sees nothing.
 *
 * `generateWithTimeout` aborts the request at the timeout, clears the timer however the call
 * ends, and counts the outcome. A timeout logs at info (see `timeoutLogLevel`), and warns only
 * when most of the recent calls are timing out.
 *
 * @module services/superhuman/semantic-intelligence/llm-timeout
 */

export class LlmTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super('LLM timeout');
    this.name = 'LlmTimeoutError';
  }
}

export interface GenerateRequest {
  model: string;
  contents: string;
  config: { maxOutputTokens: number; temperature: number };
}

interface GenerateClient {
  models: {
    generateContent: (
      params: GenerateRequest & { config: { abortSignal: AbortSignal } }
    ) => Promise<{ text: string }>;
  };
}

/** Recent calls that reached the model, for the timeout rate. */
const WINDOW_MS = 10 * 60 * 1000;
const WARN_MIN_CALLS = 10;
const WARN_TIMEOUT_RATE = 0.5;
let outcomes: Array<{ at: number; timedOut: boolean }> = [];

function record(timedOut: boolean): void {
  const now = Date.now();
  outcomes = outcomes.filter((o) => now - o.at < WINDOW_MS);
  outcomes.push({ at: now, timedOut });
}

/** `info` for an expected timeout; `warn` once at least half of 10+ recent calls timed out. */
export function timeoutLogLevel(): 'info' | 'warn' {
  const now = Date.now();
  const recent = outcomes.filter((o) => now - o.at < WINDOW_MS);
  const timeouts = recent.filter((o) => o.timedOut).length;
  return recent.length >= WARN_MIN_CALLS && timeouts / recent.length >= WARN_TIMEOUT_RATE
    ? 'warn'
    : 'info';
}

/** The text of one model call, aborted and rejected with LlmTimeoutError after `timeoutMs`. */
export async function generateWithTimeout(
  client: unknown,
  request: GenerateRequest,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      (client as GenerateClient).models.generateContent({
        ...request,
        config: { ...request.config, abortSignal: controller.signal },
      }),
      timedOut,
    ]);
    record(false);
    return response?.text?.trim() || '';
  } catch (error) {
    if (error instanceof LlmTimeoutError) record(true);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
