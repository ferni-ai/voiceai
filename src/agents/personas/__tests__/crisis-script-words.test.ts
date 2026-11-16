/**
 * The crisis script words a caller can hear, pinned whole. Each turn below runs through the real
 * scriptReply (CRISIS_SCRIPT_IMMINENT_READ on) with a stub read, joined as the caller hears it,
 * and must match its block in crisis-script-words.kept.md byte for byte. The kept file is this
 * enumerator's output; a hand edit fails even under a new stamp.
 *
 * The turns the flag can change are here in full: the 988 script (severe, high) with
 * CRISIS_SELF_HARM_911_LINE off and on, the youth line (MINOR_CRISIS_CARE) and the child-safety
 * lines (MINOR_ABUSE_DISCLOSURE) as crisisScriptFor adds them, and each read outcome: kept,
 * swapped (an imminent read inside the hold) and added (one while the rest is said). The scripts
 * the read never touches ("what never asks" in crisis-script-imminent.test.ts) are here in their
 * plain form.
 *
 * To rewrite the kept file after a deliberate wording change:
 *   CRISIS_SCRIPT_WORDS_WRITE=1 pnpm vitest run src/agents/personas/__tests__/crisis-script-words.test.ts
 * It writes `reviewed: none`; the owner reviews the new words before anyone stamps them.
 */
import { writeFileSync, readFileSync } from 'fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CRISIS_SCRIPT_IMMINENT_READ } from '../../../config/flags/CRISIS_SCRIPT_IMMINENT_READ.js';
import { forThemFirst, withCallerCheck } from '../../../services/safety/crisis-caller-check.js';
import {
  EMERGENCY_FOR_THEM,
  getCrisisResponse,
  LATE_911_LINE,
  namesCrisisLine,
} from '../../../services/safety/crisis-guard-replies.js';
import { childSafetyScript } from '../../../services/safety/minor-abuse-disclosure.js';
import { withYouthLine } from '../../../utils/minor-crisis-care.js';
import { scriptReply, type ScriptRead } from '../crisis-script-imminent.js';
import {
  flipAllowed,
  KEPT_PATH,
  splitKept,
  stamped,
  stampOf,
  type KeptStamp,
} from './crisis-script-words-kept.js';

const ON = { CRISIS_SCRIPT_IMMINENT_READ: 'on' } as const;
const SEVERITIES = { severe: 0.9, high: 0.75 } as const;
const LINE_911 = { '911 line off': {}, '911 line on': { CRISIS_SELF_HARM_911_LINE: 'on' } };
/** Past every hold (the cap is 3000 ms) and inside every rest these scripts say. */
const LATE_AT_MS = 3100;

type Outcome = 'kept' | 'swapped' | 'added';
const OUTCOMES: readonly Outcome[] = ['kept', 'swapped', 'added'];

interface Turn {
  id: string;
  outcome: Outcome | 'never asks';
  text: string;
}

const IMMINENT = getCrisisResponse(SEVERITIES.severe, 'self', 'en', true);
const count911 = (text: string): number => text.match(/\b911\b/g)?.length ?? 0;

/** What crisisScriptFor adds after a script: the youth line, then the child-safety lines. */
const finishFor =
  (youth: boolean, child: boolean) =>
  (text: string): string => {
    const withYouth = youth ? withYouthLine(text) : text;
    return child ? childSafetyScript(withYouth) : withYouth;
  };

function readFor(outcome: Outcome): Promise<ScriptRead> {
  if (outcome === 'kept') return Promise.resolve({ read: 'crisis', imminent: false, script: null });
  const found: ScriptRead = { read: 'imminent', imminent: true, script: IMMINENT };
  if (outcome === 'swapped') return Promise.resolve(found);
  return new Promise((resolve) => {
    setTimeout(() => resolve(found), LATE_AT_MS);
  });
}

async function heard(stream: ReturnType<typeof scriptReply>): Promise<string> {
  let out = '';
  const reading = (async () => {
    for await (const chunk of stream as unknown as AsyncIterable<string>) out += chunk;
  })();
  await vi.advanceTimersByTimeAsync(60_000);
  await reading;
  return out;
}

