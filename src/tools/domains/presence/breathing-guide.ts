import { getLogger } from '../../../utils/safe-logger.js';

export type BreathingTechnique = 'simple' | 'box' | '4-7-8' | 'coherent';
export type BreathingPurpose = 'calm' | 'energize' | 'presence' | 'sleep';

const SCRIPTS: Record<BreathingTechnique, readonly string[]> = {
  simple: [
    "Let's just breathe together. Simple.",
    'Breathe in... 2... 3... 4...',
    'Breathe out... 2... 3... 4... 5... 6...',
    'Again.',
    'In... 2... 3... 4...',
    'Out... 2... 3... 4... 5... 6...',
    'A longer exhale calms the nervous system.',
    'One more time, at your own pace.',
  ],
  box: [
    'Box breathing. Four sides of a box, four counts each.',
    'In... 2... 3... 4.',
    'Hold... 2... 3... 4.',
    'Out... 2... 3... 4.',
    'Hold... 2... 3... 4.',
    'Repeat for 4 cycles. Feel your heart rate slow.',
  ],
  '4-7-8': [
    '4-7-8 breathing.',
    'Inhale through the nose: 4 counts.',
    'Hold: 7 counts.',
    'Exhale through the mouth: 8 counts.',
    'The long exhale activates your rest-and-digest system.',
    'Do this 4 times. Notice how you feel after.',
  ],
  coherent: [
    'Coherent breathing, about 5 breaths a minute.',
    'In for 6 seconds.',
    'Out for 6 seconds.',
    'Smooth, continuous, no pause.',
    'This rhythm synchronizes heart, brain, and nervous system.',
    'Try for 2 or 3 minutes and notice the shift.',
  ],
};

export function breathingScript(technique: BreathingTechnique): string {
  return SCRIPTS[technique].join('\n');
}

export async function publishBreathingExercise(
  technique: BreathingTechnique,
  purpose: BreathingPurpose
): Promise<void> {
  try {
    const { getFrontendPublisher } = await import(
      '../../../agents/realtime/frontend-publisher.js'
    );
    await getFrontendPublisher().sendData('breathing_exercise', { technique, purpose });
  } catch (error) {
    getLogger().debug(
      { error: String(error), technique, purpose },
      'breathing_exercise publish skipped'
    );
  }
}
