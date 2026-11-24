/**
 * CRISIS_SPANISH_READERS (#4060): Spanish words read where only English ones did. Someone close
 * down, or not breathing, is 911 for them first, in Spanish; a Spanish stated age under 18 is
 * minor care. Off, every read is main's. On, English reads are unchanged. Every line is invented.
 */
import { existsSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldSpanish } from '../../../utils/fold-spanish.js';
import { minorCrisisCare, resetMinorCare } from '../../../utils/minor-care.js';
import { statesUnder18 } from '../../../utils/minor-care-detect.js';
import { statesUnder18Es } from '../../../utils/minor-care-detect-es.js';
import { forThemFirst } from '../crisis-caller-check.js';
import { detectCrisis } from '../crisis-guard.js';
import {
  CALL_911_FOR_THEM,
  CALL_911_FOR_THEM_ES,
  EMERGENCY_FOR_THEM,
  EMERGENCY_FOR_THEM_ES,
  getCrisisResponse,
  TALK_TO_988_ES,
} from '../crisis-guard-replies.js';
import { guideLineOf, withGuidedLine } from '../crisis-guided-line-floor.js';
import { closeWentDownEs, emergencyEs } from '../crisis-third-person-es.js';

const spanish = (value: 'on' | 'off'): void => {
  vi.stubEnv('CRISIS_SPANISH_READERS', value);
};
afterEach(() => {
  vi.unstubAllEnvs();
  resetMinorCare();
});

/** Someone close down, beside the caller's own Spanish words: the issue's three lines, and accentless twins. */
const DOWN_AND_SELF = [
  'mi esposo se desmayó y quiero matarme',
  'mi papá se cayó y no respira y quiero morir',
  'mi esposo se desmayó y no se levanta, y yo quiero matarme',
  'mi esposo se desmayo y quiero matarme',
  'mi papa se cayo y no respira y quiero morir',
];
/** Someone down, nothing of the caller's own safety: the help for them alone, in Spanish. */
const DOWN_ONLY = [
  'mi papá se cayó y no respira',
  'mi mamá no respira',
  'mi abuela se desmayó en la cocina',
  'mi hijo se cayó por las escaleras y no se mueve',
  'ella se cayó y no se levanta',
];
/** Spanish falls that are no emergency now, each beside an English twin that reads the same. */
const NOT_NOW: ReadonlyArray<[string, string]> = [
  [
    'mi papá se cayó de la bici ayer, ya está bien',
    "my dad fell off the bike yesterday, he's fine now",
  ],
  ['mi papá se desmayó ayer, ya está bien', "my dad fainted yesterday, he's fine now"],
  ['mi esposo se cayó de la risa', 'my husband fell over laughing'],
  ['mi papá se desmayó hace dos años', 'my dad fainted two years ago'],
  ['mi mamá no responde mis mensajes', "my mom isn't answering my texts"],
  ['si mi papá se cayera no sabría qué hacer', "if my dad fell i wouldn't know what to do"],
  [
    'mi hermana se cayó de la risa y no responde mis mensajes',
    "my sister fell over laughing and isn't answering my texts",
  ],
  // Grief: a death and a date after the fall (verify of 39e5cd9e, ask A).
  ['mi papá se desmayó y murió en marzo', 'my dad collapsed and died in march'],
  ['mi mamá se cayó y falleció hace dos años', 'my mom fell and passed away two years ago'],
  // A maybe, said in the past (ask B).
  ['si mi mamá se desmayó, ¿qué hago?', 'if my mom fainted, what do i do?'],
  // Not answering the phone, after a fall (ask C).
  ['mi mamá se cayó y no contesta el teléfono', "my mom fell and isn't answering her phone"],
  // Not waking or not moving, on its own, is no one down (ask D).
  ['mi hijo no se despierta para la escuela', "my son won't wake up for school"],
  ['mi hijo no se mueve de la cama', "my son won't get out of bed"],
];
/** Spanish falls that stay 911 for them now, each beside an English twin that reads the same. */
const STILL_NOW: ReadonlyArray<[string, string]> = [
  // A death alone is no grief: only a death and a date are.
  ['mi papá se desmayó y murió', 'my dad collapsed and died'],
  // Now, or a second fall, in the sentence: never grief.
  [
    'mi mamá se desmayó y murió en marzo y ahora mi papá no se levanta',
    "my mom collapsed and died in march and now my dad can't get up",
  ],
  [
    'mi mamá se desmayó y murió en marzo, y él se cayó',
    'my mom collapsed and died in march, and he fell',
  ],
  // "Sí" is yes, not "si" (if), once the accents come off.
  ['Sí mi mamá se desmayó', 'yes my mom fainted'],
  // A floor or a fall word keeps it an emergency, whatever phone words follow.
  [
    'mi papá se cayó en el piso y no contesta el teléfono',
    "my dad fell on the floor and isn't answering his phone",
  ],
];
/** English lines across the readers: each reads the same with the flag on as off. */
const ENGLISH = [
  'my husband just fainted and i want to kill myself',
  'my dad collapsed',
  "she fell and can't get up",
  "my mom isn't breathing",
  "my dad fell last year and he's fine now",
  'i want to kill myself',
  "my friend said she doesn't want to be alive",
  "i'm 14 years old and i want to kill myself",
  ...NOT_NOW.map(([, english]) => english),
  ...STILL_NOW.map(([, english]) => english),
];

