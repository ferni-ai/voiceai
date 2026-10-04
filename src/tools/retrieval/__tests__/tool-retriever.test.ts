import { describe, expect, it } from 'vitest';
import { ToolRetriever, type IntentManual } from '../tool-retriever.js';

const manual: IntentManual = {
  tools: {
    setTimer: {
      domain: 'simple-utilities',
      description: 'Start a countdown timer.',
      queries: [
        'set a timer for ten minutes',
        'the pasta needs ten minutes, keep track',
        'countdown please',
      ],
    },
    playMusic: {
      domain: 'entertainment',
      description: 'Play songs, artists or genres.',
      queries: ['put on some jazz', 'play something upbeat', 'I want to hear Taylor Swift'],
    },
    getWeather: {
      domain: 'information',
      description: 'Current weather for a place.',
      queries: ['do I need an umbrella', 'how hot is it outside', 'is it going to rain today'],
    },
  },
};

describe('ToolRetriever', () => {
  const r = new ToolRetriever(manual);

  it('finds the tool from how people ask, not only the tool name', () => {
    expect(r.retrieve('keep track of the pasta for me', 1)[0].tool).toBe('setTimer');
    expect(r.retrieve('put some jazz on', 1)[0].tool).toBe('playMusic');
    expect(r.retrieve('will it rain later', 1)[0].tool).toBe('getWeather');
  });

  it('uses the name and description when no example matches', () => {
    expect(r.retrieve('weather', 1)[0].tool).toBe('getWeather');
  });

  it('returns at most k tools, best first', () => {
    const got = r.retrieve('play jazz and set a timer', 2);
    expect(got).toHaveLength(2);
    expect(got[0].score).toBeGreaterThanOrEqual(got[1].score);
  });
});
