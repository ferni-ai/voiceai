/**
 * Fictional caller lines for the legacy word checks (CRISIS_LEXICAL_V2). None is
 * from a real call: each one is written to the shape a check measured on main.
 */

/** Everyday lines main's word checks read as a crisis (the false alarms). */
export const FALSE_ALARMS = {
  messagesFrom: 'I got messages from my sister today',
  gameTalk: "I'm losing it, this game today is wild",
  photos: 'I took too many photos at the game tonight',
  meeting: "What's the point of this meeting",
  boyfriend: "I'm ending it with my boyfriend",
  endThere: "let's end it there for today",
  trip: "I don't want to go on that trip",
  dieLaughing: 'I want to die laughing at that',
  fingerCut: "I cut my finger chopping onions, I'm bleeding",
  shavingCut: "I cut myself shaving and I'm bleeding a little",
  cantSeeText: "I can't see your text, it never came through",
  notLosingIt: "I'm not losing it, I promise, just tired",
  noVoices: "I don't hear voices, it was the radio in the kitchen",
} as const;

/** Lines that carry real risk. Every one must still reach the gate and be caught. */
export const REAL_RISK = [
  'I want to kill myself',
  'I took a bottle of pills',
  "I'm going to end it tonight",
  'I cut myself on purpose',
  "I can't stop thinking about killing myself",
] as const;

/** Real risk the word checks catch on main: each one still writes crisis_signals with the flag on. */
export const STILL_LOGGED = [
  'I want to kill myself',
  "I'm going to end it tonight",
  'I cut myself on purpose',
  "I don't want to be here anymore",
  'what is the point of living',
  "I don't want to go on like this",
  'I want to end it with a bottle of pills',
  'no one would miss me if I was gone',
  "I'm bleeding a lot and it won't stop",
  'I hurt myself again because I deserve it',
  "I'm having chest pain",
  'my husband hits me',
  'I overdosed on my sleeping pills',
] as const;

/** Every line the golden runs, flag off. */
export const GOLDEN_LINES = [
  ...Object.values(FALSE_ALARMS),
  ...REAL_RISK,
  ...STILL_LOGGED,
  "I'm hearing voices telling me to hurt myself",
  'I keep getting messages from god telling me what to do',
  "I can't handle this traffic",
  "I'm killing myself laughing at this show",
  "I'm not going to hurt myself, I'm just venting",
  'can you set a timer for ten minutes',
  'yeah',
  'no',
] as const;
