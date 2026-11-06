import { describe, expect, it } from 'vitest';

import * as LINES from '../crisis-lines.js';
import { CRISIS_RESOURCES } from '../crisis-response.js';

const entries = Object.values(CRISIS_RESOURCES).flat();

describe('crisis lines', () => {
  it('are CRISIS_RESOURCES entries, not copies', () => {
    for (const line of Object.values(LINES)) expect(entries).toContain(line);
  });

  it('carry the numbers callers print', () => {
    expect(LINES.LIFELINE_988).toMatchObject({
      name: '988 Suicide & Crisis Lifeline',
      phone: '988',
      text: 'Text 988',
      chat: 'https://988lifeline.org/chat',
    });
    expect(LINES.CRISIS_TEXT_LINE.text).toBe('Text HOME to 741741');
    expect(LINES.DOMESTIC_VIOLENCE_HOTLINE).toMatchObject({
      phone: '1-800-799-7233',
      text: 'Text START to 88788',
    });
    expect(LINES.SUBSTANCE_HELPLINE.phone).toBe('1-800-662-4357');
    expect(LINES.CHILD_ABUSE_HOTLINE.phone).toBe('1-800-422-4453');
  });

  it('give each name and number one line, so a rewrite back to a reference is unambiguous', () => {
    const values = Object.values(LINES).flatMap((l) =>
      [l.name, l.phone, l.text, l.chat].filter((v): v is string => typeof v === 'string')
    );
    expect(new Set(values).size).toBe(values.length);
  });
});
