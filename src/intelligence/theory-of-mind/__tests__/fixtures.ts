/** One caller across calls: they joke when anxious, then want practical help. */
export const T0 = new Date('2026-10-01T18:00:00Z');
export const DAY = 86_400_000;

// Call 1: the caller jokes when anxious, twice, and wants practical help.
export const CALL_1 = [
  { role: 'assistant', content: 'Hey Sam, how are you doing?' },
  {
    role: 'user',
    content:
      "Honestly? I'm a wreck. Interview at Stripe Monday. Ha, maybe I'll just fake my own death.",
  },
  { role: 'assistant', content: 'Oof. That sounds like a lot.' },
  {
    role: 'user',
    content: "Please don't do the sympathy thing. Just tell me how to prep for system design.",
  },
  {
    role: 'user',
    content:
      'Also my landlord is selling the building. Guess I live in a box now, lol. What do I actually do?',
  },
];
export const READING_1 = JSON.stringify({
  told: ['Stripe interview on Monday', 'landlord is selling their building'],
  observations: [
    {
      key: 'jokes-when-anxious',
      kind: 'coping',
      statement: 'jokes when anxious, then wants practical help',
      cue: 'joked about faking a death right after saying the interview had them rattled',
    },
    {
      key: 'jokes-when-anxious',
      kind: 'coping',
      statement: 'jokes when anxious, then wants practical help',
      cue: 'made a joke about living in a box, then asked what to actually do',
    },
    {
      key: 'practical-over-sympathy',
      kind: 'support',
      statement: 'wants solutions, not sympathy, when stressed',
      cue: 'waved off sympathy and asked for prep steps',
    },
  ],
  contradicted: [],
  current: { state: 'anxious about the Stripe interview', days: 5 },
  sensitivities: [],
});
