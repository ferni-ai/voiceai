/**
 * HANDOFF_ARRIVAL_ONCE on the real orchestrator: on a quick A→B→A→B in one
 * call, a persona the caller already met this call doesn't say the same
 * arrival line again (issues #1922, #1489). Synthetic calls, fictional data.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crisisDecidedOn,
  crisisVerdictPending,
  noteCrisisVerdictPending,
  signalCrisisDecision,
} from '../../safety/crisis-gate-signal.js';
import { gatedReply } from '../../personas/crisis-gate.js';
import { OpenerGate } from '../../personas/opener-gate.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { ARRIVING_OPENERS } from '../../../services/team-engagement/banter.js';
import { unfinishedTurnHoldMs } from '../unfinished-turn.js';
import {
  arrivalOnce,
  RETURNING_OPENERS,
  SILENT_WHEN_RETURN_LINES_USED_UP,
} from '../arrival-once.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';

vi.mock('../../model-provider/handoff-cache-warm.js', () => ({
  warmIncomingPersona: vi.fn(async () => undefined),
}));

/** Every agent the call spawned, in order, with what it said. */
interface Spawned {
  personaId: string;
  said: string[];
  session: object;
  wired: ReturnType<typeof vi.fn>;
}

function config(sessionId: string, spawned: Spawned[], makeSession: () => object = () => ({})) {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId,
    createPersonaAgent: vi.fn(async (personaId: string) => {
      const record: Spawned = {
        personaId,
        said: [],
        session: makeSession(),
        wired: vi.fn(async () => undefined),
      };
      spawned.push(record);
      return {
        id: `${personaId}-agent-${spawned.length}`,
        personaId,
        isActive: false,
        session: record.session,
        cleanup: vi.fn(async () => undefined),
        say: vi.fn((text: string) => {
          record.said.push(text);
        }),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
        wireHandlers: record.wired,
      } as never;
    }),
  };
}

