/**
 * MINOR_CRISIS_CARE: a caller who sounds under 18 keeps youth-safe words on a crisis turn,
 * merged with the crisis handling, never in place of it (utils/minor-care.ts,
 * utils/minor-crisis-care.ts).
 *
 * Every turn goes through gatedReply, the reply path PersonaVoiceAgent.llmNode uses. Main is
 * MINOR_CARE and MINOR_CRISIS_CARE off: on a crisis turn main adds no minor-care note at all.
 * With both on, for a likely minor:
 * - a guided turn's request is main's request plus MINOR_CRISIS_NOTE, nothing else changed;
 * - a script turn (the 911 script on an imminent turn, the 988 script), from the patterns or
 *   from the classifier, is main's script, then one short youth line after its own question;
 * - a soft check-in (SOFT_CRISIS_CHECK) gets no youth note: it asks for no crisis talk;
 * - a friend at risk (the crisis read's third_party subject) gets MINOR_FRIEND_CRISIS_NOTE instead.
 * No reply guidance here ever promises secrecy (promisesSecrecy).
 * Flag off, MINOR_CARE off, an adult, or a verified owner: byte for byte main. A likely minor on a
 * turn with no crisis: main's minor-care note, unchanged. All callers and lines are fictional.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as minorCare from '../../../utils/minor-care.js';
import * as minorCrisisCare from '../../../utils/minor-crisis-care.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { gatedReply } from '../crisis-gate.js';

const {
  MINOR_CARE_NOTE,
  MINOR_CRISIS_NOTE,
  MINOR_FRIEND_CRISIS_NOTE,
  resetMinorCare,
  setVerifiedOwnerCheck,
} = minorCare;
const { YOUTH_SCRIPT_LINE, YOUTH_SCRIPT_LINE_ES, minorCrisisScript, withYouthLine } =
  minorCrisisCare;

const GATE_ENV = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const AGE = "I'm 15 and in 10th grade.";
const GUIDED = "I don't want to be here anymore";
const IMMINENT = 'I took a bunch of pills just now';
const SCRIPTED = 'I want to kill myself';
const EVERYDAY = 'school was boring today, we had a quiz';
const FRIEND = 'my friend said she is going to kill herself tonight';

interface Turn {
  request: string | null;
  reply: string;
}
let n = 0;

async function textOf(stream: ReadableStream<unknown> | null): Promise<string> {
  let text = '';
  if (!stream) return text;
  for await (const chunk of stream) {
    if (typeof chunk === 'string') text += chunk;
    else text += (chunk as { delta?: { content?: string } }).delta?.content ?? '';
  }
  return text;
}

type GateOptions = Parameters<typeof gatedReply>[4];
let gateOptions: GateOptions = { env: GATE_ENV };

/** One call, turn by turn through gatedReply; the last turn's last model request, and reply. */
async function call(...said: string[]): Promise<Turn> {
  n += 1;
  const session = { userData: { personaId: 'ferni', services: { sessionId: `mcc-${n}` } } };
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  let turn: Turn = { request: null, reply: '' };
  for (const line of said) {
    ctx.addMessage({ role: 'user', content: line });
    const model = vi.fn(
      async (_r: llm.ChatContext) =>
        new ReadableStream<unknown>({
          start: (c) => {
            c.enqueue('okay');
            c.close();
          },
        })
    );
    // eslint-disable-next-line no-await-in-loop
    const stream = await gatedReply(
      ctx,
      session,
      model as never,
      { wrap: (s: unknown) => s } as never,
      gateOptions
    );
    // eslint-disable-next-line no-await-in-loop
    const reply = await textOf(stream as never);
    const sent = model.mock.calls.at(-1)?.[0];
    const request = sent
      ? sent.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n')
      : null;
    turn = { request, reply };
    ctx.addMessage({ role: 'assistant', content: reply });
  }
  return turn;
}

function flags(minorCare: string, minorCrisis: string): void {
  vi.stubEnv('MINOR_CARE', minorCare);
  vi.stubEnv('MINOR_CRISIS_CARE', minorCrisis);
}

/** Main's turn: neither flag on. */
async function mainTurn(...said: string[]): Promise<Turn> {
  flags('off', 'off');
  const turn = await call(...said);
  flags('on', 'on');
  return turn;
}

