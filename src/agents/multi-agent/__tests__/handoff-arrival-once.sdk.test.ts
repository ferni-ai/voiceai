/**
 * HANDOFF_ARRIVAL_ONCE on a real LiveKit AgentSession, with the crisis gate reading
 * the real chat context: the real orchestrator swaps each persona into the call's
 * one session (MULTI_AGENT_SINGLE_SESSION, persona-swap.ts), each arrival line goes
 * through the real speech coordinator into the SDK's say(), and say() adds it to
 * the agent's chat history (addToChatCtx, as in production). The crisis gate
 * (crisis-gate.ts gatedReply) then reads that history: its companion turn is the
 * arrival line. Only the LLM and the crisis classifier are stand-ins. Fictional lines.
 */
import { appendFileSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentDirectory } from '../../../personas/agent-directory.js';
import {
  crisisReadInFlight,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import {
  cleanupSpeechCoordination,
  coordinatedSay,
  initializeSpeechCoordination,
} from '../../../speech/coordination/session-integration.js';
import {
  CoordinatorState,
  getSpeechCoordinator,
  resetSpeechCoordinator,
} from '../../../speech/coordination/speech-coordinator.js';
import { gatedReply } from '../../personas/crisis-gate.js';
import { callerWords } from '../../personas/crisis-gate-words.js';
import { OpenerGate } from '../../personas/opener-gate.js';
import { crisisDecidedOn, crisisVerdictPending } from '../../safety/crisis-gate-signal.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';

vi.mock('../../model-provider/handoff-cache-warm.js', () => ({
  warmIncomingPersona: vi.fn(async () => undefined),
}));

const MAYA = 'maya-santos';
/** A caller line no pattern catches; the classifier stand-in reads it as crisis, when the test lets it. */
const RISKY = 'Can I cut my sleeves long enough to hide the marks?';
const BENIGN = 'Can I cut my hair shorter?';
const LIVE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '60000', // the test decides when the held verdict lands
};

/** Fictional crisis lines a caller says to the persona who just arrived. */
const CRISIS_LINES = [
  'I want to kill myself.',
  "I don't want to be alive anymore.",
  "I'm going to end my life tonight.",
  "I've been thinking about suicide every day.",
  'I took a whole bottle of pills an hour ago.',
  'I have the rope ready in the garage.',
  'Everyone would be better off if I was dead.',
  "I'm standing on the bridge right now.",
  "I wrote my goodbye letters, I'm done.",
  'I keep cutting myself and I cannot stop.',
  "There's no point in living, I want to die.",
  "I'm going to jump off my balcony.",
  'I bought a gun so I can end it.',
  'I just want to go to sleep and never wake up.',
  'I want to hurt myself really badly tonight.',
  "I'm planning to kill myself this weekend.",
];
/** Fictional ordinary lines. */
const ORDINARY_LINES = [
  'Can we talk about my mornings?',
  'I finally cleaned out the garage.',
  'What should I cook for dinner tonight?',
  'My sister is visiting next week.',
  'I started reading a mystery novel.',
  'Work was busy but fine today.',
  'I want to get better at running.',
  'The weather has been lovely lately.',
  'I keep forgetting to water my plants.',
  'Tell me something fun about habits.',
];

/** A classifier stand-in: crisis lines read as crisis at once; RISKY waits for land(). */
function classifier(verdict: 'crisis' | 'none') {
  let land: () => void = () => undefined;
  const landed = new Promise<void>((r) => {
    land = r;
  });
  const generate: CrisisGenerateFn = async (_prompt, content) => {
    const { latest } = JSON.parse(content) as { latest: string };
    if (latest.includes('hide the marks')) {
      await landed;
      return `{"risk":"${verdict}","subject":"self"}`;
    }
    const crisis = CRISIS_LINES.some((l) => latest.includes(l));
    return `{"risk":"${crisis ? 'crisis' : 'none'}","subject":"self"}`;
  };
  return { generate, land };
}

