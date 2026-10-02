/**
 * Spotting dreams, goals, habits, check-ins and let-gos in what the user
 * says. Pure functions; capture.ts writes the results.
 *
 *   "someday I want to live by the sea"      → dream
 *   "my goal is to run a half marathon"      → goal
 *   "I'm trying to meditate every morning"   → habit (daily)
 *   "I did my run today"                     → check-in (done) on a habit
 *   "I skipped my run"                       → check-in (missed)
 *   "I'm letting go of that dream of …"      → let-go
 *
 * First-person statements are explicit. Third-person summary sentences
 * ("They hope to move to Portugal someday") are inferred and need repeated
 * evidence before Ferni treats them as commitments.
 *
 * @module services/aspirations/detection
 */

import { normalizeAspirationTitle } from './identity.js';
import type { AspirationLevel, AspirationRecord, CheckInStatus, HabitFrequency } from './types.js';

export interface DetectedAspiration {
  level: AspirationLevel;
  title: string;
  frequency?: HabitFrequency;
  days?: number[];
  confidence: number;
}

export type DetectedEvent =
  | { kind: 'aspiration'; item: DetectedAspiration }
  | { kind: 'check-in'; status: CheckInStatus; phrase: string; yesterday: boolean }
  | { kind: 'let-go'; phrase: string; level?: AspirationLevel }
  | { kind: 'achieved'; phrase: string };

const END = String.raw`(?=[.!?;]|,\s*(?:but|and|so|because)\b|\s+(?:but|because|though)\b|$)`;
const OBJ = String.raw`([a-z0-9' ,\-]{3,120}?)`;

const re = (src: string) => new RegExp(src, 'i');

const DREAM_PATTERNS = [
  re(
    String.raw`\b(?:someday|one day)\s*,?\s*i(?:'d| would)? (?:really )?(?:love|like|want|hope|wish)(?: to)? ${OBJ}${END}`
  ),
  re(String.raw`\bmy (?:big |biggest |lifelong )?dream is (?:to )?${OBJ}${END}`),
  re(String.raw`\bi(?:'ve| have) always (?:wanted|dreamed of|dreamt of) (?:to )?${OBJ}${END}`),
  re(String.raw`\bbefore i die,? i (?:want|hope|need) to ${OBJ}${END}`),
  re(String.raw`\b(?:it'?s|that'?s) on my bucket list to ${OBJ}${END}`),
  re(String.raw`\bon my bucket list:? ${OBJ}${END}`),
];

const GOAL_PATTERNS = [
  re(
    String.raw`\bmy (?:main |big |new )?goal (?:is|this year is|for this year is) (?:to )?${OBJ}${END}`
  ),
  re(String.raw`\bi(?:'m| am) working (?:toward|towards) ${OBJ}${END}`),
  re(String.raw`\bi(?:'ve| have) set (?:myself )?a goal (?:to|of) ${OBJ}${END}`),
  re(String.raw`\b(?:this year|by the end of the year),? i (?:want|plan|need) to ${OBJ}${END}`),
];

const FREQ = String.raw`(every (?:single )?(?:day|morning|night|evening|weekday|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|each (?:day|morning|night|week)|daily|on weekdays|on weekends|weekly)`;

