/**
 * The "Who You're Talking To" block, moved out of agent-setup.ts. With no card it must be
 * the block agent-setup built at main, byte for byte (GOLDEN is that template, copied from
 * origin/main 80331144d agent-setup.ts:492-501). Fictional caller only.
 */
import { describe, expect, it } from 'vitest';
import { whoYoureTalkingTo } from '../who-block.js';

const LINES = ["You're talking to Riley.", "You've talked once before."];

const GOLDEN = `
---

## Who You're Talking To

You're talking to Riley.
You've talked once before.

Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.
Reference past context when relevant, but don't force it. Let the conversation flow.
`;

const CARD = [
  'What you know about them (private; never read it out):',
  '- Home: Maplewood.',
  'Use this like a friend would. Do not raise any of it unless they do or your hello already did.',
].join('\n');

describe('whoYoureTalkingTo', () => {
  it('with no card, is the block agent-setup built at main, byte for byte', () => {
    expect(whoYoureTalkingTo(LINES, null)).toBe(GOLDEN);
  });

  it('with nothing known and no card, adds nothing (as main did)', () => {
    expect(whoYoureTalkingTo([], null)).toBe('');
  });

  it('puts the card after the profile lines, before the closing rule', () => {
    const out = whoYoureTalkingTo(LINES, CARD);
    expect(out).toContain(`You've talked once before.\n\n${CARD}\n\nUse this awareness naturally.`);
  });

  it('renders the block for a card alone', () => {
    expect(whoYoureTalkingTo([], CARD)).toContain(`## Who You're Talking To\n\n${CARD}\n\n`);
  });
});
