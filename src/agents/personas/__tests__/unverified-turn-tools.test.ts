/**
 * UNVERIFIED_TURN_TOOLS (#3305): which tools a request offers, decided per request from the
 * request itself (turn-note-guard.ts requestIsUnverified). Requests are built by the real
 * withTurnReminder and gatedReply; the owner check fails through the call-me note (an IDENTITY
 * note), as #3091's tests do. The session-level proof that a filtered call never runs is
 * unverified-turn-tools-session.test.ts. Every name and line here is made up.
 */
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const fail = vi.hoisted(() => ({ builds: 0, on: new Set<number>() }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // Called once per built reminder: the builds listed in `on` lose the owner check.
  callMeNote: () => {
    if (fail.on.has(++fail.builds)) throw new Error('the owner check failed');
    return '';
  },
}));

const { withTurnReminder } = await import('../turn-request.js');
const { gatedReply, textReply } = await import('../crisis-gate.js');
const { requestIsUnverified } = await import('../turn-note-guard.js');
const { offeredWhenUnverified, SAFETY_TOOLS, toolsForRequest } =
  await import('../unverified-turn-tools.js');
const { DOMAIN_TOOL_IDS } = await import('../../shared/domain-tool-ids.generated.js');
const crisis = await import('../../../tools/domains/crisis/index.js');
const humanTransfer = await import('../../../tools/domains/human-transfer/index.js');
const { resetCrisisClassifierCache } =
  await import('../../../services/safety/crisis-classifier.js');
const { resetCrisisCallRisk } = await import('../../../services/safety/crisis-call-risk.js');

/** Tools that read or write the owner's account, act as them, or hand off with their context. */
const ACCOUNT = [
  'getCalendarToday',
  'createCalendarEvent',
  'setReminder',
  'scheduleReminder',
  'sendMessageNow',
  'quickText',
  'callOnBehalf',
  'quickCall',
  'reachOut',
  'manageContact',
  'getContactInfo',
  'rememberAboutUser',
  'recallFromMemory',
];
/** Every crisis/safety tool: 988 and the helplines, grounding, the safety plan, the human transfer. */
const CRISIS = [
  'provideCrisisResources',
  'quickCrisisResources',
  'findSafeResources',
  'createSafetyPlan',
  'evaluateHumanTransfer',
  'connectToHumanExpert',
  'guideGroundingExercise',
  'deEscalateAnxiety',
  'breatheWithMe',
  'groundingExercise',
  'supportRecoveryJourney',
];

const catalog = (): llm.ToolContext =>
  new llm.ToolContext(
    Object.fromEntries(
      [...ACCOUNT, ...CRISIS, 'getWeather', 'handoffToMaya'].map((name) => [
        name,
        llm.tool({ description: name, parameters: z.object({}), execute: async () => name }),
      ])
    ) as never
  );
const names = (tools: llm.ToolContext): string[] => Object.keys(tools.functionTools).sort();

let n = 0;
const session = (): object => ({ userData: { services: { sessionId: `unverified-${++n}` } } });
function request(said = "what's on my calendar, remind me to call her"): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'user', content: said });
  return c;
}
/** A request as withTurnReminder builds it; `unverified`: its owner check failed. */
function built(unverified: boolean): llm.ChatContext {
  fail.builds = 0;
  fail.on = new Set(unverified ? [1] : []);
  return withTurnReminder(request(), session());
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.UNVERIFIED_TURN_TOOLS = 'on';
  fail.builds = 0;
  fail.on = new Set();
});
afterEach(() => {
  process.env = { ...saved };
});

describe('the tools a request offers (#3305)', () => {
  it('flag on, unverified: no tool that acts on the owner account is offered', () => {
    const offered = names(toolsForRequest(built(true), catalog()).tools);
    for (const name of ACCOUNT) expect(offered).not.toContain(name);
    expect(offered).not.toContain('handoffToMaya'); // a handoff may carry owner context
    expect(offered).not.toContain('getWeather'); // no place named: the owner's saved home
  });

  it('flag on, unverified: every crisis/safety tool is still offered', () => {
    const offered = names(toolsForRequest(built(true), catalog()).tools);
    for (const name of CRISIS) expect(offered).toContain(name);
  });

  it('flag on, verified: the same tools and reply, untouched', async () => {
    const tools = catalog();
    const turn = toolsForRequest(built(false), tools);
    expect(turn.tools).toBe(tools);
    const reply = textReply('ok');
    expect(turn.reply(reply)).toBe(reply);
  });

  it('flag off, unverified: the same tools and reply, untouched', () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'off';
    const tools = catalog();
    const turn = toolsForRequest(built(true), tools);
    expect(turn.tools).toBe(tools);
    const reply = textReply('ok');
    expect(turn.reply(reply)).toBe(reply);
  });
});