const HABIT_PATTERNS = [
  re(String.raw`\bi(?:'m| am) trying to ${OBJ}\s+${FREQ}`),
  re(String.raw`\bi (?:want|need|plan) to (?:start )?${OBJ}\s+${FREQ}`),
  re(String.raw`\bi(?:'m| am) (?:building|starting|forming) (?:a|the) habit of ${OBJ}${END}`),
  re(String.raw`\bnew habit:? ${OBJ}${END}`),
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function frequencyOf(phrase: string | undefined): { frequency: HabitFrequency; days?: number[] } {
  const p = (phrase ?? '').toLowerCase();
  if (/weekday/.test(p)) return { frequency: 'weekdays' };
  if (/weekend/.test(p)) return { frequency: 'weekends' };
  if (/week(?!day)/.test(p) || p === 'weekly') return { frequency: 'weekly' };
  const day = WEEKDAYS.findIndex((d) => p.includes(d));
  if (day >= 0) return { frequency: 'custom', days: [day] };
  return { frequency: 'daily' };
}

function tidy(raw: string): string | null {
  const t = raw
    .replace(/\s+/g, ' ')
    .replace(/^(?:to|be able to)\s+/i, '')
    .replace(/[\s,;-]+$/g, '')
    .trim();
  const words = t.split(' ').length;
  if (t.length < 3 || words > 18) return null;
  if (/^(it|that|this|so|do it|do that|something|anything)$/i.test(t)) return null;
  return t;
}

const DONE = re(
  String.raw`\bi (?:just |finally |already )?(?:did|finished|completed|got in|knocked out|went for|went on|had) my ${OBJ}(?:\s+(today|this morning|tonight|this evening|yesterday))?${END}`
);
const DONE_VERB = re(
  String.raw`\bi (?:just |already )?(meditated|ran|ran today|journaled|journalled|exercised|worked out|stretched|walked|read|practiced|practised|studied|prayed|swam|cycled|flossed)\b(?:[^.!?]*?\b(today|this morning|tonight|yesterday))?`
);
const MISSED = re(
  String.raw`\bi (?:totally |completely )?(?:skipped|missed|didn't do|did not do|blew off|forgot) my ${OBJ}(?:\s+(today|this morning|tonight|yesterday))?${END}`
);
const LET_GO = [
  re(
    String.raw`\bi(?:'m| am) (?:letting go of|giving up on|releasing) (?:the |that |my )?(dream|goal|habit)?(?: of)? ?${OBJ}?${END}`
  ),
  re(
    String.raw`\bi(?:'ve| have) (?:let go of|given up on|decided to let go of) (?:the |that |my )?(dream|goal|habit)?(?: of)? ?${OBJ}?${END}`
  ),
  re(String.raw`\bi (?:don't|do not) want to ${OBJ} anymore${END}`),
];
const ACHIEVED = re(
  String.raw`\bi (?:finally |actually )?(?:achieved|reached|hit|accomplished|made) my goal(?: of| to)? ?${OBJ}?${END}`
);

/** First-person statements from a user turn. */
export function detectInUtterance(text: string): DetectedEvent[] {
  const t = text.replace(/[’]/g, "'");
  const events: DetectedEvent[] = [];
  for (const p of LET_GO) {
    const m = p.exec(t);
    if (m) {
      const level = m.length > 2 ? (m[1]?.toLowerCase() as AspirationLevel | undefined) : undefined;
      const phrase = (m.length > 2 ? m[2] : m[1]) ?? '';
      events.push({ kind: 'let-go', phrase: phrase.trim(), ...(level ? { level } : {}) });
      return events; // a let-go sentence isn't also a new dream
    }
  }
  const achieved = ACHIEVED.exec(t);
  if (achieved) events.push({ kind: 'achieved', phrase: (achieved[1] ?? '').trim() });

  const add = (
    level: AspirationLevel,
    raw: string | undefined,
    confidence: number,
    freq?: string
  ) => {
    const title = raw ? tidy(raw) : null;
    if (!title) return;
    const f = level === 'habit' ? frequencyOf(freq) : undefined;
    events.push({ kind: 'aspiration', item: { level, title, confidence, ...(f ?? {}) } });
  };
  let habitFound = false;
  for (const p of HABIT_PATTERNS) {
    const m = p.exec(t);
    if (m) {
      add('habit', m[1], 0.9, m[2]);
      habitFound = true;
      break;
    }
  }
  if (!habitFound) {
    for (const p of GOAL_PATTERNS) {
      const m = p.exec(t);
      if (m) {
        add('goal', m[1], 0.9);
        break;
      }
    }
    for (const p of DREAM_PATTERNS) {
      const m = p.exec(t);
      if (m) {
        add('dream', m[1], 0.9);
        break;
      }
    }
  }
  const missed = MISSED.exec(t);
  if (missed) {
    events.push({
      kind: 'check-in',
      status: 'missed',
      phrase: missed[1].trim(),
      yesterday: missed[2]?.toLowerCase() === 'yesterday',
    });
  } else {
    const done = DONE.exec(t) ?? DONE_VERB.exec(t);
    if (done) {
      events.push({
        kind: 'check-in',
        status: 'done',
        phrase: done[1].trim(),
        yesterday: done[2]?.toLowerCase() === 'yesterday',
      });
    }
  }
  return events;
}

const SUMMARY_PATTERNS: Array<[AspirationLevel, RegExp]> = [
  [
    'dream',
    re(
      String.raw`\b(?:dreams? of|has always wanted to|would love to someday|hopes? to someday|someday wants to) ${OBJ}${END}`
    ),
  ],
  [
    'goal',
    re(
      String.raw`\b(?:goal (?:is|of)|is working toward|is working towards|aims? to|plans? to) ${OBJ}${END}`
    ),
  ],
  ['habit', re(String.raw`\b(?:is trying to|wants to|is working on) ${OBJ}\s+${FREQ}`)],
];

/** Third-person sentences from a conversation summary (inferred, lower confidence). */
export function detectInSummary(text: string): DetectedAspiration[] {
  const out: DetectedAspiration[] = [];
  for (const sentence of text.replace(/[’]/g, "'").split(/(?<=[.!?])\s+|\n+/)) {
    for (const [level, p] of SUMMARY_PATTERNS) {
      const m = p.exec(sentence);
      const title = m ? tidy(m[1]) : null;
      if (!m || !title) continue;
      const f = level === 'habit' ? frequencyOf(m[2]) : undefined;
      out.push({ level, title, confidence: 0.65, ...(f ?? {}) });
      break;
    }
  }
  return out;
}

// ============================================================================
// MATCHING A PHRASE TO A KNOWN ITEM
// ============================================================================

const STOP = new Set([
  'a',
  'an',
  'the',
  'my',
  'to',
  'of',
  'for',
  'go',
  'do',
  'every',
  'each',
  'day',
  'daily',
  'morning',
  'night',
  'week',
  'today',
  'and',
  'at',
  'in',
  'on',
  'that',
  'this',
  'dream',
  'goal',
  'habit',
  'some',
  'more',
  'get',
  'start',
]);
const IRREGULAR: Record<string, string> = {
  ran: 'run',
  swam: 'swim',
  went: 'go',
  did: 'do',
  wrote: 'write',
  read: 'read',
};

export function stem(word: string): string {
  let w = IRREGULAR[word] ?? word;
  for (const suffix of ['ing', 'ed', 'es', 's', 'e']) {
    if (w.length > 4 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w)) w = w.slice(0, -1); // running → run
  return w;
}

function stems(text: string): Set<string> {
  return new Set(
    normalizeAspirationTitle(text)
      .split(' ')
      .filter((w) => w && !STOP.has(w))
      .map(stem)
  );
}

/** Items whose title shares a content word with the phrase, best first. */
export function matchItems(
  phrase: string,
  items: readonly AspirationRecord[],
  level?: AspirationLevel
): AspirationRecord[] {
  const want = stems(phrase);
  if (want.size === 0) return [];
  return items
    .filter((r) => !level || r.level === level)
    .map((r) => {
      const have = stems(r.title);
      let score = 0;
      for (const w of want) if (have.has(w)) score++;
      return { r, score: score / Math.max(1, Math.min(want.size, have.size)) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}
