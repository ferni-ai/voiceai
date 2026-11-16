/**
 * write-hold.ts: the one owner-keyed write-hold check. It composes minor-care.ts (writeHeld,
 * careHeld) and the session-keyed crisis hold, so it is never more open than writeHeld (content)
 * or careHeld (safety-record), and it adds what a write naming no session needs: a crisis call's
 * owner stays held for 10 minutes after the call ends, a crisis read still running reads
 * 'pending', and the hold flags copied when a session is first seen still count after
 * process.env changes. Every id below is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WriteHoldModule = typeof import('../write-hold.js');
type MinorCare = typeof import('../minor-care.js');
type Crisis = typeof import('../crisis-memory-hold.js');
type Sexual = typeof import('../sexual-topic-hold.js');
interface Mods {
  wh: WriteHoldModule;
  mc: MinorCare;
  crisis: Crisis;
  sexual: Sexual;
}

const AGE = "I'm 16 years old.";
const WORDS = 'An invented line the caller said, about the weekend.';
const DEMO_ID = 'device:demo_1731700000000_ab12';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Fresh module state for all four modules: write-hold keeps its sessions in memory. */
async function load(): Promise<Mods> {
  vi.resetModules();
  const wh = await import('../write-hold.js');
  const mc = await import('../minor-care.js');
  const crisis = await import('../crisis-memory-hold.js');
  const sexual = await import('../sexual-topic-hold.js');
  return { wh, mc, crisis, sexual };
}

const flags = (minorCare: string, owners: string, sexual: string): void => {
  vi.stubEnv('MINOR_CARE', minorCare);
  vi.stubEnv('MINOR_CARE_OWNERS', owners);
  vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', sexual);
};

let n = 0;
const ids = (): { sessionId: string; userId: string } => {
  n++;
  return { sessionId: `write-hold-unit-${n}`, userId: `user-write-hold-${n}` };
};

/** The three kinds for one write, with and without the session. */
function kinds(m: Mods, ownerId: string | undefined, sessionId?: string): string[] {
  return (['content', 'safety-record', 'control'] as const).map((kind) =>
    m.wh.writeHold({ ownerId, sessionId, kind })
  );
}

