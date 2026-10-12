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
 *
 * The last three histories are harder on recall: questions that share no
 * words with the memory they need (noor), a fact replaced twice (eli), and a
 * crowded history where a turn's few recalled facts must be the right ones
 * (ruth).
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
  {
    id: 'noor',
    name: 'Noor',
    sessions: [
      {
        daysAgo: 24,
        user: [
          'I pulled my groin playing five-a-side, so now I see a physical therapist, Dr. Okonkwo.',
          'She has me doing Copenhagen planks every morning, which are brutal.',
        ],
      },
      {
        daysAgo: 10,
        user: [
          "Work's been fine. I'm a sound engineer for a podcast studio downtown.",
          'My partner Jules and I are fostering a beagle called Turnip for a few weeks.',
        ],
      },
    ],
  },
  {
    id: 'eli',
    name: 'Eli',
    sessions: [
      {
        daysAgo: 60,
        user: [
          "I'm still baking at Rise and Grind, the 4 a.m. starts are killing me.",
          "I've been teaching myself to code at night though.",
        ],
      },
      {
        daysAgo: 33,
        user: [
          'I did it, I quit the bakery! I got a junior developer job at a startup called Lumen Labs.',
          'First week was terrifying but everyone is really kind.',
        ],
      },
      {
        daysAgo: 5,
        user: [
          'Wild news. Lumen Labs got acquired by Northwind, so I work for Northwind now.',
          'Same team and same desk, just a new logo on my badge.',
        ],
      },
    ],
  },
  {
    id: 'ruth',
    name: 'Ruth',
    sessions: [
      {
        daysAgo: 45,
        user: [
          'My husband Walt is getting his hip replaced next month, he is nervous.',
          'My sister Joan in Tucson keeps calling to check on him.',
          'And my book club picked Lessons in Chemistry, I am halfway through.',
        ],
      },
      {
        daysAgo: 20,
        user: [
          "My nephew Marcus just started at Purdue, he's studying aerospace engineering.",
          "Walt's surgery went well, he's already walking with a cane.",
          'Our grandson Theo turns seven next week and he wants a dinosaur cake.',
        ],
      },
      {
        daysAgo: 4,
        user: [
          'Joan is coming up from Tucson for Thanksgiving this year.',
          'The book club moved on to The Covenant of Water, it is long but lovely.',
          'And I finally started water aerobics at the Y on Tuesdays.',
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
  // harder: no shared words, facts replaced twice, a crowded history
  {
    history: 'noor',
    category: 'single-session',
    ask: "Who's helping me rehab my injury?",
    gold: () => 'Dr. Okonkwo, the physical therapist',
  },
  {
    history: 'noor',
    category: 'single-session',
    ask: 'What exercise am I supposed to do every morning?',
    gold: () => 'Copenhagen planks',
  },
  {
    history: 'noor',
    category: 'single-session',
    ask: "What's the name of the dog we're looking after?",
    gold: () => 'Turnip (a beagle)',
  },
  {
    history: 'noor',
    category: 'multi-session',
    ask: 'How did I get hurt, and who is treating me for it?',
    gold: () => 'pulled a groin playing five-a-side football; Dr. Okonkwo',
  },
  {
    history: 'noor',
    category: 'abstention',
    ask: "What's my physical therapist's first name?",
    gold: () => 'never said',
  },
  {
    history: 'eli',
    category: 'knowledge-update',
    ask: 'Which company do I work for now?',
    gold: () => 'Northwind (which acquired Lumen Labs)',
  },
  {
    history: 'eli',
    category: 'multi-session',
    ask: 'Who bought the startup I joined after leaving the bakery?',
    gold: () => 'Northwind bought Lumen Labs',
  },
  {
    history: 'eli',
    category: 'single-session',
    ask: 'What was the name of the bakery I used to work at?',
    gold: () => 'Rise and Grind',
  },
  {
    history: 'ruth',
    category: 'single-session',
    ask: 'Which university is Marcus at?',
    gold: () => 'Purdue',
  },
  {
    history: 'ruth',
    category: 'knowledge-update',
    ask: 'What is my book club reading right now?',
    gold: () => 'The Covenant of Water (not Lessons in Chemistry)',
  },
  {
    history: 'ruth',
    category: 'multi-session',
    ask: 'How is my husband recovering from his operation?',
    gold: () => "well: Walt's hip replacement went well and he's walking with a cane",
  },
  {
    history: 'ruth',
    category: 'single-session',
    ask: 'What day do I go to water aerobics?',
    gold: () => 'Tuesdays',
  },
  {
    history: 'ruth',
    category: 'abstention',
    ask: "What's my daughter's name?",
    gold: () => 'never said',
  },
];
