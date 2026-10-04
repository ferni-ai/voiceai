import { describe, expect, it } from 'vitest';

import { leverModes, speechDirectorMode } from '../gate.js';

describe('speechDirectorMode', () => {
  it('defaults to off', () => {
    expect(speechDirectorMode({})).toBe('off');
  });

  it('reads shadow and live', () => {
    expect(speechDirectorMode({ SPEECH_DIRECTOR: 'shadow' })).toBe('shadow');
    expect(speechDirectorMode({ SPEECH_DIRECTOR: 'live' })).toBe('live');
    expect(speechDirectorMode({ SPEECH_DIRECTOR: ' LIVE ' })).toBe('live');
  });

  it('treats anything unknown as off', () => {
    expect(speechDirectorMode({ SPEECH_DIRECTOR: 'on' })).toBe('off');
    expect(speechDirectorMode({ SPEECH_DIRECTOR: 'true' })).toBe('off');
  });
});

describe('leverModes', () => {
  it('follows the global mode when no lever is overridden', () => {
    expect(leverModes({ SPEECH_DIRECTOR: 'live' })).toEqual({
      phrasing: 'live',
      pauses: 'live',
      normalize: 'live',
      emotion: 'live',
      pacing: 'live',
      // Opt-in levers stay off until set (stream D).
      nonverbal: 'off',
      laughter: 'off',
    });
  });

  it('lets a lever drop below the global mode', () => {
    const modes = leverModes({
      SPEECH_DIRECTOR: 'live',
      SPEECH_DIRECTOR_PACING: 'shadow',
      SPEECH_DIRECTOR_EMOTION: 'off',
    });
    expect(modes.pacing).toBe('shadow');
    expect(modes.emotion).toBe('off');
    expect(modes.phrasing).toBe('live');
  });

  it('never lets a lever exceed the global mode', () => {
    const modes = leverModes({ SPEECH_DIRECTOR: 'shadow', SPEECH_DIRECTOR_PHRASING: 'live' });
    expect(modes.phrasing).toBe('shadow');
    expect(leverModes({ SPEECH_DIRECTOR_PHRASING: 'live' }).phrasing).toBe('off');
  });
});
