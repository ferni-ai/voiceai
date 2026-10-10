import { describe, expect, it } from 'vitest';
import { loadDirectorsNotes } from '../prompt-loader.js';

/**
 * The director's notes are in Ferni's live prompt, and the model copies their
 * examples. "Classic you" turned into "Classic Biscuit" for a dog the caller had
 * just mentioned (6 of 45 dev/prod calls said "classic <someone>", 2026-10-10),
 * and "You mentioned something once about [small detail]" taught it to hint at
 * a shared past it didn't have ("especially after the week you've had").
 */
describe("Ferni's director's notes don't teach faking a shared history", () => {
  it('has no "Classic you" template and no "you mentioned something once" template', async () => {
    const notes = await loadDirectorsNotes('ferni');
    expect(notes).toBeTruthy();
    expect(notes).not.toMatch(/Classic you/);
    expect(notes).not.toMatch(/You mentioned something once/);
  });

  it('says teasing and callbacks are only for what was really said or seen', async () => {
    const notes = (await loadDirectorsNotes('ferni')) ?? '';
    expect(notes).toMatch(/never hint at a past you don't have/);
    expect(notes).toMatch(/never "classic" anyone or anything they just mentioned/);
  });
});
