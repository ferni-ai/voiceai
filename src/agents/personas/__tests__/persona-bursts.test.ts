/**
 * VOCAL_BURSTS_PER_PERSONA (#4218): each teammate is offered its own vocal
 * bursts, and no wince right before an unwelcome answer. Off, the invitation
 * and the draws are exactly as before for every persona.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { OpenerGate } from '../opener-gate.js';

import { PERSONA_BURSTS, WINCE_FITS, personaBursts } from '../persona-bursts.js';
import { PLAIN_SIGNALS, type TurnSignals } from '../turn-extras.js';
import { styleFor } from '../turn-request-style.js';
import { BURSTS, burstAllowed, burstLine } from '../vocal-bursts.js';

const BURSTS_ON = { VOCAL_BURSTS: 'on' };
const ON = { VOCAL_BURSTS: 'on', VOCAL_BURSTS_PER_PERSONA: 'on' };
const LIGHT: TurnSignals = { ...PLAIN_SIGNALS, careful: false };
const always = (): number => 0;

/** The invitation on origin/main 63651f21b4, byte for byte. */
const MAIN_INVITE =
  'This reply may open with one small sound a friend would make, only if one truly fits what they just said (this once it overrides the rule against reaction words): "Hmm," (thinking it over), "Oh!" (surprised), "Ugh," (annoyed for them), "Eek," (wincing at an awkward spot), "Aww," (touched by something sweet), "Heh," (caught out, a little sheepish), "Ha," (mildly amused), "[laughter]" (something genuinely funny), "Haah," (resigned or relieved), "Aaahhh," (tired, late in a long day), "Tch," (that was unfair to them). Write it exactly as shown, first, then go on; if none fits, use none.';

const PERSONAS = [
  'alex-chen',
  'ferni',
  'joel-dickson',
  'john-bogle',
  'jordan-taylor',
  'maya-santos',
  'nayan-patel',
  'peter-john',
  'seth',
  'custom-agent-0101',
  undefined,
];

/** An rng that counts its draws. */
function counted(value = 0): { rng: () => number; draws: () => number } {
  let n = 0;
  return {
    rng: () => {
      n++;
      return value;
    },
    draws: () => n,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('VOCAL_BURSTS_PER_PERSONA off', () => {
  it('invites with the same text and the same draws as main, for every persona and turn', () => {
    for (const personaId of PERSONAS) {
      for (const extras of [[], ['candor_yes'], ['candor_unknowable']]) {
        const { rng, draws } = counted();
        expect(burstLine({}, LIGHT, rng, BURSTS_ON, { personaId, extras })).toBe(MAIN_INVITE);
        expect(draws()).toBe(1);
      }
      const miss = counted(0.99);
      expect(burstLine({}, LIGHT, miss.rng, BURSTS_ON, { personaId })).toBe('');
      expect(miss.draws()).toBe(1);
    }
  });
});

describe('VOCAL_BURSTS_PER_PERSONA on', () => {
  it("never offers Alex a wince: only his own dry set (canon: 'Even and dry by default.')", () => {
    const line = burstLine({}, LIGHT, always, ON, { personaId: 'alex-chen' });
    expect(line).not.toContain('Eek,');
    expect(line).toContain('"Hmm,"');
    expect(line).toContain('"Ha,"');
    expect(line).toContain('"[laughter]"');
    for (const written of ['Oh!', 'Ugh,', 'Aww,', 'Heh,', 'Haah,', 'Aaahhh,', 'Tch,']) {
      expect(line).not.toContain(`"${written}"`);
    }
  });

  it('offers each listed persona exactly its own set', () => {
    for (const [personaId, ids] of Object.entries(PERSONA_BURSTS)) {
      const line = burstLine({}, LIGHT, always, ON, { personaId });
      for (const b of BURSTS) {
        expect(line.includes(`"${b.written}"`), `${personaId} ${b.id}`).toBe(ids.includes(b.id));
      }
    }
  });

  it('offers a persona with no entry the full list (Ferni, Seth, a custom agent, unknown)', () => {
    for (const personaId of ['ferni', 'seth', 'custom-agent-0101', 'constructor', undefined]) {
      const line = burstLine({}, LIGHT, always, ON, { personaId });
      for (const b of BURSTS) expect(line).toContain(`"${b.written}"`);
    }
  });

  it('drops the wince on a turn where they fished for a yes or asked the unknowable', () => {
    for (const fired of ['candor_yes', 'candor_unknowable']) {
      const line = burstLine({}, LIGHT, always, ON, {
        personaId: 'ferni',
        extras: ['model_shape', fired],
      });
      expect(line).not.toContain('Eek,');
      expect(line).toContain('"Hmm,"');
    }
    // The standing candor line rides most ordinary turns: the wince stays there.
    const ordinary = burstLine({}, LIGHT, always, ON, { personaId: 'ferni', extras: ['candor'] });
    expect(ordinary).toContain(`"Eek," (${WINCE_FITS})`);
  });

  it('relabels the wince so it is not "an awkward spot"', () => {
    const line = burstLine({}, LIGHT, always, ON, { personaId: 'ferni' });
    expect(line).not.toContain('awkward spot');
    expect(line).toContain(WINCE_FITS);
  });

  it('draws the same once as with the flag off', () => {
    const { rng, draws } = counted();
    burstLine({}, LIGHT, rng, ON, { personaId: 'alex-chen', extras: ['candor_yes'] });
    expect(draws()).toBe(1);
  });

  it('records which bursts it offered, so the opener gate keeps only those', () => {
    const session = {};
    burstLine(session, LIGHT, always, ON, { personaId: 'alex-chen' });
    expect(burstAllowed(session, false, ON)).toEqual(new Set(['think', 'chuckle', 'laugh']));
    expect(burstAllowed(session, true, ON)).toBe(false); // never with crisis guidance
    expect(personaBursts([BURSTS[3]], 'ferni', ['candor_yes'])).toEqual([]);
  });
});

/** Their words at the end of a short call. */
function call(said: string): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'user', content: 'hey' });
  c.addMessage({ role: 'assistant', content: 'hey you' });
  c.addMessage({ role: 'user', content: said });
  return c;
}

