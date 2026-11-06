/**
 * Test support: the words a refused emergency or N11 number gets, by class
 * (utils/dialable-number.ts). An emergency number (911, 988, 112, 999, 000, 933) keeps
 * the safety kernel's in-danger words, read from the kernel, not copied; a service
 * number (211 to 811) is plain, with nothing about crisis or emergencies.
 */
import { expect } from 'vitest';
import { IN_DANGER_NOW } from '../../services/safety/crisis-guard-replies.js';

const IN_DANGER = IN_DANGER_NOW.replace(/\.$/, '');

/** `number` is the three digits refused, e.g. "911" or "311". */
export function saysDialItYourself(text: string | undefined, number: string): void {
  expect(text).toContain(`dial ${number} themselves`);
  if (/^[2-8]11$/.test(number)) {
    expect(text).toContain(`${number} is a service number Ferni can't dial`);
    expect(text).not.toContain(IN_DANGER);
    expect(text).not.toMatch(/crisis|emergency|danger/i);
  } else {
    expect(text).toContain(`${number} is an emergency number`);
    expect(text).toContain("Ferni can't place emergency calls");
    expect(text).toContain(IN_DANGER);
  }
}

/** Numbers that only contain an emergency code, or end in one: every path must dial them. */
export const LOOK_ALIKES = ['+1 212 911 0100', '202-555-0911', '1-800-273-0100'] as const;
