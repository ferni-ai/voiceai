/**
 * Voice `breathing_exercise` data messages open the breathing guide modal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const openBreathingGuideModal = vi.fn();

vi.mock('../../src/ui/breathing-guide-modal.ui.js', () => ({
  openBreathingGuideModal,
}));

import { handleBreathingExercise, handleDataMessage } from '../../src/app/data-message-handlers.js';

afterEach(() => {
  openBreathingGuideModal.mockReset();
});

describe('breathing_exercise data message', () => {
  it('opens the breathing guide with the published technique', async () => {
    handleDataMessage({ type: 'breathing_exercise', technique: 'box', purpose: 'calm' });
    await vi.waitFor(() => {
      expect(openBreathingGuideModal).toHaveBeenCalledWith({
        technique: 'box',
        purpose: 'calm',
        pattern: undefined,
      });
    });
  });

  it('maps a direct handler call the same way', () => {
    handleBreathingExercise({ type: 'breathing_exercise', technique: '4-7-8', purpose: 'sleep' });
    return vi.waitFor(() => {
      expect(openBreathingGuideModal).toHaveBeenCalledWith({
        technique: '4-7-8',
        purpose: 'sleep',
        pattern: undefined,
      });
    });
  });
});
