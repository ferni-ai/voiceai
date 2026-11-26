/**
 * The SDK side of tools/registry/result-errors.ts (TOOL_RESULT_ERRORS): how to tell the SDK's own
 * tool call (opts.ctx is its voice RunContext) and the error result it sends with isError true
 * (a returned llm.ToolError; @livekit/agents voice/generation.js createToolOutput). Installed on
 * every live call (live-call-behaviors.ts).
 *
 * @module agents/multi-agent/tool-error-adapter
 */
import { llm, voice } from '@livekit/agents';
import { setToolErrorPort, type ToolErrorPort } from '../../tools/registry/index.js';

const sdkToolErrors: ToolErrorPort = {
  sdkRun: (opts) => (opts as { ctx?: unknown } | undefined)?.ctx instanceof voice.RunContext,
  error: (text) => new llm.ToolError(text),
};

export function installToolErrorPort(): void {
  setToolErrorPort(sdkToolErrors);
}
