/**
 * The phone-safe cut of a turn's tools (toolsForTurn, turn-request.ts), and under
 * PHONE_SAFE_SETTLED_HOLD giving the agent its tools back once no cut applies.
 *
 * @module agents/personas/phone-safe-cut
 */
import type { llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { onlyPhoneSafeTools } from '../shared/phone-safe-tools.js';
import { withPinnedTools } from './turn-request-tools.js';

const log = createLogger({ module: 'FerniAgent' }); // turn-request.ts's, so its lines read the same

type AgentTools = Parameters<llm.ToolContext['updateTools']>[0];

export interface ToolHolder {
  readonly toolCtx: llm.ToolContext;
  updateTools: (tools: llm.ToolContext | AgentTools) => Promise<void>;
}

/** Per-agent state the cut reads and keeps. */
export interface PhoneSafeCutState {
  /** The agent, so tools a phone-only caller can't use come off it too (phone-safe-tools.ts). */
  agent?: object;
  /** PHONE_SAFE_SETTLED_HOLD: the agent's tools before its first phone-safe cut, given back after. */
  beforeCut?: AgentTools;
}

/**
 * A caller known only by their phone number, or a session on no account (the
 * person on a call placed for a member): every tool not on the phone-safe
 * allowlist leaves the request and the agent itself, so a call to one can't
 * run (phone-safe-tools.ts). endCall, support and handoffs stay.
 * PHONE_SAFE_SETTLED_HOLD on: `reason` is set, logged with the counts, and the
 * agent's tools before its first cut are kept for withToolsBack.
 */
export async function withoutAccountTools(
  toolCtx: llm.ToolContext,
  state: PhoneSafeCutState,
  also: ReadonlySet<string> | undefined, // phone-safe-also.ts
  reason?: string
): Promise<llm.ToolContext> {
  const agent = state.agent as ToolHolder | undefined;
  if (agent && onlyPhoneSafeTools(agent.toolCtx, also) !== agent.toolCtx) {
    if (reason === undefined) {
      await agent.updateTools(onlyPhoneSafeTools(agent.toolCtx, also));
      log.info({}, 'Only phone-safe tools open for a phone-recognised caller');
    } else {
      const before = agent.toolCtx.tools.length;
      state.beforeCut ??= [...agent.toolCtx.tools];
      await agent.updateTools(onlyPhoneSafeTools(agent.toolCtx, also));
      log.info({ reason, before, after: agent.toolCtx.tools.length }, 'Only phone-safe tools open');
    }
  }
  return onlyPhoneSafeTools(toolCtx, also);
}

/**
 * PHONE_SAFE_SETTLED_HOLD, a verified owner's turn with no cut: the agent gets back the tools it
 * had before its first cut, and this turn's request carries them (withPinnedTools adds what the
 * agent has that the request lacks). Only when changing the agent's tools is safe mid-session.
 */
export async function withToolsBack(
  toolCtx: llm.ToolContext,
  state: PhoneSafeCutState
): Promise<void> {
  const agent = state.agent as ToolHolder | undefined;
  if (!agent || state.beforeCut === undefined) return;
  const { isMidSessionToolUpdateSafe } = await import('../shared/tool-updater.js');
  const tools = state.beforeCut; // read after the await: a turn in between may have used it
  if (tools === undefined || !isMidSessionToolUpdateSafe()) return;
  state.beforeCut = undefined;
  const before = agent.toolCtx.tools.length;
  await agent.updateTools(tools);
  withPinnedTools(toolCtx, agent);
  log.info({ before, after: agent.toolCtx.tools.length }, 'Tools back after the hold cleared');
}