beforeEach(() => {
  flags('on', 'off', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock('../minor-care.js'); // row 13b's
});

describe('writeHold', () => {
  it('row 1: an unheld owner is open for all three kinds', async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    expect(kinds(m, userId, sessionId)).toEqual(['open', 'open', 'open']);
    expect(kinds(m, userId)).toEqual(['open', 'open', 'open']);
  });

  it('row 2: an age-held session holds content and the safety record, never control', async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    m.mc.noteCallerWords(sessionId, AGE);
    expect(kinds(m, userId, sessionId)).toEqual(['held', 'held', 'open']);
  });

  it("row 3: another live session of the owner is age-held, so this one's content is held", async () => {
    const m = await load();
    const first = ids();
    const second = ids();
    m.mc.bindSessionUser(first.sessionId, first.userId);
    m.mc.noteCallerWords(first.sessionId, AGE);
    m.mc.bindSessionUser(second.sessionId, first.userId);
    expect(
      m.wh.writeHold({ ownerId: first.userId, sessionId: second.sessionId, kind: 'content' })
    ).toBe('held');
  });

  it('row 4: a verified owner is open with MINOR_CARE_OWNERS off, held with it on', async () => {
    const off = await load();
    off.mc.setVerifiedOwnerCheck(() => true);
    const a = ids();
    off.mc.bindSessionUser(a.sessionId, a.userId);
    off.mc.noteCallerWords(a.sessionId, AGE);
    expect(off.wh.writeHold({ ownerId: a.userId, sessionId: a.sessionId, kind: 'content' })).toBe(
      'open'
    );

    flags('on', 'on', 'on');
    const on = await load();
    on.mc.setVerifiedOwnerCheck(() => true);
    const b = ids();
    on.mc.bindSessionUser(b.sessionId, b.userId);
    on.mc.noteCallerWords(b.sessionId, AGE);
    expect(on.wh.writeHold({ ownerId: b.userId, sessionId: b.sessionId, kind: 'content' })).toBe(
      'held'
    );
  });

  it('row 5: a confirmed sexual topic holds the session and the owner', async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    m.sexual.holdForSexualTopic(sessionId, userId);
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('held');
    expect(m.wh.writeHold({ ownerId: userId, kind: 'content' })).toBe('held');
  });

  it('row 6: a sexual-topic read still running is held, as writeHeld says (never pending)', async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    const read = m.sexual.beginSexualRead(sessionId, userId);
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('held');
    expect(m.wh.writeHold({ ownerId: userId, kind: 'content' })).toBe('held');
    read.end();
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('open');
  });

  it("row 7: a crisis-held session holds content; the safety record still writes (today's careHeld)", async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    m.crisis.holdForCrisis(sessionId);
    expect(kinds(m, userId, sessionId)).toEqual(['held', 'open', 'open']);
  });

  it('row 8: crisis, owner only: held in the call, held within 10 min of its end, open after', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    m.crisis.holdForCrisis(sessionId);
    const ownerOnly = (): string => m.wh.writeHold({ ownerId: userId, kind: 'content' });
    expect(ownerOnly()).toBe('held');
    vi.setSystemTime(Date.now() + 30 * MIN); // still in the call
    expect(ownerOnly()).toBe('held');
    m.wh.noteSessionEnded(sessionId, userId);
    vi.setSystemTime(Date.now() + 9 * MIN);
    expect(ownerOnly()).toBe('held');
    vi.setSystemTime(Date.now() + 2 * MIN);
    expect(ownerOnly()).toBe('open');
    // The session-keyed hold itself is unchanged: a write naming the call is still held.
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('held');
  });

  it('row 9: a crisis read in flight is pending for content; a definite hold beats it', async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    const other = ids();
    m.mc.bindSessionUser(sessionId, userId);
    m.mc.bindSessionUser(other.sessionId, userId);
    const read = m.crisis.beginCrisisRead(sessionId, WORDS);
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('pending');
    expect(m.wh.writeHold({ ownerId: userId, kind: 'content' })).toBe('pending');
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'safety-record' })).toBe('open');
    // A write naming another call of the owner keeps that call's own state.
    expect(m.wh.writeHold({ ownerId: userId, sessionId: other.sessionId, kind: 'content' })).toBe(
      'open'
    );
    m.mc.noteCallerWords(sessionId, AGE);
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('held');
    read.end();
    const settled = ids();
    m.mc.bindSessionUser(settled.sessionId, settled.userId);
    m.crisis.beginCrisisRead(settled.sessionId, WORDS).end();
    expect(m.wh.writeHold({ ownerId: settled.userId, kind: 'content' })).toBe('open');
  });

  it('row 10: a try-first id holds content; its safety record still writes', async () => {
    const m = await load();
    const { sessionId } = ids();
    m.mc.bindSessionUser(sessionId, DEMO_ID);
    expect(kinds(m, DEMO_ID, sessionId)).toEqual(['held', 'open', 'open']);
    expect(m.wh.writeHold({ ownerId: DEMO_ID, kind: 'content' })).toBe('held');
  });

  it('row 11: a placeholder owner follows writeHeld: held with MINOR_CARE on or a held session', async () => {
    flags('off', 'off', 'off');
    const m = await load();
    expect(m.wh.writeHold({ ownerId: 'anonymous', kind: 'content' })).toBe('open');
    const { sessionId } = ids();
    m.crisis.holdForCrisis(sessionId);
    expect(m.wh.writeHold({ ownerId: 'anonymous', sessionId, kind: 'content' })).toBe('held');
    flags('on', 'off', 'off');
    expect(m.wh.writeHold({ ownerId: 'anonymous', kind: 'content' })).toBe('held');
    expect(m.wh.writeHold({ ownerId: undefined, kind: 'content' })).toBe('held');
  });

  it('row 12: flags changed after the call ended: its copied flags still hold (union)', async () => {
    const m = await load();
    const a = ids();
    m.mc.bindSessionUser(a.sessionId, a.userId);
    m.mc.noteCallerWords(a.sessionId, AGE);
    m.wh.noteSessionEnded(a.sessionId, a.userId);
    flags('off', 'off', 'off'); // the next caller's flags
    expect(m.mc.writeHeld(a.userId, a.sessionId)).toBe(false); // today's flags alone: open
    expect(m.wh.writeHold({ ownerId: a.userId, sessionId: a.sessionId, kind: 'content' })).toBe(
      'held'
    );
    expect(m.wh.writeHold({ ownerId: a.userId, kind: 'content' })).toBe('held');
    expect(m.wh.writeHold({ ownerId: a.userId, kind: 'safety-record' })).toBe('held');

    const b = ids();
    m.mc.bindSessionUser(b.sessionId, b.userId);
    m.wh.noteSessionEnded(b.sessionId, b.userId); // copied with MINOR_CARE off
    flags('on', 'off', 'off');
    m.mc.noteCallerWords(b.sessionId, AGE);
    expect(m.wh.writeHold({ ownerId: b.userId, sessionId: b.sessionId, kind: 'content' })).toBe(
      'held'
    );
  });

  it('row 13: over the cap, idle unheld sessions go and a live hold stays', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    const m = await load();
    const see = (c: { sessionId: string; userId: string }): void => {
      m.mc.bindSessionUser(c.sessionId, c.userId);
      m.wh.writeHold({ ownerId: c.userId, sessionId: c.sessionId, kind: 'control' });
    };
    const kept = ids();
    see(kept);
    m.mc.noteCallerWords(kept.sessionId, AGE); // a live age hold, flags copied with MINOR_CARE on
    const idle = ids();
    see(idle);
    m.wh.noteSessionEnded(idle.sessionId, idle.userId);
    for (let i = 0; i < 500; i++) see(ids());
    vi.setSystemTime(Date.now() + 6 * HOUR + MIN); // past any call
    flags('off', 'off', 'off');
    see(ids()); // over the cap: eviction runs
    // The live hold kept its copied flags, so it still holds under today's flags (off).
    expect(
      m.wh.writeHold({ ownerId: kept.userId, sessionId: kept.sessionId, kind: 'content' })
    ).toBe('held');
    // The idle one went with its end time: a late crisis hold then projects as not ended (held).
    m.crisis.holdForCrisis(idle.sessionId);
    expect(m.wh.writeHold({ ownerId: idle.userId, kind: 'content' })).toBe('held');
  });

  it("row 13b: over the cap, an idle crisis-held call that never ended stays; its owner's no-session write stays held", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    // sessionUser names this call's owner at first sight only, and minor-care itself never learns
    // it, so afterwards only write-hold's own entry for the call can name the owner.
    const owners = new Map<string, string>();
    vi.doMock('../minor-care.js', async (orig) => {
      const real = await orig<MinorCare>();
      return { ...real, sessionUser: (id: string) => owners.get(id) ?? real.sessionUser(id) };
    });
    const m = await load();
    const call = ids();
    owners.set(call.sessionId, call.userId);
    m.wh.writeHold({ ownerId: call.userId, sessionId: call.sessionId, kind: 'control' });
    owners.delete(call.sessionId);
    expect(m.mc.sessionUser(call.sessionId)).toBeUndefined();
    vi.setSystemTime(Date.now() + 6 * HOUR + MIN); // idle past IDLE_MS since first sight, never ended
    m.crisis.holdForCrisis(call.sessionId);
    for (let i = 0; i < 500; i++) {
      m.wh.writeHold({ ownerId: undefined, sessionId: ids().sessionId, kind: 'control' });
    } // over the cap: eviction runs, with this call the oldest entry
    expect(m.wh.writeHold({ ownerId: call.userId, kind: 'content' })).toBe('held');
  });

  it("row 14a: crisis on call A; a write naming call B of the same owner is open (B's own state)", async () => {
    const m = await load();
    const a = ids();
    const b = ids();
    m.mc.bindSessionUser(a.sessionId, a.userId);
    m.mc.bindSessionUser(b.sessionId, a.userId);
    m.crisis.holdForCrisis(a.sessionId);
    expect(m.wh.writeHold({ ownerId: a.userId, sessionId: b.sessionId, kind: 'content' })).toBe(
      'open'
    );
  });

  it('row 14b: crisis on call A; a write naming no session is held within the grace', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    const m = await load();
    const a = ids();
    const b = ids();
    m.mc.bindSessionUser(a.sessionId, a.userId);
    m.mc.bindSessionUser(b.sessionId, a.userId);
    m.crisis.holdForCrisis(a.sessionId);
    m.wh.noteSessionEnded(a.sessionId, a.userId);
    vi.setSystemTime(Date.now() + 5 * MIN);
    expect(m.wh.writeHold({ ownerId: a.userId, kind: 'content' })).toBe('held');
  });

  it('row 15: flags copied mid-call are not replaced by a later, more open copy', async () => {
    const m = await load();
    const { sessionId, userId } = ids();
    m.mc.bindSessionUser(sessionId, userId);
    m.mc.noteCallerWords(sessionId, AGE);
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('held'); // copied
    flags('off', 'off', 'off');
    m.wh.noteSessionEnded(sessionId, userId); // would copy MINOR_CARE off
    expect(m.wh.writeHold({ ownerId: userId, sessionId, kind: 'content' })).toBe('held');
    expect(m.wh.writeHold({ ownerId: userId, kind: 'content' })).toBe('held');
  });
});

