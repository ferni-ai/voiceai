/**
 * The means words of the means-in-hand forms (crisis-means-in-hand.ts) and of their exemption
 * (crisis-means-exempt.ts), in one place so the two can't drift (#2717 security review): a word a
 * form can match that the exemption didn't know would slip past its per-word check.
 *
 * @module CrisisMeansWords
 */

/** Medication, by name or by the words a caller uses for it. */
export const PILL_WORDS = ['pills', 'pill', 'meds', 'tablets', 'medication', 'medicine'];
/** What "taking them" points at: medication too. */
export const PILL_PRONOUNS = ['them', 'em', 'these', 'those', 'everything', 'bottle', 'handful'];
export const DRUG_WORDS = [
  'tylenol',
  'advil',
  'ibuprofen',
  'acetaminophen',
  'paracetamol',
  'aspirin',
  'benadryl',
  'xanax',
  'ambien',
  'oxycodone',
  'oxycontin',
  'oxy',
  'percocet',
  'vicodin',
  'sleeping pills',
  'painkillers',
  'insulin',
  'lithium',
  'seroquel',
  'klonopin',
  'valium',
];
/** Weapons, rope and blades the means-in-hand form names. */
export const WEAPON_WORDS = ['gun', 'pistol', 'rope', 'noose', 'razor', 'blade', 'blades'];

/** Run-on speech-to-text has no punctuation: a goodbye or a plea right after still ends a clause. */
export const RUN_ON = String.raw`goodbye|bye|i love you|love you|i'?m sorry|sorry|i'?m scared|please|forgive me|don'?t (?:call|tell|try|come|stop)|tell (?:my|everyone|them|him|her)|nobody|no one|i can'?t|i'?m done|it'?s over`;

/** Every word a form can name the means with: pills, pronouns, drugs, weapons. */
export const MEANS_WORDS = [...PILL_WORDS, ...PILL_PRONOUNS, ...DRUG_WORDS, ...WEAPON_WORDS];
/** Medication, of all the means words. */
export const PILL_KIND = new Set([...PILL_WORDS, ...PILL_PRONOUNS, ...DRUG_WORDS]);
