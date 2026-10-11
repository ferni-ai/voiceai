import { describe, expect, it } from 'vitest';
import { transformStateForFrontend } from '../games-frontend.js';

/**
 * The 20-questions secret went to the app in every state broadcast, so the
 * answer could be on screen while the caller was still guessing. It stays on
 * the server until the game is over.
 */
describe('20 questions: the secret reaches the app only when the game is over', () => {
  const playing = { secretThing: 'pizza', category: 'food', questionsAsked: ['is it alive?'], answers: ['no'], questionNumber: 1, guessedCorrectly: null };

  it('leaves the secret out while the caller is still guessing', () => {
    const sent = transformStateForFrontend('20-questions', playing) as Record<string, unknown>;
    expect(sent).not.toHaveProperty('secretThing');
    expect(JSON.stringify(sent)).not.toContain('pizza');
    expect(sent.questionNumber).toBe(1);
    expect(sent.maxQuestions).toBe(20);
  });

  it('includes it once they have guessed, or used all twenty questions', () => {
    const won = transformStateForFrontend('20-questions', { ...playing, guessedCorrectly: true }) as Record<string, unknown>;
    expect(won.secretThing).toBe('pizza');
    const out = transformStateForFrontend('20-questions', { ...playing, questionNumber: 20 }) as Record<string, unknown>;
    expect(out.secretThing).toBe('pizza');
  });
});