beforeEach(() => {
  vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
  // The worst draw production can make: the same banter line each time.
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const MAYA = 'maya-santos';
const JORDAN = 'jordan-taylor';
const FOUR_HOPS = [MAYA, 'ferni', MAYA, 'ferni'];
const SIX_HOPS = [...FOUR_HOPS, MAYA, 'ferni'];
/** A fresh call, flag on: a first meeting as today, then "back again" lines, none repeated. */
const FRESH_FOUR = [
  ARRIVING_OPENERS[MAYA][0], // first meeting: today's line
  RETURNING_OPENERS.ferni[0], // Ferni opened the call: a return
  RETURNING_OPENERS[MAYA][0],
  RETURNING_OPENERS.ferni[1],
];

interface Call {
  /** Each hop's arriving agent, in order. */
  arrivals: Spawned[];
  /** Each hop's arrival line ('' = no line). */
  lines: string[];
  end: () => Promise<void>;
}

/** Starts a call on Ferni and runs `hops`; `beforeHop(i, spawned)` runs (and is awaited) before hop i. */
async function runCall(
  sessionId: string,
  hops: string[],
  beforeHop: (i: number, spawned: Spawned[]) => void | Promise<void> = () => undefined,
  makeSession?: () => object
): Promise<Call> {
  const spawned: Spawned[] = [];
  const orchestrator = createAgentOrchestrator(config(sessionId, spawned, makeSession));
  await orchestrator.start('ferni');
  await vi.waitFor(() => expect(spawned[0]?.said.length).toBe(1), { timeout: 5000 }); // the opening greeting
  for (const [i, target] of hops.entries()) {
    // eslint-disable-next-line no-await-in-loop -- the call's next event, then its next hop
    await beforeHop(i, spawned);
    // eslint-disable-next-line no-await-in-loop -- one handoff after another, as on a call
    const result = await orchestrator.handoff({ targetPersonaId: target, reason: 'test' });
    expect(result.success).toBe(true);
  }
  const arrivals = spawned.slice(1); // one spawned agent per hop
  expect(arrivals.map((a) => a.personaId)).toEqual(hops);
  return {
    arrivals,
    lines: arrivals.map((a) => a.said[0] ?? ''),
    end: () => orchestrator.shutdown(),
  };
}

/** Today's lines with the worst draw: each persona's first canned opener, every time. */
const todays = (hops: string[]) => hops.map((p) => ARRIVING_OPENERS[p][0]);

describe('A→B→A→B in one call', () => {
  it('flag on: four hops, four distinct arrival lines, none repeated', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    const { lines, end } = await runCall('arrival-once-step0', FOUR_HOPS);
    await end();
    expect(lines.every((l) => l.length > 0)).toBe(true);
    expect(new Set(lines).size).toBe(4);
  });

  it('flag on: a first meeting is unchanged, a return says a "back again" line', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    const { lines, end } = await runCall('arrival-once-lines', FOUR_HOPS);
    await end();
    expect(lines).toEqual(FRESH_FOUR);
  });

  it('flag on: once every return line is said, no arrival line rather than a repeat, still wired', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    const { arrivals, lines, end } = await runCall('arrival-once-silent', SIX_HOPS);
    await end();
    const spoken = lines.filter((l) => l.length > 0);
    expect(new Set(spoken).size).toBe(spoken.length); // never a repeat
    expect(lines[5]).toBe(''); // Ferni's third return: both return lines already said
    expect(arrivals[5].said).toEqual([]);
    expect(arrivals[5].wired).toHaveBeenCalledTimes(1); // tools and transcript still wired
    expect(arrivals.every((a) => a.wired.mock.calls.length === 1)).toBe(true);
  });

  it('flag on: each call keeps its own memory, and a new call starts fresh', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    const first = await runCall('arrival-once-call-a', FOUR_HOPS);
    const second = await runCall('arrival-once-call-b', FOUR_HOPS); // first still live
    expect(first.lines).toEqual(FRESH_FOUR);
    expect(second.lines).toEqual(FRESH_FOUR); // not the first call's memory
    await first.end();
    await second.end();
    const again = await runCall('arrival-once-call-a', FOUR_HOPS); // same id, after it ended
    await again.end();
    expect(again.lines).toEqual(FRESH_FOUR);
  });

  it('flag on: near crisis handling the arrival line is spoken as today, never swapped or dropped', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    // The gate acts on the call before the last hop, a return that would otherwise have no line.
    const decided = await runCall('arrival-once-crisis', SIX_HOPS, (i, spawned) => {
      if (i === 5) signalCrisisDecision(spawned[spawned.length - 1].session, 'guide');
    });
    await decided.end();
    expect(decided.lines[5]).toBe(ARRIVING_OPENERS.ferni[0]);
    expect(decided.arrivals[5].said).toEqual([ARRIVING_OPENERS.ferni[0]]);
    // A verdict still pending holds the line too.
    const pending = await runCall('arrival-once-verdict', FOUR_HOPS, (i, spawned) => {
      if (i === 1)
        noteCrisisVerdictPending(spawned[spawned.length - 1].session, new Promise(() => {}));
    });
    await pending.end();
    expect(pending.lines[1]).toBe(ARRIVING_OPENERS.ferni[0]);
  });

  it('flag on, a session per persona: once crisis handling touches the call, every later line is as flag off', async () => {
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'off');
    const touch = {
      decided: (session: object) => signalCrisisDecision(session, 'guide'),
      pending: (session: object) => noteCrisisVerdictPending(session, new Promise(() => {})),
    };
    for (const [kind, mark] of Object.entries(touch)) {
      for (const k of SIX_HOPS.keys()) {
        const run = async (flag: string) => {
          vi.stubEnv('HANDOFF_ARRIVAL_ONCE', flag);
          // The persona on the line when the crisis turn lands, before hop k; later
          // hops hand between other sessions, never back to this one.
          const call = await runCall(
            `arrival-once-sticky-${kind}-${k}-${flag}`,
            SIX_HOPS,
            (i, spawned) => {
              if (i === k) mark(spawned[spawned.length - 1].session);
            }
          );
          await call.end();
          return call;
        };
        // eslint-disable-next-line no-await-in-loop -- one call after another
        const on = await run('on');
        // eslint-disable-next-line no-await-in-loop -- one call after another
        const off = await run('off');
        const label = `${kind}, crisis before hop ${k}`;
        expect(off.lines, label).toEqual(todays(SIX_HOPS));
        expect(on.lines.slice(k), label).toEqual(off.lines.slice(k));
        expect(
          on.arrivals.slice(k).map((a) => a.said),
          label
        ).toEqual(off.arrivals.slice(k).map((a) => a.said));
      }
    }
  });

  it('flag on, three personas: each first meeting is a first meeting, not a return', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    const { lines, end } = await runCall('arrival-once-three', [
      MAYA,
      JORDAN,
      'ferni',
      JORDAN,
      MAYA,
    ]);
    await end();
    expect(lines).toEqual([
      ARRIVING_OPENERS[MAYA][0], // first meeting
      ARRIVING_OPENERS[JORDAN][0], // first meeting, though the caller has met two personas
      RETURNING_OPENERS.ferni[0],
      RETURNING_OPENERS[JORDAN][0],
      RETURNING_OPENERS[MAYA][0],
    ]);
  });

  it("flag off: exactly today's lines, the repeat included", async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'off');
    const four = await runCall('arrival-once-off', FOUR_HOPS);
    await four.end();
    expect(four.lines).toEqual(todays(FOUR_HOPS));
    expect(new Set(four.lines).size).toBe(2);
    const six = await runCall('arrival-once-off-six', SIX_HOPS);
    await six.end();
    expect(six.lines).toEqual(todays(SIX_HOPS)); // no silent arrival either
  });

  it('flag on, four and more personas: a return is a return however many the caller has met', async () => {
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
    const ALEX = 'alex-chen';
    const PETER = 'peter-john';
    const { lines, end } = await runCall('arrival-once-five', [
      MAYA,
      JORDAN,
      ALEX,
      MAYA,
      PETER,
      JORDAN,
    ]);
    await end();
    expect(lines).toEqual([
      ARRIVING_OPENERS[MAYA][0],
      ARRIVING_OPENERS[JORDAN][0],
      ARRIVING_OPENERS[ALEX][0], // the fourth persona met: a first meeting
      RETURNING_OPENERS[MAYA][0], // a return with four met
      ARRIVING_OPENERS[PETER][0],
      RETURNING_OPENERS[JORDAN][0], // a return with five met
    ]);
  });
});

