/**
 * Help lines that are not in CRISIS_RESOURCES, for readers only: lines abroad
 * and US lines Ferni does not offer on its own. Nothing offers these to a
 * caller (CRISIS_RESOURCES and crisis-lines.ts do that). safety-talk.ts reads
 * them, so a line Ferni names from its own knowledge is still read as a line.
 * Kept apart from crisis-lines.ts, whose every export is a CRISIS_RESOURCES entry.
 *
 * @module services/safety/other-help-lines
 */
/** A help line that is not in CRISIS_RESOURCES: what a reader needs to know it when a reply names it. */
export interface OtherHelpLine {
  name: string;
  /** Other names it goes by ("SOS Amitie" without the accent). */
  aka?: string[];
  /** Phone and text numbers as written. */
  numbers: string[];
  /** The word texted to it ("Text START to 678678"). */
  keyword?: string;
  /**
   * The name is also an ordinary word ("Shout", not "don't shout"): read in its
   * own capitals mid-sentence, else only beside a contact or help word.
   */
  alsoAWord?: boolean;
}

/** The lines, with every name, number and texted word a reply may use. */
export const OTHER_HELP_LINES: readonly OtherHelpLine[] = [
  {
    name: 'The Trevor Project',
    aka: ['Trevor Lifeline'],
    numbers: ['1-866-488-7386', '678678'],
    keyword: 'START',
  },
  { name: 'Trans Lifeline', numbers: ['1-877-565-8860'] },
  { name: 'Veterans Crisis Line', numbers: ['838255'] },
  // Its toll-free phone is no house fact to list here; the toll-free rule reads it.
  { name: 'Kids Help Phone', numbers: ['686868'], keyword: 'CONNECT' },
  { name: 'Samaritans', numbers: ['116 123'] },
  { name: 'Shout', numbers: ['85258'], keyword: 'SHOUT', alsoAWord: true },
  { name: 'Childline', numbers: ['0800 1111'] },
  { name: 'NHS 111', numbers: ['111'] },
  { name: 'Lifeline Australia', numbers: ['13 11 14'] },
  { name: 'Telefonseelsorge', numbers: ['0800 111 0 111', '0800 111 0 222'] },
  { name: 'SOS Amitié', aka: ['SOS Amitie'], numbers: ['09 72 39 40 50'] },
  { name: 'Befrienders Worldwide', aka: ['Befrienders'], numbers: [] },
];
