/**
 * The crisis script words a caller can hear, each turn composed as gatedReply composes it: the
 * real scriptRead (only the classifier's generate stubbed), scriptReply, crisisScriptFor (its
 * minor lines driven by fictional caller words) and detectCrisis. Each must match its block in
 * crisis-script-words.kept.md byte for byte. After a deliberate wording change, rewrite that file
 * (it writes `reviewed: none`; a hand edit fails even under a new stamp) and ask a crisis owner:
 *   CRISIS_SCRIPT_WORDS_WRITE=1 pnpm vitest run src/agents/personas/__tests__/crisis-script-words.test.ts
 */
import { llm } from '@livekit/agents';
import { readFileSync, writeFileSync } from 'fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CRISIS_SCRIPT_IMMINENT_READ } from '../../../config/flags/CRISIS_SCRIPT_IMMINENT_READ.js';
import { forThemFirst, withCallerCheck } from '../../../services/safety/crisis-caller-check.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { detectCrisis, type CrisisDetectionResult } from '../../../services/safety/crisis-guard.js';
import {
  EMERGENCY_FOR_THEM,
  getCrisisResponse,
  LATE_911_LINE,
  namesCrisisLine,
} from '../../../services/safety/crisis-guard-replies.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { crisisScriptFor } from '../crisis-gate-words.js';
import { scriptRead, scriptReply } from '../crisis-script-imminent.js';
import {
  crisisOwners,
  flipAllowed,
  KEPT_PATH,
  splitKept,
  stamped,
  stampOf,
  type KeptStamp,
} from './crisis-script-words-kept.js';

type Vars = Record<string, string | undefined>;

const LIVE_ON = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_SCRIPT_IMMINENT_READ: 'on' } as const;
const SEVERITIES = { severe: 0.9, high: 0.75 } as const;
const LINE_911 = { '911 line off': {}, '911 line on': { CRISIS_SELF_HARM_911_LINE: 'on' } };
/** Past every hold (the cap is 3000 ms) and inside every rest these scripts say. */
const LATE_AT_MS = 3100;

type Outcome = 'kept' | 'swapped' | 'added';
const OUTCOMES: readonly Outcome[] = ['kept', 'swapped', 'added'];

/** The classifier's model call, for each outcome: a crisis read, or an imminent one in or late. */
const generateFor =
  (outcome: Outcome): CrisisGenerateFn =>
  async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, outcome === 'added' ? LATE_AT_MS : 300);
    });
    return JSON.stringify({ risk: outcome === 'kept' ? 'crisis' : 'imminent', subject: 'self' });
  };

/** Fictional caller words: an adult, a caller under 18, and one who also tells of harm. */
const SAID = {
  adult: 'I want to kill myself.',
  youth: "I'm 14 years old and I want to kill myself.",
  harm: "I'm 14 years old, my uncle touches me at night, and I want to kill myself.",
};
const ADULT = { youth: false, child: false };
type Minor = typeof ADULT;
const MINORS: readonly Minor[] = [false, true].flatMap((youth) =>
  [false, true].map((child) => ({ youth, child }))
);
const extras = ({ youth, child }: Minor): string[] =>
  [youth ? 'youth line' : '', child ? 'child-safety lines' : ''].filter(Boolean);

/** The gate's read of a turn the patterns script with getCrisisResponse(...args). */
const scripted = (...args: Parameters<typeof getCrisisResponse>): CrisisDetectionResult => {
  const [severity, subject, language] = args;
  const suggestedResponse = getCrisisResponse(...args);
  return { isCrisis: true, indicators: [], severity, subject, language, suggestedResponse };
};

/** Fictional lines for detectCrisis's wrappers, and the wrapper each must come out in. */
const WRAPPED: Array<[string, string, (d: CrisisDetectionResult) => string]> = [
  [
    'an emergency for someone else (down, not breathing)',
    "my uncle just collapsed and he isn't breathing",
    () => EMERGENCY_FOR_THEM,
  ],
  [
    'an emergency for someone else, then the caller check',
    "my sister fainted and i don't want to die",
    () => withCallerCheck(EMERGENCY_FOR_THEM),
  ],
  [
    'an emergency for someone else, then the caller’s own severe script',
    'my husband just fainted and i want to kill myself',
    (d) => forThemFirst(getCrisisResponse(d.severity, 'self', 'en', false, {})),
  ],
];

interface Turn {
  id: string;
  outcome: Outcome | 'never asks';
  text: string;
  asked: boolean; // the real scriptRead returned a read
}