/**
 * A crisis that lands after its persona left the hop (a session per persona): the
 * caller line is read on one persona's session, the hop goes out while the
 * classifier is still reading, and the verdict lands afterwards. Driven through
 * the real reply gate (crisis-gate.ts gatedReply), with a classifier stand-in that
 * holds its verdict on the risky line until the test lets it land. Fictional lines.
 */
describe('a late crisis, after its persona left the hop', () => {
  /** A caller line no pattern catches; the classifier stand-in reads it as crisis. */
  const RISKY = 'Can I cut my sleeves long enough to hide the marks?';
  /** The start of it, which the unfinished-turn hold waits on (CRISIS_READ_JOINED_TURN). */
  const FRAGMENT = 'Can I cut my';
  const BENIGN = 'Can I cut my hair shorter?';
  /** Said to a persona that arrived while the read was still out; held with it. */
  const RISKY_AGAIN = 'I still want to hide the marks before work.';
  const LIVE = {
    CRISIS_GUARD_MODE: 'live',
    CRISIS_CLASSIFIER_MODE: 'live',
    CRISIS_CLASSIFIER_TIMEOUT_MS: '60000', // the test decides when the verdict lands
  };

  let sessions = 0;
  /** The session LiveKit hands the gate, with the unfinished-turn hold installed. */
  class LiveSession extends EventEmitter {
    readonly userData = { services: { sessionId: `arrival-once-late-${++sessions}` } };
    readonly history = llm.ChatContext.empty();
    readonly unfinishedTurnHoldMs = unfinishedTurnHoldMs;
    /** What the gate said to each reply request, read to the end. */
    readonly replies: Array<Promise<string>> = [];

    /** LiveKit commits the caller's turn. */
    commit(text: string): void {
      const item = this.history.addMessage({ role: 'user', content: text });
      this.emit('conversation_item_added', { item });
    }

    /** A reply request for `latest` through the real gate; never awaited here. */
    ask(latest: string, env: Record<string, string>, generate: CrisisGenerateFn): void {
      const ctx = llm.ChatContext.empty();
      ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
      ctx.addMessage({ role: 'user', content: latest });
      const model = async (request: llm.ChatContext) =>
        new ReadableStream<unknown>({
          start(c) {
            // A guided crisis reply says the whole guided request back, so a crisis line is
            // compared flag on vs flag off byte for byte; any other reply is 'Okay.'.
            const said = JSON.stringify(
              request.items.map((i) => (i as { content?: unknown }).content)
            );
            c.enqueue(
              /\[(CRITICAL - USER SAFETY|SAFETY - )/.test(said) ? `CRISIS: ${said}` : 'Okay.'
            );
            c.close();
          },
        });
      this.replies.push(
        spoken(gatedReply(ctx, this, model as never, new OpenerGate(3), { env, generate }))
      );
    }
  }

  /** The text a reply stream speaks, read to the end. */
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

  /** None at once, except the risky line: its crisis verdict waits for land(). */
  function heldClassifier() {
    let land: () => void = () => undefined;
    const landed = new Promise<void>((r) => {
      land = r;
    });
    const generate: CrisisGenerateFn = async (_prompt, content) => {
      const { latest } = JSON.parse(content) as { latest: string };
      if (!latest.includes('hide the marks')) return '{"risk":"none","subject":"self"}';
      await landed;
      return '{"risk":"crisis","subject":"self"}';
    };
    return { generate, land };
  }

  /**
   * How the crisis read gets past the hop with nothing pending on its session:
   * - W1, CRISIS_READ_JOINED_TURN: the hold waits on a fragment, the caller's whole line is
   *   committed with no reply of its own, and that read is signalled with no pending verdict
   *   (crisis-read-joined-turn.ts gateCommittedLine);
   * - W2: a reply's pending verdict (crisis-gate.ts) is replaced by a later turn's quicker pass.
   */
  const PATHS = {
    W1: (s: LiveSession, generate: CrisisGenerateFn) => {
      const env = { ...LIVE, CRISIS_READ_JOINED_TURN: 'on' };
      s.ask(FRAGMENT, env, generate);
      s.commit(RISKY);
    },
    W2: (s: LiveSession, generate: CrisisGenerateFn) => {
      s.ask(RISKY, LIVE, generate);
      s.ask(BENIGN, LIVE, generate);
    },
  };
  type Path = keyof typeof PATHS;

  /**
   * One call: the crisis read starts on the session on the line before hop `start`, and
   * its verdict lands before hop `lands`. Checks that the read was out, with nothing
   * pending or decided on that session, when hop `start` went. With `askInWindow`, the
   * caller says RISKY_AGAIN to the persona on the line just before the verdict lands.
   * `replies` is everything the gate said on the call.
   */
  async function lateCrisisCall(
    id: string,
    flag: string,
    hops: string[],
    plan: { path: Path; start: number; lands: number; askInWindow?: boolean }
  ): Promise<Call & { replies: string[] }> {
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    resetCallRiskSnapshots();
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'off');
    vi.stubEnv('HANDOFF_ARRIVAL_ONCE', flag);
    const { generate, land } = heldClassifier();
    let reading: LiveSession | null = null;
    const made: LiveSession[] = [];
    const call = await runCall(
      `${id}-${flag}`,
      hops,
      async (i, spawned) => {
        if (i === plan.start) {
          reading = spawned[spawned.length - 1].session as LiveSession;
          PATHS[plan.path](reading, generate);
          const s = reading;
          await vi.waitFor(() => expect(crisisVerdictPending(s)).toBeNull());
          expect(crisisDecidedOn(s)).toBe(false); // still out when this hop goes
        }
        if (i === plan.lands && reading) {
          const s: LiveSession = reading;
          if (plan.askInWindow)
            (spawned[spawned.length - 1].session as LiveSession).ask(RISKY_AGAIN, LIVE, generate);
          land();
          await vi.waitFor(() => expect(crisisDecidedOn(s)).toBe(true));
        }
      },
      () => {
        const s = new LiveSession();
        made.push(s);
        return s;
      }
    );
    await call.end();
    const replies = await Promise.all(made.flatMap((s) => s.replies));
    return { ...call, replies };
  }

  it('the verdict transcript (W1): ferni → Maya → Jordan → Maya → Jordan → Maya → ferni → Maya, every line as flag off', async () => {
    const hops = [MAYA, JORDAN, MAYA, JORDAN, MAYA, 'ferni', MAYA];
    // Maya is on when the caller's line is read; she hands to Jordan, then the verdict lands.
    const plan = { path: 'W1' as const, start: 1, lands: 2 };
    const on = await lateCrisisCall('arrival-once-a1', 'on', hops, plan);
    const off = await lateCrisisCall('arrival-once-a1', 'off', hops, plan);
    expect(off.lines).toEqual(todays(hops));
    expect(on.lines).toEqual(off.lines);
    expect(on.arrivals.map((a) => a.said)).toEqual(off.arrivals.map((a) => a.said));
  });

  it('the verdict transcript (W2): ferni ↔ Maya, four arrivals each, every line as flag off', async () => {
    const hops = [MAYA, 'ferni', MAYA, 'ferni', MAYA, 'ferni', MAYA];
    // Ferni opens the call and the caller's line is read; Ferni hands to Maya, then it lands.
    const plan = { path: 'W2' as const, start: 0, lands: 1 };
    const on = await lateCrisisCall('arrival-once-a3', 'on', hops, plan);
    const off = await lateCrisisCall('arrival-once-a3', 'off', hops, plan);
    expect(off.lines).toEqual(todays(hops));
    expect(on.lines).toEqual(off.lines);
    expect(on.arrivals.map((a) => a.said)).toEqual(off.arrivals.map((a) => a.said));
  });

  for (const path of ['W1', 'W2'] as const) {
    it(`${path}, the residual window: before the crisis is known a return is a return as on any call; crisis lines never change`, async () => {
      let windowLinesThatDiffer = 0;
      for (const start of SIX_HOPS.keys()) {
        for (const lands of [start + 1, start + 2].filter((h) => h < SIX_HOPS.length)) {
          const plan = { path, start, lands, askInWindow: true };
          const id = `arrival-once-window-${path}-${start}-${lands}`;
          // eslint-disable-next-line no-await-in-loop -- one call after another
          const on = await lateCrisisCall(id, 'on', SIX_HOPS, plan);
          // eslint-disable-next-line no-await-in-loop -- one call after another
          const off = await lateCrisisCall(id, 'off', SIX_HOPS, plan);
          vi.stubEnv('HANDOFF_ARRIVAL_ONCE', 'on');
          // eslint-disable-next-line no-await-in-loop -- one call after another
          const anyCall = await runCall(`${id}-no-crisis`, SIX_HOPS);
          // eslint-disable-next-line no-await-in-loop -- one call after another
          await anyCall.end();
          const label = `${path}, read out before hop ${start}, lands before hop ${lands}`;
          // Crisis lines: everything the gate said, the line said in the window included.
          expect(on.replies, label).toEqual(off.replies);
          expect(
            on.replies.some((r) => r.startsWith('CRISIS: ')),
            `${label}: a crisis line was said`
          ).toBe(true);
          // Before the crisis is known: the arrival lines of a call with no crisis at all.
          expect(on.lines.slice(0, lands), label).toEqual(anyCall.lines.slice(0, lands));
          // Once it is known: today's lines.
          expect(on.lines.slice(lands), label).toEqual(off.lines.slice(lands));
          windowLinesThatDiffer += on.lines
            .slice(start, lands)
            .filter((line, k) => line !== off.lines[start + k]).length;
        }
      }
      expect(windowLinesThatDiffer).toBeGreaterThan(0); // the window is real, not assumed away
    });
  }

  for (const path of ['W1', 'W2'] as const) {
    it(`${path}: whichever hop the read goes out on, every line after the verdict lands is as flag off`, async () => {
      for (const start of SIX_HOPS.keys()) {
        for (const lands of [start + 1, start + 2].filter((h) => h < SIX_HOPS.length)) {
          const plan = { path, start, lands };
          const id = `arrival-once-late-${path}-${start}-${lands}`;
          // eslint-disable-next-line no-await-in-loop -- one call after another
          const on = await lateCrisisCall(id, 'on', SIX_HOPS, plan);
          // eslint-disable-next-line no-await-in-loop -- one call after another
          const off = await lateCrisisCall(id, 'off', SIX_HOPS, plan);
          const label = `${path}, read out before hop ${start}, lands before hop ${lands}`;
          expect(off.lines, label).toEqual(todays(SIX_HOPS));
          expect(on.lines.slice(lands), label).toEqual(off.lines.slice(lands));
          expect(
            on.arrivals.slice(lands).map((a) => a.said),
            label
          ).toEqual(off.arrivals.slice(lands).map((a) => a.said));
        }
      }
    });
  }
});

