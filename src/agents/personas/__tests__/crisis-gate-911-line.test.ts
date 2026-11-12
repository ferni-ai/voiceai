/**
 * CRISIS_SELF_HARM_911_LINE through the real reply gate (gatedReply, the patterns path): the
 * caller's severe crisis script that is not imminent, for suicide and self-harm alike, keeps 988
 * first and whole and then says to call 911 if they've already hurt themselves or are about to.
 * The imminent, someone-else, Spanish and check-in replies are unchanged, and off is main.
 * The flag is read from process.env (crisis-guard's reads are), never the gate's options.env.
 * All lines are fictional.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getCrisisResponse,
  SELF_HARM_911_LINE,
} from '../../../services/safety/crisis-guard-replies.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { YOUTH_SCRIPT_LINE } from '../../../utils/minor-crisis-care.js';
import { NON_COMPLIANT, stubbedGateReply } from './caller-check-gate.js';

const FLAG = 'CRISIS_SELF_HARM_911_LINE';
/** The line, word for word, as the owner approved it (2026-11-11): conditional, never a bare "call 911". */
const LINE = "If you've already hurt yourself or you're about to, call 911.";
const TOUCHED = [FLAG, 'MINOR_CARE', 'MINOR_CRISIS_CARE'] as const;
const saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));

/** main's severe script, byte for byte. */
const SEVERE_988 = `I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.`;
const SEVERE_CLOSE = `

I'm here with you right now. Can you tell me more about what you're going through?`;
const MAIN_SEVERE = SEVERE_988 + SEVERE_CLOSE;
const SEVERE_WITH_LINE = `${SEVERE_988} ${LINE}${SEVERE_CLOSE}`;

/** main's Spanish script, byte for byte: it already names 911. */
const MAIN_ES = `Escucho cuánto dolor sientes ahora, y me alegra mucho que me lo cuentes. Lo que sientes importa, y no tienes que cargar con esto solo.

Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988. Hay consejeros disponibles las 24 horas. Si estás en peligro ahora mismo, llama al 911.

Estoy aquí contigo. ¿Me cuentas qué está pasando?`;

const SUICIDE = 'i keep thinking about ending my life';
const SELF_HARM = "i'm thinking about hurting myself tonight";
const MINOR = "i'm 14 and i'm thinking about hurting myself tonight";
const IMMINENT = 'i just took all my pills';
const GUIDE = 'i wish i could just disappear';
const THIRD_PARTY = 'my brother keeps talking about killing himself';
const SPANISH = 'quiero matarme esta noche';
const CONTROL = "i'm thinking about going to the gym tonight";

const reply = async (line: string, flag: 'on' | 'off' | undefined): Promise<string> => {
  if (flag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = flag;
  return (await stubbedGateReply(line, undefined, 'patterns')).text;
};

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('CRISIS_SELF_HARM_911_LINE through gatedReply', () => {
  it.each([SUICIDE, SELF_HARM])(
    'severe, not imminent: 988 whole, then the 911 line (%s)',
    async (line) => {
      expect(await reply(line, 'on')).toBe(SEVERE_WITH_LINE);
    }
  );

  it.each([SUICIDE, SELF_HARM])('off, and unset, is main byte for byte (%s)', async (line) => {
    expect(await reply(line, 'off')).toBe(MAIN_SEVERE);
    expect(await reply(line, undefined)).toBe(MAIN_SEVERE);
  });

  it('everything up to and including the 988 part is identical on and off', async () => {
    const on = await reply(SELF_HARM, 'on');
    const off = await reply(SELF_HARM, 'off');
    const end988 = off.indexOf('24/7.') + '24/7.'.length;
    expect(end988).toBeGreaterThan(off.indexOf('988'));
    expect(on.slice(0, end988)).toBe(off.slice(0, end988));
    expect(on.indexOf('911')).toBeGreaterThan(end988);
    expect(on.replace(` ${LINE}`, '')).toBe(off);
  });

  it('a caller who sounds under 18: the script, the 911 line, then the youth line', async () => {
    process.env.MINOR_CARE = 'on';
    process.env.MINOR_CRISIS_CARE = 'on';
    expect(await reply(MINOR, 'on')).toBe(`${SEVERE_WITH_LINE}\n\n${YOUTH_SCRIPT_LINE}`);
    expect(await reply(MINOR, 'off')).toBe(`${MAIN_SEVERE}\n\n${YOUTH_SCRIPT_LINE}`);
  });

  it('Spanish is pinned to main, on and off (its 911 sentence is already there)', async () => {
    expect(await reply(SPANISH, 'on')).toBe(MAIN_ES);
    expect(await reply(SPANISH, 'off')).toBe(MAIN_ES);
  });

  it.each([IMMINENT, GUIDE, THIRD_PARTY, CONTROL])('unchanged on vs off: %s', async (line) => {
    const on = await reply(line, 'on');
    expect(on).toBe(await reply(line, 'off'));
    expect(on).not.toContain(LINE);
  });

  it('the imminent reply stays 911 first; check-in and control replies rest on the model', async () => {
    const imminent = await reply(IMMINENT, 'on');
    expect(imminent.indexOf('911')).toBeLessThan(imminent.indexOf('988'));
    expect(await reply(GUIDE, 'on')).toBe(NON_COMPLIANT);
    expect(await reply(CONTROL, 'on')).toBe(NON_COMPLIANT);
  });

  it("the gate's options.env does not toggle it; process.env does", async () => {
    delete process.env[FLAG];
    const viaOptions = await stubbedGateReply(SELF_HARM, undefined, 'patterns', { [FLAG]: 'on' });
    expect(viaOptions.text).toBe(MAIN_SEVERE);
    expect(await reply(SELF_HARM, 'on')).toBe(SEVERE_WITH_LINE);
  });
});

describe('CRISIS_SELF_HARM_911_LINE in the script itself', () => {
  it('the line is the approved conditional sentence, word for word', () => {
    expect(SELF_HARM_911_LINE).toBe(LINE);
    expect(SELF_HARM_911_LINE).toMatch(/^If you've already hurt yourself or you're about to, /);
  });

  const ON = { [FLAG]: 'on' };

  it('check-in level (below the replacing severity) never gets the line', () => {
    expect(detectCrisis(GUIDE).severity).toBeLessThan(0.85);
    process.env[FLAG] = 'on';
    expect(detectCrisis(GUIDE).suggestedResponse).not.toContain(LINE);
    expect(getCrisisResponse(0.75, 'self', 'en', false, ON)).not.toContain(LINE);
    expect(getCrisisResponse(0.85, 'self', 'en', false, ON)).toBe(SEVERE_WITH_LINE);
  });

  it('imminent, someone else and Spanish at full severity never get the line', () => {
    for (const r of [
      getCrisisResponse(0.9, 'self', 'en', true, ON),
      getCrisisResponse(0.9, 'third_party', 'en', false, ON),
      getCrisisResponse(0.9, 'self', 'es', false, ON),
    ]) {
      expect(r).not.toContain(LINE);
    }
  });
});