const count911 = (text: string): number => text.match(/\b911\b/g)?.length ?? 0;

async function heard(stream: ReturnType<typeof scriptReply>): Promise<string> {
  let out = '';
  const reading = (async () => {
    for await (const chunk of stream as unknown as AsyncIterable<string>) out += chunk;
  })();
  await vi.advanceTimersByTimeAsync(60_000);
  await reading;
  return out;
}

let calls = 0;

/** One scripted turn as gatedReply says it; minorCrisisScript reads its flags from process.env. */
async function say(
  detection: CrisisDetectionResult,
  minor: Minor,
  env: Vars,
  generate: CrisisGenerateFn
): Promise<Pick<Turn, 'text' | 'asked'>> {
  vi.stubEnv('MINOR_CARE', minor.youth ? 'on' : 'off');
  vi.stubEnv('MINOR_CRISIS_CARE', minor.youth ? 'on' : 'off');
  const latest = minor.child ? SAID.harm : minor.youth ? SAID.youth : SAID.adult;
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'user', content: latest });
  const session = `crisis-script-words-${++calls}`;
  const gateEnv = { ...LIVE_ON, ...env, MINOR_ABUSE_DISCLOSURE: minor.child ? 'on' : 'off' };
  const finish = (text: string): string => crisisScriptFor(text, chatCtx, session, gateEnv);
  resetCrisisClassifierCache();
  const at = { pattern: 'block', env: gateEnv, generate } as const;
  const read = scriptRead({ latest, earlier: [] }, detection, { action: 'replace' }, at);
  const script = finish(detection.suggestedResponse ?? '');
  return { text: await heard(scriptReply(script, read, finish, gateEnv)), asked: !!read };
}

/** Every turn, in a fixed order: the order the kept file lists them. */
async function enumerate(): Promise<Turn[]> {
  const turns: Turn[] = [];
  for (const [severity, value] of Object.entries(SEVERITIES)) {
    for (const [line, env] of Object.entries(LINE_911)) {
      for (const minor of MINORS) {
        for (const outcome of OUTCOMES) {
          const id = [`988 script, ${severity}`, line, ...extras(minor), outcome].join(' · ');
          const read = scripted(value, 'self', 'en', false, env);
          turns.push({ id, outcome, ...(await say(read, minor, env, generateFor(outcome))) });
        }
      }
    }
  }
  // Never asks, with the stub that swaps a 988 turn: a read here would change the words.
  const never = async (id: string, read: CrisisDetectionResult, minor = ADULT): Promise<void> => {
    const said = await say(read, minor, {}, generateFor('swapped'));
    const ids = [id, ...extras(minor), 'never asks'];
    turns.push({ id: ids.join(' · '), outcome: 'never asks', ...said });
  };
  const severe = SEVERITIES.severe;
  // The imminent script as crisisScriptFor finishes it: the patterns' read and the escalation's.
  const imminent = scripted(severe, 'self', 'en', true);
  const imminentId = 'imminent script (the patterns read imminent)';
  for (const minor of MINORS) await never(imminentId, imminent, minor);
  await never('about someone else at risk', scripted(severe, 'third_party', 'en', false));
  await never('Spanish script', scripted(severe, 'self', 'es', false));
  for (const [id, line] of WRAPPED) await never(id, detectCrisis(line, undefined, { env: {} }));
  return turns;
}

