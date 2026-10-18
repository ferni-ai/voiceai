/**
 * TURN_TOKEN_RECEIPT=on: one `turn_input_tokens` line per caller turn, saying
 * what the model's input was made of, so the biggest part can be cut first
 * (#1542). Time to first token grows with input, and a request is ~22k tokens.
 *
 * Built from the turn's TURN_RECEIPT (turn-receipt.ts), so the two lines always
 * describe the same turn. Four parts, each an estimate of chars/4 (fields end
 * in `Est`): the persona prompt (the agent's instructions), the context
 * injected for this call and turn (recall, turn context, the reminder with the
 * context packet, director notes, other system notes), the tool schemas as the
 * Google plugin declares them (name, description, JSON schema), and the chat
 * history (both sides, tool calls and outputs, the caller's latest words).
 * `totalMeasured` and `cachedMeasured` are the model's own counts
 * (promptTokenCount, cachedContentTokenCount), from the turn's first request;
 * the parts are from its last one (`requests` says how many there were).
 *
 * Off: no tool schema is measured and no line is written.
 *
 * @module agents/shared/turn-input-tokens
 */
import { llm } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { PromptSection, SectionName } from './prompt-sections.js';
import type { TurnReceipt } from './turn-receipt.js';

export const TURN_INPUT_TOKENS_VERSION = 1;
type ChatPart = 'persona' | 'context' | 'history';

/** Which part of the input each prompt section (prompt-sections.ts) belongs to. */
const PART_OF: Record<SectionName, ChatPart> = {
  instructions: 'persona',
  memory_recall: 'context',
  turn_context: 'context',
  tool_announcement: 'context',
  system_other: 'context',
  director_notes: 'context',
  turn_reminder: 'context',
  crisis_guidance: 'context',
  history_user: 'history',
  history_assistant: 'history',
  caller_turn: 'history',
  tool_io: 'history',
};

const log = createLogger({ module: 'TurnInputTokens' });
const tokensEst = (chars: number): number => Math.ceil(chars / 4);

export function turnTokenReceiptEnabled(env: Env = process.env): boolean {
  return flagOn('TURN_TOKEN_RECEIPT', env);
}

/** A function tool as far as its declaration goes (llm.FunctionTool). */
export interface ToolView {
  description?: string;
  parameters?: unknown;
}

// Tool objects are reused across turns: measure each once.
const declChars = new WeakMap<object, number>();

/** Characters of one tool's declaration, as toFunctionDeclarations (agents-plugin-google) builds it. */
function declarationChars(name: string, tool: ToolView): number {
  const known = declChars.get(tool);
  if (known !== undefined) return known;
  let schema: unknown;
  try {
    schema =
      tool.parameters === undefined ? undefined : llm.toJsonSchema(tool.parameters as never, false);
  } catch (error) {
    log.debug({ tool: name, error: String(error) }, 'tool schema not measured');
  }
  const chars = JSON.stringify({ name, description: tool.description ?? '', schema }).length;
  declChars.set(tool, chars);
  return chars;
}

/** Characters of the tool schemas a request carries. Measures, keeps nothing but sizes. */
export function toolSchemaChars(tools: Readonly<Record<string, ToolView>>): number {
  return Object.entries(tools).reduce((n, [name, tool]) => n + declarationChars(name, tool), 0);
}

export interface InputTokenParts {
  personaEst: number;
  contextEst: number;
  toolsEst: number;
  historyEst: number;
  /** The four parts added up. */
  totalEst: number;
}

/** The request's input in four parts, each chars/4 over that part's characters. */
export function inputTokenParts(
  sections: readonly PromptSection[],
  toolChars: number
): InputTokenParts {
  const chars: Record<ChatPart, number> = { persona: 0, context: 0, history: 0 };
  for (const s of sections) chars[PART_OF[s.name]] += s.chars;
  const parts = {
    personaEst: tokensEst(chars.persona),
    contextEst: tokensEst(chars.context),
    toolsEst: tokensEst(toolChars),
    historyEst: tokensEst(chars.history),
  };
  const totalEst = parts.personaEst + parts.contextEst + parts.toolsEst + parts.historyEst;
  return { ...parts, totalEst };
}

export interface TurnInputTokens extends InputTokenParts {
  event: 'turn_input_tokens';
  v: number;
  sessionId: string;
  turn: number;
  personaId: string | null;
  /** The model that answered, from LiveKit's metrics metadata. */
  model: string | null;
  /** The model's promptTokenCount for the turn's first request; null when no request finished. */
  totalMeasured: number | null;
  /** Of those, served from the model's cache (cachedContentTokenCount). */
  cachedMeasured: number | null;
  estimate: 'chars/4';
  toolCount: number | null;
  /** Requests this turn (preemptive, final, after tools): the parts are the last one's. */
  requests: number;
}

/** The `turn_input_tokens` line for a TURN_RECEIPT: sizes and counts only. */
export function turnInputTokens(receipt: TurnReceipt): TurnInputTokens {
  const { tokens, tools, prompt } = receipt;
  return {
    event: 'turn_input_tokens',
    v: TURN_INPUT_TOKENS_VERSION,
    sessionId: receipt.sessionId,
    turn: receipt.turn,
    personaId: receipt.personaId,
    model: tokens?.model ?? null,
    totalMeasured: tokens?.prompt ?? null,
    cachedMeasured: tokens ? tokens.promptCached : null,
    estimate: 'chars/4',
    ...inputTokenParts(prompt.sections, tools.schemaChars ?? 0),
    toolCount: tools.offered,
    requests: prompt.requests,
  };
}

/** Wrap a receipt emitter so each receipt is followed by its `turn_input_tokens` line. */
export function withInputTokens(
  emit: (receipt: TurnReceipt) => void,
  write: (line: TurnInputTokens) => void = (line) => log.info(line, 'turn_input_tokens')
): (receipt: TurnReceipt) => void {
  return (receipt) => {
    emit(receipt);
    write(turnInputTokens(receipt));
  };
}
