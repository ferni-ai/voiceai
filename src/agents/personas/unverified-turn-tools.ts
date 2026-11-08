/**
 * UNVERIFIED_TURN_TOOLS=on: a turn whose speaker is unverified (#3091: an identity note couldn't be
 * built, turn-note-guard.ts) is offered only tools that read or write no owner data and take no
 * account action (#3305). Before this, only one sentence of the reminder held the model back.
 *
 * The rule: an unverified turn offers only crisis/safety tools (SAFETY_TOOLS) and fixed-text
 * presence tools (PRESENCE_TOOLS), 19 names pinned by unverified-turn-tools.test.ts. A tool joins
 * only with a test proving it reads and writes no owner data. Everything else leaves the request.
 * Not the phone-safe list (phone-safe-tools.ts): reusing it kept importing tools that touch the
 * owner's account (getWeather read the saved home; the music games wrote the owner's game record).
 *
 * Taking a tool off the request is not enough on its own: the SDK runs a tool call against the
 * reply's full tool context, not the request's (@livekit/agents voice/agent_activity.js hands
 * `this.tools` to both llmNode and performToolExecutions; generation.js looks the call up with
 * toolCtx.getFunctionTool). Every call it runs comes from llmNode's own output (generation.js
 * reads `delta.toolCalls` there), so the reply drops a call to any tool this request didn't offer.
 * The agent's tools are never changed per turn: that restarts a realtime session.
 *
 * A verified turn, and every turn with the flag off, gets the same tools and reply objects back.
 */
import { type ReadableStream, TransformStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { requestIsUnverified } from './turn-note-guard.js';

const log = createLogger({ module: 'UnverifiedTurnTools' });

/**
 * Every tool of the crisis and human-transfer domains (src/tools/domains/crisis and
 * human-transfer): helpline text, grounding, the safety plan and the warm handoff to a
 * professional. None reads or stores account data. Pinned against those domains by
 * unverified-turn-tools.test.ts, so a new crisis tool fails it until it is added here.
 */
export const SAFETY_TOOLS: ReadonlySet<string> = new Set([
  'connectToHumanExpert',
  'createSafetyPlan',
  'deEscalateAnxiety',
  'evaluateHumanTransfer',
  'findFinancialAssistance',
  'findSafeResources',
  'guideGroundingExercise',
  'provideCrisisResources',
  'quickCrisisResources',
  'supportRecoveryJourney',
  'trackSobrietyMilestone',
]);

/**
 * Presence and trauma-support exercises (src/tools/domains/presence, trauma-support): each returns
 * fixed guidance text and stores nothing (not savorExperience or recognizeFlow, which do).
 */
const PRESENCE_TOOLS: ReadonlySet<string> = new Set([
  'breatheWithMe',
  'groundingExercise',
  'groundingForTrauma',
  'naturePrescription',
  'noticeThisMoment',
  'selfCompassionTrauma',
  'somaticSupport',
  'windowOfTolerance',
]);

/** Offered on an unverified turn: a crisis/safety tool or a fixed-text presence tool, no other. */
export const offeredWhenUnverified = (name: string): boolean =>
  SAFETY_TOOLS.has(name) || PRESENCE_TOOLS.has(name);

/** Spoken in place of a dropped call when the reply had nothing else: never silence. */
const NOT_VERIFIED_LINE = "I can't do that until I know it's you.";

/** The tools a request offers, and its reply with no call to a tool it didn't offer. */
export interface RequestTools {
  tools: llm.ToolContext;
  /** Verified or flag off: the reply itself, the same object. */
  reply: <T>(reply: Promise<T> | T) => Promise<T> | T;
}

/** For PersonaVoiceAgent.llmNode: `tools` and the reply as they are, unless (flag on) unverified. */
export function toolsForRequest(
  request: llm.ChatContext,
  tools: llm.ToolContext,
  env: Env = process.env
): RequestTools {
  if (!flagOn('UNVERIFIED_TURN_TOOLS', env) || !requestIsUnverified(request)) {
    return { tools, reply: (reply) => reply };
  }
  // Provider tools and toolsets aren't allowlisted, so they go too.
  const offered = new llm.ToolContext(
    Object.entries(tools.functionTools)
      .filter(([name]) => offeredWhenUnverified(name))
      .map(([, tool]) => tool)
  );
  const names = new Set(Object.keys(offered.functionTools));
  return { tools: offered, reply: (reply) => onlyCallsTo(reply, names) };
}

interface CallChunk {
  id?: string;
  delta?: { content?: string; toolCalls?: Array<{ type?: string; name?: string }> };
}
type Call = { type?: string; name?: string };

/**
 * The reply without a function call to any tool outside `names` (logged by tool name only). A
 * reply that was only such a call would be silence: it ends with NOT_VERIFIED_LINE instead.
 */
async function onlyCallsTo<T>(reply: Promise<T> | T, names: ReadonlySet<string>): Promise<T> {
  const stream = (await reply) as ReadableStream<unknown> | null | undefined;
  if (!stream) return stream as T;
  const offered = (c: Call): boolean => c.type !== 'function_call' || names.has(c.name ?? '');
  let id = '';
  let dropped = 0;
  let said = false; // words, or a call that runs: the caller hears something either way
  const filtered = stream.pipeThrough(
    new TransformStream<unknown, unknown>({
      transform(chunk, controller) {
        const { delta, id: chunkId } = (chunk ?? {}) as CallChunk;
        id = chunkId ?? id;
        said ||= typeof chunk === 'string' ? chunk.trim() !== '' : !!delta?.content?.trim();
        const calls = delta?.toolCalls;
        if (!calls) return controller.enqueue(chunk);
        const kept = calls.filter(offered);
        said ||= kept.some((c) => c.type === 'function_call');
        if (kept.length === calls.length) return controller.enqueue(chunk);
        dropped += calls.length - kept.length;
        const names = calls.filter((c) => !offered(c)).map((c) => c.name);
        log.warn({ dropped: names }, 'UNVERIFIED_TURN_TOOLS: call to a tool not offered, dropped');
        controller.enqueue({ ...(chunk as object), delta: { ...delta, toolCalls: kept } });
      },
      flush(controller) {
        if (dropped && !said) {
          controller.enqueue({ id, delta: { role: 'assistant', content: NOT_VERIFIED_LINE } });
        }
      },
    })
  );
  return filtered as T;
}
