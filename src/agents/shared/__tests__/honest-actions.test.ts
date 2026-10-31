/**
 * PROMPT_HONEST_ACTIONS (honest-actions.ts): tool guidance that never asks a
 * persona to claim an action no tool ran, and no UTC clock read out as the
 * caller's time. Off: the prompts are what they were.
 *
 * Real calls 2026-10-21/22 (bth-calls-broken C4, C6): a persona said it was
 * placing a call that no tool placed, and told the owner a UTC time.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadSystemPrompt, loadToolUsageGuidancePrompt } from '../../personas/prompt-loader.js';
import { honestActionsEnabled, honestVariant } from '../honest-actions.js';
import { rightNowLine, unknownZoneLine, worldNowNote } from '../world-now.js';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../../personas/bundles');
const read = (rel: string): string => readFileSync(join(BUNDLES, rel), 'utf-8');
const guidance = (id: string, honest = false): string =>
  read(`${id}/identity/tool-usage-guidance${honest ? '.honest' : ''}.md`);
const shared = (honest = false): string =>
  read(`shared/shared-capabilities${honest ? '.honest' : ''}.md`);

const COACHES = ['maya-santos', 'alex-chen', 'jordan-taylor', 'peter-john', 'nayan-patel'];

/** The live lines the flag takes out, per file (live-prompt-audit rows 1-4). */
const OLD = {
  ferniCall:
    'When user asks you to call someone, invoke `callOnBehalf`. You will be spawned into a call and talk to them directly. After the call, report back what happened.',
  ferniAway:
    'You can work when user is disconnected: on-behalf calls, commitment checks, thinking-of-you moments. When they reconnect, weave results naturally into your greeting.',
  ferniCantCall: `- Never say "I can't make calls" - you can and will handle the conversation`,
  ferniNeverRefuse:
    '- Never refuse to act on a clear request - if they want music, play it; if they want a call, make it',
  coachNeverRefuse:
    '- Never refuse to act on a clear request - do it with the tool, explain if asked',
  shared:
    "Whoever is on the call can play, pause and change music, set timers and alarms, set reminders, check the weather, and remember things. None of these is anyone's specialty, so they're yours too: when someone asks, call the tool and say what it did. Don't hand off for them or say they're someone else's thing, and don't say you can't until a tool has told you so.",
};

/** Calls and texts are read back by the tool itself (outreach-confirm.ts), so no second read-back. */
const CONFIRM =
  "For a call or text, the tool's first result reads it back and sends nothing: say that read-back, wait for a yes, then call the tool again.";

const lines = (text: string): string[] => text.split('\n');
/** Lines of `base` that `variant` dropped or rewrote. */
const dropped = (base: string, variant: string): string[] =>
  lines(base).filter((l) => !lines(variant).includes(l));

