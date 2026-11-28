/**
 * The turn's receipt names the note builders that gave the turn a note (turn-note-guard.ts
 * firedNotes): names only, never the note text, and only builders that returned text.
 */
import { describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';

import { attempt, firedNotes, guardedTurn } from '../turn-note-guard.js';

const log = { warn: vi.fn() } as never;

function turn(build: () => void): string[] {
  let seen: string[] = [];
  const request = llm.ChatContext.empty();
  guardedTurn(log, 'RM_fired', request, () => {
    build();
    seen = firedNotes();
    return request;
  });
  return seen;
}

describe('firedNotes', () => {
  it('names the builders that returned text, once each, in order', () => {
    const fired = turn(() => {
      attempt('news', () => 'Ask what happened.', '');
      attempt('quiet', () => '', '');
      attempt('style', () => ({ text: 'Keep it short.', turn: 'x' }), { text: '', turn: '' });
      attempt('friends', () => ['', 'Tease lightly.'], [] as string[]);
      attempt('news', () => 'Again.', '');
      attempt('flag', () => true, false);
    });
    expect(fired).toEqual(['news', 'style', 'friends']);
  });

  it('leaves out a builder that threw', () => {
    const fired = turn(() => {
      attempt(
        'broken',
        () => {
          throw new Error('Biscuit');
        },
        'fallback text'
      );
    });
    expect(fired).toEqual([]);
  });

  it('starts empty on each turn and outside a turn', () => {
    turn(() => attempt('news', () => 'Ask what happened.', ''));
    expect(turn(() => undefined)).toEqual([]);
    expect(firedNotes()).toEqual([]);
  });
});
