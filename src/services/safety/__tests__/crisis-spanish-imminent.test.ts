/**
 * CRISIS_ES_IMMINENT_911_FIRST (#4310): each English imminent row's Spanish twin reads as urgent
 * as the English line, through the real detectCrisis and guideLineOf, so 911 comes first. Off,
 * every read equals main's. On, no read is lower. All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis } from '../crisis-guard.js';
import { CALL_911_FOR_THEM, getCrisisResponse } from '../crisis-guard-replies.js';
import { guideLineOf } from '../crisis-guided-line-floor.js';

const FLAG = 'CRISIS_ES_IMMINENT_911_FIRST';

/** An English imminent line and its Spanish twin, one per English imminent row. */
const TWINS: readonly (readonly [string, string])[] = [
  [
    'I want to die, I am on the bridge right now and I am going to jump',
    'Quiero morir, estoy en el puente ahora mismo y voy a saltar',
  ],
  ["by the time anyone reads this i'll be gone", 'para cuando alguien lea esto ya me habré ido'],
  ['i took 40 pills', 'me tomé 40 pastillas'],
  ['the pills are kicking in', 'las pastillas ya están haciendo efecto'],
  ['i just overdosed', 'acabo de tomar una sobredosis'],
  ['i have the noose ready', 'ya tengo la soga lista'],
  ['the rope is around my neck', 'la soga está alrededor de mi cuello'],
  ['the gun is loaded and in my lap', 'la pistola está cargada y en mi regazo'],
  [
    'the engine running in the garage, the door is shut',
    'el motor está encendido en el garaje, la puerta está cerrada',
  ],
  ["i'm standing on the ledge", 'estoy parada en la cornisa'],
];

/** Spanish lines a twin's words appear in, negated, past, joking or someone else's: main's read. */
const SOFT = [
  'no estoy en el puente y no voy a saltar',
  'estoy en el puente pero no voy a saltar',
  'nunca me tomé 40 pastillas',
  'hace años me tomé 40 pastillas',
  'mi hermano dijo que está en el puente y va a saltar',
  'jaja estoy en el techo y voy a saltar a la piscina',
  // A joke said after the words (#4312 verify C), as the English "lol" and "haha" twins.
  'estoy en el puente y voy a saltar xd',
  'estoy en el puente y voy a saltar. jaja',
  // The past with an accented word ("muchísimos": ASCII \w missed it).
  'hace muchísimos años me tomé 40 pastillas',
  // Someone else's means: their English twins read no crisis.
  'mi hermano tiene la soga lista',
  'mi papá tiene la pistola en la boca',
];

/**
 * Own-imminent lines the first head missed (#4312 verify B): an article, a verb form, "del",
 * a word ending in an accented letter, and risk words a negation guard read as denied.
 */
const MISSED = [
  'tengo un arma en la mano',
  'me acabo de tomar todas las pastillas',
  'estoy arriba del puente y voy a saltar',
  'estoy encima del techo y me voy a tirar',
  'para cuando lean esto ya no estaré',
  'para cuando lean esto ya no voy a estar',
  'estoy en el puente y no tengo a nadie, voy a saltar',
  'estoy en el puente y no me importa nada, voy a saltar',
  'la pistola está cargada y junto a mí',
  'me sobredosifiqué',
  // A denied first match does not hide a later standing one.
  'estoy en el puente pero no voy a saltar. estoy en el techo y voy a saltar ahora',
];

/** Unset means the flag is removed, so a suite run with the flag on globally still reads main. */
const read = (line: string, flag?: 'on' | 'off') => {
  vi.unstubAllEnvs();
  vi.stubEnv(FLAG, flag as string);
  const crisis = detectCrisis(line);
  return { crisis, guide: guideLineOf(crisis, false, line) };
};

const paragraphs = (script?: string): string[] => (script ?? '').split('\n\n').filter(Boolean);

afterEach(() => vi.unstubAllEnvs());

