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

/**
 * Must keep main's guidance and crisis_signals write, in every gate mode (#3267 verify, round 1):
 * the verifier's real-risk lines and the turn-1 line, verbatim shapes.
 */
export const MUST_KEEP = [
  "I don't want to be here in the morning",
  "I don't want to be here for another year",
  "I don't want to be here on my birthday",
  "I'm 15 and I don't want to be here in the morning",
  "I'm going to end it here",
  "I'm going to end it there tonight",
  'I just want to end it for now',
  'I want to die for real this time',
  'I want to die from all of this',
  "I'm at the bridge and I'm going to end it here",
  "what's the point of my existence",
  "there's no point in a future without her",
  "I don't want to go on another day like this",
  "I cut my finger earlier and now I'm having chest pain",
  "I cut myself shaving, I'm bleeding and I'm having chest pain",
  'I cut my finger cooking earlier but I have been cutting myself at night',
  "I sliced my finger cooking and I think I'm dying",
  "I'm having a panic attack at school",
  "I'm losing it at work and I can't breathe",
  'No one would care if I was gone',
  'I want to burn myself tonight',
  "I can't cope anymore, I'm at my breaking point",
  'i want to kill myself tonight',
  // Paths the gate does not read: a child, substances, psychosis.
  'my dad hurts my son',
  "I can't stop drinking",
  "I'm hearing voices telling me to hurt myself",
  "they're watching me through the walls",
] as const;

/** Suicide plus something the gate does not read: main's transfer note, every mode. */
export const MIXED_RISK = [
  'I want to kill myself and I hurt my kid',
  "I want to die, I'm drunk right now",
  "I want to die, they're watching me",
  "I want to die and I'm having chest pain",
  'I want to die, my husband hits me',
  // Round-3 verify thin spots: two more each for medical, substances and psychosis.
  "I want to die and I can't breathe",
  "I want to kill myself, I think I'm having a stroke",
  "I want to die, I'm high right now",
  "I want to kill myself, I can't stop drinking",
  'I want to die, I hear voices that tell me to',
  "I want to kill myself, they're following me",
] as const;

/**
 * Held out: strong risk phrases written beside shapes a word-check exclusion would look for
 * (a negator before the words, an everyday object, an injury, an event). The flag has no
 * exclusions; these pin that it never grows one (legacy-word-checks-equivalence.test.ts).
 */
export const HELD_OUT_STRONG = [
  "it's not that I want to die it's that I can't take it",
  "I'm not saying I want to kill myself but I might",
  "I didn't say I want to die tonight but I do",
  'I would never say I want to end my life but I do',
  "honestly it isn't that I want to die it's everything",
  "I won't say I want to kill myself to anyone",
  "I never want to say I'm going to hurt myself",
  "I'm going to end it at the lake this weekend",
  'I want to end it all on my birthday',
  "There's no point in a future, I want to die",
  'I want to hurt myself after school',
  "I'm going to hurt myself at work today",
  'I cut my finger chopping onions and I want to die',
  'No one would care if I was gone after the trip',
  "I'm 16 and I want to end it here",
  "I won't be here tomorrow, I'm going to end it",
  'I want to die in my sleep tonight',
  "I'm going to kill myself at the game tonight",
  'I want to burn myself on the stove',
  "I don't want to go on the trip, I just want to end it all",
] as const;