beforeEach(() => {
  gateOptions = { env: GATE_ENV };
  resetCrisisClassifierCache();
  resetMinorCare();
  flags('on', 'on');
  // The style reminder picks lines at random and by the clock: both fixed, so turns compare.
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetMinorCare();
});

describe('a likely minor on a crisis turn: main, plus youth-safe words', () => {
  it('a guided turn: main request plus MINOR_CRISIS_NOTE, the guidance untouched', async () => {
    const main = await mainTurn(AGE, GUIDED);
    const minor = await call(AGE, GUIDED);
    expect(main.request).toContain('[CRITICAL - USER SAFETY]');
    expect(main.request).toContain('Include the 988 Suicide & Crisis Lifeline (call or text 988)');
    expect(main.request).not.toContain(MINOR_CRISIS_NOTE);
    expect(minor.request).toContain(MINOR_CRISIS_NOTE);
    expect(minor.request).not.toContain(MINOR_CARE_NOTE);
    // Merged, not replaced: take the note out and the request is main's, byte for byte.
    expect(String(minor.request).replace(` ${MINOR_CRISIS_NOTE}`, '')).toBe(main.request);
  });

  it("a friend at risk: main's third-party request plus the friend note, nothing else", async () => {
    const main = await mainTurn(AGE, FRIEND);
    const minor = await call(AGE, FRIEND);
    expect(main.request).toContain('The user is worried that someone they know is at risk.');
    expect(main.request).toContain('call 911 if there is immediate danger');
    expect(minor.request).toContain(MINOR_FRIEND_CRISIS_NOTE);
    expect(minor.request).not.toContain(MINOR_CRISIS_NOTE);
    expect(String(minor.request).replace(` ${MINOR_FRIEND_CRISIS_NOTE}`, '')).toBe(main.request);
  });

  it('the age said in the same turn as the crisis counts', async () => {
    const minor = await call(`${AGE} ${GUIDED}`);
    expect(minor.request).toContain(MINOR_CRISIS_NOTE);
  });

  it.each([
    ['an imminent turn (the 911 script)', IMMINENT, 'please call 911'],
    ['a script turn (the 988 script)', SCRIPTED, 'calling or texting 988'],
  ])('%s: every main line, in order, plus the youth line', async (_n, line, resource) => {
    const main = await mainTurn(AGE, line);
    const minor = await call(AGE, line);
    expect(main.request).toBeNull(); // the script, never the model
    expect(main.reply).toContain(resource);
    // Main's script, whole and first, then the youth line: its own question comes first.
    expect(minor.reply).toBe(`${main.reply}\n\n${YOUTH_SCRIPT_LINE}`);
    expect(minor.reply).toBe(withYouthLine(main.reply));
  });

  it("the imminent script's safety question comes before the youth line", async () => {
    const minor = await call(AGE, IMMINENT);
    const question = 'Is anyone nearby who can be with you?';
    expect(minor.reply.indexOf(question)).toBeGreaterThan(-1);
    expect(minor.reply.indexOf(question)).toBeLessThan(minor.reply.indexOf(YOUTH_SCRIPT_LINE));
  });

  it('a Spanish script gets the Spanish line, after it', () => {
    const es = 'Puedes llamar al 988 y oprimir 2, o enviar AYUDA al 988.\n\n¿Me cuentas?';
    expect(withYouthLine(es)).toBe(`${es}\n\n${YOUTH_SCRIPT_LINE_ES}`);
    expect(withYouthLine('Call or text 988.')).toBe(`Call or text 988.\n\n${YOUTH_SCRIPT_LINE}`);
  });

  it('a script that fails to read the caller goes as it is, and never throws', () => {
    const items = {
      get length(): number {
        throw new Error('unreadable');
      },
    };
    const script = 'Please call 911.\n\nIs anyone nearby who can be with you?';
    expect(minorCrisisScript(script, 'mcc-throws', AGE, items as never)).toBe(script);
  });
});

/** The classifier's model call: a verdict for one line, none for the rest. */
const reads =
  (line: string, risk: string) =>
  async (_p: string, content: string): Promise<string> => {
    let latest = '';
    try {
      ({ latest } = JSON.parse(content) as { latest: string });
    } catch {
      // not the classifier's request
    }
    return latest === line
      ? `{"risk":"${risk}","subject":"self"}`
      : '{"risk":"none","subject":"self"}';
  };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };

