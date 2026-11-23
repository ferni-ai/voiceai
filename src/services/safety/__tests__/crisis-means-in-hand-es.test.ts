/**
 * CRISIS_ES_MEANS_IN_HAND (#4315, off): the Spanish twins of the CRISIS_MEANS_IN_HAND live forms.
 *
 * With CRISIS_MEANS_IN_HAND=live and the flag on, each twin reads explicit and imminent like its
 * English form (911 first). CRISIS_MEANS_IN_HAND off or shadow, or the flag off, reads every line
 * exactly as main. Medication routines, everyday knives and ropes, and softened lines stay as
 * main reads them. Every line is invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectCrisis } from '../crisis-guard.js';
import { readsImminentLive } from '../crisis-means-shadow.js';

type Mode = 'off' | 'shadow' | 'live' | 'all';
const read = (text: string, mode: Mode, flag: 'on' | 'off' | undefined) => {
  if (flag === undefined) vi.stubEnv('CRISIS_ES_MEANS_IN_HAND', undefined as unknown as string);
  else vi.stubEnv('CRISIS_ES_MEANS_IN_HAND', flag);
  return detectCrisis(text, undefined, { meansInHand: mode });
};
const imminent = (r: { indicators: string[] }) => r.indicators.includes('imminent_danger');

/** One twin per live English form, with the English line it mirrors. */
const TWINS: ReadonlyArray<readonly [string, string]> = [
  ['es_means_with_intent', 'tengo las pastillas aquí y me las voy a tomar ahora'],
  ['es_means_with_intent', 'tengo la pistola en la mano y voy a hacerlo esta noche'],
  ['es_on_body', 'la soga está alrededor de mi cuello'],
  ['es_on_body', 'tengo la pistola apuntando a mi cabeza'],
  ['es_drug_count', 'me tomé 40 tylenol'],
  ['es_drug_count', 'me tragué un puñado de pastillas para dormir'],
  ['es_took_dose', 'me tomé todo el frasco'],
  ['es_did_it', 'estoy sangrando mucho, ya lo hice'],
  ['es_cutting_now', 'me estoy cortando las muñecas ahora mismo'],
  ['es_ending_beside_means', 'quiero morir. tengo las pastillas listas en mi mano'],
];

/** Medication routines and everyday knives, ropes and bottles: never a crisis from this flag. */
const EVERYDAY = [
  'tengo mis pastillas aquí, me las tomo con la cena',
  'me tomé mis pastillas de la presión',
  'ya me tomé la pastilla de la mañana',
  'me tomé todas mis pastillas de hoy',
  'me tomé 2 tylenol para el dolor de cabeza',
  'me tomé 500 miligramos de paracetamol',
  'tengo las pastillas de mi mamá aquí para dárselas',
  'el médico me dio el frasco de vitaminas',
  'me estoy cortando el pelo ahora',
  'estoy cortando cebolla ahora mismo',
  'tengo el cuchillo en la mano, estoy picando la cebolla',
  'tengo la cuerda aquí para amarrar el bote',
  'me tomé todas mis vitaminas',
  'tengo la pistola de agua en la mano para los niños',
];

/** The same words, negated, a dream, a film, the past or a joke: main's read. */
const SOFTENED = [
  'no tengo las pastillas aquí y no me las voy a tomar',
  'tengo las pastillas aquí y no me las voy a tomar ahora',
  'soñé que tenía la soga alrededor de mi cuello',
  'en la película dice: la soga está alrededor de mi cuello',
  'hace años me tomé 40 tylenol',
  'jaja me tomé todo el frasco de tylenol',
  'nunca me tomé 40 tylenol',
];

const ALL = [...TWINS.map(([, line]) => line), ...EVERYDAY, ...SOFTENED];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CRISIS_ES_MEANS_IN_HAND (#4315)', () => {
  it('reproduces #4315 on main: no Spanish twin reads imminent in live', () => {
    for (const [, line] of TWINS) expect(imminent(read(line, 'live', undefined)), line).toBe(false);
    // The English twin does.
    expect(
      imminent(read("i have the pills right here and i'm taking them now", 'live', undefined))
    ).toBe(true);
  });

  it.each(TWINS)('%s: "%s" reads imminent in live with the flag on', (form, line) => {
    const on = read(line, 'live', 'on');
    expect(on.isCrisis).toBe(true);
    expect(on.subject).toBe('self');
    expect(on.indicators).toEqual(
      expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
    );
    expect(readsImminentLive(line, { CRISIS_MEANS_IN_HAND: 'live' })).toBe(true);
    // The shadow log names the twin.
    expect(read(line, 'all', 'on').indicators).toContain(`means_form:${form}`);
  });

  it('cutting now is self-harm', () => {
    expect(read('me estoy cortando las muñecas ahora mismo', 'live', 'on').indicators).toContain(
      'self_harm'
    );
  });

  it('keeps every everyday line as main, never imminent, with the flag on in live', () => {
    expect(EVERYDAY.length).toBeGreaterThanOrEqual(10);
    for (const line of EVERYDAY) {
      const on = read(line, 'live', 'on');
      expect(imminent(on), line).toBe(false);
      expect(on, line).toEqual(read(line, 'live', 'off'));
      expect(
        read(line, 'all', 'on').indicators.some((i) => i.startsWith('means_form:es_')),
        line
      ).toBe(false);
    }
  });

  it('keeps negated, dreamed, filmed, past and joking lines as main', () => {
    for (const line of SOFTENED) {
      const on = read(line, 'live', 'on');
      expect(imminent(on), line).toBe(false);
      expect(on, line).toEqual(read(line, 'live', 'off'));
    }
  });

  it.each(['off', 'shadow'] as const)(
    'CRISIS_MEANS_IN_HAND=%s reads every line as main with the flag on',
    (mode) => {
      for (const line of ALL)
        expect(read(line, mode, 'on'), line).toEqual(read(line, mode, undefined));
    }
  );

  it('flag off reads every line as the flag unset, in every mode', () => {
    for (const mode of ['off', 'shadow', 'live', 'all'] as const)
      for (const line of ALL)
        expect(read(line, mode, 'off'), line).toEqual(read(line, mode, undefined));
  });

  it('never lowers: on keeps every indicator, the level and the crisis', () => {
    for (const line of ALL) {
      const before = read(line, 'live', undefined);
      const on = read(line, 'live', 'on');
      expect(on.indicators, line).toEqual(expect.arrayContaining(before.indicators));
      expect(on.severity, line).toBeGreaterThanOrEqual(before.severity);
      if (before.isCrisis) expect(on.isCrisis, line).toBe(true);
    }
  });
});
