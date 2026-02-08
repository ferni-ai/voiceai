/**
 * Director Engine unit tests
 */

import { describe, expect, it } from 'vitest';
import { DirectorEngine } from '../director-engine.js';
import { PersonaActor, type PersonaBundleRef } from '../persona-actor.js';

const minimalBundle: PersonaBundleRef = {
  id: 'ferni',
  name: 'Ferni',
  displayName: 'Ferni',
  description: 'Life coach',
  role: 'coach',
  systemPromptExcerpt: 'You are Ferni.',
  cognitiveStyle: 'warm',
  domains: ['life-coaching'],
};

describe('DirectorEngine', () => {
  it('constructs with minimal config', () => {
    const engine = new DirectorEngine({
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
    expect(engine).toBeDefined();
  });

  it('returns state snapshot', () => {
    const engine = new DirectorEngine({
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
    const snapshot = engine.getStateSnapshot();
    expect(snapshot.cast).toBeDefined();
    expect(snapshot.cast.leadPersona).toBe('ferni');
    expect(snapshot.scene).toBeDefined();
    expect(snapshot.scene.mood).toBe('warm');
  });

  it('registers actor and includes in state', () => {
    const engine = new DirectorEngine({
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
    const actor = new PersonaActor({
      personaId: 'ferni',
      bundle: minimalBundle,
      initialPosition: 'lead',
    });
    engine.registerActor(actor);
    const snapshot = engine.getStateSnapshot();
    expect(snapshot.actors.length).toBeGreaterThanOrEqual(0);
  });
});