describe('arrivalOnce on a briefed line', () => {
  const hop = (to: string, from: string) => ({ to, from, sessions: [], briefed: true });

  it('keeps a briefed line not yet said on a return, and swaps one already said', () => {
    const call = 'arrival-once-briefed';
    const briefed = 'Okay, I heard about the trip. Let me help.';
    expect(arrivalOnce(call, hop(MAYA, 'ferni'), briefed)).toBe(briefed); // first meeting
    expect(arrivalOnce(call, hop('ferni', MAYA), 'Back to the trip, then.')).toBe(
      'Back to the trip, then.'
    );
    expect(arrivalOnce(call, hop(MAYA, 'ferni'), briefed)).toBe(RETURNING_OPENERS[MAYA][0]);
  });

  it('a return with both return lines said is silent, pinned by SILENT_WHEN_RETURN_LINES_USED_UP', () => {
    // Open product call: flipping the constant to false says the line instead.
    // Change this test with it, on purpose.
    expect(SILENT_WHEN_RETURN_LINES_USED_UP).toBe(true);
    const call = 'arrival-once-used-up';
    const canned = ARRIVING_OPENERS[MAYA][0];
    const back = (to: string, from: string) => ({ to, from, sessions: [], briefed: false });
    expect(arrivalOnce(call, back(MAYA, 'ferni'), canned)).toBe(canned);
    expect(arrivalOnce(call, back(MAYA, 'ferni'), canned)).toBe(RETURNING_OPENERS[MAYA][0]);
    expect(arrivalOnce(call, back(MAYA, 'ferni'), canned)).toBe(RETURNING_OPENERS[MAYA][1]);
    expect(arrivalOnce(call, back(MAYA, 'ferni'), canned)).toBeNull();
  });

  it('treats a line with other SSML, case or punctuation as the same line', () => {
    const call = 'arrival-once-ssml';
    expect(arrivalOnce(call, hop(MAYA, 'ferni'), 'Hi there.')).toBe('Hi there.');
    expect(arrivalOnce(call, hop(MAYA, 'ferni'), "hi <break time='200ms'/> THERE!")).toBe(
      RETURNING_OPENERS[MAYA][0]
    );
  });
});