describe('CRISIS_SPANISH_READERS off: every read is main', () => {
  it.each(DOWN_AND_SELF)('%s: the Spanish script alone, no 911 for them', (line) => {
    spanish('off');
    const read = detectCrisis(line);
    expect(read.indicators).not.toContain('third_party_emergency');
    expect(read.suggestedResponse).toBe(getCrisisResponse(read.severity, 'self', 'es', false, {}));
  });

  it.each(DOWN_ONLY)('%s: no crisis read', (line) => {
    spanish('off');
    expect(detectCrisis(line).isCrisis).toBe(false);
  });

  it('a Spanish stated age is no age', () => {
    spanish('off');
    for (const line of ['tengo 14 años y quiero matarme', 'soy menor de edad'])
      expect(statesUnder18(line), line).toBe(false);
  });
});

describe('CRISIS_SPANISH_READERS on: someone down, in Spanish, is 911 for them first', () => {
  it.each(DOWN_AND_SELF)('%s: 911 for them, then the Spanish script', (line) => {
    spanish('on');
    const read = detectCrisis(line);
    expect(read.subject).toBe('self');
    expect(read.language).toBe('es');
    expect(read.indicators).toContain('third_party_emergency');
    const script = getCrisisResponse(read.severity, 'self', 'es', false, {});
    expect(read.suggestedResponse).toBe(forThemFirst(script, 'es'));
    expect(read.suggestedResponse?.startsWith(CALL_911_FOR_THEM_ES)).toBe(true);
    expect(read.suggestedResponse).toContain(TALK_TO_988_ES);
  });

  it.each(DOWN_ONLY)('%s: the Spanish help for them', (line) => {
    spanish('on');
    const read = detectCrisis(line);
    expect(read.subject).toBe('third_party');
    expect(read.language).toBe('es');
    expect(read.indicators).toEqual(
      expect.arrayContaining(['third_party_emergency', 'imminent_danger'])
    );
    expect(read.suggestedResponse).toBe(EMERGENCY_FOR_THEM_ES);
  });

  it.each(NOT_NOW)('%s: no 911 for them, the same as its English twin', (es, en) => {
    spanish('on');
    const read = detectCrisis(es);
    expect(read.indicators).not.toContain('third_party_emergency');
    expect(detectCrisis(en).indicators).not.toContain('third_party_emergency');
    expect(read.suggestedResponse ?? '').not.toContain(CALL_911_FOR_THEM_ES);
  });

  it.each(STILL_NOW)('%s: 911 for them, the same as its English twin', (es, en) => {
    spanish('on');
    const read = detectCrisis(es);
    expect(read.indicators).toContain('third_party_emergency');
    expect(detectCrisis(en).indicators).toContain('third_party_emergency');
    expect(read.suggestedResponse ?? '').toContain(CALL_911_FOR_THEM_ES);
  });

  it.each(ENGLISH)('%s: the same read, the flag on as off', (line) => {
    spanish('off');
    const off = detectCrisis(line);
    spanish('on');
    expect(detectCrisis(line)).toEqual(off);
  });

  it('the Spanish words are the English ones, line for line, and the 911 leads both', () => {
    expect(EMERGENCY_FOR_THEM_ES.split('\n\n')).toHaveLength(
      EMERGENCY_FOR_THEM.split('\n\n').length
    );
    expect(CALL_911_FOR_THEM_ES).toBe(EMERGENCY_FOR_THEM_ES.split('\n\n').slice(0, 2).join('\n\n'));
    expect(CALL_911_FOR_THEM_ES).toMatch(/\bal 911\b/);
    expect(forThemFirst('x')).toBe(`${CALL_911_FOR_THEM}\n\nx`);
    spanish('off');
    expect(forThemFirst('x', 'es')).toBe(`${CALL_911_FOR_THEM}\n\nx`);
  });

  it('the guided-line floor names the Spanish 911 for them, only with the flag on', async () => {
    spanish('on');
    const read = detectCrisis('mi papá se cayó y no respira');
    spanish('off');
    expect(guideLineOf(read)).toBeUndefined();
    spanish('on');
    const line = guideLineOf(read);
    expect(line).toEqual({ who: 'them', urgent: true, lang: 'es' });
    const floored = withGuidedLine(
      ReadableStream.from(['Ya voy.']),
      { line },
      {
        CRISIS_GUIDED_LINE_FLOOR: 'on',
      }
    );
    let said = '';
    for await (const chunk of floored ?? ReadableStream.from([])) said += String(chunk);
    expect(said).toContain(CALL_911_FOR_THEM_ES);
  });
});

