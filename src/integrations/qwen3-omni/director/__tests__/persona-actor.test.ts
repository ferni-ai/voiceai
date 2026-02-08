/**
 * Persona Actor unit tests
 */

import { describe, expect, it } from 'vitest';
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

describe('PersonaActor', () => {
  it('constructs with minimal config', () => {
    const actor = new PersonaActor({
      personaId: 'ferni',
      bundle: minimalBundle,
    });
    expect(actor.personaId).toBe('ferni');
    expect(actor.bundle).toBe(minimalBundle);
    expect(actor.instructProfile).toBeDefined();
  });

  it('accepts initial position and mood', () => {
    const actor = new PersonaActor({
      personaId: 'ferni',
      bundle: minimalBundle,
      initialPosition: 'lead',
      initialMood: 'warm',
    });
    expect(actor.stagePosition).toBe('lead');
    expect(actor.currentMood).toBe('warm');
  });

  it('returns state snapshot', () => {
    const actor = new PersonaActor({
      personaId: 'ferni',
      bundle: minimalBundle,
    });
    const state = actor.getState();
    expect(state.personaId).toBe('ferni');
    expect(state.stagePosition).toBeDefined();
    expect(state.currentMood).toBeDefined();
  });
});
