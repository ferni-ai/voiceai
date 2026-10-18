/**
 * FERNI_LIGHT_TOUCH on the director: "sounding upbeat" is no longer a habit
 * it tells Ferni to drop (23% of prod notes leaned soft), and staying flat or
 * serious when the caller is being light is. Off, the prompt is unchanged.
 */
import { describe, expect, it } from 'vitest';

import { DIRECTOR_SYSTEM, directorSystem } from '../director-notes.js';

const ON = { FERNI_LIGHT_TOUCH: 'on' };

describe('director prompt with FERNI_LIGHT_TOUCH', () => {
  it('is byte-identical to the old prompt with the flag off', () => {
    expect(directorSystem({})).toBe(DIRECTOR_SYSTEM);
    expect(directorSystem({ FERNI_LIGHT_TOUCH: 'off' })).toBe(DIRECTOR_SYSTEM);
    expect(DIRECTOR_SYSTEM).toContain('sounding upbeat');
  });

  it('no longer lists sounding upbeat as a habit to drop', () => {
    expect(directorSystem(ON)).not.toMatch(/upbeat/);
    expect(directorSystem({ ...ON, DIRECTOR_LOOK_BACK: 'on' })).not.toMatch(/upbeat/);
  });

  it("adds staying flat or serious when they're being light as a habit to drop", () => {
    const habit = "staying flat or serious when they're being light";
    expect(directorSystem(ON)).toContain(habit);
    expect(directorSystem({ ...ON, DIRECTOR_LOOK_BACK: 'on' })).toContain(habit);
    expect(directorSystem({})).not.toContain(habit);
  });

  it('changes only the habit list', () => {
    const off = directorSystem({}).split('\n');
    const on = directorSystem(ON).split('\n');
    expect(on).toHaveLength(off.length);
    expect(on.filter((line, i) => line !== off[i])).toHaveLength(1);
  });
});
