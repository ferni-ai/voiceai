/**
 * Regression harness for the forget matcher: nothing the matcher on main
 * (before 2026-10-11) hid may come back. Main's tokenizer is frozen below,
 * byte for byte. Every topic is checked both as main stored it (legacy
 * tokens, still in Firestore) and as a new forget stores it (storedTopic),
 * against every passage. Zero regressions allowed.
 */
import { describe, expect, it } from 'vitest';
import { isForgotten, storedTopic } from '../session-recall.js';

// --- main's matcher, frozen ---------------------------------------------------
const MAIN_SKIP = new Set([
  ..."the and but for with that this was are you your have has had not just about what when where how who why can could would should will from they them their there then than into onto been being its it's i'm im my our out get got going really very some like know think well yeah okay also".split(
    ' '
  ),
  ...'forget forgot forgotten remember said say saying told tell talked talk mentioned thing things stuff part bit please user speaker'.split(
    ' '
  ),
]);
function mainTokens(text: string): string[] {
  const joined = text.toLowerCase().replace(/(\d)[\s().-]+(?=\d)/g, '$1');
  const words = joined.match(/[a-z0-9][a-z0-9']*/g) ?? [];
  const out = words
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => w.length >= 2 && !MAIN_SKIP.has(w))
    .map((w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w));
  return [...new Set(out)];
}
function mainIsForgotten(text: string, topics: readonly string[]): boolean {
  if (topics.length === 0) return false;
  const words = new Set(mainTokens(text));
  return topics.some((t) => {
    const want = mainTokens(t);
    return want.length > 0 && want.every((w) => words.has(w));
  });
}
// ------------------------------------------------------------------------------

const TOPICS = [
  'Zoë',
  'babies',
  'Babies',
  'my divorce',
  "my sister's wedding",
  'Charles',
  'Parents',
  'Hayes',
  'Studies',
  'my ex-wife',
  'the cookies',
  "my brother's number 435-339-7687",
  'James',
  'news',
  'my job',
  'the lawyer',
  'Dana',
  'pregnancy',
  "my mom's surgery",
  'therapy',
  'drinking',
];

const PASSAGES = [
  'Lunch with Zoë on Friday',
  'Lunch with Zoe on Friday',
  'The babies are sick',
  'They want a baby',
  'Talked about babies again',
  'Finalised the divorce papers',
  'She is divorcing him',
  "My sister's wedding is in May",
  'The wedding was lovely',
  'weddings are pricey',
  'charles got sick',
  'Charles called twice',
  'my parents visited',
  'Parents are coming Sunday',
  'hayes owes me money',
  'her studies are going well',
  'He studied law',
  'His ex-wife called',
  'his ex wife called',
  'She baked cookies',
  'a cookie jar',
  'His number is 435-339-7687',
  'call 4353397687 later',
  'James is moving',
  'Making strawberry jam',
  'Watching the news',
  'Got a new job',
  'Hates the job',
  'The lawyer sent papers',
  'Dana from work',
  'The pregnancy is going well',
  "Mom's surgery is Tuesday",
  'Started therapy last week',
  'He has been drinking again',
];

/**
 * Over-hides main had that a new forget deliberately drops (a topic's short
 * words are not stemmed: forgetting "news" is not forgetting "new job").
 * Topics main already stored keep hiding them.
 */
const INTENDED_FOR_NEW_FORGETS = new Set(['news -> Got a new job']);

function regressions(storedAs: (topic: string) => string, allowed = new Set<string>()): string[] {
  const out: string[] = [];
  for (const topic of TOPICS) {
    const legacyStored = mainTokens(topic).join(' ');
    for (const passage of PASSAGES) {
      if (mainIsForgotten(passage, [legacyStored]) && !isForgotten(passage, [storedAs(topic)])) {
        const miss = `${topic} -> ${passage}`;
        if (!allowed.has(miss)) out.push(miss);
      }
    }
  }
  return out;
}

describe('forget matcher: nothing main hid comes back', () => {
  it('has the harness size the reviewers checked', () => {
    expect(TOPICS).toHaveLength(21);
    expect(PASSAGES).toHaveLength(34);
  });

  it('topics as main stored them (still in Firestore): 0 regressions', () => {
    expect(regressions((t) => mainTokens(t).join(' '))).toEqual([]);
  });

  it('topics as a new forget stores them: 0 regressions', () => {
    expect(regressions(storedTopic, INTENDED_FOR_NEW_FORGETS)).toEqual([]);
    // The one intended change is real, not a harness gap.
    expect(regressions(storedTopic)).toEqual([...INTENDED_FOR_NEW_FORGETS]);
  });

  it.each([
    ['Charles', 'charles got sick'],
    ['Parents', 'my parents visited'],
    ['Hayes', 'hayes owes me money'],
    ['Babies', 'The babies are sick'],
    ['Studies', 'her studies'],
  ])('a new forget of "%s" hides "%s"', (topic, passage) => {
    expect(isForgotten(passage, [storedTopic(topic)])).toBe(true);
  });
});
