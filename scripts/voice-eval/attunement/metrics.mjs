// Code metrics for attunement: did a reply meet the caller where they are?
// Pure functions over text, shared by rollout.ts (live numbers) and report.mjs.
//
// Per Ferni reply:
//   words        spoken words (markup removed)
//   lengthRatio  words / median words of the caller's last three turns
//   questions    question marks
//   advice       unsolicited advice or a life lesson ("you should", "the key is",
//                "ignoring those things never ...")
//   selfShare    mostly about himself (2+ first-person words, more than "you")
//   fit          the reply is inside the band a friend would keep for this state
//                (FIT below); null for neutral, which has no band.

const strip = (t) =>
  String(t ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[a-z ]+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const words = (t) => strip(t).split(' ').filter(Boolean).length;

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const questions = (t) => (strip(t).match(/\?/g) ?? []).length;

const ADVICE =
  /\b(?:you should|you could (?:try|just)|you might (?:want|try)|have you (?:tried|thought about)|why don'?t you|try (?:to|and|not)|make sure|i'?d (?:suggest|recommend)|my advice|the (?:key|trick|thing) is|it'?s important to|don'?t let|you (?:need|have|ought) to|you'?ve got to|sometimes you (?:just )?(?:have|need|gotta)|(?:never|always) (?:actually )?(?:makes?|helps?|works?)|life is (?:too|about|short)|that'?s the thing about)\b/i;

export const advice = (t) => ADVICE.test(strip(t));

const FIRST = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|myself)\b/gi;
const SECOND = /\b(?:you|you're|you've|you'd|you'll|your|yours|yourself)\b/gi;

export function selfShare(t) {
  const s = strip(t);
  const first = (s.match(FIRST) ?? []).length;
  const second = (s.match(SECOND) ?? []).length;
  return first >= 2 && first > second;
}

/**
 * The band a friend keeps for each state, from the caller's own words. Short
 * callers (tired, distracted, hurried) get short replies; nobody low or hurting
 * gets advice they didn't ask for or more than one question.
 */
export const FIT = {
  tired: (m) => m.words <= 15 && m.questions <= 1 && !m.advice && !m.selfShareUnasked,
  distracted: (m) => m.words <= 15 && m.questions <= 1 && !m.advice,
  hurried: (m) => m.words <= 18 && m.questions === 0 && !m.adviceUnasked,
  venting: (m) => m.questions <= 1 && !m.adviceUnasked && !m.selfShareUnasked,
  sad: (m) => m.questions <= 1 && !m.adviceUnasked && !m.selfShareUnasked && m.words <= 35,
  excited: (m) => m.words >= 6 && m.questions <= 1 && !m.advice,
  playful: (m) => m.words <= 30 && !m.advice,
  neutral: () => null,
};

const ASKED_ADVICE =
  /\b(?:what (?:would|should|do) (?:you|i)|should i|any (?:idea|advice|tips?)|what do you think|how long do i|rate my|is that weird)\b|\?\s*$/i;
const ASKED_ABOUT_HIM =
  /\b(?:what about you|how about you|you up to|with you|what'?s new with you|do you|don'?t you|are you|if you were|you don'?t like|bet you)\b/i;

/** Metrics for one reply. `callerTurns` is every caller turn so far, this one last. */
export function replyMetrics(reply, callerTurns, state) {
  const said = callerTurns[callerTurns.length - 1] ?? '';
  const recent = callerTurns.slice(-3).map(words);
  const m = {
    words: words(reply),
    callerWords: words(said),
    lengthRatio: words(reply) / Math.max(1, median(recent)),
    questions: questions(reply),
    advice: advice(reply),
    selfShare: selfShare(reply),
  };
  m.adviceUnasked = m.advice && !ASKED_ADVICE.test(said);
  m.selfShareUnasked = m.selfShare && !ASKED_ABOUT_HIM.test(said);
  const fit = FIT[state] ?? FIT.neutral;
  m.fit = fit(m);
  return m;
}

/** Caller talk share over a whole scenario: caller words / all words. */
export function callerShare(callerTurns, replies) {
  const c = callerTurns.reduce((n, t) => n + words(t), 0);
  const f = replies.reduce((n, t) => n + words(t), 0);
  return c + f ? c / (c + f) : 0;
}
