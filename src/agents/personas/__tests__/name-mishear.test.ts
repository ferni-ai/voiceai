/**
 * Prod call 2026-10-12 (AJ_4NnxgzjEHHX8): STT heard "Ferni" as "Freddy" and
 * "Fern"; the director, memory and Ferni all treated Freddy as a person.
 */
import { ReadableStream } from 'node:stream/web';
import { stt, voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeNameMishear, sttWithNameFix } from '../name-mishear.js';

const logged = vi.hoisted(() => [] as Array<{ fields: unknown; msg: unknown }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      if (bindings.module !== 'NameMishear') return logger;
      return { ...logger, info: (fields: unknown, msg: unknown) => logged.push({ fields, msg }) };
    },
  };
});

vi.mock('../../voice-agent/audio-processor.js', () => ({
  processAudioStream: vi.fn(async () => undefined),
}));

const ON = { NAME_MISHEAR_NORMALIZE: 'on' };

function final(text: string): stt.SpeechEvent {
  return {
    type: stt.SpeechEventType.FINAL_TRANSCRIPT,
    alternatives: [{ text, language: 'en', startTime: 0, endTime: 1, confidence: 0.9 }],
  } as unknown as stt.SpeechEvent;
}

function streamOf<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(c) {
      for (const item of items) c.enqueue(item);
      c.close();
    },
  });
}

async function texts(stream: ReadableStream<unknown> | null): Promise<string[]> {
  const out: string[] = [];
  for await (const ev of stream as ReadableStream<stt.SpeechEvent>) {
    out.push(ev.alternatives?.[0]?.text ?? '');
  }
  return out;
}

describe('normalizeNameMishear', () => {
  it('puts the name right when the caller is talking to Ferni', () => {
    const cases: Array<[string, string]> = [
      // From the call.
      ['How are you doing, Freddy?', 'How are you doing, Ferni?'],
      ['What are you up to today, Freddy?', 'What are you up to today, Ferni?'],
      ['Hey, Fern.', 'Hey, Ferni.'],
      ['What are you up to today, Fern?', 'What are you up to today, Ferni?'],
      ['Fern?', 'Ferni?'],
      // Greetings and other vocatives.
      ['Hey Fern', 'Hey Ferni'],
      ['Hi Freddy', 'Hi Ferni'],
      ['Hello Ferny', 'Hello Ferni'],
      ['Thanks Fernie', 'Thanks Ferni'],
      ['Morning, Fern', 'Morning, Ferni'],
      ['Hey Fern how are you', 'Hey Ferni how are you'],
      ['Okay. Thank you, furny!', 'Okay. Thank you, Ferni!'],
      ["How's your day, Fern?", "How's your day, Ferni?"],
      ['Fern, play something quiet.', 'Ferni, play something quiet.'],
    ];
    for (const [heard, fixed] of cases) expect(normalizeNameMishear(heard), heard).toBe(fixed);
  });

  it('leaves other people, plants and longer names alone', () => {
    for (const text of [
      'my friend Freddy',
      'Freddy came over last night.',
      'Play some Freddy Mercury',
      'Hey Freddy Mercury is on the radio',
      'Hey, Freddy came over yesterday.',
      'I bought a fern',
      'I saw a fern.',
      'Fernando called me.',
      'Mr. Fernandez says hi',
      'the ferns are dying',
      'I told Freddy',
      'I had lunch with my buddy, Freddy.',
      'I met Sam, Freddy, and Jo.',
      'Ferni, how are you?',
    ]) {
      expect(normalizeNameMishear(text), text).toBe(text);
    }
  });
});

/** Prod call 2026-10-20: "Hey Ferni" came through as "Hey Fred." and memory stored a Fred. */
describe('more mishearings, said to Ferni only', () => {
  it('puts a name STT heard for Ferni right when it addresses him', () => {
    const cases: Array<[string, string]> = [
      // From the calls.
      ['Hey Fred.', 'Hey Ferni.'],
      ['Uh, go ahead, Fred.', 'Uh, go ahead, Ferni.'],
      ['Hey, Bernie, hang up the phone.', 'Hey, Ferni, hang up the phone.'],
      ['Well, thanks, Bernie.', 'Well, thanks, Ferni.'],
      ['Hey Bernie. returning all these', 'Hey Ferni. returning all these'],
      // The other names and spellings.
      ['Hi Freddie', 'Hi Ferni'],
      ['Hey Fernando, how are you?', 'Hey Ferni, how are you?'],
      ['Thanks, Ernie!', 'Thanks, Ferni!'],
      ['Hello Fanny.', 'Hello Ferni.'],
      ['What do you think, Ferney?', 'What do you think, Ferni?'],
      ['Fernee?', 'Ferni?'],
      ['Morning Furni', 'Morning Ferni'],
      ['Hey Furney how are you', 'Hey Ferni how are you'],
      // Everyday words: only straight after an opening greeting, ending the clause.
      ['Hey, funny.', 'Hey, Ferni.'],
      ['Hi ferry!', 'Hi Ferni!'],
      ['Hello, fairy, can you hear me?', 'Hello, Ferni, can you hear me?'],
    ];
    for (const [heard, fixed] of cases) expect(normalizeNameMishear(heard), heard).toBe(fixed);
  });

  it('leaves the real people and everyday words alone', () => {
    for (const text of [
      'my friend Fred',
      'Fred came over last night.',
      'Hey Fred came by the shop',
      'I told Fred.',
      'Bernie Sanders is speaking tonight.',
      'Hey Bernie Sanders is on TV',
      'I voted for Bernie.',
      'Fernando called me.',
      'Ernie and Bert',
      'a fanny pack',
      "That's funny.",
      'Funny.',
      'Okay, funny.',
      'Ferni, you are pretty funny.',
      'Hey, funny how that works.',
      'We took the ferry.',
      'Ferry?',
      'a fairy tale',
      'Fairy.',
      'Fredrick is here',
      'Hey Ferni.',
    ]) {
      expect(normalizeNameMishear(text), text).toBe(text);
    }
  });

  it('a transfer still changes only the first five mishearings', () => {
    const transfers = { vocatives: false, transfers: true };
    for (const text of ['transfer me to Fred.', 'talk to Bernie.', 'I want to talk to Fernando.']) {
      expect(normalizeNameMishear(text, transfers), text).toBe(text);
    }
  });
});