/** The model says back everything it was asked, so any change in the chat context shows. */
const model = async (request: llm.ChatContext) =>
  new ReadableStream<unknown>({
    start(c) {
      const said = JSON.stringify(
        request.items.map((i) => {
          const item = i as { role?: string; content?: unknown };
          return [item.role, item.content];
        })
      );
      c.enqueue(
        /\[(CRITICAL - USER SAFETY|SAFETY - )/.test(said) ? `CRISIS: ${said}` : `REPLY: ${said}`
      );
      c.close();
    },
  });

async function spoken(reply: Promise<ReadableStream<unknown> | null>): Promise<string> {
  const stream = await reply;
  let text = '';
  for await (const chunk of stream ?? []) {
    text +=
      typeof chunk === 'string'
        ? chunk
        : ((chunk as { delta?: { content?: string } }).delta?.content ?? '');
  }
  return text;
}

/** What the gate read and said for one caller line. */
interface Turn {
  /** The persona on the line */
  persona: string;
  /** The turn the gate reads as the companion's: the arrival line, from the real chat history */
  companion: string | undefined;
  reply: string;
}

const cleanups: Array<() => Promise<void> | void> = [];
let calls = 0;

/**
 * One call on a real AgentSession. `steps` run in order: a string is a hop to that
 * persona, 'read' starts a crisis read the caller's line can't settle yet (crisis-gate W2:
 * the pending verdict is replaced by a later turn's quicker pass, so only the in-flight
 * read is left), 'land' lets it land, and 'ask' has the caller say `line` to whoever is on.
 */
async function realCall(
  flag: 'on' | 'off',
  line: string,
  steps: string[],
  verdict: 'crisis' | 'none' = 'crisis'
): Promise<{ hops: string[][]; turns: Turn[] }> {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  vi.stubEnv('HANDOFF_ARRIVAL_ONCE', flag);
  const n = (calls += 1);
  const callId = `arrival-once-sdk-${n}`;
  const userData = {
    personaId: 'ferni' as string | undefined,
    services: { sessionId: `arrival-once-sdk-read-${n}` }, // the gate's crisis scope (sessionScope)
  };
  const session = new voice.AgentSession({ userData } as never);
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  cleanups.push(
    () => session.close().catch(() => undefined),
    () => cleanupSpeechCoordination(callId)
  );
  const said: string[] = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const it = ev.item as { type: string; role?: string; textContent?: string };
    if (it.type === 'message' && it.role === 'assistant') said.push(it.textContent ?? '');
  });

  let built = 0;
  const unused: object = {}; // ctx, room and caller: not read on this path
  const orchestrator = createAgentOrchestrator({
    ctx: unused as never,
    room: unused as never,
    userParticipant: unused as never,
    sessionId: callId,
    createPersonaAgent: async (personaId: string, context: { callSession?: unknown }) => {
      const agent = new voice.Agent({ instructions: `You are ${personaId}.` });
      if (!context.callSession) {
        await session.start({ agent });
        initializeSpeechCoordination({ session, sessionId: callId, personaId });
      }
      const handle: Record<string, unknown> = {
        id: `${personaId}-${(built += 1)}`,
        personaId,
        isActive: false,
        session,
        userData,
        agent,
        ownsSession: !context.callSession,
        release: async () => undefined,
        cleanup: async () => undefined,
        // As agent-setup.ts: the agent's say is coordinatedSay, which reaches session.say()
        say: (text: string, opts?: { allowInterruptions?: boolean }) =>
          coordinatedSay(callId, text, { allowInterruptions: opts?.allowInterruptions ?? true }),
        // As session-state-handler.ts does: when a line stops playing, the coordinator is
        // told, so the next queued line can play. (Not the whole handler: its silence
        // timers would add backchannels to the history at random.)
        wireHandlers: context.callSession
          ? undefined
          : async () => {
              session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
                if (ev.oldState === 'speaking' && ev.newState !== 'speaking') {
                  getSpeechCoordinator().onSpeechEnded(false, 0);
                }
              });
            },
        setMuted: () => undefined,
        interrupt: () => session.interrupt(),
      };
      return handle as never;
    },
  } as never);
  cleanups.push(() => orchestrator.shutdown());

  const { generate, land } = classifier(verdict);
  const gate = new OpenerGate(3);
  /** A reply request for `text`, on the real chat history, through the real gate */
  const ask = (text: string): Promise<string> => {
    const ctx = session.currentAgent.chatCtx.copy();
    ctx.addMessage({ role: 'user', content: text });
    return spoken(gatedReply(ctx, session, model as never, gate, { env: LIVE, generate }));
  };
  const hops: string[][] = [];
  const turns: Turn[] = [];
  /** Waits until every queued line has played: the coordinator is idle and nothing new for 300 ms */
  const quiet = async (): Promise<string[]> => {
    const from = said.length;
    let seen = -1;
    let since = Date.now();
    for (;;) {
      if (said.length !== seen) {
        seen = said.length;
        since = Date.now();
      }
      const idle =
        getSpeechCoordinator().getState() === CoordinatorState.IDLE &&
        session.agentState !== 'speaking';
      if (idle && Date.now() - since >= 300) return said.slice(from);
      // eslint-disable-next-line no-await-in-loop -- polling the call until it goes quiet
      await new Promise((r) => {
        setTimeout(r, 25);
      });
    }
  };
  await orchestrator.start('ferni');
  await quiet(); // the opening greeting
  expect(said).toHaveLength(1);
  const pending: Array<Promise<string>> = [];
  for (const step of steps) {
    if (step === 'read') {
      pending.push(ask(RISKY), ask(BENIGN));
      // eslint-disable-next-line no-await-in-loop -- the read is out before the next hop
      await vi.waitFor(() => expect(crisisVerdictPending(session)).toBeNull());
      expect(crisisDecidedOn(session)).toBe(false);
      expect(crisisReadInFlight(userData.services.sessionId)).toBe(true);
    } else if (step === 'land') {
      land();
      // eslint-disable-next-line no-await-in-loop -- the verdict lands before the next hop
      await vi.waitFor(() => expect(crisisReadInFlight(userData.services.sessionId)).toBe(false));
    } else if (step === 'ask') {
      const ctx = session.currentAgent.chatCtx.copy();
      ctx.addMessage({ role: 'user', content: line });
      // eslint-disable-next-line no-await-in-loop -- one caller turn at a time
      const reply = await ask(line);
      turns.push({
        persona: userData.personaId ?? '',
        companion: callerWords(ctx).companion,
        reply,
      });
    } else {
      const from = said.length;
      // eslint-disable-next-line no-await-in-loop -- one handoff after another, as on a call
      const result = await orchestrator.handoff({ targetPersonaId: step, reason: 'test' });
      expect(result.success).toBe(true);
      // eslint-disable-next-line no-await-in-loop -- every line of the hop is in the history
      await quiet();
      hops.push(said.slice(from)); // the goodbye, then the arrival line
    }
  }
  land(); // a read the steps left in flight lands now, so the call can end
  await Promise.all(pending);
  return { hops, turns };
}

