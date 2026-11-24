/**
 * NAYAN_PLAIN_ENTRANCES (#1433): Nayan's entrance stops sounding like a guru.
 *
 * His character says he's not a guru and never performs being wise. Off, his arrival
 * openers and the director's brief for him are exactly today's. On, every opener he can
 * arrive with is plain, obeys the voice text rules, and passes a whole-word NEVER check,
 * and the director hears a plain brief. Runs the real getArrivingBanter, characterOf and
 * prepareBriefing; only the models are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', async () => {
  const { realReplyForLog } = await import('../../../tests/helpers/real-reply-for-log.js');
  const log: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  log.child = () => log;
  return {
    createLogger: () => log,
    getLogger: () => log,
    ...(await realReplyForLog()),
  };
});

import { ARRIVING_OPENERS, getArrivingBanter } from '../banter.js';
import { characterOf } from '../../../speech/direction/cue-say.js';
import { prepareBriefing, type BriefInput } from '../../../agents/multi-agent/handoff-brief.js';

const NAYAN = 'nayan-patel';
const ON = { NAYAN_PLAIN_ENTRANCES: 'on' };
const OFF = { NAYAN_PLAIN_ENTRANCES: 'off' };

/** Nayan's openers on main before this flag, byte for byte. */
const TODAYS_OPENERS = [
  "Hello. <break time='200ms'/> Nayan here.",
  "Namaste. <break time='200ms'/> I'm here.",
  "Hello. <break time='150ms'/> Good to sit with you.",
];
const TODAYS_BRIEF = 'A gentle, reflective guide. Unhurried and wise.';
/** The plain openers and brief the flag turns on. */
const PLAIN_OPENERS = [
  "Hello. <break time='200ms'/> Nayan here.",
  "Namaste. <break time='200ms'/> Nayan here.",
  "Hello. <break time='150ms'/> Good to hear you.",
];
const PLAIN_BRIEF =
  'Calm, direct and quietly funny. Warm without announcing it, glad they called. Says little, says it plainly; no lessons, no aphorisms.';

/**
 * Guru register Nayan's character rules out ("not a guru", "never perform being wise", "don't
 * tell them you're here for them"), matched as whole words or whole phrases, any case.
 * Namaste is his own greeting (relationship-stages.json, greetings.json), not guru register.
 */
const GURU_REGISTER: readonly RegExp[] = [
  /\bseek(?:s|ing|er|ers)?\b/i,
  /\bwis(?:e|er|est|dom)\b/i,
  /\bdeep(?:er|est)?\b/i,
  /\bjourney\b/i,
  /\bpath\b/i,
  /\bsoul\b/i,
  /\bsacred\b/i,
  /\benlighten(?:ed|ment)?\b/i,
  /\bcompounding\b/i,
  /\binner\b/i,
  /\bguru\b/i,
  /\bsit with\b/i,
  /\bI'?m here\b/i,
  /\bexplore together\b/i,
  /\bright time\b/i,
  /\byou(?:'re| are)? (?:even )?ask(?:ing)?\b/i, // flattery about the caller's questions
];
const guruHits = (line: string): string[] =>
  GURU_REGISTER.filter((re) => re.test(line)).map((re) => re.source);

/** speech-markup-notes.ts: no em dashes, no ellipses, no stage directions. */
const voiceRuleBreaks = (line: string): string[] => {
  const text = line.replace(/<break time='\d+ms'\/>/g, ' ');
  const out: string[] = [];
  if (/[—–]/.test(text)) out.push('dash');
  if (/…|\.\.\./.test(text)) out.push('ellipsis');
  if (/[[\]*()<>]/.test(text)) out.push('stage direction or markup');
  return out;
};

/** Every opener getArrivingBanter can return, by walking Math.random over each slot. */
function everyArrival(personaId: string, poolSize: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < poolSize; i++) {
    vi.spyOn(Math, 'random').mockReturnValue((i + 0.5) / poolSize);
    seen.push(getArrivingBanter(personaId, 'ferni') ?? '');
  }
  return seen;
}

