/**
 * Tools that call, text or email someone else for the caller are offered only
 * to a verified account owner: a signed-in app user or a caller recognised by
 * a signed attestation (caller-recognition.ts, sessionIsVerifiedOwner). An
 * anonymous phone caller asked Ferni to ring someone; the tool was offered and
 * ran. Now it leaves the request and the agent, and the tool itself still
 * refuses a caller with no account (tools/registry/outbound-gate.ts).
 *
 * Test accounts keep them: they never reach anyone (outreach-confirm.ts), and
 * evals check which tool the model picks.
 *
 * @module agents/shared/third-party-tools
 */
import { llm } from '@livekit/agents';

import { THIRD_PARTY_TOOLS } from '../../tools/registry/outbound-gate.js';
import { isSyntheticUserId } from '../../utils/synthetic-user.js';

/** Whether this session's caller may be offered tools that reach other people. */
export function mayReachOthers(
  userId: string | undefined,
  sessionId: string | undefined,
  verifiedOwner: (sessionId: string) => boolean
): boolean {
  if (isSyntheticUserId(userId)) return true;
  return sessionId !== undefined && verifiedOwner(sessionId);
}

/** Whether `toolCtx` holds any tool that reaches other people. */
export function hasThirdPartyTools(toolCtx: llm.ToolContext): boolean {
  return Object.keys(toolCtx.functionTools).some((name) => THIRD_PARTY_TOOLS.has(name));
}

/** `toolCtx` without the third-party tools (the same object when it has none). */
export function withoutThirdPartyTools(toolCtx: llm.ToolContext): llm.ToolContext {
  if (!hasThirdPartyTools(toolCtx)) return toolCtx;
  const tools = toolCtx.functionTools;
  const keep = Object.entries(tools)
    .filter(([name]) => !THIRD_PARTY_TOOLS.has(name))
    .map(([, tool]) => tool);
  return new llm.ToolContext([...keep, ...toolCtx.providerTools]);
}