beforeEach(() => {
  vi.stubEnv('PROMPT_MODE', 'character');
  vi.stubEnv('PERSONA_SPARK', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the flag', () => {
  it('is off by default and names the .honest.md sibling only when on', () => {
    expect(honestActionsEnabled({})).toBe(false);
    expect(honestVariant('shared-capabilities.md', {})).toBe('shared-capabilities.md');
    expect(honestVariant('identity/tool-usage-guidance.md', { PROMPT_HONEST_ACTIONS: 'on' })).toBe(
      'identity/tool-usage-guidance.honest.md'
    );
  });
});

describe.each(['ferni', 'maya-santos'])('%s system prompt, flag off', (id) => {
  it('is the same text unset and off, with the base guidance files verbatim', async () => {
    const unset = await loadSystemPrompt(id);
    vi.stubEnv('PROMPT_HONEST_ACTIONS', 'off');
    const off = await loadSystemPrompt(id);
    expect(off).toBe(unset);
    expect(off).toContain(`\n\n---\n\n${guidance(id)}\n\n${shared()}`);
    expect(off).toContain(OLD.shared);
    expect(off).not.toContain('read it back');
  });
});

describe('flag on', () => {
  beforeEach(() => {
    vi.stubEnv('PROMPT_HONEST_ACTIONS', 'on');
  });

  it("Ferni reads a call back, waits for a yes, and says so when the tool isn't there", async () => {
    const prompt = await loadSystemPrompt('ferni');
    expect(prompt).toContain(`\n\n---\n\n${guidance('ferni', true)}\n\n${shared(true)}`);
    // outreach-confirm.ts: the first callOnBehalf only reads back; the yes, then a second call, sends.
    expect(prompt).toContain(
      "Its first result reads back who you'll call and what you'll say, and places nothing: say that to them, wait for a yes, then invoke it again."
    );
    expect(prompt).toContain(CONFIRM);
    expect(prompt).toContain("If `callOnBehalf` isn't on this call, say plainly");
    expect(prompt).toContain(
      "Never say you're calling, texting or booking, or that you did, unless the tool ran"
    );
    expect(prompt).toContain('mention only results a tool or your notes actually show');
    for (const old of [OLD.ferniCall, OLD.ferniAway, OLD.ferniCantCall, OLD.ferniNeverRefuse]) {
      expect(prompt).not.toContain(old);
    }
    expect(prompt).not.toContain('if they want a call, make it');
    expect(prompt).not.toContain("don't say you can't until a tool has told you so");
  });

  it.each(COACHES)("%s says so plainly when the tool isn't on this call", async (id) => {
    const prompt = await loadSystemPrompt(id);
    expect(prompt).toContain(
      "if the tool isn't on this call, say so plainly, and never say you're doing it"
    );
    expect(prompt).toContain(CONFIRM);
    expect(prompt).toContain("never say it's done unless the tool ran");
    expect(prompt).not.toContain('Never refuse to act on a clear request');
    expect(prompt).not.toContain("don't say you can't until a tool has told you so");
  });

  it('a legend with no guidance of its own still gets the honest shared capabilities', async () => {
    expect(await loadToolUsageGuidancePrompt('john-bogle')).toBe(shared(true));
  });
});

describe('the .honest.md variants stay in step with their base files', () => {
  const withGuidance = readdirSync(BUNDLES).filter((d) =>
    existsSync(join(BUNDLES, d, 'identity/tool-usage-guidance.md'))
  );

  it('every persona with tool guidance has an honest variant', () => {
    expect(withGuidance.sort()).toEqual(['ferni', ...COACHES].sort());
  });

  it('Ferni changes only the call, away-time and two guardrail lines', () => {
    expect(dropped(guidance('ferni'), guidance('ferni', true))).toEqual([
      OLD.ferniCall,
      OLD.ferniAway,
      OLD.ferniCantCall,
      OLD.ferniNeverRefuse,
    ]);
  });

  it.each(COACHES)('%s changes only the never-refuse guardrail', (id) => {
    expect(dropped(guidance(id), guidance(id, true))).toEqual([OLD.coachNeverRefuse]);
  });

  it('shared capabilities changes only its one paragraph', () => {
    expect(dropped(shared(), shared(true))).toEqual([OLD.shared]);
  });
});

describe('Right now, caller zone unknown', () => {
  const CLOCK = /\d{1,2}:\d{2}|\b[AP]M\b|UTC/;
  const WEEKDAY = /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/;
  // 3:18 pm Eastern, Sunday Oct 11 2026 (world-now.test.ts).
  const AT = new Date('2026-10-11T19:18:00Z');

  it('flag off: the line is what it was', () => {
    expect(rightNowLine({ now: AT })).toBe(
      "Right now: Sunday, Oct 11, 7:18 PM UTC; the caller's local time is unknown, so ask before assuming it."
    );
  });

  describe('flag on', () => {
    beforeEach(() => {
      vi.stubEnv('PROMPT_HONEST_ACTIONS', 'on');
    });

    it('gives no clock time at any hour of two days, with or without the hour said', () => {
      for (let m = 0; m < 48 * 60; m += 20) {
        const now = new Date(AT.getTime() + m * 60_000);
        for (const hourSaid of [false, true]) {
          const line = rightNowLine({ now, hourSaid });
          expect(line).not.toMatch(CLOCK);
          expect(line).toMatch(/the caller's local time is unknown/i);
        }
      }
    });

    it("gives the US weekday, not UTC's: 11:55 pm Eastern Sunday is Sunday", () => {
      const line = rightNowLine({ now: new Date('2026-10-12T03:55:00Z') });
      expect(line).toBe(
        "Right now: Sunday. The caller's local time is unknown, so ask before saying a time or part of the day."
      );
    });

    it('gives no day when it is Monday in Puerto Rico and still Sunday in Hawaii', () => {
      const line = unknownZoneLine(new Date('2026-10-12T09:30:00Z'));
      expect(line).not.toMatch(WEEKDAY);
      expect(line).not.toMatch(CLOCK);
    });

    it("keeps Ferni's own clock, labelled as his, and nothing else", () => {
      const line = rightNowLine({ now: AT, ferniClock: true });
      expect(line.replace('For you: 1:18 PM mountain.', '')).not.toMatch(CLOCK);
    });

    it('the turn note for a phone call with no zone has no clock', () => {
      vi.stubEnv('WORLD_NOW', 'on');
      vi.stubEnv('FERNI_LOCAL_CLOCK', 'off');
      const note = worldNowNote({ userData: {} }, AT);
      expect(note).toMatch(/the caller's local time is unknown/i);
      expect(note).not.toMatch(CLOCK);
    });

    it('a known zone is unchanged', () => {
      const line = rightNowLine({ now: AT, callerZone: 'America/New_York' });
      expect(line).toBe('Right now for the caller: Sunday, Oct 11, 3:18 PM EDT, afternoon.');
    });
  });
});
