import { describe, expect, it } from 'vitest';
import { calmGreeting } from '../orchestrator.js';

describe('calmGreeting', () => {
  it('takes the exclamation marks out of a greeting', () => {
    expect(calmGreeting('Hey Sam! Good morning! How are you doing?')).toBe(
      'Hey Sam. Good morning. How are you doing?'
    );
    expect(calmGreeting('Hey!!')).toBe('Hey.');
    expect(calmGreeting("Hey. What's up?")).toBe("Hey. What's up?");
  });
});