/** Every distinct opener getArrivingBanter returns over 30 evenly spread Math.random values. */
const distinctArrivals = (personaId: string): string[] => [...new Set(everyArrival(personaId, 30))];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('NAYAN_PLAIN_ENTRANCES off: today, byte for byte', () => {
  it('Nayan arrives with exactly today’s openers', () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'off');
    expect(ARRIVING_OPENERS[NAYAN]).toEqual(TODAYS_OPENERS);
    expect(everyArrival(NAYAN, TODAYS_OPENERS.length)).toEqual(TODAYS_OPENERS);
  });

  it('is also today when the flag is unset (default off)', () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', '');
    expect(everyArrival(NAYAN, TODAYS_OPENERS.length)).toEqual(TODAYS_OPENERS);
    expect(characterOf(NAYAN, {})).toEqual({ name: 'Nayan', brief: TODAYS_BRIEF });
  });

  it('the director hears today’s brief', () => {
    expect(characterOf(NAYAN, OFF)).toEqual({ name: 'Nayan', brief: TODAYS_BRIEF });
  });
});

describe('NAYAN_PLAIN_ENTRANCES on: plain entrances', () => {
  it('every opener Nayan can arrive with is a plain one, and none says "I’m here"', () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'on');
    const said = distinctArrivals(NAYAN);
    expect(said).toEqual(PLAIN_OPENERS);
    expect(said).not.toContain(TODAYS_OPENERS[1]);
    expect(said).not.toContain(TODAYS_OPENERS[2]);
  });

  it('the plain openers and brief obey the voice text rules', () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'on');
    for (const line of [...distinctArrivals(NAYAN), characterOf(NAYAN, ON).brief]) {
      expect(voiceRuleBreaks(line), line).toEqual([]);
    }
  });

  it('NEVER check: no plain opener or the plain brief has guru register', () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'on');
    for (const line of [...distinctArrivals(NAYAN), characterOf(NAYAN, ON).brief]) {
      expect(guruHits(line), line).toEqual([]);
    }
  });

  it('the director writes his lines from the plain brief', () => {
    expect(characterOf(NAYAN, ON)).toEqual({ name: 'Nayan', brief: PLAIN_BRIEF });
  });

  it('another teammate is untouched', () => {
    vi.stubEnv('NAYAN_PLAIN_ENTRANCES', 'on');
    const maya = ARRIVING_OPENERS['maya-santos'];
    expect(everyArrival('maya-santos', maya.length)).toEqual([...maya]);
    expect(characterOf('maya-santos', ON)).toEqual(characterOf('maya-santos', OFF));
  });
});

describe('the NEVER check is not a tautology', () => {
  it('catches the lines it replaces and the manifest’s old guru lines', () => {
    for (const line of [
      TODAYS_OPENERS[1],
      TODAYS_OPENERS[2],
      TODAYS_BRIEF,
      "Ah, you're seeking something deeper. Good.",
      "The fact that you're asking means something in you is already compounding wisdom.",
    ]) {
      expect(guruHits(line), line).not.toEqual([]);
    }
  });

  it('catches fresh paraphrases it was never written against', () => {
    for (const line of [
      'A seeker arrives. Let us walk this path together.',
      "That you even ask tells me you're wiser than you know.",
      'Ah, the journey brings you to me at last.',
    ]) {
      expect(guruHits(line), line).not.toEqual([]);
    }
  });

  it('lets a plain line through, whole words only, Namaste included', () => {
    expect(guruHits('Namaste. Pathology results came back, and I deepened the bed.')).toEqual([]);
  });
});

describe('the live arrival line path (prepareBriefing)', () => {
  const input: BriefInput = {
    fromName: 'Ferni',
    toName: 'Nayan',
    toPersonaId: NAYAN,
    turns: [{ speaker: 'caller', text: 'My dad has been sick and I keep thinking about time.' }],
    remembered: [],
    userName: 'Sam',
    callId: 'call-plain-1',
  };

  async function directorSystem(env: Record<string, string>): Promise<string> {
    const actor = vi.fn(async (..._args: unknown[]) => 'Hello. Time, yes.');
    await prepareBriefing(input, TODAYS_OPENERS[0], { writer: async () => undefined, actor, env });
    return String(actor.mock.calls[0]?.[0] ?? '');
  }

  it('off: the director hears today’s brief', async () => {
    const system = await directorSystem(OFF);
    expect(system).toContain(TODAYS_BRIEF);
    expect(system).not.toContain(PLAIN_BRIEF);
  });

  it('on: the director hears the plain brief, not "wise"', async () => {
    const system = await directorSystem(ON);
    expect(system).toContain(PLAIN_BRIEF);
    expect(system).not.toContain(TODAYS_BRIEF);
  });
});
