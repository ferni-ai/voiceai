import { describe, expect, it, vi } from 'vitest';

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

  it('are the first CRISIS_RESOURCES entry with their name', () => {
    for (const line of Object.values(LINES))
      expect(line).toBe(entries.find((r) => r.name === line.name));
  });

  it('throw on load when the first entry with a name lacks a field, instead of reading a later one', async () => {
    // A later entry with the same name still has the field, so falling through would load.
    expect(entries.filter((r) => r.name === 'NAMI Helpline' && r.phone).length).toBeGreaterThan(1);
    const load = async (emptyFirstNamiPhone: boolean) => {
      vi.resetModules();
      vi.doMock('../crisis-response.js', async (importOriginal) => {
        const real = await importOriginal<typeof import('../crisis-response.js')>();
        let first = emptyFirstNamiPhone;
        const resources = Object.fromEntries(
          Object.entries(real.CRISIS_RESOURCES).map(([type, list]) => [
            type,
            list.map((r) => {
              if (!first || r.name !== 'NAMI Helpline') return r;
              first = false;
              return { ...r, phone: '' };
            }),
          ])
        );
        return { ...real, CRISIS_RESOURCES: resources };
      });
      try {
        return await import('../crisis-lines.js');
      } finally {
        vi.doUnmock('../crisis-response.js');
        vi.resetModules();
      }
    };
    await expect(load(false)).resolves.toHaveProperty('MENTAL_HEALTH_HELPLINE');
    await expect(load(true)).rejects.toThrow('first "NAMI Helpline" entry has no phone');
  });
});
