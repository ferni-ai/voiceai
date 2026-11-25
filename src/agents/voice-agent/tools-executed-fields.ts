/**
 * What a log line may say about a FunctionToolsExecuted event: which tools ran, whether each
 * failed, and how big their arguments and results were. The event itself carries the
 * arguments the model wrote from the caller's words (a contact, a purpose, a search) and the
 * tool's whole output (a memory recall, a message), so it is never logged whole.
 *
 * Argument names are kept (they come from the tool's schema); argument values and outputs
 * are measured, never copied. Every string is cut to an id's length.
 *
 * @module agents/voice-agent/tools-executed-fields
 */

/** Longest string a field keeps: the length of an id. */
const FIELD_MAX = 40;
/** Most argument names kept per tool. */
const ARG_KEYS_MAX = 20;

interface ExecutedCall {
  callId?: unknown;
  name?: unknown;
  args?: unknown;
  arguments?: unknown;
}
interface ExecutedOutput {
  callId?: unknown;
  name?: unknown;
  output?: unknown;
  isError?: unknown;
}
interface ExecutedLegacyTool {
  name?: unknown;
  result?: unknown;
  error?: unknown;
}
interface ExecutedEvent {
  functionCalls?: ExecutedCall[];
  functionCallOutputs?: ExecutedOutput[];
  tools?: ExecutedLegacyTool[];
  name?: unknown;
  toolName?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface ToolExecutedFields {
  name: string;
  isError: boolean;
  /** Names of the arguments the model passed. */
  argKeys: string[];
  /** Size of the arguments as JSON. */
  argChars: number;
  /** Size of the output as text or JSON. */
  outputChars: number;
}

const cut = (value: unknown): string =>
  typeof value === 'string' && value ? value.slice(0, FIELD_MAX) : 'unknown';

/** Characters in a value as text or JSON; -1 when it cannot be measured. */
function chars(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string') return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return -1;
  }
}

/** The arguments' names and size. The SDK passes them as a JSON string; a bad one has no names. */
function measureArgs(
  call: ExecutedCall | undefined
): Pick<ToolExecutedFields, 'argKeys' | 'argChars'> {
  const raw = call?.args ?? call?.arguments;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { argKeys: [], argChars: raw.length };
    }
  }
  const isObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  const names = isObject ? Object.keys(parsed as object) : [];
  return {
    argKeys: names.slice(0, ARG_KEYS_MAX).map((k) => k.slice(0, FIELD_MAX)),
    argChars: chars(raw),
  };
}

/** One entry per tool that ran in the event, in the shapes the SDK and older callers use. */
export function toolsExecutedFields(event: unknown): {
  toolCount: number;
  tools: ToolExecutedFields[];
} {
  const e = (typeof event === 'object' && event !== null ? event : {}) as ExecutedEvent;
  const calls = Array.isArray(e.functionCalls) ? e.functionCalls : [];
  let tools: ToolExecutedFields[];
  if (Array.isArray(e.functionCallOutputs) && e.functionCallOutputs.length > 0) {
    tools = e.functionCallOutputs.map((out, i) => {
      const call = calls.find((c) => c.callId !== undefined && c.callId === out.callId) ?? calls[i];
      return {
        name: cut(out.name ?? call?.name),
        isError: out.isError === true,
        ...measureArgs(call),
        outputChars: chars(out.output),
      };
    });
  } else if (Array.isArray(e.tools) && e.tools.length > 0) {
    tools = e.tools.map((t) => ({
      name: cut(t.name),
      isError: t.error !== undefined && t.error !== null,
      argKeys: [],
      argChars: 0,
      outputChars: chars(t.result),
    }));
  } else {
    tools = [
      {
        name: cut(e.name ?? e.toolName),
        isError: e.error !== undefined && e.error !== null,
        argKeys: [],
        argChars: 0,
        outputChars: chars(e.result),
      },
    ];
  }
  return { toolCount: tools.length, tools };
}
