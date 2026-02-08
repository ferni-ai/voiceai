/**
 * Audio Router unit tests
 */

import { describe, expect, it } from 'vitest';
import { AudioRouter } from '../audio-router.js';
import { DirectorEngine } from '../director-engine.js';

function createMinimalEngine(): DirectorEngine {
  return new DirectorEngine({
    sessionId: 'test-session',
    userId: 'user-1',
    directorUserId: 'dir-1',
    initialLead: 'ferni',
    initialCast: ['ferni'],
    initialMood: 'warm',
    autoDirectorMode: 'off',
    maxEnsembleSize: 4,
    enableMusic: false,
  });
}

describe('AudioRouter', () => {
  it('constructs with engine and authorized IDs', () => {
    const engine = createMinimalEngine();
    const router = new AudioRouter({
      directorEngine: engine,
      authorizedDirectorIds: ['dir-1'],
    });
    expect(router).toBeDefined();
  });

  it('routes user transcript when director mode off', () => {
    const engine = createMinimalEngine();
    const router = new AudioRouter({
      directorEngine: engine,
      authorizedDirectorIds: ['dir-1'],
    });
    const decision = router.routeTranscript('Hello', 'user-1');
    expect(decision.type).toBe('user_conversation');
    if (decision.type === 'user_conversation') {
      expect(decision.transcript).toBe('Hello');
    }
  });
});
