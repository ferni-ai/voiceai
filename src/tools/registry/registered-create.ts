/**
 * The layers ToolRegistry.register() puts around every tool's create(), outermost first:
 *
 * 1. user-id-guard.ts: the session's userId wins over one the model passed.
 * 2. write-results.ts (LATE_WRITE_RESULT_KEPT): a write that lands after a barge-in still reaches
 *    the model. Outermost of the result layers, so it keeps what the model would have read (#4303).
 * 3. result-errors.ts (TOOL_RESULT_ERRORS): a `{ success: false }` result reaches the model as an
 *    error. A returned ToolError is an Error, so layer 2 does not keep it.
 * 4. outbound-gate.ts: calls and texts wait for the caller's yes.
 *
 * @module tools/registry/registered-create
 */
import { gateOutboundTool } from './outbound-gate.js';
import { withToolResultErrors } from './result-errors.js';
import type { ToolDefinition } from './types.js';
import { wrapCreateWithUserIdGuard } from './user-id-guard.js';
import { keepLateWriteResults } from './write-results.js';

export function registeredCreate(definition: ToolDefinition): ToolDefinition['create'] {
  return wrapCreateWithUserIdGuard(
    keepLateWriteResults(withToolResultErrors(gateOutboundTool(definition)))
  );
}