describe('never more open than today', () => {
  type Built = { ownerId: string | undefined; sessionId: string };
  const scenarios: Record<string, (m: Mods) => Built> = {
    unheld: (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, c.userId);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    age: (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, c.userId);
      m.mc.noteCallerWords(c.sessionId, AGE);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    'age on another session': (m) => {
      const c = ids();
      const other = ids();
      m.mc.bindSessionUser(other.sessionId, c.userId);
      m.mc.noteCallerWords(other.sessionId, AGE);
      m.mc.bindSessionUser(c.sessionId, c.userId);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    'sexual topic': (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, c.userId);
      m.sexual.holdForSexualTopic(c.sessionId, c.userId);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    'sexual read running': (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, c.userId);
      m.sexual.beginSexualRead(c.sessionId, c.userId);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    crisis: (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, c.userId);
      m.crisis.holdForCrisis(c.sessionId);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    'crisis read running': (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, c.userId);
      m.crisis.beginCrisisRead(c.sessionId, WORDS);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    'crisis on another call': (m) => {
      const c = ids();
      const other = ids();
      m.mc.bindSessionUser(other.sessionId, c.userId);
      m.crisis.holdForCrisis(other.sessionId);
      m.mc.bindSessionUser(c.sessionId, c.userId);
      return { ownerId: c.userId, sessionId: c.sessionId };
    },
    'try-first': (m) => {
      const c = ids();
      m.mc.bindSessionUser(c.sessionId, DEMO_ID);
      return { ownerId: DEMO_ID, sessionId: c.sessionId };
    },
    placeholder: () => ({ ownerId: 'anonymous', sessionId: ids().sessionId }),
    'placeholder in a held session': (m) => {
      const c = ids();
      m.crisis.holdForCrisis(c.sessionId);
      return { ownerId: 'default', sessionId: c.sessionId };
    },
    'unknown owner': () => ({ ownerId: undefined, sessionId: ids().sessionId }),
  };

  it('content is held whenever writeHeld is; the safety record whenever careHeld is', async () => {
    const m = await load();
    let contentHeld = 0;
    let careHeldCount = 0;
    let cases = 0;
    for (const minorCare of ['on', 'off'])
      for (const owners of ['on', 'off'])
        for (const sexual of ['on', 'off'])
          for (const verified of [true, false])
            for (const [name, build] of Object.entries(scenarios)) {
              m.mc.resetMinorCare();
              m.crisis.resetCrisisMemoryHold();
              m.sexual.resetSexualTopicHold();
              flags(minorCare, owners, sexual);
              m.mc.setVerifiedOwnerCheck(() => verified);
              const { ownerId, sessionId } = build(m);
              for (const sid of [sessionId, undefined]) {
                cases++;
                const where = `${name} ${minorCare}/${owners}/${sexual}/${verified} ${sid ?? 'owner only'}`;
                if (m.mc.writeHeld(ownerId, sid)) {
                  contentHeld++;
                  expect(m.wh.writeHold({ ownerId, sessionId: sid, kind: 'content' }), where).toBe(
                    'held'
                  );
                }
                if (m.mc.careHeld(ownerId, sid)) {
                  careHeldCount++;
                  expect(
                    m.wh.writeHold({ ownerId, sessionId: sid, kind: 'safety-record' }),
                    where
                  ).toBe('held');
                }
              }
            }
    // The matrix is not vacuous: it has held cases of both kinds, and open ones.
    expect(cases).toBe(16 * Object.keys(scenarios).length * 2);
    expect(contentHeld).toBeGreaterThan(100);
    expect(careHeldCount).toBeGreaterThan(40);
    expect(contentHeld).toBeLessThan(cases);
  });
});
