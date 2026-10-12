/**
 * A synthetic caller's scripted life across 20 calls (no real person).
 *
 * Dana is an ER night-shift nurse. Over ten weeks she shares more (social
 * penetration: breadth first, then depth), builds a running bit with Ferni
 * (Gerald, the sourdough starter that keeps dying), a feud (Marcus and the
 * parking spot), a preference (vent, no advice lists) and a boundary (her dad),
 * and later talks in shorthand that only someone who was there would follow.
 *
 * Each call lists what a friend would know before it (`learned` of earlier
 * calls), the probes the scorer checks, and the caller's lines, which are
 * scripted: they do not react to what Ferni says.
 */

export interface Probe {
  /** Index into `user` of a line that only makes sense with shared history. */
  turn: number;
  /** Ferni asking what it means: a friend who was there would not need to. */
  clarify: RegExp;
}

export interface ArcCall {
  /** Days before the run's last call. */
  daysAgo: number;
  user: string[];
  /** What a friend knows after this call (fed to the judge for later calls). */
  learned: string[];
  shorthand?: Probe[];
  /** She raises her dad herself on this call, so asking about him is fine. */
  dadOk?: boolean;
}

/** Shared history Ferni could bring back unprompted, with the call it starts. */
export const ANCHORS: Array<{ name: string; re: RegExp; from: number; joke?: boolean }> = [
  { name: 'Biscuit', re: /\bbiscuit\b/i, from: 1 },
  { name: 'night shifts', re: /\bnight shifts?\b|\bnights\b/i, from: 1 },
  { name: 'Gerald', re: /\bgerald\b/i, from: 2, joke: true },
  { name: 'Priya', re: /\bpriya\b/i, from: 3 },
  { name: 'the wedding', re: /\bwedding\b/i, from: 3 },
  { name: 'Marcus', re: /\bmarcus\b/i, from: 6 },
  { name: 'the parking spot', re: /\bparking\b|\bthe spot\b/i, from: 6, joke: true },
  { name: 'the half marathon', re: /\bhalf[- ]?marathon\b|\b13\.1\b|\btraining\b/i, from: 7 },
  { name: 'the clinic job', re: /\bclinic\b|\bday job\b/i, from: 15 },
];

