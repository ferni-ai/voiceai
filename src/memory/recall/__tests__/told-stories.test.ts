import { describe, expect, it } from 'vitest';
import { anecdoteIn, formatToldStories, sameStory, storyId } from '../told-stories.js';

describe('anecdoteIn', () => {
  it('finds the persona telling one of its own stories', () => {
    expect(
      anecdoteIn(
        'Oh I love that. When I was a kid in Wyoming, my grandmother kept a garden full of tomatoes. She said patience grows things. Anyway, how is yours?'
      )
    ).toBe(
      'When I was a kid in Wyoming, my grandmother kept a garden full of tomatoes. She said patience grows things.'
    );
    expect(
      anecdoteIn(
        'I remember the time I tried to bake bread and set off every smoke alarm in the building.'
      )
    ).toMatch(/^I remember the time/);
  });

  it('keeps what the persona says about itself, to stay consistent', () => {
    expect(anecdoteIn('Honestly? My favorite season is fall, the light is so soft.')).toBe(
      'My favorite season is fall, the light is so soft.'
    );
    expect(anecdoteIn("I've never been to Japan, but it is high on my list.")).toMatch(
      /^I've never been to Japan/
    );
  });

  it('ignores replies that are not a story', () => {
    expect(anecdoteIn('That sounds hard. How are you holding up?')).toBeNull();
    expect(anecdoteIn('I remember when.')).toBeNull();
  });
});

describe('sameStory / storyId', () => {
  it('knows a retelling in other words is the same story', () => {
    expect(
      sameStory(
        'When I was a kid, my grandmother kept a tomato garden in Wyoming.',
        'My grandmother had a tomato garden back in Wyoming, did I ever say?'
      )
    ).toBe(true);
    expect(sameStory('My grandmother kept a garden.', 'I once got lost in Paris at night.')).toBe(
      false
    );
  });

  it('gives a stable, persona-scoped id', () => {
    expect(storyId('ferni', 'I once got lost in Paris at night.')).toBe(
      'ferni-once-lost-pari-night'
    );
  });
});

describe('formatToldStories', () => {
  it('lists them and asks to refer back, never retell', () => {
    const lines = formatToldStories([
      { id: 'a', personaId: 'ferni', gist: 'My grandmother kept a garden.', at: 0 },
    ]);
    expect(lines[0]).toMatch(/never retell one as new/);
    expect(lines[1]).toBe('- My grandmother kept a garden.');
    expect(formatToldStories([])).toEqual([]);
  });
});
