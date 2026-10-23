/**
 * The financial legends (Nate, Henry Caldwell and Tom Brannigan; ids joel-dickson,
 * john-bogle, peter-lynch) get what the rest
 * of the team gets: speech traits, a greeting and an arrival line in their own
 * voice, their names in the speech recognizer's hints, and their own Cartesia
 * voice. Before, a handoff to john-bogle or peter-lynch greeted with "Hey! What's up?" in
 * Ferni's voice and the recognizer had never heard of their names.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCascadeKeyterms } from '../../agents/model-provider/cartesia-cascade.js';
import { generateWarmGreeting } from '../../agents/shared/warm-greeting.js';
import { VOICE_IDS } from '../../config/voice-ids.js';
import { getArrivingBanter } from '../../services/team-engagement/banter.js';
import { FINANCIAL_LEGENDS } from '../persona-ids.js';
import { getVoiceId } from '../voice-registry.js';

const LEGEND_NAMES: Record<(typeof FINANCIAL_LEGENDS)[number], string[]> = {
  'joel-dickson': ['Nate'],
  'john-bogle': ['Henry', 'Caldwell'],
  'peter-lynch': ['Tom', 'Brannigan'],
};

function manifest(id: string) {
  const path = join(process.cwd(), 'src/personas/bundles', id, 'persona.manifest.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** Every line the generic fallback can produce (an unknown persona only ever gets those). */
const genericGreetings = new Set(
  Array.from({ length: 200 }, () => generateWarmGreeting('no-such-persona'))
);

describe.each(FINANCIAL_LEGENDS)('%s has parity with the team', (id) => {
  const others = FINANCIAL_LEGENDS.filter((other) => other !== id);

  it('greets in their own words, not the generic fallback', () => {
    for (let i = 0; i < 30; i++) {
      expect(genericGreetings.has(generateWarmGreeting(id))).toBe(false);
    }
  });

  it.each(others)('has an arrival line when handed off from %s', (from) => {
    const line = getArrivingBanter(id, from);
    expect(line).not.toBeNull();
    expect(line).not.toBe("Hey! What's up?");
  });

  it('is named in the STT keyterms, by its fictional name only', () => {
    const terms = buildCascadeKeyterms({}, {});
    for (const name of LEGEND_NAMES[id]) expect(terms).toContain(name);
    for (const real of ['Joel', 'Dickson', 'Bogle', 'Lynch']) expect(terms).not.toContain(real);
  });

  it('never introduces itself by a real person\'s name on arrival', () => {
    for (const from of others) {
      for (let i = 0; i < 20; i++) {
        expect(getArrivingBanter(id, from) ?? '').not.toMatch(/Bogle|Lynch|Dickson|Joel|Jack/);
      }
    }
  });

  it('speaks in its own Cartesia voice, not Ferni', () => {
    const voice = manifest(id).voice;
    expect(voice.provider).toBe('cartesia');
    expect(voice.settings).toBeUndefined(); // ElevenLabs-shaped block Cartesia ignores
    expect(voice.voice_id).not.toBe(VOICE_IDS.FERNI);
    // The registry is never built from bundles on the call path; the fallback must still differ.
    expect(getVoiceId(id)).toBe(voice.voice_id);
  });
});

describe('legend voice translation', () => {
  it.each(['john-bogle', 'peter-lynch'])('%s carries the pace the cascade reads', (id) => {
    const m = manifest(id);
    expect(m.voice.default_rate).toMatch(/^(slow|medium|fast)$/);
    expect(typeof m.voice.default_speed).toBe('number');
    expect(m.speech_characteristics.base_speed_multiplier).toBeLessThan(1);
  });
});
