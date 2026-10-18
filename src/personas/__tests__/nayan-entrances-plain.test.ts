/**
 * Nayan's arrival lines are plain speech. character.md: he "never performs being
 * wise" and is "not a guru". The persona audit (2026-10-17) found the fallback
 * and acknowledgment lines in entrances.json saying things like "The seeking
 * itself brought you here" and "So we meet"; on a prod handoff the spoken line
 * came from these (alive-entrances.ts static fallback).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entrances = JSON.parse(
  readFileSync(
    new URL('../bundles/nayan-patel/content/behaviors/entrances.json', import.meta.url),
    'utf8'
  )
) as { static_fallback: string[]; acknowledgments: string[] };

const GURU_TALK =
  /seek(ing|er)|stirring|awake|So we meet|You've come|explore|unfold|the real guru|consciousness|the universe/i;

const spoken = (line: string): string => line.replace(/<[^>]+>|\[laughter\]/g, '').trim();

describe("Nayan's arrival lines", () => {
  it('read as plain, warm speech, not a guru performing wisdom', () => {
    const lines = [...entrances.static_fallback, ...entrances.acknowledgments];
    expect(entrances.static_fallback.length).toBeGreaterThan(2);
    expect(entrances.acknowledgments.length).toBeGreaterThan(2);
    expect(lines.map(spoken).filter((line) => GURU_TALK.test(line))).toEqual([]);
  });

  it('the check catches the old lines', () => {
    expect(GURU_TALK.test('The seeking itself brought you here.')).toBe(true);
    expect(GURU_TALK.test('So we meet.')).toBe(true);
    expect(GURU_TALK.test("Hello. Good to hear you. What's going on?")).toBe(false);
  });
});
