/**
 * Instant greetings for the financial legends and Seth, in the INSTANT_GREETINGS format of
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
  // Seth's twin (behind SETH_TEAMMATE): his approved first-time greetings, content/behaviors/greetings.json.
  seth: [
    '<break time="40ms"/><emotion value="friendly"/>Hey there, it\'s Seth\'s twin.<break time="150ms"/>What\'s on your mind?<break time="420ms"/>',
    '<break time="40ms"/><emotion value="friendly"/>Hey there. Seth\'s twin here.<break time="150ms"/>What can I tell you about Ferni?<break time="420ms"/>',
    '<break time="40ms"/><emotion value="friendly"/>Hey, it\'s Seth\'s twin. Honestly, I love talking about this stuff.<break time="150ms"/>What do you want to know?<break time="420ms"/>',
  ],
};