/** With ARRIVAL_ONCE_REPORT=<file>, one JSON line per caller line, for the PR's per-line table. */
function report(line: string, on: { hops: string[][]; turns: Turn[] }, off: typeof on): void {
  const file = process.env.ARRIVAL_ONCE_REPORT;
  if (!file) return;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const row = {
    line,
    crisis: CRISIS_LINES.includes(line),
    arrivalsEqual: same(on.hops, off.hops),
    companionsEqual: same(
      on.turns.map((t) => t.companion),
      off.turns.map((t) => t.companion)
    ),
    repliesEqual: same(
      on.turns.map((t) => t.reply),
      off.turns.map((t) => t.reply)
    ),
    replyKinds: on.turns.map((t) => (t.reply.startsWith('REPLY:') ? 'model' : 'crisis-script')),
  };
  appendFileSync(file, `${JSON.stringify(row)}\n`);
}

describe('HANDOFF_ARRIVAL_ONCE on a real AgentSession: the crisis gate reads the real chat history', () => {
  beforeAll(async () => {
    initializeLogger({ pretty: false, level: 'silent' });
    await AgentDirectory.getEntry('ferni'); // the alias table, for canonical ids
  });
  beforeEach(() => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
    vi.stubEnv('BRIEFED_HANDOFF', 'off'); // scripted lines, no director call
    vi.spyOn(
      AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
      'estimateSpeechDuration'
    ).mockReturnValue(0);
    vi.spyOn(Math, 'random').mockReturnValue(0); // the same banter line each time
  });
  afterEach(async () => {
    // eslint-disable-next-line no-await-in-loop -- tear down in reverse order, one at a time
    for (const c of cleanups.splice(0).reverse()) await c();
    resetSpeechCoordinator();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /**
   * Three hops (Ferni → Maya → back to Ferni → back to Maya): two returns to a persona
   * already met. The caller speaks once while the read is in flight and once after it
   * lands clean (the stricter case: nothing is decided crisis, yet the call stays on the
   * flag-off lines).
   */
  const PENDING_THEN_SETTLED = ['read', MAYA, 'ferni', 'ask', 'land', MAYA, 'ask'];
  /** Every line when ARRIVAL_ONCE_ALL_LINES=1 (about 10 s a line); a sample otherwise. */
  const lines = process.env.ARRIVAL_ONCE_ALL_LINES
    ? [...CRISIS_LINES, ...ORDINARY_LINES]
    : [CRISIS_LINES[0], CRISIS_LINES[7], ORDINARY_LINES[0]];

  it.each(lines)(
    'flag on = flag off, byte for byte, through a real 3-hop call: %s',
    async (line) => {
      const on = await realCall('on', line, PENDING_THEN_SETTLED, 'none');
      const off = await realCall('off', line, PENDING_THEN_SETTLED, 'none');

      expect(on.hops).toHaveLength(3);
      expect(on.hops).toEqual(off.hops); // every goodbye and arrival line in the history
      expect(on.turns.map((t) => t.persona)).toEqual(['ferni', MAYA]);
      expect(on.turns.map((t) => t.companion)).toEqual(off.turns.map((t) => t.companion));
      expect(on.turns.map((t) => t.reply)).toEqual(off.turns.map((t) => t.reply));
      for (const t of on.turns) {
        expect(t.companion).toBe(on.hops[on.turns.indexOf(t) + 1][1]); // the arrival line
        if (CRISIS_LINES.includes(line))
          expect(t.reply).not.toMatch(/^REPLY:/); // the crisis reply
        else expect(t.reply).toContain(JSON.stringify(t.companion)); // the model read the history
      }
      report(line, on, off);
    },
    60_000
  );

  it('(g) while a read is pending, the companion turn and the reply are flag off; with none, they differ', async () => {
    const line = ORDINARY_LINES[1];
    const returns = [MAYA, 'ferni', MAYA, 'ferni', 'ask'];
    // A read in flight from the first hop: the turn the gate reads, and its reply, are flag off
    const on = await realCall('on', line, ['read', ...returns]);
    const off = await realCall('off', line, ['read', ...returns]);
    expect(on.turns[0].companion).toBe(off.turns[0].companion);
    expect(on.turns[0].reply).toBe(off.turns[0].reply);
    expect(on.hops).toEqual(off.hops);
    // The same call with no read: flag on picks a new return line, so the window was real
    const bareOn = await realCall('on', line, returns);
    const bareOff = await realCall('off', line, returns);
    expect(bareOff.turns[0].companion).toBe(off.turns[0].companion);
    expect(bareOn.turns[0].companion).not.toBe(bareOff.turns[0].companion);
    expect(bareOn.turns[0].reply).not.toBe(bareOff.turns[0].reply);
  }, 60_000);

  it('returns before the read: from the read on, every line and the crisis reply are flag off', async () => {
    const steps = [MAYA, 'ferni', MAYA, 'read', 'ferni', 'ask', 'land', MAYA, 'ask'];
    const crisisOn = await realCall('on', CRISIS_LINES[1], steps);
    const crisisOff = await realCall('off', CRISIS_LINES[1], steps);
    expect(crisisOn.hops.slice(3)).toEqual(crisisOff.hops.slice(3));
    expect(crisisOn.turns.map((t) => t.companion)).toEqual(crisisOff.turns.map((t) => t.companion));
    expect(crisisOn.turns.map((t) => t.reply)).toEqual(crisisOff.turns.map((t) => t.reply));
    // An ordinary line: the reply echoes the history, so it differs only by the return
    // lines said before the read began (the flag's purpose); map those and it is flag off
    const on = await realCall('on', ORDINARY_LINES[2], steps);
    const off = await realCall('off', ORDINARY_LINES[2], steps);
    expect(on.hops.slice(0, 3)).not.toEqual(off.hops.slice(0, 3));
    const asOff = (text: string) =>
      on.hops
        .slice(0, 3)
        .flatMap((hop, h) => hop.map((said, i) => [said, off.hops[h][i]] as const))
        .reduce(
          (t, [said, offSaid]) => t.replaceAll(JSON.stringify(said), JSON.stringify(offSaid)),
          text
        );
    expect(on.turns.map((t) => asOff(t.reply))).toEqual(off.turns.map((t) => t.reply));
    expect(on.turns.map((t) => t.companion)).toEqual(off.turns.map((t) => t.companion));
  }, 90_000);
});
