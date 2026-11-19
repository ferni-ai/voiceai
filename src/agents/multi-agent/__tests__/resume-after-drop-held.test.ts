/**
 * A held caller's kept turns are never read back into a call (RESUME_AFTER_DROP and
 * CALL_ME_MOVES_TO_PHONE). The gate is the caller card's: an in-process hold of this user
 * (userHeld), or the shared hold record, where a record that can't be read, or isn't read in
 * time, means held. The new call's own hold is checked again where the turns would be used.
 * Held: no turns are read, nothing goes back into the history, and the call greets as usual.
 * A call whose kept caller lines read as risk, or whose risk read fails, is treated the same:
 * the opening and the history are exactly what they are with the flag off. So is a call whose
 * turn read comes back full: its newest turns may not have been read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Turn = { role: 'user' | 'assistant'; content: string; timestamp: Date };
type Conv = { id: string; endedAt?: Date };

const store = vi.hoisted(() => ({
  conversations: [] as Conv[],
  turns: new Map<string, Turn[]>(),
  onTurnsRead: undefined as (() => void) | undefined,
}));
const getRecentConversations = vi.fn(async (_userId: string, limit: number) =>
  store.conversations.slice(0, limit)
);
/** Like the store: oldest first, at most `limit` turns. */
const getConversationTurns = vi.fn(
  async (_userId: string, conversationId: string, limit?: number) => {
    store.onTurnsRead?.();
    const all = store.turns.get(conversationId) ?? [];
    return limit === undefined ? all : all.slice(0, limit);
  }
);
vi.mock('../../../services/memory/realtime-memory.js', () => ({
  getRecentConversations,
  getConversationTurns,
}));

const directedText = vi.fn(async (_sessionId: string, cue: { fallback: string }) => ({
  text: cue.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

/** The real crisis-guard read, or one that throws. */
const risk = vi.hoisted(() => ({ throws: false }));
vi.mock('../../safety/crisis-guard.js', async (orig) => {
  const real = await orig<typeof import('../../safety/crisis-guard.js')>();
  return {
    ...real,
    detectCrisis: (...args: Parameters<typeof real.detectCrisis>) => {
      if (risk.throws) throw new Error('risk read failed');
      return real.detectCrisis(...args);
    },
  };
});

const {
  findDroppedCall,
  greetingOrResume,
  startResumeLookup,
  MOVED_NOTE,
  MOVED_TURNS,
  RESTORED_TURNS,
} = await import('../resume-after-drop.js');
const { detectCrisis } = await import('../../safety/crisis-guard.js');
const { bindSessionUser, holdSession, resetMinorCare, userHeld } =
  await import('../../../utils/minor-care.js');
const { setHoldStore } = await import('../../../services/outreach/minor-care-shared-hold.js');
const { setProactiveSessionContext, clearProactiveSessionContext } =
  await import('../../../intelligence/context-builders/external/proactive-session-context.js');

type Msg = { role: string; content: string };
function fakeAgent() {
  const committed: Msg[][] = [];
  const agent = {
    chatCtx: {
      copy: () => {
        const items: Msg[] = [];
        return { items, addMessage: (m: Msg) => items.push(m) };
      },
    },
    updateChatCtx: vi.fn(async (ctx: unknown) => {
      committed.push((ctx as { items: Msg[] }).items);
    }),
  };
  return { agent, committed };
}

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms);

/** A call that was never ended (its pod died, or its hold skipped the end), last turn 25 s ago. */
function seedDroppedCall(): void {
  const turns: Turn[] = [];
  for (let i = 0; i < 10; i++) {
    turns.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 2 === 0 ? `user line ${i}` : `ferni line ${i}`,
      timestamp: ago(25_000 + (9 - i) * 4000),
    });
  }
  store.conversations = [{ id: 'conv_new' }, { id: 'conv_dropped' }];
  store.turns.set('conv_new', []);
  store.turns.set('conv_dropped', turns);
}

/** The shared hold record: held, not held, unreadable, or never answering. */
const heldUntil = vi.fn<(userId: string) => Promise<number | undefined>>();
const record = {
  held: () => heldUntil.mockImplementation(async () => Date.now() + 60_000),
  clear: () => heldUntil.mockImplementation(async () => 0),
  unreadable: () => heldUntil.mockRejectedValue(new Error('firestore down')),
  late: () => heldUntil.mockImplementation(() => new Promise(() => {})),
};

let n = 0;
const nextSession = () => `session-held-resume-${++n}`;
const sessions: string[] = [];
const moments = () =>
  directedText.mock.calls.map((c) => (c[1] as unknown as { moment: string }).moment);