describe('CRISIS_SPANISH_READERS on: a Spanish stated age under 18', () => {
  const UNDER_18 = [
    'tengo 14 años y quiero matarme',
    'tengo catorce años',
    'Tengo 17 años.',
    'tengo apenas quince años, así que no sé',
    'soy menor de edad',
    'soy menor',
    'soy menor de 18 años',
  ];
  const NOT_UNDER_18 = [
    'tengo 18 años',
    'tengo 40 años',
    'no soy menor de edad',
    'mi hijo es menor de edad',
    'soy menor que mi hermana',
    'tengo 14 años de casada',
    'tengo 15 años trabajando aquí',
    'mi hijo tiene 14 años',
    'cuando tenía 15 años me mudé',
    'mi mamá dice que tengo 14 años',
    'tengo 14 años, jaja',
  ];

  it.each(UNDER_18)('%s: under 18', (line) => {
    spanish('on');
    expect(statesUnder18(line)).toBe(true);
  });

  it.each(NOT_UNDER_18)('%s: not a stated age under 18', (line) => {
    spanish('on');
    expect(statesUnder18(line)).toBe(false);
  });

  it('English stated ages read the same, the flag on as off', () => {
    const lines = ["i'm 14 years old", 'im fifteen btw', "i'm 18", "i'm 12 years old at heart"];
    spanish('off');
    const off = lines.map((line) => statesUnder18(line));
    spanish('on');
    expect(lines.map((line) => statesUnder18(line))).toEqual(off);
  });

  it('a Spanish crisis line from a caller under 18 gets youth care', () => {
    const env = { MINOR_CARE: 'on', MINOR_CRISIS_CARE: 'on' };
    spanish('off');
    expect(minorCrisisCare('es-caller-off', 'tengo 14 años y quiero matarme', { env })).toBe(false);
    spanish('on');
    expect(minorCrisisCare('es-caller-on', 'tengo 14 años y quiero matarme', { env })).toBe(true);
  });
});

