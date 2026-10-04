/**
 * analyzeConversation passes the user's response gap to engagement scoring.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetAllEngagementScorers } from '../../../conversation/engagement-scoring.js';
import { analyzeConversation } from '../analyzers.js';

const ANSWERS = [
  'honestly the hardest part has been the mornings',
  'I have been walking by the water most evenings now',
  'it helps to have something steady to come back to',
];

async function scoreAfterAnswers(sessionId: string, gapMs: number | undefined): Promise<number> {
  let score = 0;
  for (const [i, text] of ANSWERS.entries()) {
    const result = await analyzeConversation(sessionId, {
      sessionId,
      text,
      turnNumber: i + 1,
      currentTopic: 'moving',
      timeSinceAgentMessage: gapMs,
    });
    score = result.engagement.score;
  }
  return score;
}

describe('analyzeConversation response gap', () => {
  afterEach(() => {
    resetAllEngagementScorers();
  });

  it('treats an immediate answer (gap 0) as known and quick, not unknown', async () => {
    const immediate = await scoreAfterAnswers('gap-zero', 0);
    const unknown = await scoreAfterAnswers('gap-unknown', undefined);

    expect(immediate).toBeGreaterThan(unknown);
  });
});