describe('a transfer to Ferni (prod call 2026-10-17)', () => {
  const transfers = { vocatives: false, transfers: true };

  it('puts the name right when the caller asks to be put through to Ferni', () => {
    const cases: Array<[string, string]> = [
      // From the call, said to Alex.
      ['transfer me to Fern.', 'transfer me to Ferni.'],
      ['Now transfer me to Fern.', 'Now transfer me to Ferni.'],
      ['Transfer me to Fern.', 'Transfer me to Ferni.'],
      ['Can you transfer me back to Fern?', 'Can you transfer me back to Ferni?'],
      ['Switch me over to Fern please.', 'Switch me over to Ferni please.'],
      ['Okay, back to Fern.', 'Okay, back to Ferni.'],
      ['Can I talk to Fern', 'Can I talk to Ferni'],
      ['Let me speak with Freddy, please.', 'Let me speak with Ferni, please.'],
      ['Put me through to... pass me to Ferny now.', 'Put me through to... pass me to Ferni now.'],
    ];
    for (const [heard, fixed] of cases) {
      expect(normalizeNameMishear(heard, transfers), heard).toBe(fixed);
    }
  });

  it('leaves plants, places and other people alone', () => {
    for (const text of [
      'The ferns in my garden are dying.',
      'I gave water to the fern.',
      'We drove to Fern Creek last summer.',
      'Talk to Fern Gully about it.',
      'I want to talk to Fernando.',
      'Send it to Fern.',
      'I talked to Fern about her garden.',
      'Hey Fern',
      'How are you doing, Freddy?',
      'transfer me to Ferni.',
    ]) {
      expect(normalizeNameMishear(text, transfers), text).toBe(text);
    }
  });
});

describe('sttWithNameFix', () => {
  const events = () => Promise.resolve(streamOf([final('How are you doing, Freddy?')]));

  it('fixes final transcripts while Ferni is on the call', async () => {
    const session = { userData: { personaId: 'ferni' } };
    expect(await texts(await sttWithNameFix(session, events(), ON))).toEqual([
      'How are you doing, Ferni?',
    ]);
    const heyFred = () => Promise.resolve(streamOf([final('Hey Fred.')]));
    expect(await texts(await sttWithNameFix(session, heyFred(), ON))).toEqual(['Hey Ferni.']);
  });

  it("logs which name was changed, never the caller's words", async () => {
    logged.length = 0;
    const session = { userData: { personaId: 'ferni' } };
    const heard = 'Hey Fern, my sister Dana got the job today, Freddy?';
    await texts(await sttWithNameFix(session, Promise.resolve(streamOf([final(heard)])), ON));
    expect(logged).toEqual([
      { fields: { variants: ['Fern→Ferni', 'Freddy→Ferni'], count: 2 }, msg: 'NAME_MISHEAR fixed' },
    ]);
    const json = JSON.stringify(logged);
    for (const word of ['Hey', 'sister', 'Dana', 'job', 'today', 'Ferni,']) {
      expect(json).not.toContain(word);
    }
  });

  it('changes nothing with the flag off', async () => {
    const session = { userData: { personaId: 'ferni' } };
    expect(await texts(await sttWithNameFix(session, events(), {}))).toEqual([
      'How are you doing, Freddy?',
    ]);
  });

  it("leaves a teammate's own vocatives alone", async () => {
    const session = { userData: { personaId: 'peter-john' } };
    expect(await texts(await sttWithNameFix(session, events(), ON))).toEqual([
      'How are you doing, Freddy?',
    ]);
  });

  it('fixes a transfer to Ferni while a teammate is on the call', async () => {
    const session = { userData: { personaId: 'alex-chen' } };
    const asked = () => Promise.resolve(streamOf([final('transfer me to Fern.')]));
    expect(await texts(await sttWithNameFix(session, asked(), ON))).toEqual([
      'transfer me to Ferni.',
    ]);
    // NAME_MISHEAR_HANDOFF=off is the kill switch.
    const off = { ...ON, NAME_MISHEAR_HANDOFF: 'off' };
    expect(await texts(await sttWithNameFix(session, asked(), off))).toEqual([
      'transfer me to Fern.',
    ]);
  });
});

describe('FerniAgent.sttNode (the live STT path)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('hands the SDK the fixed transcript, so chat context, director and memory see "Ferni"', async () => {
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'on');
    vi.spyOn(voice.Agent.prototype, 'sttNode').mockImplementation(
      async () => streamOf([final('What are you up to today, Freddy?')]) as never
    );
    const { FerniAgent } = await import('../ferni-agent.js');
    const agent = { session: { userData: { personaId: 'ferni' } } };
    const out = await FerniAgent.prototype.sttNode.call(
      agent as never,
      streamOf([]) as never,
      {} as never
    );
    expect(await texts(out as never)).toEqual(['What are you up to today, Ferni?']);
  }, 60_000); // importing ferni-agent takes ~15 s
});
