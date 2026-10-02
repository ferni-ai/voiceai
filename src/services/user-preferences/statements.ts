/**
 * Deterministic parser for preference statements in the user's own words.
 *
 * Covers the profile's own vocabulary (how to talk to them, boundaries,
 * coaching style, liked activities). Food lives in food-capture.ts; music and the older lifestyle
 * categories are NOT re-detected here — those reuse the existing extractors
 * (src/audio/music-preference-extractor.ts, src/intelligence/tracking/preferences.ts)
 * via ./inference.ts.
 *
 * @module services/user-preferences/statements
 */

import type { PreferenceInput, PreferenceSource } from './types.js';

interface Rule {
  readonly re: RegExp;
  readonly build: (m: RegExpExecArray) => Omit<PreferenceInput, 'source' | 'confidence'> | null;
}

const FILLER = /\s+(please|thanks|thank you|anymore|any more|ok|okay)\.?$/i;

function clean(text: string | undefined): string {
  return (text ?? '')
    .replace(/[.!?,;]+$/g, '')
    .replace(FILLER, '')
    .trim();
}

function topic(text: string | undefined): string {
  return clean(text)
    .replace(/^(about|up)\s+/i, '')
    .replace(/\s+(unless i do|unless i bring it up|with me|again|at all)$/i, '')
    .trim();
}

const NOT_NAMES = new Set([
  'tomorrow',
  'later',
  'back',
  'when',
  'if',
  'at',
  'on',
  'in',
  'a',
  'an',
  'the',
  'maybe',
  'after',
  'before',
  'tonight',
  'today',
  'soon',
  'again',
  'crazy',
  'whatever',
  'anything',
  'up',
  'out',
  'by',
]);

const single = (domain: PreferenceInput['domain'], key: string, value: string) => ({
  domain,
  key,
  value,
});

