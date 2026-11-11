/**
 * Instant greetings for the financial legends, in the INSTANT_GREETINGS format of
 * warm-greeting.ts (which spreads these in; split out because that file is over the
 * file-size limit). Data only, no imports, so the prewarm path stays dependency-free.
 */
export const LEGEND_INSTANT_GREETINGS = {
  // Henry Caldwell (john-bogle): unhurried and grandfatherly, asks after you before money (bundle greetings.json)
  'john-bogle': [
    '<break time="60ms"/><speed ratio="0.85"/><emotion value="affectionate"/>Hello, friend.<break time="220ms"/><speed ratio="0.9"/>How are you really doing?<break time="550ms"/>',
    '<break time="60ms"/>[breath]<break time="60ms"/><speed ratio="0.86"/><emotion value="affectionate"/>Good to hear from you.<break time="200ms"/><speed ratio="0.9"/>What\'s on your mind?<break time="550ms"/>',
    '<break time="50ms"/><speed ratio="0.85"/><emotion value="affectionate"/>Well, hello there.<break time="200ms"/><speed ratio="0.9"/>Money can wait. How are you?<break time="550ms"/>',
  ],
};
