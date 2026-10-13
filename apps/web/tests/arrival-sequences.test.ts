/**
 * The call arrival plays the arrival_* sequences from design tokens
 * (design-system/tokens/sequences.json → config/sequences.generated.ts).
 * These checks keep the tokens drawable and the arrival calm.
 */
import { describe, expect, it } from 'vitest';
import { EXPRESSIONS } from '../src/config/expressions.generated';
import { REDUCED_MOTION, SEQUENCES, type Sequence } from '../src/config/sequences.generated';

const arrival: Sequence[] = Object.values(SEQUENCES).filter((s) => s.id.startsWith('arrival_'));

describe('arrival sequences', () => {
  it('cover every moment of the arrival', () => {
    expect(arrival.map((s) => s.trigger).sort()).toEqual(
      [
        'agent_joined',
        'agent_listening',
        'agent_speaking',
        'agent_thinking',
        'call_start',
        'connect_failed',
        'connect_slow',
        'connect_very_slow',
      ].sort()
    );
  });

  it('only name faces the expression tokens define, so the avatar can draw them', () => {
    const faces = arrival.flatMap((s) =>
      s.steps.filter((x) => x.element === 'face').map((x) => String(x.properties?.expression))
    );
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) expect(Object.keys(EXPRESSIONS), f).toContain(f);
  });

  it('play the chord only when Ferni arrives: not on the tap, not on a failure', () => {
    expect(arrival.filter((s) => s.sound).map((s) => s.id)).toEqual(['arrival_joined']);
  });

  it('under reduced motion drop body motion but keep his face', () => {
    for (const id of [
      'arrival_joined',
      'arrival_ready',
      'arrival_listening',
      'arrival_failed',
    ] as const) {
      const simp = REDUCED_MOTION[id];
      expect(simp?.removeSteps, id).toContain('avatar');
      expect(simp?.removeSteps, id).not.toContain('face');
    }
  });
});