/** A phone call a "call me" moved from that user's app call. */
function movedPhoneCall(userId: string): string {
  const sessionId = nextSession();
  sessions.push(sessionId);
  setProactiveSessionContext(sessionId, {
    triggerType: 'silence',
    triggerReason: 'They asked you to call them.',
    openerStyle: 'warm',
    initiatingPersona: 'ferni',
    movedFrom: { userId, conversationId: 'conv_dropped' },
  });
  return sessionId;
}

async function greet(sessionId: string) {
  const { agent, committed } = fakeAgent();
  await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
  return committed;
}

const FLAGS = [
  'RESUME_AFTER_DROP',
  'CALL_ME_MOVES_TO_PHONE',
  'MINOR_CARE',
  'MINOR_CARE_SHARED_HOLD',
];
beforeEach(() => {
  vi.clearAllMocks();
  resetMinorCare();
  store.conversations = [];
  store.turns.clear();
  store.onTurnsRead = undefined;
  record.clear();
  risk.throws = false;
  setHoldStore({ heldUntil, write: async () => undefined });
  for (const flag of FLAGS) process.env[flag] = 'on';
});
afterEach(() => {
  for (const flag of FLAGS) delete process.env[flag];
  setHoldStore();
  sessions.splice(0).forEach(clearProactiveSessionContext);
  vi.restoreAllMocks();
});

describe('a dropped call, picked up by a held caller', () => {
  it("a held call's pre-hold turns are not resumed on another pod (no endedAt)", async () => {
    seedDroppedCall();
    record.held(); // written when the dropped call was held; nothing in this process knows
    const sessionId = nextSession();
    expect(userHeld('user-h1')).toBe(false);
    startResumeLookup(sessionId, 'user-h1', 'conv_new');

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getRecentConversations).not.toHaveBeenCalled();
    expect(getConversationTurns).not.toHaveBeenCalled();
    expect(moments()).toEqual(['greeting']);
  });

  it('a caller held in this process (another live session of theirs) gets no resume', async () => {
    delete process.env.MINOR_CARE_SHARED_HOLD; // only the in-process hold can see it
    seedDroppedCall();
    bindSessionUser('session-other-h2', 'user-h2');
    holdSession('session-other-h2');
    const sessionId = nextSession();
    startResumeLookup(sessionId, 'user-h2', 'conv_new');

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getRecentConversations).not.toHaveBeenCalled();
    expect(moments()).toEqual(['greeting']);
  });

  it('a new call already held when it starts never looks', async () => {
    delete process.env.MINOR_CARE_SHARED_HOLD;
    seedDroppedCall();
    const sessionId = nextSession();
    holdSession(sessionId); // e.g. its number was left on hold by an earlier call
    startResumeLookup(sessionId, 'user-h3', 'conv_new');

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getRecentConversations).not.toHaveBeenCalled();
    expect(moments()).toEqual(['greeting']);
  });

  it('a new call held while the lookup ran: the found turns are not put back', async () => {
    delete process.env.MINOR_CARE_SHARED_HOLD;
    seedDroppedCall();
    const sessionId = nextSession();
    startResumeLookup(sessionId, 'user-h4', 'conv_new');
    holdSession(sessionId);

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getConversationTurns).toHaveBeenCalled(); // the lookup did find the drop
    expect(moments()).toEqual(['greeting']);
  });

  it('a shared record that cannot be read means held: no resume', async () => {
    seedDroppedCall();
    record.unreadable();
    const sessionId = nextSession();
    startResumeLookup(sessionId, 'user-h5', 'conv_new');

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getRecentConversations).not.toHaveBeenCalled();
    expect(moments()).toEqual(['greeting']);
  });

  it('a shared record that does not answer in time means held: nothing read', async () => {
    seedDroppedCall();
    record.late();
    const sentinel = new Promise<'pending'>((resolve) => {
      setTimeout(resolve, 1500, 'pending');
    });

    const found = await Promise.race([findDroppedCall('user-h6', 'conv_new'), sentinel]);

    expect(found).toBeUndefined();
    expect(getRecentConversations).not.toHaveBeenCalled();
  });

  it('control: an unheld caller still gets the turns, the note and the reconnect line', async () => {
    seedDroppedCall();
    const sessionId = nextSession();
    startResumeLookup(sessionId, 'user-c1', 'conv_new');

    const committed = await greet(sessionId);

    expect(heldUntil).toHaveBeenCalledWith('user-c1'); // the shared record was read
    expect(committed).toHaveLength(1);
    expect(committed[0].slice(0, -1).map((m) => m.content)).toEqual(
      store.turns.get('conv_dropped')!.map((t) => t.content)
    );
    expect(committed[0].at(-1)!.content).toMatch(/^\[RESUMED CALL\]/);
    expect(moments()).toEqual(['resume_after_drop']);
  });
});