/** The burst invitations styleFor gave across fresh calls (each has its own seed). */
function invitesFrom(said: string, personaId: string, calls = 40): string[] {
  const out: string[] = [];
  for (let i = 0; i < calls; i++) {
    const { text } = styleFor(call(said), { userData: { personaId } }, true);
    if (text.includes('may open with one small sound')) out.push(text);
  }
  return out;
}

describe('the live path (styleFor) passes the speaker and the stance', () => {
  it("Alex's own set holds Eek, out of his invite on a candor turn (it is offered with the flag off)", () => {
    const said = 'Okay, fine. If something goes, what goes?';
    vi.stubEnv('VOCAL_BURSTS', 'on');
    vi.stubEnv('CANDOR', 'on');
    const before = invitesFrom(said, 'alex-chen');
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((t) => !t.includes('"Eek,"'))).toEqual([]);
    vi.stubEnv('VOCAL_BURSTS_PER_PERSONA', 'on');
    const after = invitesFrom(said, 'alex-chen');
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((t) => t.includes('Eek,'))).toEqual([]);
  });

  it("Ferni's fished-for-a-yes turn is offered no wince with the flag on", () => {
    const said = "So be real, the Webster's bit. Good opener? People are going to love it, right?";
    vi.stubEnv('VOCAL_BURSTS', 'on');
    vi.stubEnv('CANDOR', 'on');
    vi.stubEnv('VOCAL_BURSTS_PER_PERSONA', 'on');
    const invites = invitesFrom(said, 'ferni');
    expect(invites.length).toBeGreaterThan(0);
    expect(invites.filter((t) => t.includes('Eek,'))).toEqual([]);
    expect(invites.filter((t) => !t.includes('"Hmm,"'))).toEqual([]);
  });
});

describe('the opener gate keeps only a burst that was offered', () => {
  it('strips a burst outside the offered set with the flag on, keeps it as on main with it off', () => {
    const offered = (env: Record<string, string>) => {
      const session = {};
      burstLine(session, LIGHT, always, env, { personaId: 'alex-chen' });
      return burstAllowed(session, false, env);
    };
    const said = "Eek, that's the hard part.";
    expect(new OpenerGate(3, false).decide(said, false, offered(ON))).toBe("That's the hard part.");
    expect(new OpenerGate(3, false).decide('Oof, that hurts.', false, offered(ON))).toBe(
      'That hurts.'
    );
    expect(new OpenerGate(3, false).decide(said, false, offered(BURSTS_ON))).toBe(said);
    // A burst in his set is kept, in the spelling that renders.
    expect(new OpenerGate(3, false).decide('Hmm, okay.', false, offered(ON))).toBe('Hmm, okay.');
  });

  const streamOf = (text: string) =>
    new ReadableStream<unknown>({
      start(c) {
        c.enqueue(text);
        c.close();
      },
    });

  /** One reply through gatedReply (crisis-gate.ts) as Alex: whether it was invited, what was said. */
  async function asAlex(reply: string, env: Record<string, string>) {
    const session = { userData: { personaId: 'alex-chen' } };
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Okay, fine. If something goes, what goes?' });
    let invited = false;
    const model = async (c: llm.ChatContext) => {
      const text = c.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join(' ');
      invited ||= text.includes('small sound a friend would make');
      return streamOf(reply);
    };
    const out: string[] = [];
    const gated = await gatedReply(ctx, session, model as never, new OpenerGate(3, false), { env });
    for await (const chunk of gated as unknown as AsyncIterable<string>) out.push(chunk);
    return { invited, said: out.join('') };
  }

  it("drops Alex's invited Eek, on the live reply path with the flag on, keeps it with it off", async () => {
    const said = "Eek, that's the hard part.";
    for (const [env, expected] of [
      [{ ...ON, CRISIS_GUARD_MODE: 'off' }, "That's the hard part."],
      [{ ...BURSTS_ON, CRISIS_GUARD_MODE: 'off' }, said],
    ] as const) {
      vi.unstubAllEnvs();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      // One env at a time: styleFor reads process.env.
      // eslint-disable-next-line no-await-in-loop
      const runs = await Promise.all(Array.from({ length: 30 }, () => asAlex(said, env)));
      const invited = runs.filter((r) => r.invited);
      expect(invited.length).toBeGreaterThan(0);
      expect(invited.map((r) => r.said)).toEqual(invited.map(() => expected));
    }
  });
});
