import { describe, expect, it } from 'vitest';

import { normalizeBundleStory } from '../story-normalizer.js';

describe('normalizeBundleStory', () => {
  it('takes triggers from the index topics when the story file has none (Nayan)', () => {
    const story = normalizeBundleStory(
      {
        id: 'snake-rope',
        setup: { context: 'A classic story.', tone: 'storyteller mode' },
        narrative: { paragraphs: [{ text: 'A man sees a snake.', delivery: 'slow' }] },
      },
      { id: 'snake-rope', topics: ['fear', 'illusion'] }
    );

    expect(story.triggers).toEqual(['fear', 'illusion']);
    expect(story.content).toBe('A classic story.\n\nA man sees a snake.');
  });

  it('flattens object-shaped content and falls back to tags (Maya, Peter)', () => {
    const story = normalizeBundleStory(
      { id: 'x', story: { setup: 'Start.', lesson: 'End.' }, tags: ['sleep'] },
      { id: 'x' }
    );

    expect(story).toMatchObject({ triggers: ['sleep'], content: 'Start.\n\nEnd.' });
  });

  it('keeps a canonical story as written', () => {
    const story = normalizeBundleStory(
      { id: 'y', content: 'Text.', triggers: ['a'], category: 'personal' },
      { id: 'y', triggers: ['b'] }
    );

    expect(story).toEqual({ id: 'y', content: 'Text.', triggers: ['a'], category: 'personal' });
  });

  it('never returns undefined triggers or content for a malformed file', () => {
    const story = normalizeBundleStory(null, { id: 'z' });

    expect(story).toMatchObject({ id: 'z', triggers: [], content: '' });
  });
});