describe('each request answers for itself, a crisis-guided re-ask included', () => {
  const LIVE = {
    CRISIS_GUARD_MODE: 'live',
    CRISIS_CLASSIFIER_MODE: 'live',
    CRISIS_GROUNDED_RELEASE: 'off',
  };
  // The classifier reads crisis on words the patterns pass: the first reply is held and re-asked
  // with crisis guidance (crisis-gate.ts holdUntilCleared), on a reminder built again.
  const generate = vi.fn(async () => '{"risk":"crisis","subject":"self"}');

  async function askedTwice(failing: number[]): Promise<Array<[boolean, string[]]>> {
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    fail.builds = 0;
    fail.on = new Set(failing);
    const seen: Array<[boolean, string[]]> = [];
    const model = async (ctx: llm.ChatContext) => {
      seen.push([requestIsUnverified(ctx), names(toolsForRequest(ctx, catalog()).tools)]);
      return textReply('I hear you.') as never;
    };
    const opener = { wrap: (s: ReadableStream<never>) => s };
    const said = request('honestly this whole week has been a lot');
    const reply = await gatedReply(said, session() as never, model as never, opener as never, {
      env: { ...process.env, ...LIVE },
      generate,
    });
    if (reply) for await (const _ of reply as unknown as AsyncIterable<unknown>) void _;
    return seen;
  }

  it('an unverified first ask, then a verified guided re-ask: each its own tools', async () => {
    const [first, guided] = await askedTwice([1]);
    expect(first[0]).toBe(true);
    expect(first[1]).not.toContain('setReminder');
    expect(guided[0]).toBe(false);
    expect(guided[1]).toContain('setReminder');
  });

  it('a verified first ask, then an unverified guided re-ask: each its own tools', async () => {
    const [first, guided] = await askedTwice([2]);
    expect(first[0]).toBe(false);
    expect(guided[0]).toBe(true);
    expect(guided[1]).not.toContain('setReminder');
    for (const name of CRISIS) expect(guided[1]).toContain(name);
  });
});

describe('the allowlist pin: a tool joins it only on purpose', () => {
  it('no team tool or getWeather is offered; the rest of the phone-safe rule is', () => {
    const team = ['handoffToMaya', 'handoffToPeter', 'askForTeammate', 'introduceMember'];
    for (const name of [...team, 'meetTheTeam', 'softTeamIntro', 'getWeather'])
      expect(offeredWhenUnverified(name)).toBe(false);
    for (const name of ['endCall', 'getMovieInfo', 'playMusic', 'breatheWithMe'])
      expect(offeredWhenUnverified(name)).toBe(true);
  });

  it('SAFETY_TOOLS is every tool of the crisis and human-transfer domains', () => {
    const ids = [...crisis.definitions, ...humanTransfer.definitions].map((d) => d.id).sort();
    expect([...SAFETY_TOOLS].sort()).toEqual(ids);
  });

  it('of every domain tool, exactly these are offered on an unverified turn', () => {
    const offered = (DOMAIN_TOOL_IDS as readonly string[]).filter(offeredWhenUnverified).sort();
    expect(offered).toEqual([
      'breatheWithMe',
      'connectToHumanExpert',
      'createSafetyPlan',
      'deEscalateAnxiety',
      'endGame',
      'endTextGame',
      'evaluateHumanTransfer',
      'findFinancialAssistance',
      'findSafeResources',
      'getGameHint',
      'getGameStatus',
      'getTextGameBoard',
      'groundingExercise',
      'groundingForTrauma',
      'guideGroundingExercise',
      'makeTextGameMove',
      'musicControl',
      'musicInfo',
      'naturePrescription',
      'noticeThisMoment',
      'provideCrisisResources',
      'quickCrisisResources',
      'selfCompassionTrauma',
      'skipGameRound',
      'somaticSupport',
      'startGame',
      'startTextGame',
      'submitGameAnswer',
      'suggestGame',
      'supportRecoveryJourney',
      'trackSobrietyMilestone',
      'windowOfTolerance',
    ]);
  });
});