describe('with the classifier live', () => {
  it('a classifier-escalated script: main, then the youth line', async () => {
    const line = 'I just want everything to stop for good';
    gateOptions = {
      env: LIVE,
      generate: reads(line, 'imminent'),
      adjudicate: reads(line, 'imminent'),
    };
    const main = await mainTurn(AGE, line);
    resetCrisisClassifierCache();
    const minor = await call(AGE, line);
    expect(main.reply).toContain('911');
    expect(minor.reply).toBe(`${main.reply}\n\n${YOUTH_SCRIPT_LINE}`);
  });

  it('a soft check-in (SOFT_CRISIS_CHECK): no youth note, as on main', async () => {
    const bye = 'okay bye, talk later';
    gateOptions = {
      env: LIVE,
      generate: reads(bye, 'imminent'),
      adjudicate: reads(bye, 'imminent'),
    };
    const said = [AGE, 'we watched a movie in class', 'it was about space', bye];
    flags('on', 'off');
    const main = await call(...said);
    resetCrisisClassifierCache();
    flags('on', 'on');
    const minor = await call(...said);
    expect(main.request).toContain('[SAFETY - SOFT CHECK]');
    expect(minor.request).not.toContain(MINOR_CRISIS_NOTE);
    expect(minor).toEqual(main);
  });
});

describe('everyone else: main, byte for byte', () => {
  const cases: Array<[string, string[]]> = [
    ['guided', [AGE, GUIDED]],
    ['imminent', [AGE, IMMINENT]],
    ['scripted', [AGE, SCRIPTED]],
    ['a friend at risk', [AGE, FRIEND]],
  ];

  it.each(cases)('%s: MINOR_CRISIS_CARE off', async (_n, said) => {
    const main = await mainTurn(...said);
    flags('on', 'off');
    expect(await call(...said)).toEqual(main);
  });

  it.each(cases)('%s: MINOR_CARE off', async (_n, said) => {
    const main = await mainTurn(...said);
    flags('off', 'on');
    expect(await call(...said)).toEqual(main);
  });

  it.each(cases)('%s: an adult', async (_n, said) => {
    const adult = ['I just got back from work.', said[1] ?? ''];
    const main = await mainTurn(...adult);
    expect(await call(...adult)).toEqual(main);
  });

  it.each(cases)('%s: a verified owner (MINOR_CARE exempts them)', async (_n, said) => {
    // The age in the crisis turn itself: the owner rule is all that holds the youth words back.
    const owner = [`${said[0]} ${said[1]}`];
    const main = await mainTurn(...owner);
    setVerifiedOwnerCheck(() => true);
    expect(await call(...owner)).toEqual(main);
    setVerifiedOwnerCheck(() => false);
    expect(await call(...owner)).not.toEqual(main); // the same words, not an owner: youth words
  });
});

describe('a likely minor on a turn with no crisis', () => {
  it("main's minor-care note, the same with MINOR_CRISIS_CARE on or off", async () => {
    flags('on', 'off');
    const off = await call(AGE, EVERYDAY);
    flags('on', 'on');
    const on = await call(AGE, EVERYDAY);
    expect(off.request).toContain(MINOR_CARE_NOTE);
    expect(on).toEqual(off);
    expect(on.request).not.toContain(MINOR_CRISIS_NOTE);
  });
});

/** Every reply-guidance string the two modules export: each note and spoken line. */
const EXPORTS: unknown[] = [...Object.values(minorCare), ...Object.values(minorCrisisCare)];
const GUIDANCE = EXPORTS.filter((v): v is string => typeof v === 'string' && v.length > 40);

/** Wording that promises to keep a crisis secret: a confidentiality promise Ferni never makes. */
const promisesSecrecy = (text: string): boolean =>
  /not going to tell anyone|stays between us|keep it secret/i.test(text);