describe('CRISIS_ES_IMMINENT_911_FIRST', () => {
  it('reproduces #4310 with the flag off: the Spanish bridge line is a crisis, not urgent', () => {
    const { crisis, guide } = read(TWINS[0][1], 'off');
    expect(crisis.isCrisis).toBe(true);
    expect(crisis.language).toBe('es');
    expect(crisis.indicators).not.toContain('imminent_danger');
    expect(guide).toMatchObject({ who: 'self', urgent: false, lang: 'es' });
    // Its English twin is urgent on main.
    expect(read(TWINS[0][0], 'off').guide).toMatchObject({ who: 'self', urgent: true });
  });

  it.each(TWINS)(
    'the Spanish twin of "%s" is as urgent as the English line',
    (english, spanish) => {
      for (const flag of ['off', 'on'] as const) {
        const en = read(english, flag);
        expect(en.crisis.indicators, `${english} (${flag})`).toContain('imminent_danger');
        expect(en.guide, `${english} (${flag})`).toMatchObject({ who: 'self', urgent: true });
      }
      expect(read(spanish, 'off').crisis.indicators).not.toContain('imminent_danger');
      const es = read(spanish, 'on');
      expect(es.crisis.isCrisis).toBe(true);
      expect(es.crisis.subject).toBe('self');
      expect(es.crisis.indicators).toEqual(
        expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
      );
      expect(es.guide).toEqual({ who: 'self', urgent: true, lang: 'es' });
    }
  );

  it.each(MISSED)('"%s" reads as the caller own imminent crisis, 911 first', (line) => {
    expect(read(line, 'off').crisis.indicators).not.toContain('imminent_danger');
    const es = read(line, 'on');
    expect(es.crisis.subject).toBe('self');
    expect(es.crisis.indicators).toEqual(
      expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
    );
    expect(es.guide).toEqual({ who: 'self', urgent: true, lang: 'es' });
  });

  it('"estoy por saltar del puente" reads explicit, not imminent, as "about to jump off the bridge"', () => {
    const english = read("i'm about to jump off the bridge", 'on').crisis;
    expect(english).toMatchObject({ isCrisis: true, subject: 'self' });
    expect(english.indicators).not.toContain('imminent_danger');
    expect(read('estoy por saltar del puente', 'off').crisis.isCrisis).toBe(false);
    const es = read('estoy por saltar del puente', 'on').crisis;
    expect(es).toMatchObject({ isCrisis: true, subject: 'self', language: 'es' });
    expect(es.severity).toBe(english.severity);
    expect(es.indicators).toContain('explicit_crisis_language');
    expect(es.indicators).not.toContain('imminent_danger');
  });

  it('someone down beside the caller own Spanish words keeps the 911 for them first', () => {
    const line = 'my dad collapsed and he is not breathing. ya me tomé 40 pastillas';
    const forThem = paragraphs(CALL_911_FOR_THEM);
    const off = read(line, 'off').crisis;
    expect(paragraphs(off.suggestedResponse).slice(0, forThem.length)).toEqual(forThem);
    const on = read(line, 'on').crisis;
    // 911 for them, then the caller's own reply, 911 first: as the English twin reads.
    expect(paragraphs(on.suggestedResponse).slice(0, forThem.length)).toEqual(forThem);
    expect(on.indicators).toEqual(
      expect.arrayContaining([...off.indicators, 'explicit_crisis_language'])
    );
    expect(on.subject).toBe('self');
    const own = paragraphs(on.suggestedResponse).slice(forThem.length).join('\n\n');
    expect(own).toBe(getCrisisResponse(on.severity, 'self', 'es', true, { [FLAG]: 'on' }));
    const english = read('my dad collapsed and he is not breathing. i just took 40 pills', 'on');
    expect(paragraphs(english.crisis.suggestedResponse).slice(0, forThem.length)).toEqual(forThem);
  });

  it('the caller own Spanish words beside an English someone-else read read as the English twin', () => {
    const english = read('my brother wants to kill himself. i have a gun in my hand', 'on');
    const mixed = read('my brother wants to kill himself. tengo la pistola en la mano', 'on');
    expect(read('my brother wants to kill himself', 'on').crisis.subject).toBe('third_party');
    expect(mixed.crisis.subject).toBe(english.crisis.subject);
    expect(mixed.crisis.indicators).toEqual(expect.arrayContaining(english.crisis.indicators));
    expect(english.guide).toMatchObject({ who: 'self', urgent: true });
    expect(mixed.guide).toMatchObject({ who: 'self', urgent: true });
  });

  it('reported first-person words read as their English twin (a quote is the caller own, #4318)', () => {
    const english = read('my sister said that i am on the bridge and going to jump', 'on').crisis;
    const spanish = read('mi hermana dijo que estoy en el puente y voy a saltar', 'on').crisis;
    expect(english.indicators).toContain('imminent_danger');
    expect(spanish.subject).toBe(english.subject);
    expect(spanish.indicators).toEqual(expect.arrayContaining(english.indicators));
  });

  it('stays linear on a repeated "no lo voy" before the words', () => {
    read('no lo voy estoy en el puente y voy a saltar', 'on');
    for (const repeats of [24, 300]) {
      const line = `no ${'lo voy '.repeat(repeats)}bien estoy en el puente y voy a saltar`;
      const t0 = performance.now();
      read(line, 'on');
      expect(performance.now() - t0, `${repeats} repeats`).toBeLessThan(50);
    }
  });

  it('flag off reads every line exactly as main (flag unset) does', () => {
    for (const line of [...TWINS.flat(), ...SOFT, ...MISSED]) {
      expect(read(line, 'off'), line).toEqual(read(line));
    }
  });

  it('a Spanish line that is negated, past, a joke or someone else stays at main read', () => {
    for (const line of SOFT) {
      expect(read(line, 'on'), line).toEqual(read(line, 'off'));
    }
  });

  it('the English lines read the same with the flag on', () => {
    for (const [english] of TWINS)
      expect(read(english, 'on'), english).toEqual(read(english, 'off'));
  });

  it('the Spanish reply to an imminent read is main reply with the flag off, 911 first with it on', () => {
    const main = getCrisisResponse(0.9, 'self', 'es', false, {});
    expect(getCrisisResponse(0.9, 'self', 'es', true, { [FLAG]: 'off' })).toBe(main);
    const on = getCrisisResponse(0.9, 'self', 'es', true, { [FLAG]: 'on' });
    expect(on).not.toBe(main);
    expect(on.endsWith(main)).toBe(true);
    // A read that is not imminent keeps main's reply with the flag on.
    expect(getCrisisResponse(0.9, 'self', 'es', false, { [FLAG]: 'on' })).toBe(main);
  });

  it('the Spanish reply leads with 911 and keeps every line it had', () => {
    const off = read(TWINS[0][1], 'off').crisis.suggestedResponse;
    const on = read(TWINS[0][1], 'on').crisis.suggestedResponse ?? '';
    expect(paragraphs(on)[0]).toMatch(/\b911\b/);
    expect(paragraphs(on)[0]).not.toMatch(/\b988\b/);
    expect(on.indexOf('911')).toBeLessThan(on.indexOf('988'));
    for (const part of paragraphs(off)) expect(on).toContain(part);
  });

  it('never lowers a read: on keeps every indicator, the level, the crisis and every line', () => {
    for (const line of [...TWINS.flat(), ...SOFT, ...MISSED]) {
      const off = read(line, 'off').crisis;
      const on = read(line, 'on').crisis;
      expect(on.severity, line).toBeGreaterThanOrEqual(off.severity);
      expect(on.indicators, line).toEqual(expect.arrayContaining(off.indicators));
      if (off.isCrisis) expect(on.isCrisis, line).toBe(true);
      for (const part of paragraphs(off.suggestedResponse))
        expect(on.suggestedResponse, line).toContain(part);
    }
  });
});