const RULES: readonly Rule[] = [
  // ── name / pronouns ──────────────────────────────────────────────────────
  {
    re: /\b(?:call me|you can call me|i go by|please call me)\s+([A-Za-z][\w'-]{0,30})/i,
    build: (m) => {
      const name = clean(m[1]);
      const first = name.split(' ')[0].toLowerCase();
      const negated = /\b(?:don'?t|do not|never)\s+(?:you\s+)?$/i.test(m.input.slice(0, m.index));
      return NOT_NAMES.has(first) || negated ? null : single('conversation', 'preferredName', name);
    },
  },
  {
    re: /\bmy pronouns are\s+([a-z]+\s*\/\s*[a-z]+(?:\s*\/\s*[a-z]+)?)/i,
    build: (m) => single('conversation', 'pronouns', m[1].replace(/\s+/g, '')),
  },
  // ── response length ─────────────────────────────────────────────────────
  {
    re: /\b(?:shorter|brief|briefer|short|concise|quicker)\s+(?:answers|responses|replies)\b|\bkeep it (?:short|brief)\b|\btoo long\b|\btalk less\b/i,
    build: () => single('conversation', 'responseLength', 'short'),
  },
  {
    re: /\b(?:longer|more detailed|detailed|fuller)\s+(?:answers|responses|replies)\b|\bmore detail\b/i,
    build: () => single('conversation', 'responseLength', 'long'),
  },
  // ── directness / pace / humour / follow-ups ─────────────────────────────
  {
    re: /\bbe (?:more )?(?:direct|blunt|straightforward)\b|\bdon'?t sugar ?coat\b|\bjust tell me straight\b/i,
    build: () => single('conversation', 'directness', 'direct'),
  },
  {
    re: /\bbe (?:more )?(?:gentle|gentler|softer|kinder)\b/i,
    build: () => single('conversation', 'directness', 'gentle'),
  },
  {
    re: /\b(?:slow down|talk slower|speak slower|slower please)\b/i,
    build: () => single('conversation', 'pace', 'slow'),
  },
  {
    re: /\b(?:speed up|talk faster|speak faster)\b/i,
    build: () => single('conversation', 'pace', 'fast'),
  },
  {
    re: /\b(?:no|less|fewer|stop (?:the|making|with the))\s+jokes\b|\bnot in the mood for jokes\b/i,
    build: () => single('conversation', 'humor', 'none'),
  },
  {
    re: /\b(?:more jokes|i love (?:your )?jokes|make me laugh more)\b/i,
    build: () => single('conversation', 'humor', 'lots'),
  },
  {
    re: /\b(?:stop asking (?:me )?so many questions|fewer questions|too many questions|less questions)\b/i,
    build: () => single('conversation', 'followUpQuestions', 'fewer'),
  },
  // ── boundaries ──────────────────────────────────────────────────────────
  {
    re: /\b(?:don'?t|do not|never|please don'?t)\s+(?:bring up|mention|ask (?:me )?about|talk about|raise)\s+(.{2,60})/i,
    build: (m) => {
      const t = topic(m[1]);
      return t ? { domain: 'boundaries', key: `avoidTopic:${t}`, value: t } : null;
    },
  },
  {
    re: /\b(?:don'?t|do not|never)\s+(?:call|text|message|ping|contact|remind)\s+me\s+(?:after|past)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+(?:or\s+)?before\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i,
    build: (m) => single('boundaries', 'doNotContact', `${clean(m[1])}-${clean(m[2]) || '8am'}`),
  },
  // ── coaching ────────────────────────────────────────────────────────────
  {
    re: /\b(?:hold me accountable|push me harder|be tough on me|don'?t let me off the hook)\b/i,
    build: () => single('coaching', 'accountabilityStyle', 'firm'),
  },
  {
    re: /\b(?:go easy on me|don'?t push me|gentle reminders)\b/i,
    build: () => single('coaching', 'accountabilityStyle', 'gentle'),
  },
  {
    re: /\bi'?m an?\s+(upholder|questioner|obliger|rebel)\b/i,
    build: (m) => single('coaching', 'fourTendency', m[1].toLowerCase()),
  },
  // ── units / time format ─────────────────────────────────────────────────
  {
    re: /\b(?:use|in|prefer)\s+celsius\b/i,
    build: () => single('practical', 'temperatureUnit', 'celsius'),
  },
  {
    re: /\b(?:use|in|prefer)\s+fahrenheit\b/i,
    build: () => single('practical', 'temperatureUnit', 'fahrenheit'),
  },
  {
    re: /\b(?:use|prefer)\s+(?:the\s+)?metric\b/i,
    build: () => single('practical', 'units', 'metric'),
  },
  {
    re: /\b(?:use|prefer)\s+(?:the\s+)?imperial\b/i,
    build: () => single('practical', 'units', 'imperial'),
  },
  {
    re: /\b24[- ]hour (?:time|clock|format)\b/i,
    build: () => single('practical', 'timeFormat', '24h'),
  },
];

const ACTIVITY_WORDS =
  /\b(running|hiking|yoga|swimming|cycling|biking|reading|gardening|cooking|baking|painting|climbing|walking|dancing|meditation|meditating|camping|fishing|skiing|surfing|golf|tennis|chess|knitting|gaming)\b/i;

/** Generic "I love X" / "I hate X" for activities (food → food-capture.ts, music → media.ts). */
function genericLikes(text: string): Omit<PreferenceInput, 'source' | 'confidence'>[] {
  const m =
    /\bi\s+(?:really\s+)?(love|adore|enjoy|like|hate|can'?t stand|dislike|don'?t like)\s+([a-z][a-z' -]{1,40})/i.exec(
      text
    );
  if (!m) return [];
  const item = clean(m[2])
    .split(/\s+(?:and|but|because|when|so)\s+/i)[0]
    .trim();
  const sentiment = /hate|can'?t stand|dislike|don'?t like/i.test(m[1]) ? 'dislike' : 'like';
  const prefix = ACTIVITY_WORDS.test(item) ? 'activity' : null;
  if (!prefix || item.split(' ').length > 4) return [];
  return [{ domain: 'likes', key: `${prefix}:${item}`, value: item, sentiment }];
}

/**
 * Parse a user utterance into preference inputs.
 * @param source  'explicit' for the user's own words, 'inferred' for paraphrases (summaries)
 */
export function parsePreferenceStatements(
  text: string,
  source: PreferenceSource,
  confidence: number,
  conversationId?: string
): PreferenceInput[] {
  if (!text || text.length > 2000) return [];
  const out: PreferenceInput[] = [];
  const seen = new Set<string>();
  const push = (p: Omit<PreferenceInput, 'source' | 'confidence'> | null): void => {
    if (!p || !p.value) return;
    const sig = `${p.domain}|${p.key}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ ...p, source, confidence, ...(conversationId ? { conversationId } : {}) });
  };
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m) push(rule.build(m));
  }
  genericLikes(text).forEach(push);
  return out;
}