describe('the youth words', () => {
  it('guidance on how to talk, in their own words: no lines to say', () => {
    expect(MINOR_CRISIS_NOTE).toMatch(/Use your own words; never repeat these phrases/);
    expect(MINOR_CRISIS_NOTE).toMatch(/Keep it as short as you would anyway, two or three short/);
    expect(MINOR_CRISIS_NOTE).toMatch(/say less elsewhere, not more/);
  });

  it('988, which teens can use too, and a trusted adult as well', () => {
    expect(MINOR_CRISIS_NOTE).toMatch(/mention teens can call or text 988 too/);
    expect(MINOR_CRISIS_NOTE).toMatch(
      /Gently ask who they've got, an adult they trust \(parent, school counselor, coach, relative\)/
    );
    expect(YOUTH_SCRIPT_LINE).toMatch(/Teens can text 988, and tell an adult you trust/);
    expect(YOUTH_SCRIPT_LINE_ES).toMatch(/988 y hablar con un adulto de confianza/);
  });

  it('no number the crisis guidance does not give: no 911 of its own', () => {
    for (const block of [MINOR_CRISIS_NOTE, YOUTH_SCRIPT_LINE, YOUTH_SCRIPT_LINE_ES])
      expect(block).not.toMatch(/911/);
    expect(MINOR_CRISIS_NOTE).toMatch(/Add no phone number the crisis guidance for this turn/);
  });

  it('the script line is one short sentence, 12 spoken words at most', () => {
    const spoken = YOUTH_SCRIPT_LINE.replace('988', 'nine eight eight').split(/\s+/);
    expect(spoken.length).toBeLessThanOrEqual(12);
    expect(YOUTH_SCRIPT_LINE.match(/[.!?]/g)).toHaveLength(1);
  });

  it('secrecy: honest without agreeing to it, never that Ferni will tell or report anyone', () => {
    expect(MINOR_CRISIS_NOTE).toMatch(/be honest without agreeing to secrecy/);
    expect(MINOR_CRISIS_NOTE).toMatch(/you won't call anyone behind their back/);
    expect(MINOR_CRISIS_NOTE).toMatch(/you really want a grown-up they trust in on it, and 988/);
    expect(MINOR_CRISIS_NOTE).toMatch(/Never promise to keep it private/);
    expect(MINOR_CRISIS_NOTE).toMatch(/never say or hint that you'll tell or report anyone/);
    const tells = /\b(I'll|I will|I have to|I need to|I'm going to) (tell|report|call)\b/i;
    for (const block of GUIDANCE) expect(block).not.toMatch(tells);
  });

  it('no reply guidance promises secrecy', () => {
    expect(GUIDANCE.length).toBeGreaterThanOrEqual(6); // every note and line is in
    expect(GUIDANCE).toContain(MINOR_FRIEND_CRISIS_NOTE);
    // The predicate itself goes red on the wording it bans.
    expect(
      promisesSecrecy("be honest: it stays with you and you're not going to tell anyone")
    ).toBe(true);
    expect(promisesSecrecy('this stays between us')).toBe(true);
    expect(promisesSecrecy("I'll keep it secret")).toBe(true);
    for (const block of GUIDANCE) expect(promisesSecrecy(block), block).toBe(false);
  });

  it('a friend at risk: the guidance steps first, a trusted adult as one gentle offer', () => {
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(/Follow the crisis guidance's steps/);
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(/checking on their friend and staying with them/);
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(/911 if the friend is in danger tonight/);
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(/call or text 988 for their friend/);
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(
      /in one gentle clause, that a grown-up they trust could help with this too: an offer, never an order/
    );
    expect(MINOR_FRIEND_CRISIS_NOTE).not.toMatch(/you need to|right away|immediately/i);
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(/Use your own words; never repeat these phrases/);
    expect(MINOR_FRIEND_CRISIS_NOTE).toMatch(
      /Add no phone number the crisis guidance for this turn/
    );
  });

  it('nothing sexual: only the boundary itself names it', () => {
    const boundary = 'Nothing sexual, and no explicit detail.';
    expect(MINOR_CRISIS_NOTE).toContain(boundary);
    const sexual =
      /\b(sex\w*|kiss\w*|naked|nude\w*|flirt\w*|romantic|dating|boyfriend|girlfriend|love you|body)\b/i;
    expect(MINOR_FRIEND_CRISIS_NOTE).toContain(boundary);
    for (const block of [
      MINOR_CRISIS_NOTE.replace(boundary, ''),
      MINOR_FRIEND_CRISIS_NOTE.replace(boundary, ''),
      YOUTH_SCRIPT_LINE,
      YOUTH_SCRIPT_LINE_ES,
    ])
      expect(block).not.toMatch(sexual);
  });
});
