/**
 * BACKGROUND_VOICE_EMOTION and the crisis subject. On the background turn the
 * voice may only raise a read's severity (the amplifier in
 * services/safety/crisis-guard.ts); it never moves a worry about someone else
 * onto the caller. The soft-self flip there ("the voice makes it about the
 * caller again") is the synchronous path's rule and stays as on main. A flipped
 * read would swap the help for the person at risk (988 on their behalf, check on
 * them, 911) for the caller's own scripted reply. Fictional lines and synthetic
 * voices only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { startCrisisGate } from '../../personas/crisis-gate.js';
import type { CrisisDetection } from '../../processors/types.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { buildCrisisGuidance, detectCrisis } from '../../safety/crisis-guard.js';
import { toGuardVoiceEmotion } from '../../safety/crisis-shadow.js';
import { disclosureGuidance } from '../../../services/safety/index.js';
import { analyzerReading, backgroundTurn, VOICES } from './background-voice-fixtures.js';

afterEach(() => vi.unstubAllEnvs());

/**
 * "Not me" shapes the synchronous path flips on a distressed voice (crisis-guard.ts soft-self
 * flip): the caller's own ending words, negated, beside a worry about someone else.
 */
const NOT_ME = [
  "my son said he wants to die. not me, i'd never kill myself",
  'my brother keeps talking about killing himself. i would never kill myself',
  'my dad told me he wants to end his life. not me, i would never end my life',
  "my sister said she wants to die. i'd never kill myself though",
  "my wife keeps saying she wants to die. i don't want to die",
];

const THIRD_PARTY = [
  ...NOT_ME,
  // "Not me" shapes the soft-self flip does not read; here the voice already only raises.
  "my friend says she wants to kill herself. i'd never do that, but i'm scared for her",
  "my roommate wants to kill himself. i'd never hurt myself, i just want to help him",
  'my friend wants to kill herself',
  "i'm worried my brother is suicidal",
  "my mom said she doesn't want to be alive anymore",
  'my coworker keeps talking about ending his life',
  'my daughter said she wants to hurt herself',
  'my best friend told me he has a plan to kill himself',
];

const THIRD_PARTY_HELP = 'The user is worried that someone they know is at risk';

/** The reply contract turn-handler.ts picks from a turn's crisis summary, in its branch order. */
function contractOf(crisis: CrisisDetection): { kind: string; text?: string } {
  if (crisis.shouldOverrideLLM && crisis.suggestedResponse)
    return { kind: 'override', text: crisis.suggestedResponse };
  if (crisis.isCrisis)
    return { kind: 'guidance', text: disclosureGuidance(crisis) ?? buildCrisisGuidance(crisis) };
  return { kind: crisis.softCheck ? 'soft' : 'none' };
}

/** A background turn's crisis summary: the real hook's user data, then the real turn crisis read. */
async function backgroundSummary(line: string, voice: string, flag: 'on' | '') {
  const ctx = await backgroundTurn(line, analyzerReading(VOICES[voice]), flag);
  return startTurnCrisis(line, ctx.userData, { env: {} }).summary();
}

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

describe('BACKGROUND_VOICE_EMOTION never changes the crisis subject', () => {
  it('flag on: every third-party line keeps its subject and its help, on every voice', async () => {
    const severityOnly: string[] = [];
    let pairs = 0;
    for (const line of THIRD_PARTY)
      for (const voice of Object.keys(VOICES)) {
        pairs += 1;
        const off = await backgroundSummary(line, voice, '');
        const on = await backgroundSummary(line, voice, 'on');
        const where = `${voice} | ${line}`;
        expect(off.subject, where).toBe('third_party');
        expect(on.subject, where).toBe(off.subject);
        expect(on.shouldOverrideLLM, where).toBe(off.shouldOverrideLLM);
        expect(on.isCrisis, where).toBe(off.isCrisis);
        expect(on.severity, where).toBeGreaterThanOrEqual(off.severity);
        const offContract = contractOf(off);
        const onContract = contractOf(on);
        expect(onContract.kind, where).toBe(offContract.kind);
        if (offContract.kind === 'guidance')
          expect(onContract.text, where).toContain(THIRD_PARTY_HELP);
        if (on.severity > off.severity) severityOnly.push(where);
      }
    expect(pairs).toBe(91);
    // Raises here are severity only: same subject, same contract, the third-party help kept.
    // 26 of 91: the anxious and sad voices raise every line (.75 to .80), and nothing else.
    const distressed = THIRD_PARTY.flatMap((line) => [`anxious | ${line}`, `sad | ${line}`]);
    expect(severityOnly.sort()).toEqual(distressed.sort());
  }, 60_000);

  it('the background voice still raises: the subject pin does not switch the voice off', async () => {
    const line = "i'm so tired of being alive";
    const off = await backgroundSummary(line, 'sad', '');
    const on = await backgroundSummary(line, 'sad', 'on');
    expect(off).toMatchObject({ subject: 'self', shouldOverrideLLM: false });
    expect(on).toMatchObject({ subject: 'self', shouldOverrideLLM: true });
    expect(on.indicators).toContain('voice_moderate_distress');
  });

  it('the synchronous path keeps its flip on a "not me" line with a distressed voice, as on main', async () => {
    for (const line of NOT_ME)
      for (const voice of ['anxious', 'sad']) {
        const reading = analyzerReading(VOICES[voice]);
        const where = `${voice} | ${line}`;
        expect(detectCrisis(line, toGuardVoiceEmotion(reading)).subject, where).toBe('self');
        expect(detectCrisis(line).subject, where).toBe('third_party');
        // The synchronous turn's user data carries no marker: its crisis read still flips.
        const turn = await startTurnCrisis(line, { voiceEmotion: reading }, { env: {} }).summary();
        expect(turn.subject, where).toBe('self');
        // The reply's crisis gate (personas/crisis-gate.ts) reads the session's voice.
        const env = { CRISIS_GUARD_MODE: 'live' };
        const gate = startCrisisGate(request(line), { voiceEmotion: reading }, { env });
        expect(gate?.decision.action, where).toBe('replace');
        const quiet = startCrisisGate(request(line), undefined, { env });
        expect(quiet?.decision.action, where).toBe('guide');
      }
  });
});
