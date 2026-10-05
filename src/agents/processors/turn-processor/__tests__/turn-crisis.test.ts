/**
 * The turn pipeline classifies a turn with the line of Ferni's it answers, as
 * the reply's crisis gate does, so the two share one call and one reading.
 */
import { describe, expect, it, vi } from 'vitest';

const startCrisisClassifier = vi.hoisted(() => vi.fn(() => null));
vi.mock('../../../../services/safety/crisis-classifier.js', () => ({ startCrisisClassifier }));

import { startTurnCrisis } from '../turn-crisis.js';

describe('startTurnCrisis', () => {
  it("passes Ferni's last reply as the companion line", () => {
    startTurnCrisis("Tell me again how you'd do it.", {
      recentTranscripts: ['Plan the day with her.'],
      lastAgentResponse: 'Morning hike, then a movie night.',
    });
    expect(startCrisisClassifier).toHaveBeenCalledWith(
      {
        latest: "Tell me again how you'd do it.",
        earlier: ['Plan the day with her.'],
        companion: 'Morning hike, then a movie night.',
      },
      expect.anything()
    );
  });
});