describe('a call moved to the phone, for a held caller', () => {
  it('a held app call: nothing is read or restored, and no moved note', async () => {
    seedDroppedCall();
    record.held();
    const committed = await greet(movedPhoneCall('user-m1'));

    expect(committed).toHaveLength(0);
    expect(getConversationTurns).not.toHaveBeenCalled();
    expect(moments()).toEqual(['greeting']);
  });

  it('a phone call already held: nothing is read', async () => {
    delete process.env.MINOR_CARE_SHARED_HOLD;
    seedDroppedCall();
    const sessionId = movedPhoneCall('user-m2');
    holdSession(sessionId);

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getConversationTurns).not.toHaveBeenCalled();
  });

  it('a phone call held while the turns were read: none go back', async () => {
    delete process.env.MINOR_CARE_SHARED_HOLD;
    seedDroppedCall();
    const sessionId = movedPhoneCall('user-m3');
    store.onTurnsRead = () => holdSession(sessionId);

    expect(await greet(sessionId)).toHaveLength(0);
    expect(getConversationTurns).toHaveBeenCalled();
  });

  it('control: an unheld caller gets the app call turns and the moved note', async () => {
    seedDroppedCall();
    const committed = await greet(movedPhoneCall('user-c2'));

    expect(heldUntil).toHaveBeenCalledWith('user-c2');
    expect(committed).toHaveLength(1);
    expect(committed[0].slice(0, -1).map((m) => m.content)).toEqual(
      store.turns
        .get('conv_dropped')!
        .slice(-MOVED_TURNS)
        .map((t) => t.content)
    );
    expect(committed[0].at(-1)!.content).toBe(MOVED_NOTE);
  });
});

/** A fictional crisis line, as the caller's last words before the drop. */
const CRISIS_LINE = 'i want to kill myself';
function seedCrisisDrop(): void {
  seedDroppedCall();
  const turns = store.turns.get('conv_dropped')!;
  turns[8] = { ...turns[8], content: CRISIS_LINE }; // the last caller line; Ferni's reply follows
}

/** The first line and the history, as greetingOrResume leaves them. */
async function opening(sessionId: string) {
  const { agent, committed } = fakeAgent();
  const line = await greetingOrResume(sessionId, { personaId: 'ferni', agent }, undefined);
  return { line, committed };
}

describe('a dropped or moved call whose caller lines read as risk', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // the same hello on both runs
  });

  it('RESUME_AFTER_DROP: a call that dropped right after a crisis line opens exactly as with the flag off', async () => {
    seedCrisisDrop();
    delete process.env.RESUME_AFTER_DROP;
    const off = nextSession();
    startResumeLookup(off, 'user-r1', 'conv_new');
    const flagOff = await opening(off);
    expect(getConversationTurns).not.toHaveBeenCalled();

    process.env.RESUME_AFTER_DROP = 'on';
    vi.clearAllMocks();
    const on = nextSession();
    startResumeLookup(on, 'user-r1', 'conv_new');
    const flagOn = await opening(on);

    expect(getConversationTurns).toHaveBeenCalledTimes(1); // the drop was found, then not resumed
    expect(flagOn.line).toBe(flagOff.line);
    expect(flagOn.committed).toEqual(flagOff.committed);
    expect(flagOn.committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });

  it('RESUME_AFTER_DROP: a risk read that throws resumes nothing', async () => {
    seedDroppedCall(); // no risk in it: the control above resumes these same turns
    risk.throws = true;
    const sessionId = nextSession();
    startResumeLookup(sessionId, 'user-r2', 'conv_new');

    const { committed } = await opening(sessionId);

    expect(getConversationTurns).toHaveBeenCalledTimes(1);
    expect(committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });

  it('CALL_ME_MOVES_TO_PHONE: an app call with a crisis line opens the phone call exactly as with the flag off', async () => {
    seedCrisisDrop();
    delete process.env.CALL_ME_MOVES_TO_PHONE;
    const flagOff = await opening(movedPhoneCall('user-r3'));
    expect(getConversationTurns).not.toHaveBeenCalled();

    process.env.CALL_ME_MOVES_TO_PHONE = 'on';
    vi.clearAllMocks();
    const flagOn = await opening(movedPhoneCall('user-r3'));

    expect(getConversationTurns).toHaveBeenCalledTimes(1); // the app call's turns were read
    expect(flagOn.line).toBe(flagOff.line);
    expect(flagOn.committed).toEqual(flagOff.committed);
    expect(flagOn.committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });

  it('CALL_ME_MOVES_TO_PHONE: a risk read that throws carries nothing over', async () => {
    seedDroppedCall();
    risk.throws = true;

    const { committed } = await opening(movedPhoneCall('user-r4'));

    expect(getConversationTurns).toHaveBeenCalledTimes(1);
    expect(committed).toHaveLength(0);
    expect(moments()).toEqual(['greeting']);
  });
});

/** A longer call: `count` turns, the caller's on even turns, the last one 25 s ago. */
function seedLongCall(count = 20): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < count; i++) {
    turns.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 2 === 0 ? `user line ${i}` : `ferni line ${i}`,
      timestamp: ago(25_000 + (count - 1 - i) * 1000),
    });
  }
  store.conversations = [{ id: 'conv_new' }, { id: 'conv_dropped' }];
  store.turns.set('conv_new', []);
  store.turns.set('conv_dropped', turns);
  return turns;
}