/** Questions a friend would never ask again once told, with the call that told them. */
export const KNOWN: Array<{ re: RegExp; from: number }> = [
  { re: /what('s| is) (your|the) (dog|pup|puppy)('s)? name|what kind of dog/i, from: 1 },
  { re: /what do you do( for (work|a living))?\?|where do you work/i, from: 1 },
  { re: /do you have (any )?(siblings|brothers|sisters)|who('s| is) priya/i, from: 3 },
  { re: /who('s| is) gerald|what('s| is) gerald/i, from: 2 },
  { re: /who('s| is) marcus/i, from: 6 },
  { re: /what (race|distance)|how (long|far) is the race/i, from: 7 },
];

/** Advice-as-a-list, after she asked for none (call 3). */
export const LIST_ADVICE =
  /\bhere are (a few|some)\b|\b(first|firstly),.*\b(second|secondly|then)\b|^\s*\d\.|\ba few (tips|ideas|things you could)\b/im;
/** Asking about her dad, after she said she doesn't talk about him (call 4). */
export const DAD_ASK = /\b(your|ur) (dad|father)\b[^.?!]*\?|\babout (your|ur) (dad|father)\b/i;
/** Too familiar for a first few calls. */
export const OVERFAMILIAR =
  /\b(missed you|as always|like old times|bestie|buddy|old friend|you know me|love you|babe|hon)\b/i;
/** Treating a close friend like a stranger. */
export const STRANGER =
  /\b(nice to meet you|tell me (a (little|bit) )?about yourself|what brings you|how can i help|what do you do)\b/i;

export const CALLER = { id: 'arc-dana', name: 'Dana', timezone: 'America/Denver' };

export const ARC: ArcCall[] = [
  {
    daysAgo: 66,
    user: [
      'Hi. Um, my coworker said you were nice to talk to, so here I am.',
      "I'm Dana. I'm a nurse in the ER at St. Vincent's, I work nights.",
      "I just got off a twelve and I can't sleep yet. My corgi Biscuit is snoring on my feet though.",
      "It's weird talking to you. But kind of nice.",
      'Okay I think I can sleep now. Thanks.',
    ],
    learned: ["Dana is an ER night-shift nurse at St. Vincent's", 'her corgi is Biscuit'],
  },
  {
    daysAgo: 63,
    user: [
      "Hey, it's Dana again.",
      'So I tried to make sourdough. I named the starter Gerald.',
      'Gerald is already dead. Three days. He smelled like feet and then he just gave up.',
      "I'm going to try again. Gerald the second. He'll be stronger.",
      'Okay, shift starts in an hour. Bye.',
    ],
    learned: ['Gerald is her sourdough starter; it keeps dying (a running bit between them)'],
  },
  {
    daysAgo: 59,
    user: [
      'Hey. Rough night.',
      'We lost a kid tonight. I am not okay but I will be.',
      "Please don't give me a list of tips or tell me to do self care. I just want to talk it out.",
      "My sister Priya called and I couldn't even pick up. She's getting married in December and she wants me to be maid of honor.",
      'Thanks for just listening.',
    ],
    learned: [
      'she wants to vent, not get advice lists or "self care" tips',
      'her sister Priya is getting married in December; Dana is maid of honor',
    ],
  },
  {
    daysAgo: 56,
    user: [
      "Hi. Better day today. I slept eight hours, it's a miracle.",
      "Priya wants a speech and I'm terrible at speeches.",
      "Our dad won't be at the wedding. I don't really talk about my dad, so. Yeah.",
      'Anyway. Biscuit stole a whole bagel off the counter today.',
      "Okay, I'm going to go walk him.",
    ],
    learned: [
      "she doesn't talk about her dad, who won't be at the wedding",
      'she dreads the maid-of-honor speech',
    ],
  },
  {
    daysAgo: 52,
    user: [
      'Hey you.',
      "Gerald's dead. Again.",
      "I think I'm the problem. My apartment is too cold for him.",
      "Work's been okay. Slow week, which in the ER means you can't say the word quiet.",
      'Talk soon.',
    ],
    learned: ['Gerald the second also died (her apartment is too cold)'],
    shorthand: [{ turn: 1, clarify: /who('s| is) gerald|what('s| is) gerald|gerald\?/i }],
  },
  {
    daysAgo: 48,
    user: [
      'I need to vent.',
      "There's this charge nurse Marcus. He parks in MY spot. Every night. There are forty spots.",
      'I left a note. He left a note back. It said "first come first served" with a smiley face.',
      "Don't tell me to talk to HR. I just need to be mad for a minute.",
      'Okay. I feel better. Thank you.',
    ],
    learned: [
      'Marcus, a charge nurse, keeps taking her parking spot: the parking war (a running bit)',
    ],
  },
  {
    daysAgo: 45,
    user: [
      'So I signed up for a half marathon. In April.',
      "I've never run more than like three miles. I think I panicked.",
      "Priya says it's because I'm avoiding the speech. She's not wrong.",
      'I ran two miles today and Biscuit quit after one.',
      'Okay. Bye.',
    ],
    learned: ['she signed up for an April half marathon; training from about three miles'],
  },
  {
    daysAgo: 41,
    user: [
      'Hey.',
      'Marcus. The spot. Again.',
      'I got there twenty minutes early just to get it. Twenty minutes.',
      'And then I had the worst shift. A guy threw a bedpan at me.',
      "I'm so tired. Just, tell me something good.",
    ],
    learned: ['she now arrives 20 minutes early to win the spot'],
    shorthand: [{ turn: 1, clarify: /who('s| is) marcus|what spot|which spot|what happened\?$/i }],
  },
  {
    daysAgo: 38,
    user: [
      'Okay, big news.',
      'Gerald rose from the grave, by the way. Gerald the third. He bubbled.',
      "I put him on top of the fridge, it's warm up there.",
      'I ran five miles on Sunday. Five!',
      "I'll call you after my next shift.",
    ],
    learned: ['Gerald the third is alive on top of the fridge', 'she ran five miles'],
    shorthand: [{ turn: 1, clarify: /who('s| is) gerald|what('s| is) gerald|what grave/i }],
  },
  {
    daysAgo: 34,
    user: [
      "Can I tell you something I haven't told anyone?",
      "I think I'm burning out. I cried in the supply closet twice this week.",
      "I've been looking at day jobs. Clinic jobs. It feels like quitting.",
      "Everyone at work thinks I'm the tough one.",
      "Thanks. I didn't expect to say all that.",
    ],
    learned: [
      'she is burning out, cried at work, is quietly looking at clinic day jobs; feels like quitting',
    ],
  },
  {
    daysAgo: 31,
    user: [
      'Hi. I just need to talk, no fixing please.',
      'I picked up an extra shift because they were short. I always say yes.',
      'And Priya keeps texting me about napkin colors. Napkin colors.',
      "Sorry. I know I always call you when I'm a mess.",
      'Okay. Going to sleep.',
    ],
    learned: ['she always says yes to extra shifts', 'Priya is in wedding-planning mode'],
  },
  {
    daysAgo: 27,
    user: [
      'Guess who parked in my spot.',
      "But here's the thing, I took HIS spot on the day shift side. War.",
      'Biscuit has a new thing where he howls at the dishwasher.',
      "Gerald's doing great, by the way. I made actual bread. It was a brick, but it was bread.",
      'Okay bye.',
    ],
    learned: ['she retaliated in the parking war', 'Gerald finally made bread (a brick)'],
    shorthand: [{ turn: 0, clarify: /who\?|who parked|which spot|what spot/i }],
  },
  {
    daysAgo: 24,
    user: [
      'Can we talk about something heavy?',
      "My dad was an alcoholic. That's why I don't talk about him.",
      'I noticed I have a glass of wine after every shift now. Every one.',
      "I'm not him. But I'm scared I could be.",
      "You're the first person I've said that to.",
    ],
    learned: [
      'her dad was an alcoholic; she drinks wine after every shift and fears becoming him (told only Ferni)',
    ],
    dadOk: true,
  },
  {
    daysAgo: 20,
    user: [
      'Hey. Okay, so, update.',
      'Biscuit ate Gerald.',
      "Like, knocked the jar off the fridge and ate him. The vet says he's fine.",
      "Also, I've gone a week with no wine after shifts. Tea. I hate tea.",
      'Talk later.',
    ],
    learned: ['Biscuit ate Gerald the third', 'a week with no wine after shifts, tea instead'],
    shorthand: [{ turn: 1, clarify: /who('s| is) gerald|what('s| is) gerald/i }],
  },
  {
    daysAgo: 17,
    user: [
      'I applied. To the clinic job. Days, Monday to Friday.',
      "I haven't told anyone at work. Or Priya.",
      'The interview is Thursday.',
      "I wrote half of the speech, too. It's mostly jokes about her bangs.",
      'Okay. Wish me luck.',
    ],
    learned: [
      'she applied for a clinic day job, interview Thursday, told no one else',
      'half the speech written',
    ],
  },
  {
    daysAgo: 13,
    user: [
      'Interview went well, I think.',
      'They asked why I want to leave the ER and I almost cried. In a good way?',
      'Long run was eight miles. My knees hate me.',
      'Still no wine. Sixteen days.',
      'Night.',
    ],
    learned: [
      'the clinic interview went well',
      'long run up to eight miles',
      'sixteen days without wine',
    ],
  },
  {
    daysAgo: 10,
    user: [
      'Okay, the parking war is officially over.',
      'He got transferred to days. I won by default. It feels empty.',
      'Priya wants to do a dress fitting on my only day off.',
      'I said yes, obviously. I always say yes.',
      'Bye.',
    ],
    learned: ['the parking war ended: Marcus transferred to days'],
    shorthand: [{ turn: 0, clarify: /what (war|parking war)|which war/i }],
  },
  {
    daysAgo: 7,
    user: [
      'I GOT IT.',
      'The clinic job. I start in three weeks.',
      'I told my manager. She cried. I cried. Marcus hugged me, which was weird.',
      "I don't know who I am if I'm not an ER nurse.",
      'Okay I have to go call Priya.',
    ],
    learned: ['she got the clinic job, starts in three weeks; told her manager'],
  },
  {
    daysAgo: 3,
    user: [
      "Priya's thing is next week and I still don't have shoes.",
      'The speech is done though. I cut the bangs jokes. Mostly.',
      'Should I start a new Gerald? Gerald the fourth? Fridge is Biscuit-proof now.',
      'Thanks for always picking up.',
      'Okay. Bye.',
    ],
    learned: ['the speech is done', 'she is thinking about a Gerald the fourth'],
    shorthand: [{ turn: 0, clarify: /what('s| is) (priya's|the) thing|which thing|what thing/i }],
  },
  {
    daysAgo: 0,
    user: [
      'Last one tonight.',
      'My last night shift. Ever, maybe.',
      'I keep thinking about the night I called you after we lost that kid.',
      "You've kind of been there for all of it. Gerald, Marcus, the wine thing.",
      "Okay. I'm going to go clock out. Talk soon.",
    ],
    learned: [],
    shorthand: [{ turn: 0, clarify: /last (one|what)\?|what do you mean/i }],
  },
];