/** Every turn, in a fixed order: the order the kept file lists them. */
async function enumerate(): Promise<Turn[]> {
  const turns: Turn[] = [];
  for (const [severity, value] of Object.entries(SEVERITIES)) {
    for (const [line, env] of Object.entries(LINE_911)) {
      for (const youth of [false, true]) {
        for (const child of [false, true]) {
          const finish = finishFor(youth, child);
          const script = finish(getCrisisResponse(value, 'self', 'en', false, env));
          for (const outcome of OUTCOMES) {
            const extras = [youth && 'youth line', child && 'child-safety lines'].filter(Boolean);
            const id = [`988 script, ${severity}`, line, ...extras, outcome].join(' · ');
            const text = await heard(scriptReply(script, readFor(outcome), finish, ON));
            turns.push({ id, outcome, text });
          }
        }
      }
    }
  }
  const untouched: Record<string, string> = {
    'imminent script (the patterns read imminent)': IMMINENT,
    'about someone else at risk': getCrisisResponse(SEVERITIES.severe, 'third_party', 'en', false),
    'Spanish script': getCrisisResponse(SEVERITIES.severe, 'self', 'es', false),
    'an emergency for someone else (down, not breathing)': EMERGENCY_FOR_THEM,
    'an emergency for someone else, then the caller check': withCallerCheck(EMERGENCY_FOR_THEM),
    'an emergency for someone else, then the caller’s own severe script': forThemFirst(
      getCrisisResponse(SEVERITIES.severe, 'self', 'en', false)
    ),
  };
  for (const [id, script] of Object.entries(untouched)) {
    const text = await heard(scriptReply(script, undefined, (t) => t, ON));
    turns.push({ id: `${id} · never asks`, outcome: 'never asks', text });
  }
  return turns;
}

const HEAD = `# Crisis script words a caller can hear

Every distinct voice turn the crisis gate can say in place of a reply, word for word, as the
caller hears it with CRISIS_SCRIPT_IMMINENT_READ on. crisis-script-words.test.ts writes this file
from the real scriptReply and fails when the code says anything else. Never edit it by hand: run
that test with CRISIS_SCRIPT_WORDS_WRITE=1, then ask the owner to review the new words.

The stamp below covers every block after it. It is \`none\` until the owner reviews these words;
a builder then writes it (reviewer, date, hash) in a commit of its own, after the owner approves
that commit's exact head. CRISIS_SCRIPT_IMMINENT_READ may default on only while it is current.

`;

/** Distinct texts in first-heard order, each with every turn that says it. */
function blocksOf(turns: Turn[]): Array<{ text: string; ids: string[] }> {
  const byText = new Map<string, string[]>();
  for (const turn of turns) byText.set(turn.text, [...(byText.get(turn.text) ?? []), turn.id]);
  return [...byText].map(([text, ids]) => ({ text, ids }));
}

function render(turns: Turn[]): string {
  const blocks = blocksOf(turns).map(
    ({ text, ids }, i) =>
      `\n## ${i + 1}. ${ids[0]}\n\nHeard on:\n\n${ids.map((id) => `- ${id}`).join('\n')}\n\n\`\`\`text\n${text}\n\`\`\`\n`
  );
  return `${HEAD}reviewed: none\n${blocks.join('')}`;
}

