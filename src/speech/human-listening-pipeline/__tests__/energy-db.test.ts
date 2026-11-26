/**
 * HUMAN_LISTENING_ENERGY_DB (#4241): a voice reading's energyMean is in dBFS, so main's
 * `energyMean < 40` called every reading quiet: the pipeline asked for space and saw a voice
 * "getting quieter on sensitive content" on every turn with a reading. With the flag on, only a
 * soft voice or a whisper (volumeLevelOfDb, below -35 dB) is quiet. Invented lines only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HumanListeningPipeline,
  resetAllHumanListeningPipelines,
} from '../../human-listening-pipeline.js';

const QUIET_EVIDENCE = 'voice getting quieter on sensitive content';

/** The pipeline's read of one plain turn with a voice reading at this level. */
async function heard(energyMean: number, flag?: 'on' | 'off') {
  if (flag) vi.stubEnv('HUMAN_LISTENING_ENERGY_DB', flag);
  const pipeline = new HumanListeningPipeline(`riley-test-${energyMean}-${flag ?? 'unset'}`);
  const result = await pipeline.analyze({
    sessionId: 'riley-test',
    text: 'I made pasta today.',
    turnNumber: 2,
    prosodyFeatures: { energyMean, energyVariance: 4 },
  });
  return {
    quiet: result.audio.volumeDynamics?.onSensitiveTopic,
    giveSpace: result.shouldGiveSpace,
    fading: result.audio.energyDynamics !== null,
    masked: result.emotionalUndercurrent.evidence.includes(QUIET_EVIDENCE),
  };
}
const QUIET = { quiet: true, giveSpace: true, fading: true, masked: true };
const NOT_QUIET = { quiet: false, giveSpace: false, fading: false, masked: false };

afterEach(() => {
  vi.unstubAllEnvs();
  resetAllHumanListeningPipelines();
});

describe('HUMAN_LISTENING_ENERGY_DB', () => {
  it('off or unset: every reading reads as quiet, a loud one too (main)', async () => {
    for (const flag of [undefined, 'off'] as const)
      for (const db of [-50, -25, -15])
        expect(await heard(db, flag), `${db} ${flag}`).toEqual(QUIET);
  });

  it('on: a loud or a normal voice is not quiet and asks for no space', async () => {
    expect(await heard(-15, 'on')).toEqual(NOT_QUIET);
    expect(await heard(-25, 'on')).toEqual(NOT_QUIET);
  });

  it('on: a soft voice and a whisper still read as quiet', async () => {
    expect(await heard(-40, 'on')).toEqual(QUIET);
    expect(await heard(-50, 'on')).toEqual(QUIET);
  });
});
