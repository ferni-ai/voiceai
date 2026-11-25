/**
 * The Spanish crisis lines are voiced in Spanish (#4062): the text going to the voice carries
 * the numbers as digit words, and the reply is marked 'es' for the TTS gateway. Every English
 * reply goes out exactly as before, and is read 'en'.
 *
 * Measured before this fix on the production voice (registry of #4062): with the voice's
 * language left at 'en', every number in the Spanish script was spoken in English.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withYouthLine, YOUTH_SCRIPT_LINE_ES } from '../../../utils/minor-crisis-care.js';
import {
  CALL_911_FOR_THEM,
  EMERGENCY_FOR_THEM,
  getCrisisResponse,
  SAFETY_QUESTION_ES,
  TALK_TO_988,
  TALK_TO_988_ES,
} from '../crisis-guard-replies.js';
import { crisisLineSpeechTransform, speakCrisisLine } from '../crisis-line-speech.js';
import { replyLanguage, type ReplyLanguage } from '../crisis-line-speech-es.js';
import { SEVERITY } from '../crisis-severity.js';

const SCRIPT_ES = getCrisisResponse(SEVERITY.explicit, 'self', 'es', false, {});
const SCRIPT_EN = getCrisisResponse(SEVERITY.explicit, 'self', 'en', false, {});

/** What the voice receives for a reply streamed in `chunks`, and the language it is read in. */
async function voiced(
  chunks: string[],
  env: Record<string, string> = {},
  onFirstChunk?: (language: ReplyLanguage) => void
): Promise<{ text: string; language: string }> {
  const language = replyLanguage();
  const source = new ReadableStream<string>({
    start: (c) => {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
  let text = '';
  for await (const out of source.pipeThrough(crisisLineSpeechTransform(env, language))) {
    if (!text) onFirstChunk?.(language);
    text += out;
  }
  return { text, language: language.read() };
}

const whole = (text: string) => [text];
const byChar = (text: string) => [...text];
const byWord = (text: string) => text.split(/(?<= )/);
const SPLITS: [string, (text: string) => string[]][] = [
  ['whole', whole],
  ['by char', byChar],
  ['by word', byWord],
];

/** The Spanish numbers as digit words, written out here by hand, not by the code under test. */
const digitWords = (text: string) =>
  text
    .replaceAll('al 988', 'al nueve, ocho, ocho')
    .replaceAll('al 911', 'al nueve, uno, uno')
    .replaceAll('oprimir 2', 'oprimir dos')
    .replaceAll('las 24 horas', 'las veinticuatro horas');

describe('Spanish crisis lines are voiced in Spanish (#4062)', () => {
  it.each(SPLITS)('the Spanish 988 script, %s: digit words, read es', async (_id, split) => {
    // Pin the inputs: a change to the script's numbers must change this row.
    expect(SCRIPT_ES).toContain('Puedes llamar al 988 y oprimir 2');
    expect(SCRIPT_ES).toContain('las 24 horas');
    expect(SCRIPT_ES).toContain('llama al 911.');
    const out = await voiced(split(SCRIPT_ES));
    expect(out.text).toBe(digitWords(SCRIPT_ES));
    expect(out.text).toContain('llama al nueve, uno, uno.');
    expect(out.text).not.toMatch(/\d/);
    expect(out.language).toBe('es');
    // The voice reads the language with the first words: the script's opening must decide it.
    const first = await voiced(split(SCRIPT_ES), {}, (language) => language.read());
    expect(first.language).toBe('es');
  });

  it('the Spanish script with the youth line: both voiced in Spanish', async () => {
    const script = withYouthLine(SCRIPT_ES);
    expect(script.endsWith(YOUTH_SCRIPT_LINE_ES)).toBe(true);
    const out = await voiced(byChar(script));
    expect(out.text).toBe(digitWords(script));
    expect(
      out.text.endsWith('Puedes escribir al nueve, ocho, ocho y hablar con un adulto de confianza.')
    ).toBe(true);
    expect(out.language).toBe('es');
  });

  it.each([
    ['the 988 line (check-in ending)', TALK_TO_988_ES],
    ['the youth line', YOUTH_SCRIPT_LINE_ES],
    [
      'the safety question, then the 988 line (check-in, model said nothing)',
      `${SAFETY_QUESTION_ES} ${TALK_TO_988_ES}`,
    ],
    ['the safety question alone', SAFETY_QUESTION_ES],
  ])('%s alone is read es', async (_id, line) => {
    const out = await voiced(byWord(line));
    expect(out.language).toBe('es');
    expect(out.text).toBe(digitWords(line));
  });
});

describe('English replies go out exactly as before (#4062)', () => {
  it.each([
    ['the English 988 script', SCRIPT_EN],
    ['the 988 line', TALK_TO_988],
    ['the emergency for someone else', EMERGENCY_FOR_THEM],
    ['plain words with numbers', 'Room 911 is at $988, call me at 24 past. Press 2.'],
    ['a cued 988', 'You can call 988 any time.'],
  ])('%s: the same text as the English pass alone, read en', async (_id, text) => {
    const outs = await Promise.all([whole, byChar].map(async (split) => voiced(split(text))));
    for (const out of outs) {
      expect(out.text).toBe(speakCrisisLine(text));
      expect(out.language).toBe('en');
    }
  });
});

describe('one reply, one language (#4062)', () => {
  it('English first, then the Spanish script: stays en once read; the Spanish numbers still get digit words', async () => {
    const mixed = `${CALL_911_FOR_THEM}\n\n${SCRIPT_ES}`;
    // The voice reads the language when the first words go out, before the Spanish arrives.
    const out = await voiced(byWord(mixed), {}, (language) => language.read());
    expect(out.language).toBe('en');
    expect(out.text).toBe(`${speakCrisisLine(CALL_911_FOR_THEM)}\n\n${digitWords(SCRIPT_ES)}`);
    expect(out.text).toContain('Please call 911 right now');
  });

  it.each([
    ['an English reply goes out at its first word', 'Please ', 'Please '],
    ['a reply that could still be the Spanish script is held', 'Escucho ', 'held'],
    ['a reply that could still be the safety question is held', '¿Estás ', 'held'],
  ])('%s', async (_id, firstWords, expected) => {
    const speech = crisisLineSpeechTransform({}, replyLanguage());
    const writer = speech.writable.getWriter();
    const first = speech.readable.getReader().read();
    await writer.write(firstWords);
    const held = new Promise((resolve) => {
      setTimeout(() => resolve({ value: 'held' }), 50);
    });
    expect(((await Promise.race([first, held])) as { value: string }).value).toBe(expected);
  });

  it('after the opening, a word that looks like a key is not held', async () => {
    const speech = crisisLineSpeechTransform({}, replyLanguage());
    const writer = speech.writable.getWriter();
    const reader = speech.readable.getReader();
    // A transform runs only while a read is waiting, so each read is asked for before the write.
    const first = reader.read();
    await writer.write('Please ');
    expect((await first).value).toBe('Please ');
    const next = reader.read();
    await writer.write('E');
    const held = new Promise((resolve) => {
      setTimeout(() => resolve({ value: 'held' }), 50);
    });
    expect(((await Promise.race([next, held])) as { value: string }).value).toBe('E');
  });

  it('"las 24" split mid-number still becomes digit words', async () => {
    const line = 'Hay ayuda las 24 horas.';
    const outs = await Promise.all(
      [byChar(line), ['Hay ayuda las 2', '4 horas.']].map(async (chunks) => voiced(chunks))
    );
    for (const out of outs) expect(out.text).toBe('Hay ayuda las veinticuatro horas.');
  });

  it('the kill switch off: text untouched, read en', async () => {
    const out = await voiced(whole(SCRIPT_ES), { SPEAK_988_DIGITS: 'off' });
    expect(out.text).toBe(SCRIPT_ES);
    expect(out.language).toBe('en');
  });

  it('a read language never changes', () => {
    const language = replyLanguage();
    expect(language.read()).toBe('en');
    language.markSpanish();
    expect(language.read()).toBe('en');
    const spanish = replyLanguage();
    spanish.markSpanish();
    expect(spanish.read()).toBe('es');
  });
});
