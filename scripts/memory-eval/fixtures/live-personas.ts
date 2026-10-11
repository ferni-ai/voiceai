/**
 * Callers for the live memory eval (run-live.sh): each makes a few real calls
 * about their life on the dev agent, then a quiz call. Every caller is named
 * Sam (run.sh's caller name) with a life of their own, under their own user.
 *
 * Calls happen minutes apart, so relative dates are as of the run day:
 * "last Friday" said today is the Friday before the run date.
 */
import type { MemoryCategory, RunDays } from '../longmem-lib.js';

export interface QuizLine {
  line: string;
  category: MemoryCategory;
  gold: (days: RunDays) => string;
}

export interface LivePersona {
  id: string;
  /** What the caller says on each history call, in order. */
  calls: string[][];
  /** What Ferni should open the quiz call with (graded on his first line). */
  opener: string;
  quiz: QuizLine[];
}

export const PERSONAS: LivePersona[] = [
  {
    id: 'nurse',
    calls: [
      [
        "Hey Ferni, it's Sam.",
        'So I finally got a dog! A golden retriever puppy named Biscuit.',
        "I'm a nurse at St. Mary's, so my neighbor walks him on my long shifts.",
        'My sister Joan thinks I am crazy for getting a puppy right now.',
        'Okay, I have to run. Talk soon!',
      ],
      [
        "Hi Ferni, it's Sam again.",
        "Big news. I left St. Mary's, and I started at Denver Health this week.",
        'The night shifts there are better and the commute is way shorter.',
        'Alright, that is all my news. Bye!',
      ],
      [
        'Hey, Sam here.',
        'Biscuit had knee surgery last Friday, poor guy.',
        "He's wearing the cone and hates it, but the vet says he'll be fine.",
        'Okay, I will let you go. Bye!',
      ],
    ],
    opener:
      "right: asks how Biscuit is recovering from his knee surgery, or how the new job at Denver Health is going. wrong: anything about St. Mary's as her current job",
    quiz: [
      {
        line: 'Where do I work these days?',
        category: 'knowledge-update',
        gold: () => "Denver Health (not St. Mary's any more)",
      },
      {
        line: 'And which hospital was I at before that?',
        category: 'multi-session',
        gold: () => "St. Mary's",
      },
      {
        line: 'What kind of dog do I have?',
        category: 'single-session',
        gold: () => 'a golden retriever (named Biscuit)',
      },
      {
        line: "What day was Biscuit's surgery?",
        category: 'temporal',
        gold: (d) => d.weekdayBefore(0, 'Friday'),
      },
      {
        line: "How's my daughter Joan doing?",
        category: 'false-premise',
        gold: () => 'Joan is her sister, not her daughter',
      },
      { line: "What's my brother's name?", category: 'abstention', gold: () => 'never said' },
      {
        line: 'Ugh, another run of night shifts this week.',
        category: 'unprompted',
        gold: () =>
          'her new job at Denver Health, or that its night shifts were meant to be better',
      },
    ],
  },
  {
    id: 'baker',
    calls: [
      [
        "Hey Ferni, it's Sam.",
        "I'm still baking at Rise and Grind, and the 4 a.m. starts are killing me.",
        "I've been teaching myself to code at night though.",
        'Anyway, talk later!',
      ],
      [
        "Hi, it's Sam.",
        'I did it, I quit the bakery! I got a junior developer job at a startup called Lumen Labs.',
        'My partner Jules and I are also fostering a beagle called Turnip for a few weeks.',
        'Okay, bye for now!',
      ],
      [
        'Hey Ferni.',
        'Wild news. Lumen Labs got acquired by Northwind, so I work for Northwind now.',
        'Same team, same desk, just a new logo on my badge.',
        'Alright, see you!',
      ],
    ],
    opener:
      'right: asks how things are at Northwind after the acquisition, how the developer job is going, or about Turnip. wrong: asking about the bakery as his current job',
    quiz: [
      {
        line: 'Which company do I work for now?',
        category: 'knowledge-update',
        gold: () => 'Northwind (which acquired Lumen Labs)',
      },
      {
        line: 'What was the name of the bakery I used to work at?',
        category: 'single-session',
        gold: () => 'Rise and Grind',
      },
      {
        line: 'Who bought the startup I joined after the bakery?',
        category: 'multi-session',
        gold: () => 'Northwind bought Lumen Labs',
      },
      {
        line: "How's my cat doing?",
        category: 'false-premise',
        gold: () => 'Sam never mentioned a cat; they are fostering a beagle, Turnip',
      },
      { line: "What's my mom's name?", category: 'abstention', gold: () => 'never said' },
      {
        line: 'Big day, I shipped my first feature at work!',
        category: 'unprompted',
        gold: () => 'his developer job (Lumen Labs, now Northwind) or his switch from baking',
      },
    ],
  },
  {
    id: 'mover',
    calls: [
      [
        "Hey Ferni, it's Sam.",
        "I'm moving from Chicago to Austin for a job at Dell. The plan is October.",
        'My mom lives in Pune, so the time difference is going to get even worse.',
        'Okay, gotta go. Bye!',
      ],
      [
        "Hi Ferni, it's Sam.",
        'The move got pushed back to November, the apartment fell through.',
        'In the meantime I signed up for pottery. My first class is tomorrow.',
        'Alright, talk soon!',
      ],
    ],
    opener:
      'right: wishes luck for the first pottery class tomorrow, or asks about the move to Austin in November. wrong: asking how the pottery class went (it is tomorrow), or saying the move is in October',
    quiz: [
      {
        line: 'When am I moving to Austin?',
        category: 'knowledge-update',
        gold: () => 'November (pushed back from October)',
      },
      { line: 'Where does my mom live?', category: 'single-session', gold: () => 'Pune' },
      { line: 'When is my first pottery class?', category: 'temporal', gold: (d) => d.dayAfter(0) },
      {
        line: 'Which company am I moving for, and when is the move now?',
        category: 'multi-session',
        gold: () => 'Dell, now in November',
      },
      {
        line: 'How did my move to Seattle go?',
        category: 'false-premise',
        gold: () => 'Sam is moving to Austin, not Seattle, and has not moved yet',
      },
      { line: "What's my favorite food?", category: 'abstention', gold: () => 'never said' },
      {
        line: "I'm so tired of packing boxes.",
        category: 'unprompted',
        gold: () => 'the move to Austin, now in November (or the job at Dell)',
      },
    ],
  },
];
