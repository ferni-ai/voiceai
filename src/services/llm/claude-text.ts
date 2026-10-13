/**
 * Background LLM calls on Claude, chosen per task.
 *
 * Ferni's thought (2.38) and recall (1.25) scored below a good friend
 * (judge.mjs, prod 2026-10-10), and recall rests on background work: the
 * end-of-call summary and its follow-up items, world-model extraction, and the
 * outreach text written between calls. None of it runs while the caller is
 * talking, so it can use a stronger model than the realtime reply does.
 *
 * CLAUDE_LLM_TASKS lists the tasks that try Claude first, e.g.
 * "summary,memory,outreach". An empty or unset list routes nothing (off by
 * default); so does a missing ANTHROPIC_API_KEY. Any Claude failure returns
 * null and the caller falls back to Gemini, so turning a task on can't make it
 * worse than off.
 *
 * Env: CLAUDE_LLM_MODEL (default claude-sonnet-5-5), CLAUDE_LLM_EFFORT
 * (default low), CLAUDE_LLM_TIMEOUT_MS (default: the caller's timeout),
 * ANTHROPIC_WORKSPACE_ID (required by keys not scoped to one workspace, which
 * otherwise get a 400; sent as the anthropic-workspace-id header).
 *
 * @module services/llm/claude-text
 */

import { CircuitOpenError, getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { getLogger } from '../../utils/safe-logger.js';

/** The background jobs that can be routed to Claude. */
export const LLM_TASKS = ['summary', 'memory', 'outreach'] as const;
export type LLMTask = (typeof LLM_TASKS)[number];

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

// Thinking counts against max_tokens, and Sonnet 5.5 thinks adaptively. The
// small caps callers pass for Gemini (summaries 1000) would let thinking eat
// the reply and cut the JSON off, the bug vertex-text.ts fixed for Gemini, so
// Claude gets at least this many. Billing is for tokens used, not the cap.
export const MIN_MAX_TOKENS = 4096;

const breaker = getCircuitBreaker('anthropic', {
  failureThreshold: 3,
  resetTimeout: 60_000,
  successThreshold: 1,
});

type Env = Record<string, string | undefined>;

/** The tasks CLAUDE_LLM_TASKS turns on; unknown names are ignored. */
export function claudeTasks(env: Env = process.env): Set<LLMTask> {
  const names = (env.CLAUDE_LLM_TASKS ?? '').split(',').map((s) => s.trim());
  return new Set(LLM_TASKS.filter((t) => names.includes(t)));
}

/** True when this task is listed in CLAUDE_LLM_TASKS and a key is set. */
export function routesToClaude(task: LLMTask | undefined, env: Env = process.env): boolean {
  return Boolean(task && env.ANTHROPIC_API_KEY && claudeTasks(env).has(task));
}

interface ClaudeReply {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: { type?: string; message?: string };
}

export interface ClaudeTextOptions {
  maxTokens?: number;
  timeout?: number;
}

/** Claude's text reply, or null on any failure (the caller falls back to Gemini). */
export async function claudeText(
  prompt: string,
  options: ClaudeTextOptions = {},
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key || !breaker.canRequest()) return null;
  const model = env.CLAUDE_LLM_MODEL || DEFAULT_MODEL;
  const timeout = Number(env.CLAUDE_LLM_TIMEOUT_MS) || options.timeout || 15_000;
  // No temperature: current Claude models sample at their default.
  const body = {
    model,
    max_tokens: Math.max(options.maxTokens ?? 0, MIN_MAX_TOKENS),
    output_config: { effort: env.CLAUDE_LLM_EFFORT || 'low' },
    messages: [{ role: 'user', content: prompt }],
  };
  try {
    return await breaker.execute(async () => {
      const res = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          ...(env.ANTHROPIC_WORKSPACE_ID
            ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      const reply = (await res.json()) as ClaudeReply;
      if (!res.ok)
        throw new Error(
          `claude ${res.status}: ${reply.error?.type ?? ''} ${reply.error?.message ?? ''}`
        );
      const text = (reply.content ?? [])
        .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
        .join('')
        .trim();
      if (reply.stop_reason === 'max_tokens') {
        getLogger().warn(
          { model, maxTokens: body.max_tokens, chars: text.length },
          'Claude reply cut off at max_tokens'
        );
      }
      if (reply.stop_reason === 'refusal') throw new Error('claude refused');
      return text || null;
    });
  } catch (error) {
    if (!(error instanceof CircuitOpenError)) {
      getLogger().warn(
        { model, error: String(error) },
        'Claude background call failed, falling back to Gemini'
      );
    }
    return null;
  }
}
