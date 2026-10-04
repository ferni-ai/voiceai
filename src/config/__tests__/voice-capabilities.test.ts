/**
 * Voice Capabilities Tests
 *
 * @module @ferni/config/__tests__/voice-capabilities
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isProVoiceClone,
  pvcFineTunedModels,
  voiceHonorsProsodyTags,
  voiceHonorsVolumeTag,
  voiceMedianF0Hz,
} from '../voice-capabilities.js';
import { DEFAULT_CARTESIA_MODEL, LEGACY_FERNI_IVC_VOICE_ID, VOICE_IDS } from '../voice-ids.js';

const LESTER_PRO = [
  'a83a1291-2e22-4af5-ac02-945e7d008c19',
  '42a85814-c3b7-4b3b-bf34-903c4abce255',
  '94850365-1b6e-4f8d-8c41-e96433c0fd4e',
  'ebaf7477-b6ae-417e-be54-19e6176777ea',
];
const KRISHNA_PRO = [
  'df58aa7f-6a5c-43dc-a761-73742f33d5ca',
  '143e55f5-3d0d-4adf-8e5a-ac8ea4763676',
  '13e60dd9-0fee-4ccc-9e18-0f93aa3ff792',
  '3d6daec7-03e1-4201-9a00-3c9cba0f1b43',
];

describe('voiceHonorsProsodyTags', () => {
  it.each([...LESTER_PRO, ...KRISHNA_PRO])('returns false for Pro clone %s', (id) => {
    expect(voiceHonorsProsodyTags(id)).toBe(false);
  });

  it("returns false for Ferni's current voice (Lester Pro V3)", () => {
    expect(voiceHonorsProsodyTags(VOICE_IDS.FERNI)).toBe(false);
  });

  it('returns true for the legacy Ferni instant clone', () => {
    expect(voiceHonorsProsodyTags(LEGACY_FERNI_IVC_VOICE_ID)).toBe(true);
  });

  it('returns true for other persona voices and unknown ids', () => {
    expect(voiceHonorsProsodyTags(VOICE_IDS.PETER_JOHN)).toBe(true);
    expect(voiceHonorsProsodyTags(VOICE_IDS.GENERIC)).toBe(true);
    expect(voiceHonorsProsodyTags('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(voiceHonorsProsodyTags('')).toBe(true);
  });

  it('matches Pro clone ids case- and whitespace-insensitively', () => {
    expect(voiceHonorsProsodyTags(' EBAF7477-B6AE-417E-BE54-19E6176777EA ')).toBe(false);
  });
});

describe('voiceHonorsVolumeTag', () => {
  it('returns true for Pro clones (measured ~-4.4 dB at volume 0.6)', () => {
    for (const id of [...LESTER_PRO, ...KRISHNA_PRO]) {
      expect(voiceHonorsVolumeTag(id)).toBe(true);
    }
  });

  it('returns true for instant clones and unknown ids', () => {
    expect(voiceHonorsVolumeTag(LEGACY_FERNI_IVC_VOICE_ID)).toBe(true);
    expect(voiceHonorsVolumeTag('anything')).toBe(true);
  });
});

describe('Ferni PVC + pinned Cartesia model', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('VOICE_IDS.FERNI is a Professional Voice Clone with measured fine-tunes', () => {
    expect(isProVoiceClone(VOICE_IDS.FERNI)).toBe(true);
    expect(pvcFineTunedModels(VOICE_IDS.FERNI)).toEqual([
      'sonic-3.6-2026-08-27',
      'sonic-3.5-2026-05-04',
    ]);
  });

  it('the default model is a dated snapshot the Ferni PVC was fine-tuned on', () => {
    expect(DEFAULT_CARTESIA_MODEL).toMatch(/^sonic-[\d.]+-\d{4}-\d{2}-\d{2}$/);
    expect(pvcFineTunedModels(VOICE_IDS.FERNI)).toContain(DEFAULT_CARTESIA_MODEL);
  });

  it('CARTESIA_MODEL resolves to the pinned snapshot when the env var is unset', async () => {
    vi.stubEnv('CARTESIA_MODEL', '');
    vi.resetModules();
    const fresh = await import('../voice-ids.js');
    expect(fresh.CARTESIA_MODEL).toBe('sonic-3.6-2026-08-27');
    expect(pvcFineTunedModels(fresh.VOICE_IDS.FERNI)).toContain(fresh.CARTESIA_MODEL);
  });

  it('non-PVC voices are not Pro clones and have no fine-tune list', () => {
    expect(isProVoiceClone(LEGACY_FERNI_IVC_VOICE_ID)).toBe(false);
    expect(pvcFineTunedModels(LEGACY_FERNI_IVC_VOICE_ID)).toBeUndefined();
  });
});

describe('voiceMedianF0Hz', () => {
  it("gives Ferni's voice (Lester Pro V3) its median f0 for Stage 2 sighs", () => {
    expect(voiceMedianF0Hz(VOICE_IDS.FERNI)).toBe(111);
    expect(voiceMedianF0Hz(` ${VOICE_IDS.FERNI.toUpperCase()} `)).toBe(111);
  });

  it('is undefined for a voice nobody measured (the renderer keeps its default)', () => {
    expect(voiceMedianF0Hz(LEGACY_FERNI_IVC_VOICE_ID)).toBeUndefined();
    expect(voiceMedianF0Hz('not-a-voice')).toBeUndefined();
  });
});
