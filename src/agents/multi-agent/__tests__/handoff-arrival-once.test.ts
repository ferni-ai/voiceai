/**
 * HANDOFF_ARRIVAL_ONCE on the real orchestrator: on a quick A→B→A→B in one
 * call, a persona the caller already met this call doesn't say the same
 * arrival line again (issues #1922, #1489). Synthetic calls, fictional data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteCrisisVerdictPending, signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import { ARRIVING_OPENERS } from '../../../services/team-engagement/banter.js';
import { arrivalOnce, RETURNING_OPENERS } from '../arrival-once.js';
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

function config(sessionId: string, spawned: Spawned[]) {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId,
    createPersonaAgent: vi.fn(async (personaId: string) => {
      const record: Spawned = {
        personaId,
        said: [],
        session: {},
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

/** Starts a call on Ferni and runs `hops`; `beforeHop(i, spawned)` runs before hop i. */
async function runCall(
  sessionId: string,
  hops: string[],
  beforeHop: (i: number, spawned: Spawned[]) => void = () => undefined
): Promise<Call> {
  const spawned: Spawned[] = [];
  const orchestrator = createAgentOrchestrator(config(sessionId, spawned));
  await orchestrator.start('ferni');
  await vi.waitFor(() => expect(spawned[0]?.said.length).toBe(1)); // the opening greeting
  for (const [i, target] of hops.entries()) {
    beforeHop(i, spawned);
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

  it('treats a line with other SSML, case or punctuation as the same line', () => {
    const call = 'arrival-once-ssml';
    expect(arrivalOnce(call, hop(MAYA, 'ferni'), 'Hi there.')).toBe('Hi there.');
    expect(arrivalOnce(call, hop(MAYA, 'ferni'), "hi <break time='200ms'/> THERE!")).toBe(
      RETURNING_OPENERS[MAYA][0]
    );
  });
});
