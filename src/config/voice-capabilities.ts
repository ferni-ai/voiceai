/**
 * Voice Capabilities - which Cartesia SSML-style tags a given voice honors.
 *
 * MEASURED 2026-10-03 on model sonic-3.6, 4 takes per condition:
 *   - Professional Voice Clones (is_pro=true, e.g. "Lester Nare (Pro) - V3")
 *     IGNORE `<speed>` and `<emotion>` tags: duration / prosody differences were
 *     within take-to-take noise. `<volume>` IS honored (~-4.4 dB at 0.6) and
 *     `[laughter]` renders.
 *   - Instant clones honor `<speed>`, `<emotion>` and `<volume>`.
 *
 * Callers that inject pace/emotion tags (pace matching, emotion directors) should
 * consult voiceHonorsProsodyTags() and route around tags that would be silently
 * dropped. Unknown voices default to "honors tags" (the instant-clone/stock
 * behavior), so only measured Pro clones are listed here.
 */

/**
 * Known Cartesia Professional Voice Clones. Add a voice here only after
 * measuring that it ignores `<speed>` / `<emotion>`.
 */
const PRO_CLONE_VOICE_IDS: ReadonlySet<string> = new Set([
  // Lester Nare (Pro) V0–V3 — V3 is Ferni's voice (VOICE_IDS.FERNI)
  'a83a1291-2e22-4af5-ac02-945e7d008c19',
  '42a85814-c3b7-4b3b-bf34-903c4abce255',
  '94850365-1b6e-4f8d-8c41-e96433c0fd4e',
  'ebaf7477-b6ae-417e-be54-19e6176777ea',
  // Krishna (Pro) V0–V3
  'df58aa7f-6a5c-43dc-a761-73742f33d5ca',
  '143e55f5-3d0d-4adf-8e5a-ac8ea4763676',
  '13e60dd9-0fee-4ccc-9e18-0f93aa3ff792',
  '3d6daec7-03e1-4201-9a00-3c9cba0f1b43',
]);

/**
 * Model snapshots a PVC has fine-tunes for. A PVC must be synthesized with a
 * model it was trained on (Cartesia PVC guide), so CARTESIA_MODEL must be one of
 * these for Ferni's voice. MEASURED 2026-10-03 via GET /voices/{id}. Only voices
 * whose fine-tunes were actually listed appear here.
 */
export const PVC_FINE_TUNED_MODELS: Readonly<Record<string, readonly string[]>> = {
  // Lester Nare (Pro) - V3 (Ferni)
  'ebaf7477-b6ae-417e-be54-19e6176777ea': ['sonic-3.6-2026-08-27', 'sonic-3.5-2026-05-04'],
};

/** Whether this voice is a known Cartesia Professional Voice Clone. */
export function isProVoiceClone(voiceId: string): boolean {
  return PRO_CLONE_VOICE_IDS.has(normalize(voiceId));
}

/**
 * Measured fine-tuned model snapshots for a PVC, or undefined when the voice is
 * not a PVC or its fine-tunes have not been measured.
 */
export function pvcFineTunedModels(voiceId: string): readonly string[] | undefined {
  return PVC_FINE_TUNED_MODELS[normalize(voiceId)];
}

function normalize(voiceId: string): string {
  return typeof voiceId === 'string' ? voiceId.trim().toLowerCase() : '';
}

/**
 * Whether Cartesia honors `<speed>` and `<emotion>` tags for this voice.
 * False for known Professional Voice Clones; true otherwise.
 */
export function voiceHonorsProsodyTags(voiceId: string): boolean {
  return !isProVoiceClone(voiceId);
}

/**
 * Whether Cartesia honors the `<volume>` tag for this voice.
 * True for every voice measured so far, Pro clones included.
 */
export function voiceHonorsVolumeTag(_voiceId: string): boolean {
  return true;
}