/** The fenced texts of a kept file, in order. */
const keptTexts = (file: string): string[] =>
  [...file.matchAll(/^```text\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);

let turns: Turn[] = [];
let expected = '';
let kept = '';

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  turns = await enumerate();
  vi.useRealTimers();
  expected = render(turns);
  if (process.env.CRISIS_SCRIPT_WORDS_WRITE === '1') writeFileSync(KEPT_PATH, expected);
  kept = readFileSync(KEPT_PATH, 'utf8');
});
afterAll(() => vi.useRealTimers());

describe('the kept file is this enumerator’s output', () => {
  it('every turn a caller can hear is a kept block, and every kept block is a turn', () => {
    const said = new Set(turns.map((t) => t.text));
    const keptSet = new Set(keptTexts(kept));
    const unkept = turns.filter((t) => !keptSet.has(t.text)).map((t) => t.id);
    const stale = [...keptSet].filter((text) => !said.has(text)).map((t) => t.slice(0, 80));
    expect({ unkept, stale }).toEqual({ unkept: [], stale: [] });
  });

  it('matches what the enumerator writes, byte for byte, above and below the stamp', () => {
    const want = splitKept(expected);
    const got = splitKept(kept);
    expect(got?.head).toBe(want?.head);
    expect(got?.blocks).toBe(want?.blocks);
  });

  it('carries no stamp yet, or a current one: a changed word needs the owner again', () => {
    const stamp = stampOf(kept);
    expect(['none', 'current'], JSON.stringify(stamp)).toContain(stamp.state);
  });
});

describe('the floors, on every turn', () => {
  it('every turn names 988 or 911', () => {
    const silent = turns.filter((t) => !namesCrisisLine(t.text)).map((t) => t.id);
    expect(silent).toEqual([]);
  });

  it('a swapped turn: the 988 script’s first sentence, then the imminent rest, 911 once', () => {
    const swapped = turns.filter((t) => t.outcome === 'swapped');
    expect(swapped).toHaveLength(16);
    for (const turn of swapped) {
      expect(turn.text, turn.id).toMatch(/^I (hear|can hear) how /);
      expect(turn.text, turn.id).toContain('Your safety matters most right now.');
      expect(count911(turn.text), turn.id).toBe(1);
    }
  });

  it('an added turn: the whole 988 turn, then the late line last, 911 once', () => {
    const added = turns.filter((t) => t.outcome === 'added');
    expect(added).toHaveLength(16);
    for (const turn of added) {
      const keptTurn = turns.find((t) => t.id === turn.id.replace(/added$/, 'kept'));
      if (!keptTurn) throw new Error(`no kept turn for ${turn.id}`);
      const want = count911(keptTurn.text) ? keptTurn.text : `${keptTurn.text} ${LATE_911_LINE}`;
      expect(turn.text, turn.id).toBe(want);
      expect(count911(turn.text), turn.id).toBe(1);
    }
  });
});

describe('every axis changes the words (none of them is a no-op here)', () => {
  const textOf = (id: string): string => {
    const turn = turns.find((t) => t.id === id);
    if (!turn) throw new Error(`no turn ${id}`);
    return turn.text;
  };
  const base = '988 script, severe · 911 line off';

  it('severity, the 911 line, the youth line, the child-safety lines and each outcome', () => {
    const variants = [
      `${base} · kept`,
      `988 script, high · 911 line off · kept`,
      `988 script, severe · 911 line on · kept`,
      `${base} · youth line · kept`,
      `${base} · child-safety lines · kept`,
      `${base} · swapped`,
      `${base} · added`,
    ].map(textOf);
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe('the stamp', () => {
  const none = (): string => expected;

  it('a stamp on the current blocks is current, and records who and when', () => {
    expect(stampOf(stamped(none(), 'a-reviewer', '2026-11-16'))).toEqual({
      state: 'current',
      reviewer: 'a-reviewer',
      date: '2026-11-16',
    });
  });

  it('one changed word after the stamp makes it stale', () => {
    const file = stamped(none(), 'a-reviewer', '2026-11-16').replace('Your safety', 'Your Safety');
    expect(stampOf(file).state).toBe('stale');
  });

  it('a missing or unreadable stamp line is malformed, never current', () => {
    expect(stampOf(none().replace('reviewed: none\n', '')).state).toBe('malformed');
    expect(stampOf(none().replace('reviewed: none', 'reviewed: yes')).state).toBe('malformed');
  });
});

describe('the flip gate: CRISIS_SCRIPT_IMMINENT_READ defaults on only under a current stamp', () => {
  const states: Record<KeptStamp['state'], KeptStamp> = {
    none: { state: 'none' },
    current: { state: 'current', reviewer: 'r', date: '2026-11-16' },
    stale: { state: 'stale', reviewer: 'r', date: '2026-11-16' },
    malformed: { state: 'malformed', why: 'x' },
  };

  it('on needs current; off and shadow say today’s words and need nothing', () => {
    const on = Object.values(states).map((s) => flipAllowed('on', s));
    expect(on).toEqual([false, true, false, false]);
    for (const mode of ['off', 'shadow']) {
      expect(Object.values(states).every((s) => flipAllowed(mode, s))).toBe(true);
    }
  });

  it("the flag's manifest default passes the gate against the kept file's stamp", () => {
    expect(flipAllowed(CRISIS_SCRIPT_IMMINENT_READ.default, stampOf(kept))).toBe(true);
  });
});
