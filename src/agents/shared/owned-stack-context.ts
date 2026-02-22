/**
 * Build context string for the owned-stack LLM (Higgs generate_reply).
 *
 * Used when USE_OWNED_STACK=true so our Candle/Ollama model gets persona + recent conversation
 * without calling Gemini/OpenAI.
 *
 * @module agents/shared/owned-stack-context
 */

import type { PersonaConfig } from '../../personas/types.js';
import type { SessionServices } from '../../services/types.js';

const MAX_RECENT_TURNS = 6;

/**
 * Build a single context string for Higgs generate_reply from persona and optional recent turns.
 */
export function buildOwnedStackContext(opts: {
  sessionPersona: PersonaConfig;
  services?: SessionServices | null;
  /** Optional extra context (e.g. "Greet the user warmly. One sentence." for greeting). */
  extra?: string;
}): string {
  const { sessionPersona, services, extra } = opts;
  const parts: string[] = [];

  parts.push(`You are ${sessionPersona.displayName || sessionPersona.name || sessionPersona.id}, a warm and supportive voice assistant.`);
  parts.push('Reply in 1-3 short sentences. Be concise and natural for spoken delivery.');
  parts.push('Do not use markdown, bullet points, or special formatting.');
  parts.push('');
  parts.push('If you need to call a tool, output ONLY a JSON object: {"fn":"toolName","args":{"key":"value"}}');
  parts.push('Do not wrap it in backticks or add any other text. Available tools include: playMusic, rememberAboutUser, recallFromMemory, getCurrentTime, getWeather, setTimer, searchWeb.');

  const turns = services?.historyTracker?.getSimpleTurns?.();
  if (turns && turns.length > 0) {
    const recent = turns.slice(-MAX_RECENT_TURNS);
    const lines = recent.map(
      (t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content || ''}`
    );
    parts.push('\nRecent conversation:');
    parts.push(lines.join('\n'));
  }

  if (extra && extra.trim()) {
    parts.push('\n');
    parts.push(extra.trim());
  }

  return parts.join('\n');
}

/**
 * Build greeting-specific context for owned stack (first message when user joins).
 */
export function buildOwnedStackGreetingContext(opts: {
  sessionPersona: PersonaConfig;
}): string {
  const { sessionPersona } = opts;
  const name = sessionPersona.displayName || sessionPersona.name || sessionPersona.id;
  return `Greet the user warmly as ${name}. One short sentence. Do not repeat your name if you already said it.`;
}