/** The 10-turn dropped call with some of the caller's lines replaced. */
function seedLines(lines: Record<number, string>): void {
  seedDroppedCall();
  const turns = store.turns.get('conv_dropped')!;
  for (const [at, content] of Object.entries(lines)) {
    turns[Number(at)] = { ...turns[Number(at)], content };
  }
}

/** Any crisis-guard signal, the guard's own test. */
const anySignal = (read: { isCrisis: boolean; severity: number; indicators: string[] }) =>
  read.isCrisis || read.severity > 0 || read.indicators.length > 0;

/** A fictional line with risk signals that is not a crisis read on its own. */
const SIGNAL_LINE = 'i feel so empty these days';

async function droppedOpening(userId: string) {
  const sessionId = nextSession();
  startResumeLookup(sessionId, userId, 'conv_new');
  return opening(sessionId);
}
const movedOpening = (userId: string) => opening(movedPhoneCall(userId));

/** The turns were read, then nothing was used: no history, the usual greeting. */
function expectNothingResumed(committed: Msg[][]): void {
  expect(getConversationTurns).toHaveBeenCalledTimes(1);
  expect(committed).toHaveLength(0);
  expect(moments()).toEqual(['greeting']);
}

describe('the whole kept call is read, with any signal, and a full read resumes nothing', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('RESUME_AFTER_DROP: a crisis line before the restored turns resumes nothing', async () => {
    const turns = seedLongCall();
    turns[0] = { ...turns[0], content: CRISIS_LINE };
    expect(turns.length - RESTORED_TURNS).toBeGreaterThan(0); // turn 0 is not restored

    expectNothingResumed((await droppedOpening('user-r5')).committed);
  });

  it('RESUME_AFTER_DROP control: a long call with no crisis line resumes its last turns', async () => {
    const turns = seedLongCall();

    const { committed } = await droppedOpening('user-c3');

    expect(committed).toHaveLength(1);
    expect(committed[0].slice(0, -1).map((m) => m.content)).toEqual(
      turns.slice(-RESTORED_TURNS).map((t) => t.content)
    );
    expect(moments()).toEqual(['resume_after_drop']);
  });

  it('CALL_ME_MOVES_TO_PHONE: a crisis line before the carried-over turns carries nothing over', async () => {
    const turns = seedLongCall();
    turns[0] = { ...turns[0], content: CRISIS_LINE };
    expect(turns.length - MOVED_TURNS).toBeGreaterThan(0); // turn 0 is not carried over

    expectNothingResumed((await movedOpening('user-r6')).committed);
  });

  it('CALL_ME_MOVES_TO_PHONE control: a long app call with no crisis line carries its last turns over', async () => {
    const turns = seedLongCall();

    const { committed } = await movedOpening('user-c4');

    expect(committed).toHaveLength(1);
    expect(committed[0].slice(0, -1).map((m) => m.content)).toEqual(
      turns.slice(-MOVED_TURNS).map((t) => t.content)
    );
    expect(committed[0].at(-1)!.content).toBe(MOVED_NOTE);
  });

  it('RESUME_AFTER_DROP: a line with risk signals but no crisis read resumes nothing', async () => {
    const read = detectCrisis(SIGNAL_LINE);
    expect(read.isCrisis).toBe(false);
    expect(read.severity).toBeGreaterThan(0);
    expect(read.indicators.length).toBeGreaterThan(0);
    seedLines({ 8: SIGNAL_LINE });

    expectNothingResumed((await droppedOpening('user-r7')).committed);
  });

  it('CALL_ME_MOVES_TO_PHONE: a line with risk signals but no crisis read carries nothing over', async () => {
    expect(detectCrisis(SIGNAL_LINE).isCrisis).toBe(false);
    seedLines({ 8: SIGNAL_LINE });

    expectNothingResumed((await movedOpening('user-r8')).committed);
  });

  /** Fictional lines: two of distress, then one that is a signal only after them. */
  const EARLIER = ['everything is too much', 'feeling so alone lately'];
  const QUIET_ALONE = 'thank you for everything';
  const seedContextCall = () => seedLines({ 4: EARLIER[0], 6: EARLIER[1], 8: QUIET_ALONE });

  it('RESUME_AFTER_DROP: a line that reads as risk only after its earlier lines resumes nothing', async () => {
    expect(anySignal(detectCrisis(QUIET_ALONE))).toBe(false);
    const before = ['user line 0', 'user line 2', ...EARLIER];
    expect(anySignal(detectCrisis(QUIET_ALONE, undefined, { recentMessages: before }))).toBe(true);
    seedContextCall();

    expectNothingResumed((await droppedOpening('user-r9')).committed);
  });

  it('CALL_ME_MOVES_TO_PHONE: a line that reads as risk only after its earlier lines carries nothing over', async () => {
    expect(anySignal(detectCrisis(QUIET_ALONE))).toBe(false);
    seedContextCall();

    expectNothingResumed((await movedOpening('user-r10')).committed);
  });

  it('RESUME_AFTER_DROP: a call that fills the turn read resumes nothing', async () => {
    const turns = seedLongCall(201);
    turns[200] = { ...turns[200], content: CRISIS_LINE }; // past the store's 200-turn read

    expect(await findDroppedCall('user-r11', 'conv_new')).toBeUndefined();
    expect(getConversationTurns).toHaveBeenCalledTimes(1);
    expect(await getConversationTurns.mock.results[0].value).toHaveLength(200); // the line unread
  });

  it('CALL_ME_MOVES_TO_PHONE: an app call that fills the turn read carries nothing over', async () => {
    const turns = seedLongCall(201);
    turns[200] = { ...turns[200], content: CRISIS_LINE };

    expectNothingResumed((await movedOpening('user-r12')).committed);
    expect(await getConversationTurns.mock.results[0].value).toHaveLength(200);
  });

  /** A long call with four empty turns, which the readers drop after the read. */
  function seedWithEmpties(count: number): Turn[] {
    const turns = seedLongCall(count);
    for (const at of [1, 3, 5, 7]) turns[at] = { ...turns[at], content: at === 7 ? '   ' : '' };
    return turns;
  }
  const kept = (turns: Turn[]) => turns.filter((t) => t.content.trim()).map((t) => t.content);

  it('RESUME_AFTER_DROP: a full read with empty turns resumes nothing', async () => {
    const turns = seedWithEmpties(200);
    expect(kept(turns)).toHaveLength(196); // below the limit once the empty turns are dropped

    expect(await findDroppedCall('user-r13', 'conv_new')).toBeUndefined();
    expect(getConversationTurns).toHaveBeenCalledTimes(1);
  });

  it('RESUME_AFTER_DROP control: a read one short of full, with empty turns, still resumes', async () => {
    const turns = seedWithEmpties(199);

    const found = await findDroppedCall('user-c5', 'conv_new');

    expect(found?.turns.map((t) => t.content)).toEqual(kept(turns).slice(-RESTORED_TURNS));
  });

  it('CALL_ME_MOVES_TO_PHONE: a full read with empty turns carries nothing over', async () => {
    expect(kept(seedWithEmpties(200))).toHaveLength(196);

    expectNothingResumed((await movedOpening('user-r14')).committed);
  });

  it('CALL_ME_MOVES_TO_PHONE control: a read one short of full, with empty turns, still carries over', async () => {
    const turns = seedWithEmpties(199);

    const { committed } = await movedOpening('user-c6');

    expect(committed).toHaveLength(1);
    expect(committed[0].slice(0, -1).map((m) => m.content)).toEqual(
      kept(turns).slice(-MOVED_TURNS)
    );
    expect(committed[0].at(-1)!.content).toBe(MOVED_NOTE);
  });
});
