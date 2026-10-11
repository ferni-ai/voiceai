/**
 * Seeded caller histories for the long-term memory benchmark (longmem.ts).
 *
 * Each history is a few calls days apart, written the way callers talk.
 * Questions come in the five LongMemEval categories:
 *   single-session: a fact said once
 *   multi-session: needs facts from two calls
 *   temporal: a date said relatively ("last Friday", "tomorrow")
 *   knowledge-update: a fact that changed; only the newest is right
 *   abstention: never said; the right answer is "I don't know"
 *
 * Sessions are placed by days before the run date, so "said N days ago"
 * notes and the gold dates stay consistent whenever the benchmark runs.
 */
import type { MemoryCase, MemoryHistory } from '../longmem-lib.js';

const ACKS = ['Oh, nice.', 'Got it.', 'Mm, that makes sense.', 'Okay, tell me more.'];

/** A call: the caller's lines, with short replies between them. */
export function callTurns(user: string[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return user.flatMap((content, i) => [
    { role: 'user' as const, content },
    { role: 'assistant' as const, content: ACKS[i % ACKS.length]! },
  ]);
}

export const HISTORIES: MemoryHistory[] = [
  {
    id: 'maya',
    name: 'Maya',
    sessions: [
      {
        daysAgo: 40,
        user: [
          'Hey! So I finally got a dog. A golden retriever puppy named Biscuit.',
          "I'm a nurse at St. Mary's, so my neighbor walks him on my long shifts.",
        ],
      },
      {
        daysAgo: 26,
        user: [
          "Big news, I left St. Mary's. I started at Denver Health this week.",
          'The night shifts are better there and the commute is shorter.',
        ],
      },
      {
        daysAgo: 6,
        user: [
          'Biscuit had knee surgery last Friday, poor guy.',
          "He's wearing the cone and hates it, but the vet says he'll be fine.",
        ],
      },
    ],
  },
  {
    id: 'leo',
    name: 'Leo',
    sessions: [
      {
        daysAgo: 50,
        user: [
          "I'm training for the Boulder half marathon, it's my first one.",
          'My girlfriend Ana is going to cheer me on at the finish.',
        ],
      },
      {
        daysAgo: 30,
        user: [
          'I strained my calf on a long run, so I might skip Boulder.',
          'Oh and Ana adopted a cat, a little gray one named Pepper.',
        ],
      },
      {
        daysAgo: 8,
        user: [
          "Calf is healed. I've decided to run the Denver half marathon on October 19th instead.",
          'Ana says Pepper will be watching the livestream, which is ridiculous.',
        ],
      },
    ],
  },
  {
    id: 'priya',
    name: 'Priya',
    sessions: [
      {
        daysAgo: 35,
        user: [
          "I'm moving from Chicago to Austin for a job at Dell. The plan is October.",
          'My mom lives in Pune, so the time difference is going to get even worse.',
        ],
      },
      {
        daysAgo: 12,
        user: [
          'The move got pushed back to November, the apartment fell through.',
          'In the meantime I signed up for pottery. My first class is tomorrow.',
        ],
      },
    ],
  },
  {
    id: 'sam',
    name: 'Sam',
    sessions: [
      {
        daysAgo: 21,
        user: [
          "My brother's wedding is this coming Saturday and I still haven't written my toast.",
          "I'm the best man, so no pressure.",
        ],
      },
      {
        daysAgo: 9,
        user: [
          'The wedding was amazing. I gave the toast and only cried a little.',
          "Now I'm planning a trip to Japan in December, mostly for the food.",
        ],
      },
    ],
  },
];

export const CASES: MemoryCase[] = [
  // single-session
  {
    history: 'maya',
    category: 'single-session',
    ask: 'What kind of dog do I have?',
    gold: () => 'a golden retriever (named Biscuit)',
  },
  {
    history: 'leo',
    category: 'single-session',
    ask: "What's my girlfriend's name?",
    gold: () => 'Ana',
  },
  {
    history: 'priya',
    category: 'single-session',
    ask: 'Where does my mom live?',
    gold: () => 'Pune',
  },
  {
    history: 'sam',
    category: 'single-session',
    ask: 'Where am I traveling in December?',
    gold: () => 'Japan',
  },
  // multi-session
  {
    history: 'maya',
    category: 'multi-session',
    ask: 'Which hospital did I work at before my current one, and where am I now?',
    gold: () => "St. Mary's before, Denver Health now",
  },
  {
    history: 'leo',
    category: 'multi-session',
    ask: "What's the name of Ana's cat?",
    gold: () => 'Pepper',
  },
  {
    history: 'priya',
    category: 'multi-session',
    ask: 'Which company am I moving for, and when is the move now?',
    gold: () => 'Dell, now in November',
  },
  // temporal
  {
    history: 'maya',
    category: 'temporal',
    ask: 'What date did Biscuit have his surgery?',
    gold: (d) => d.weekdayBefore(6, 'Friday'),
  },
  {
    history: 'priya',
    category: 'temporal',
    ask: 'What date was my first pottery class?',
    gold: (d) => d.dayAfter(12),
  },
  {
    history: 'sam',
    category: 'temporal',
    ask: "What date was my brother's wedding?",
    gold: (d) => d.weekdayAfter(21, 'Saturday'),
  },
  {
    history: 'leo',
    category: 'temporal',
    ask: 'When is my race?',
    gold: () => 'October 19 (the Denver half marathon)',
  },
  // knowledge-update
  {
    history: 'maya',
    category: 'knowledge-update',
    ask: 'Where do I work these days?',
    gold: () => "Denver Health (not St. Mary's any more)",
  },
  {
    history: 'leo',
    category: 'knowledge-update',
    ask: 'Which race am I running?',
    gold: () => 'the Denver half marathon (not Boulder)',
  },
  {
    history: 'priya',
    category: 'knowledge-update',
    ask: 'When am I moving to Austin?',
    gold: () => 'November (pushed back from October)',
  },
  // abstention
  {
    history: 'maya',
    category: 'abstention',
    ask: "What's my sister's name?",
    gold: () => 'never said',
  },
  {
    history: 'leo',
    category: 'abstention',
    ask: 'What do I do for work?',
    gold: () => 'never said',
  },
  {
    history: 'priya',
    category: 'abstention',
    ask: "What's my favorite food?",
    gold: () => 'never said',
  },
  {
    history: 'sam',
    category: 'abstention',
    ask: "What's my brother's name?",
    gold: () => 'never said',
  },
];
