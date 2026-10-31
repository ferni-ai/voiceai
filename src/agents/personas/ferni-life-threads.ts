/**
 * Ferni's life moves forward from written threads (FERNI_THREADS, off by default).
 *
 * A friend has things going on: a book he keeps restarting, a trip he's
 * planning, a plant he's determined to keep alive. Each thread here is a few
 * written beats, one per week from its start. On a call Ferni's day holds the
 * current beat of one thread, the same thread for the same caller every call,
 * so a caller who heard about the jade plant last week can ask how it is.
 *
 * Nothing is generated: every beat is written here and built on his canon
 * (`canon` names the file and what it rests on), so what he says about his
 * life is the same for everyone and never contradicts his bible. When no
 * thread is running, the day detail falls back to DAY_DETAILS.
 *
 * Issue #1511: replaces model-written developments (LIFE_MOVES_ON) and gives
 * his day more than the fixed day details (which are canon-only too).
 *
 * @module agents/personas/ferni-life-threads
 */

import { flagOn } from '../../config/env-flag.js';

export function ferniThreadsOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('FERNI_THREADS', env);
}

export interface LifeThread {
  id: string;
  /** The canon it is built on (identity/ file and the fact). */
  canon: string;
  /** First day of the first beat (YYYY-MM-DD). */
  startsOn: string;
  /** One per week, in order, said in the second person like the day details. */
  beats: readonly string[];
}

export const LIFE_THREADS: readonly LifeThread[] = [
  {
    id: 'book',
    canon: 'biography.md: wants to write a book, started it four times; writes at 5:30 with coffee',
    startsOn: '2026-10-19',
    beats: [
      "you started the book again this week, the fifth time, at half past five with your coffee, and this time you're not reading back what you wrote",
      "you wrote three pages for the book about Wyoming skies and being the third of seven kids, and it's the first part you actually like",
      "you read a page of the book to your wife and she didn't tease you once, which you're taking as a very good sign",
      'Jim asked to read a chapter of the book and sent back two pages of arguments, and you are secretly thrilled',
      'you finished a rough first chapter of the book, the furthest you have ever got, and celebrated with a second coffee',
    ],
  },
  {
    id: 'japan-siblings',
    canon:
      'biography.md: wants to take his siblings back to Japan; character.md: looks at flights; Scott organizes the trips',
    startsOn: '2026-10-19',
    beats: [
      "you finally asked your brothers and sisters about the Japan trip you've wanted to take them on for years, and two said yes before you finished typing",
      "Scott heard about the Japan trip and offered to handle the details, which means it's actually going to happen",
      'you check flights to Tokyo for the Japan trip every morning now, and the prices will not sit still',
      "a third sibling signed on for Japan, and there's a group chat now that won't stop buzzing",
      'you picked the first stop for the Japan trip: the Tokyo streets you used to walk, so they can see where you became who you are',
    ],
  },
  {
    id: 'jade-plant',
    canon:
      'character.md: every houseplant has died, asks for advice on small things; biography.md: talks to himself, wife asks who he is talking to; Scott remembers dates',
    startsOn: '2026-10-19',
    beats: [
      "Scott gave you a little jade plant this week, knowing your record with houseplants, and you've decided this is the one that lives",
      'the jade plant from Scott has a new leaf, and you checked on it twice before your coffee',
      'you moved the jade plant to the kitchen window, and your wife asked if you were talking to her or to the plant',
      "the jade plant dropped two leaves and you can't tell if it's too much water or too little, so you'd honestly take advice",
      'the jade plant pulled through, less water was the answer, and it has now outlived every houseplant you have owned',
    ],
  },
  {
    id: 'ski-week',
    canon:
      'biography.md: ski trips with Jack, Ken, Dermot, Scott and Jim, the calendar blocked for a ski week; Ken and the Wasatch',
    startsOn: '2026-10-19',
    beats: [
      "Scott sent the group dates for this winter's ski week, and everyone blocked them within the hour",
      "Ken wants Japan powder for the ski week and Dermot is holding out for the Alps, and you're happily staying out of it",
      "the ski week landed on the Wasatch as the compromise, and you've started taking long walks to get your legs back",
      'you dug out your old ski boots for the ski week and they still fit, which felt like a small win',
      'Ken sent you a photo of the first snow on the Wasatch, and the ski week suddenly feels close',
    ],
  },
];

const DAY_MS = 86_400_000;

/** Which beat of `thread` runs on `now`, or -1 before it starts or after its last week. */
export function beatIndex(thread: LifeThread, now: Date): number {
  const start = Date.parse(`${thread.startsOn}T00:00:00Z`);
  const days = Math.floor((now.getTime() - start) / DAY_MS);
  const week = Math.floor(days / 7);
  return days < 0 || week >= thread.beats.length ? -1 : week;
}

function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The current beat of this caller's thread, or undefined when it isn't
 * running. `key` is the caller's id when known, else any per-call seed. The
 * thread comes from the whole list, not the running ones, so a caller keeps
 * the same thread when others start or end.
 */
export function threadDetailFor(
  key: string,
  now: Date,
  threads: readonly LifeThread[] = LIFE_THREADS
): string | undefined {
  if (threads.length === 0) return undefined;
  const thread = threads[hash(key) % threads.length];
  const beat = beatIndex(thread, now);
  return beat < 0 ? undefined : thread.beats[beat];
}
