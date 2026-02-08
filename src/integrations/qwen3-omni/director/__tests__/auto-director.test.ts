/**
 * Auto-Director unit tests
 */

import { describe, expect, it } from 'vitest';
import { AutoDirector } from '../auto-director.js';
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

describe('AutoDirector', () => {
  it('constructs with engine and optional config', () => {
    const engine = createMinimalEngine();
    const auto = new AutoDirector(engine);
    expect(auto).toBeDefined();
  });

  it('analyzeTurn returns empty array when mode is off', async () => {
    const engine = createMinimalEngine();
    const auto = new AutoDirector(engine, { mode: 'off' });
    const result = await auto.analyzeTurn({
      userTranscript: 'Hello',
      currentLead: 'ferni',
      turnCount: 0,
      sessionMinutes: 0,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('getMode returns configured mode', () => {
    const engine = createMinimalEngine();
    const auto = new AutoDirector(engine, { mode: 'suggest' });
    expect(auto.getMode()).toBe('suggest');
  });
});
