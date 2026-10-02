/**
 * Voice Pace Heuristic
 *
 * Classifies a user turn's speaking pace and energy relative to the user's
 * baseline WPM. Used by session-manager's addTurn to feed recordVoicePattern
 * ("Better than Human" energy-change detection).
 *
 * @module session-manager/voice-pace
 */

export type VoicePace = 'slower_than_usual' | 'faster_than_usual' | 'normal';
export type VoiceEnergy = 'lower_than_usual' | 'higher_than_usual' | 'normal';

export function estimateVoicePaceEnergy(
  content: string,
  contentWordCount: number,
  durationMs: number,
  avgWPM: number
): { pace: VoicePace; energy: VoiceEnergy } {
  const currentWPM = contentWordCount / (durationMs / 60000) || avgWPM;

  // Determine pace relative to user's baseline
  const paceRatio = avgWPM > 0 ? currentWPM / avgWPM : 1;
  const pace: VoicePace =
    paceRatio < 0.85 ? 'slower_than_usual' : paceRatio > 1.15 ? 'faster_than_usual' : 'normal';

  // Simple energy heuristic based on pace and message length
  const energy: VoiceEnergy =
    pace === 'slower_than_usual' && content.length < 50
      ? 'lower_than_usual'
      : pace === 'faster_than_usual' && content.length > 100
        ? 'higher_than_usual'
        : 'normal';

  return { pace, energy };
}
