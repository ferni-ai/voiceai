/**
 * The persona bundles, the hardcoded fallbacks (config/voice-ids.ts) and the
 * design-system persona kits name the same voice for every persona.
 *
 * The voice registry now loads bundle voices over the fallbacks
 * (voice-registry-init-order.test.ts), so a bundle voice that differs from its
 * fallback would change how that persona sounds in prod. Jordan's bundle named
 * a different voice than prod used; Seth kept prod's (2026-10-18). Any new
 * mismatch fails here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getVoiceIdForPersona } from '../../config/voice-ids.js';
import { discoverAndLoadBundles } from '../bundles/index.js';
import { toCanonical } from '../persona-ids.js';

/** Env vars the bundles' ${env:…|default} voices and the fallbacks read first. */
const VOICE_ENV = [
  'FERNI_VOICE_ID',
  'JACK_B_VOICE_ID',
  'PETER_JOHN_VOICE_ID',
  'JACK_BOGLE_VOICE_ID',
  'ALEX_CHEN_VOICE_ID',
  'COMM_SPECIALIST_VOICE_ID',
  'MAYA_SANTOS_VOICE_ID',
  'SPEND_SAVE_VOICE_ID',
  'JORDAN_TAYLOR_VOICE_ID',
  'EVENT_PLANNER_VOICE_ID',
  'NAYAN_PATEL_VOICE_ID',
  'NAYAN_VOICE_ID',
  'JOEL_DICKSON_VOICE_ID',
  'PETER_LYNCH_VOICE_ID',
  'JOHN_BOGLE_VOICE_ID',
];

async function bundleVoices(): Promise<Array<[string, string]>> {
  const { bundles } = await discoverAndLoadBundles();
  return bundles.map((b) => [b.manifest.identity.id, b.manifest.voice.voice_id]);
}

/** Every Cartesia voiceId in design-system/tokens/persona-kits.json, keyed by kit name. */
function personaKitVoices(): Array<[string, string]> {
  const kits = JSON.parse(
    readFileSync(resolve(__dirname, '../../../design-system/tokens/persona-kits.json'), 'utf8')
  ) as { personas: Record<string, { avatar?: { voiceId?: { cartesia?: string } } }> };
  return Object.entries(kits.personas).flatMap(([name, kit]) => {
    const voice = kit.avatar?.voiceId?.cartesia;
    return voice ? [[name, voice] as [string, string]] : [];
  });
}

const drift = (voices: Array<[string, string]>, canonical: (id: string) => string) =>
  Object.fromEntries(
    voices
      .filter(([id, voice]) => voice !== getVoiceIdForPersona(canonical(id)))
      .map(([id, voice]) => [id, { fallback: getVoiceIdForPersona(canonical(id)), voice }])
  );

beforeEach(() => {
  for (const name of VOICE_ENV) vi.stubEnv(name, '');
});
afterAll(() => vi.unstubAllEnvs());

describe('persona voice sources', () => {
  it('every persona bundle names the same voice as its fallback', async () => {
    const voices = await bundleVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(drift(voices, (id) => id)).toEqual({});
  });

  it('every persona kit voiceId names the same voice as its fallback', () => {
    const voices = personaKitVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(drift(voices, (name) => toCanonical(name))).toEqual({});
  });

  it('keeps Jordan on the voice prod used before bundles won', async () => {
    const jordan = new Map(await bundleVoices()).get('jordan-taylor');
    expect(jordan).toBe('b2d14370-c56b-4bdd-a6a3-71abe1b6e345');
  });
});
