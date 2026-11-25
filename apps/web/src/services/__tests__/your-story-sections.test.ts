/**
 * Your World: every number on the graph counts the people it draws.
 *
 * Prod 2026-11-16: the header said "36 connections" and the chip "34 active" over the
 * whole stored network, while the graph drew the top 8 and its legend counted those 8.
 */
import { describe, expect, it } from 'vitest';
import { toRelationshipNetwork, type ApiYourWorld } from '../your-story-sections.js';

const node = (name: string, type: string, daysSinceMention: number) => ({
  name,
  type,
  strength: 0.5,
  lastMentioned: '2026-11-01T00:00:00.000Z',
  daysSinceMention,
});

const world: ApiYourWorld = {
  totalConnections: 36,
  activeConnections: 34,
  needsAttention: ['Bria', 'Someone Not Drawn'],
  people: [
    node('Bria', 'friend', 40),
    node('Mel', 'friend', 2),
    node('my mom', 'family', 1),
    node('Rowan', 'colleague', 5),
  ],
};

describe('toRelationshipNetwork counts', () => {
  const net = toRelationshipNetwork(world)!;

  it('header and active chip count the drawn nodes, like the legend', () => {
    expect(net.relationships).toHaveLength(4);
    expect(net.totalConnections).toBe(net.relationships.length);
    expect(net.activeConnections).toBe(3); // Bria was last mentioned 40 days ago
  });

  it('the reconnect card names only someone drawn', () => {
    expect(net.needsAttention).toEqual(['Bria']);
  });

  it('no people, no graph', () => {
    expect(toRelationshipNetwork({ ...world, people: [] })).toBeUndefined();
  });
});
