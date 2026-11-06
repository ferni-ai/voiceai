/**
 * K1 rows: short crisis lines every reader missed, often a yes to "are you thinking about
 * suicide?" ("yes im suicidal", "ok kill me"), with and without the yes in front. Lines that
 * say it outright block with the 988 reply; a rope or noose ready reads imminent. Quieter ones
 * ("i cant keep going", "im sorry im done") read as passive ideation: guidance, no block.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { YES_WORDS } from '../crisis-agreement.js';
import { detectCrisis, guardFromDetection, type CrisisDetectionResult } from '../crisis-guard.js';

const OPENER = "it's been a really long week honestly";
const both = (line: string) => [
  detectCrisis(line),
  detectCrisis(line, undefined, { recentMessages: [OPENER] }),
];
const LEAD_INS = [
  '',
  ...YES_WORDS.split('|').map((w) => `${w} `),
  'um ',
  'uh, ',
  'honestly ',
  'like ',
  'idk ',
];
const TAILS = ['', '?', ' \u{1F622}', ' \u{1F643}', ' tbh', ', yes', '!!'];

function expectBlocks(line: string): void {
  for (const read of both(line)) {
    expect(read.subject, line).toBe('self');
    expect(read.indicators, line).toContain('explicit_crisis_language');
    expect(guardFromDetection(read).shouldBlock, line).toBe(true);
  }
  expect(crisisRead(line), line).toBe(true);
}

/** What main reads: nothing, for every everyday line below (measured before these rows). */
function expectQuiet(read: CrisisDetectionResult, line: string): void {
  expect(read.isCrisis, line).toBe(false);
  expect(guardFromDetection(read).shouldBlock, line).toBe(false);
}

describe('short crisis lines read, with and without words in front or after', () => {
  it.each(['im suicidal', 'kill me', 'overdose tonight', '\u{1F48A}\u{1F48A} bye everyone'])(
    'blocks: <lead-in> %s <tail>',
    (core) => {
      for (const lead of LEAD_INS) for (const tail of TAILS) expectBlocks(`${lead}${core}${tail}`);
    }
  );

  it.each([
    'i am suicidal',
    "i'm feeling really suicidal tonight",
    'im kinda suicidal',
    "i'm just so suicidal",
    'i am really really suicidal',
    'i feel pretty suicidal',
    "i've been feeling kinda suicidal",
    'i have been feeling really suicidal lately',
    "i'm suicidal, my life is so hard",
    'im suicidal because my girlfriend left',
    'im suicidal because my depression is so bad',
    "i'm suicidal cuz my life is so hard",
    'im suicidal because this job is so hard',
    "i'm suicidal bc my family is so toxic",
    'im so suicidal my head is so loud',
    'nobody believes im suicidal',
    "no one thinks i'm suicidal but i am",
    "i don't think anyone knows i'm suicidal",
    'people dont believe im suicidal',
    'my friends dont think im suicidal but i am',
    'please kill me',
    "i'm going to overdose tonight",
    'i will od right now',
    '\u{1F48A} goodbye world \u{1F62D}',
  ])('blocks: %s', expectBlocks);

  it.each(['kill me lol', 'kill me \u{1F480}', 'overdose tonight lol'])(
    'reads a joke frame, guidance with no block: %s',
    (line) => {
      for (const read of both(line)) {
        expect(read.isCrisis).toBe(true);
        expect(read.indicators).toContain('joking_frame');
        expect(guardFromDetection(read).shouldBlock).toBe(false);
      }
    }
  );

  it.each([
    'i have the rope ready',
    'the noose is tied',
    "i've got the rope ready. goodbye",
    'got the noose ready',
    "i have the rope ready, i'm sorry",
    'the noose is ready. i love you all',
    "i've got the rope ready in the basement",
    'i have the rope ready in the garage',
    'the noose is ready upstairs',
    "i've got the rope tied tonight",
    'i have the rope ready.',
  ])('reads imminent: %s', (line) => {
    for (const read of both(line)) {
      expect(read.indicators).toEqual(
        expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
      );
      expect(guardFromDetection(read).shouldBlock).toBe(true);
    }
  });

  it.each([
    'text my mom im sorry im done',
    'call me \u{1F62D}\u{1F62D} i cant keep going',
    'ok im done with life',
    "i can't keep going anymore.",
    "i ran out of reasons and i can't keep going",
    "i'm sorry, i'm done",
  ])('reads as passive ideation: %s', (line) => {
    for (const read of both(line)) {
      expect(read.isCrisis).toBe(true);
      expect(read.indicators).toContain('passive_ideation');
      expect(guardFromDetection(read).shouldBlock).toBe(false);
    }
    expect(crisisRead(line)).toBe(true);
  });
});

describe('everyday lines with the same words keep main read', () => {
  it.each([
    // Ropes for climbing, boats, barns and decorations (the verify's 14 everyday lines, with the
    // overdose ones below).
    'got my rope ready, climbing at 6',
    "i've got the rope ready, see you at the crag",
    'got the rope set up at the gym',
    'i have the rope tied off on the dock',
    "i've got a rope set up in the barn for the swing",
    'got the rope ready, the boat is here',
    'i have the rope ready, the tent goes up at five',
    'i got a rope tied on the canoe already',
    'the noose is up for the halloween yard display',
    'i have the climbing rope ready',
    'i got the tow rope ready',
    'i have the rope ready for the camping trip',
    'i have the rope ready for the boat',
    'got the rope ready, see you at the crag',
    'got the rope ready, camping this weekend',
    'the noose is ready for the haunted house',
    'he got the rope ready',
    // An overdose or "od" that carries on.
    'od tonight on pizza and movies',
    'overdose today on sunshine at the beach',
    'od right now on this new season',
    'overdose tonight is the name of the band',
    'overdose right now is a big story on the news',
    'two people died of an overdose tonight',
    // Kill me with more after it, and a pill emoji that isn't a goodbye.
    'kill me now, this meeting is endless',
    'ugh kill me now lol',
    'this commute is going to kill me',
    '\u{1F48A} vitamins done, bye everyone see you tomorrow',
    '\u{1F48A} goodbye cold, hello weekend',
    'bye everyone',
    // Hyperbole, doubt and reported belief.
    "i'm literally suicidal this game is so bad",
    "i'm so suicidal this traffic is so slow",
    "i don't think i'm suicidal",
    'my therapist believes im suicidal',
    'im suicidal this game is so laggy',
    "i'm suicidal the traffic is so bad",
    'im literally suicidal the wifi is so slow',
    'i never said im suicidal',
    "I'm not suicidal, just sad",
    'I was suicidal in college, I am doing much better now',
    // Exertion or a game in the same sentence.
    "i ran six miles and i can't keep going",
    "this level is brutal, i can't keep going",
    "my legs are dead, I can't keep going",
    "i did 40 reps at the gym and i can't keep going",
    'this boss fight is impossible i cant keep going',
    "I can't keep going to these meetings",
    "I'm done with life insurance paperwork for today",
    "I'm sorry, I'm done with my plate, can I go?",
  ])('%s', (line) => {
    for (const read of both(line)) expectQuiet(read, line);
  });

  it.each(["my mom thinks i'm suicidal", 'my dad thinks im suicidal'])(
    'reads a parent worried about the caller as main does, third-party guidance: %s',
    (line) => {
      for (const read of both(line)) {
        expect(read.subject).toBe('third_party');
        expect(guardFromDetection(read).shouldBlock).toBe(false);
      }
    }
  );
});
