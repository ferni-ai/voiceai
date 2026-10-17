/**
 * LLM_CONTEXT_CACHE=on: one switch for the cascade's Gemini prompt-cache
 * settings. It turns on the prompt-prefix ordering (PROMPT_STABLE_PREFIX), the
 * append-only tool order (CASCADE_APPEND_ONLY_TOOLS) and the prompt-cache warm
 * (CASCADE_CACHE_WARM). It does not change which tools are sent: TOOL_CORE_STATIC
 * and TOOL_RETRIEVAL keep their own flags. Off (the default): each of the three
 * flags decides alone, as before.
 *
 * Read only in agents/multi-agent/agent-instructions.ts, agents/model-provider/cache-warm.ts
 * and config/tool-config.ts.
 *
 * @module config/llm-context-cache-flag
 */

export function llmContextCacheEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.LLM_CONTEXT_CACHE?.trim().toLowerCase() === 'on';
}
