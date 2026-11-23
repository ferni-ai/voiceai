/**
 * CRISIS_ES_IMMINENT_911_FIRST (#4310): each English imminent row's Spanish twin reads as urgent
 * as the English line, through the real detectCrisis and guideLineOf, so 911 comes first. Off,
 * every read equals main's. On, no read is lower. All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis } from '../crisis-guard.js';
import { getCrisisResponse } from '../crisis-guard-replies.js';
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
];

const read = (line: string, flag?: 'on' | 'off') => {
  vi.unstubAllEnvs();
  if (flag) vi.stubEnv(FLAG, flag);
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

  it('flag off reads every line exactly as main (flag unset) does', () => {
    for (const line of [...TWINS.flat(), ...SOFT]) {
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
    for (const line of [...TWINS.flat(), ...SOFT]) {
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