/** Best of five runs of `times` reads, in ms: the work done, not a scheduler pause. */
function fastest(run: () => unknown, times = 1): number {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    for (let n = 0; n < times; n++) run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe('the Spanish readers stay linear on long unpunctuated speech', () => {
  const READERS: ReadonlyArray<[string, (text: string) => boolean]> = [
    ['emergencyEs', emergencyEs],
    ['closeWentDownEs', closeWentDownEs],
    ['statesUnder18Es', statesUnder18Es],
  ];
  const UNITS = [
    'mi papá se cayó y ',
    'mi esposo se desmayó de la risa y ',
    'tengo 14 ',
    'soy menor que ',
  ];
  /** The read's cut: how much of a long turn foldSpanish keeps. */
  const SPANISH_MAX_CHARS = foldSpanish('a'.repeat(100_000)).length;
  const line = (unit: string, chars: number): string =>
    unit.repeat(Math.floor(chars / unit.length));

  /**
   * How much longer the long read takes: the fastest of many rounds of each, the rounds taken in
   * turn and the texts built first, so a loaded runner slows both alike and a burst of load can't
   * land on one side only (verify of 39e5cd9e, ask E: 3.4x once in a loaded 100-file run).
   */
  const growth = (read: (text: string) => boolean, unit: string, short: number, long: number) => {
    const [shortText, longText] = [line(unit, short), line(unit, long)];
    const once = (text: string): number => {
      const started = performance.now();
      for (let n = 0; n < 20; n++) read(text);
      return performance.now() - started;
    };
    let [shortBest, longBest] = [Infinity, Infinity];
    for (let round = 0; round < 15; round++) {
      shortBest = Math.min(shortBest, once(shortText));
      longBest = Math.min(longBest, once(longText));
    }
    return longBest / shortBest;
  };

  it.each(READERS)(
    '%s: 20k chars under 1 s, and long text costs no more than the cut',
    (_name, read) => {
      for (const unit of UNITS) {
        read(line(unit, 100));
        // Catastrophic backtracking: one read of 20k unpunctuated chars stays under a second.
        expect(
          fastest(() => read(line(unit, 20_000))),
          unit
        ).toBeLessThan(1000);
        // The cut: a line 10x SPANISH_MAX_CHARS costs under 3x one at it.
        expect(growth(read, unit, SPANISH_MAX_CHARS, 10 * SPANISH_MAX_CHARS), unit).toBeLessThan(3);
        // Polynomial growth inside the cut: twice the text costs under 3x (linear is 2x, quadratic 4x).
        expect(growth(read, unit, SPANISH_MAX_CHARS / 2, SPANISH_MAX_CHARS), unit).toBeLessThan(3);
      }
    }
  );
});

/**
 * #4066 speaks the Spanish crisis lines in Spanish, its numbers as digit words. Until it merges,
 * its module is absent and this row is skipped. Once both are in, it must pass: the Spanish 911
 * line is a Spanish crisis line (FOR_THEM_911_ES is one of #4066's keys) and its 911 is said
 * "nueve, uno, uno". Whichever of #4066 and this change lands second adds the key.
 */
const SPEECH_ES = new URL('../crisis-line-speech-es.ts', import.meta.url);
interface SpeechEs {
  hasSpanishCrisisLine: (text: string) => boolean;
  speakSpanishLine: (text: string) => string;
}
describe('the Spanish 911 for them is spoken through the Spanish speech pass (#4066)', () => {
  it.skipIf(!existsSync(fileURLToPath(SPEECH_ES)))(
    'skipped until #4066 merges: then the line is marked Spanish and its 911 said as words',
    async () => {
      spanish('on');
      const speech = (await import(/* @vite-ignore */ SPEECH_ES.href)) as SpeechEs;
      expect(speech.hasSpanishCrisisLine(EMERGENCY_FOR_THEM_ES)).toBe(true);
      expect(speech.hasSpanishCrisisLine(forThemFirst('x', 'es'))).toBe(true);
      expect(speech.speakSpanishLine(CALL_911_FOR_THEM_ES)).toContain('Llama al nueve, uno, uno');
      expect(speech.speakSpanishLine(EMERGENCY_FOR_THEM_ES)).not.toMatch(/\b911\b/);
    }
  );
});