const HEAD = `# Crisis script words a caller can hear

Every distinct voice turn the crisis gate can say in place of a reply, word for word, as sent to
the voice with CRISIS_SCRIPT_IMMINENT_READ on, before the 988-digit rewrite (SPEAK_988_DIGITS):
the text, not the audio. crisis-script-words.test.ts writes it from the real code and fails when
the code says anything else; never edit it by hand (run that test with CRISIS_SCRIPT_WORDS_WRITE=1).

Not here: the screen question (crisis-grounded-screen.ts), typed chat (crisis-gate-text.ts) and
SMS. Spoken crisis words pinned in a follow-up: the other someone-else and for-them-first turns,
the Spanish youth line, the timeout check-in lines and EMERGENCY_LINE.

The stamp below covers every block after it: \`none\` until a crisis owner (approvers.crisis in
scripts/ci/autonomy-policy.json) approves these words, then written in a commit of its own.
CRISIS_SCRIPT_IMMINENT_READ may default on only while it is current.

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
  // The stubbed generate is the only model here; nothing may reach a real one.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in the words test')));
  turns = await enumerate();
  vi.useRealTimers();
  expected = render(turns);
  if (process.env.CRISIS_SCRIPT_WORDS_WRITE === '1') writeFileSync(KEPT_PATH, expected);
  kept = readFileSync(KEPT_PATH, 'utf8');
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetMinorCare();
});

const textOf = (id: string): string => {
  const turn = turns.find((t) => t.id === id);
  if (!turn) throw new Error(`no turn ${id}`);
  return turn.text;
};

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

describe('the read: the real scriptRead, the model stubbed at its generate seam', () => {
  it('asks on every 988 turn, and on none of the 9 that never ask with the stub that swaps', () => {
    expect(turns.filter((t) => t.outcome === 'never asks')).toHaveLength(9);
    // A 988 turn that was not asked, or a never-asks turn that was.
    const wrong = turns.filter((t) => t.asked === (t.outcome === 'never asks'));
    expect(wrong.map((t) => t.id)).toEqual([]);
  });
});

describe('the wrappers come from detectCrisis, each from the branch its line must hit', () => {
  it.each(WRAPPED)('%s', (id, line, want) => {
    const read = detectCrisis(line, undefined, { env: {} });
    expect(read.suggestedResponse).toBe(want(read));
    expect(textOf(`${id} · never asks`)).toBe(want(read));
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
      const keptText = textOf(turn.id.replace(/added$/, 'kept'));
      const want = count911(keptText) ? keptText : `${keptText} ${LATE_911_LINE}`;
      expect(turn.text, turn.id).toBe(want);
      expect(count911(turn.text), turn.id).toBe(1);
    }
  });
});

describe('every axis changes the words (none of them is a no-op here)', () => {
  const base = '988 script, severe · 911 line off';

  it('severity, the 911 line, the youth line, the child-safety lines and each outcome', () => {
    const variants = [
      `${base} · kept`,
      `988 script, high · 911 line off · kept`,
      `988 script, severe · 911 line on · kept`,
      `${base} · youth line · kept`,
      `${base} · child-safety lines · kept`,
      `${base} · youth line · child-safety lines · kept`,
      `${base} · swapped`,
      `${base} · added`,
    ].map(textOf);
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe('the stamp', () => {
  const owner = crisisOwners()[0] ?? 'no-crisis-owner-configured';
  const DATE = '2026-11-16';

  it('a crisis owner’s stamp on the current blocks is current, and records who and when', () => {
    const stamp = stampOf(stamped(expected, owner, DATE));
    expect(stamp).toEqual({ state: 'current', reviewer: owner, date: DATE });
  });

  it('a stamp by anyone the policy does not name is not current, and cannot flip the flag', () => {
    expect(crisisOwners().map((o) => o.toLowerCase())).not.toContain('not-a-crisis-owner');
    const stamp = stampOf(stamped(expected, 'not-a-crisis-owner', DATE));
    expect(stamp.state).toBe('not-owner');
    expect(flipAllowed('on', stamp)).toBe(false);
  });

  it('one changed word after the stamp makes it stale', () => {
    const file = stamped(expected, owner, DATE).replace('Your safety', 'Your Safety');
    expect(stampOf(file).state).toBe('stale');
  });

  it('a missing or unreadable stamp line is malformed, never current', () => {
    expect(stampOf(expected.replace('reviewed: none\n', '')).state).toBe('malformed');
    expect(stampOf(expected.replace('reviewed: none', 'reviewed: yes')).state).toBe('malformed');
  });
});

describe('the flip gate: CRISIS_SCRIPT_IMMINENT_READ defaults on only under a current stamp', () => {
  const by = { reviewer: 'r', date: '2026-11-16' };
  const states: Record<KeptStamp['state'], KeptStamp> = {
    none: { state: 'none' },
    current: { state: 'current', ...by },
    stale: { state: 'stale', ...by },
    'not-owner': { state: 'not-owner', ...by },
    malformed: { state: 'malformed', why: 'x' },
  };

  it('on needs current; off and shadow say today’s words and need nothing', () => {
    const on = Object.values(states).map((s) => flipAllowed('on', s));
    expect(on).toEqual([false, true, false, false, false]);
    for (const mode of ['off', 'shadow']) {
      expect(Object.values(states).every((s) => flipAllowed(mode, s))).toBe(true);
    }
  });

  it("the flag's manifest default passes the gate against the kept file's stamp", () => {
    expect(flipAllowed(CRISIS_SCRIPT_IMMINENT_READ.default, stampOf(kept))).toBe(true);
  });
});
