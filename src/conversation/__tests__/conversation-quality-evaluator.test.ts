import { describe, expect, it } from 'vitest';

import { evaluateConversationQuality } from '../eval/conversation-quality.js';

describe('Conversation Quality Evaluator', () => {
  it('should score within 0..1 and detect SSML leakage', () => {
    const score = evaluateConversationQuality({
      userMessage: "I'm not doing great.",
      responseText: '<prosody rate="95%">I hear you.</prosody>',
      userEmotion: 'sad',
      wasPersonalSharing: true,
      turnNumber: 2,
    });

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(1);
    expect(score.diagnostics.responseHasSsml).toBe(true);
    expect(score.notes.length).toBeGreaterThan(0);
  });
});
