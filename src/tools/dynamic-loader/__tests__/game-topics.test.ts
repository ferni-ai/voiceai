/**
 * "Let's play a game" loads the games, not the joy-coaching `play` domain.
 *
 * The games audit (2026-10-18) found every "let's play" turn adding the play
 * domain's 9 to 10 joy tools (mapJoy, becomeSilly...) to the call and no games
 * tool. The games domain is the one with the scorekeeper.
 */
import { describe, expect, it } from 'vitest';
import { createSessionToolLoader } from '../index.js';

const loader = createSessionToolLoader({ enableAutoUnload: false, essentialDomains: [] });

describe('game requests and the topic loader', () => {
  it.each(["let's play a game", 'I want to play some games', 'are you playing a game with me'])(
    '%j suggests the games domain, not play',
    (said) => {
      const { suggestedDomains } = loader.detectTopics(said);
      expect(suggestedDomains).toContain('games');
      expect(suggestedDomains).not.toContain('play');
    }
  );

  it('still loads music for "play some music"', () => {
    expect(loader.detectTopics('play some music').suggestedDomains).toContain('entertainment');
  });
});
