/**
 * ALEX_CHIEF_OF_STAFF=on: Alex's prompt carries identity/chief-of-staff.md
 * (chief-of-staff-role.ts). Off, or for anyone else, the prompt is as loaded.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHIEF_OF_STAFF_FILE, withChiefOfStaffRole } from '../chief-of-staff-role.js';

const PROMPT = '# Alex\nYou are Alex.\n';
const role = readFileSync(
  new URL(`../../../personas/bundles/alex-chen/${CHIEF_OF_STAFF_FILE}`, import.meta.url),
  'utf8'
);

afterEach(() => vi.unstubAllEnvs());

describe("Alex's chief-of-staff role", () => {
  it('is not in the prompt while the flag is off', async () => {
    expect(await withChiefOfStaffRole('alex-chen', PROMPT)).toBe(PROMPT);
  });

  it("follows Alex's prompt while it is on, and no one else's", async () => {
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
    expect(await withChiefOfStaffRole('alex-chen', PROMPT)).toBe(`${PROMPT}\n${role.trim()}\n`);
    expect(await withChiefOfStaffRole('ferni', PROMPT)).toBe(PROMPT);
    expect(await withChiefOfStaffRole('maya-santos', PROMPT)).toBe(PROMPT);
  });

  it('says what a chief of staff does: one thing first, top 3, read back, one question, Ferni for feelings, the week', () => {
    expect(role).toMatch(/one thing that matters most today/);
    expect(role).toMatch(/Three things at most/);
    expect(role).toMatch(/read it back/);
    expect(role).toMatch(/one clarifying question at most/i);
    expect(role).toMatch(/offer Ferni/);
    expect(role).toMatch(/"let's do my week", "weekly review"/);
    expect(role).toMatch(/tasks, their goals and their calendar/);
  });

  it('follows the persona text rules: short, no em dashes or ellipses, no "AI"', () => {
    expect(role.trim().split('\n').length).toBeLessThanOrEqual(40);
    expect(role).not.toMatch(/—|–|\.\.\.|…/);
    expect(role).not.toMatch(/\bAI\b/);
  });
});
