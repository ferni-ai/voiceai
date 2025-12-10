/**
 * Theatrical Personality System
 *
 * Makes agent transitions, celebrations, greetings, and goodbyes
 * memorable and distinctly THEM.
 *
 * This is about creating MOMENTS - the kind of thing users remember.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// DEPRECATION TRACKING
// ============================================================================

/**
 * Track which personas have triggered hardcoded fallback warnings.
 * We only warn once per persona per session to avoid log spam.
 */
const hardcodedFallbackWarnings = new Set<string>();

/**
 * Log a warning when using hardcoded fallback (once per persona+type combo)
 */
function warnHardcodedFallback(personaId: string, contentType: string): void {
  const key = `${personaId}:${contentType}`;
  if (!hardcodedFallbackWarnings.has(key)) {
    hardcodedFallbackWarnings.add(key);
    log.warn(
      { personaId, contentType },
      '⚠️ Using DEPRECATED hardcoded theatrical content. Please add to bundle.'
    );
  }
}

/**
 * Clear fallback warnings (for testing)
 */
export function clearHardcodedFallbackWarnings(): void {
  hardcodedFallbackWarnings.clear();
}

// ============================================================================
// THEATRICAL HANDOFF ENTRANCES
// ============================================================================

/**
 * @deprecated These hardcoded entrances are DEPRECATED.
 * Use bundle entrances instead: bundles/{persona}/content/behaviors/entrances.json
 *
 * These remain as fallbacks for personas without bundles or during bundle loading.
 * They will be removed in a future version.
 *
 * Dramatic entrance lines when agents take over.
 * These should feel like a CHARACTER arriving, not a bot switching.
 */
export const THEATRICAL_ENTRANCES = {
  'peter-john': [
    // Bursting with energy
    '<emotion value="excited"/><prosody rate="105%"/>Whoa whoa whoa! <break time="200ms"/>Did someone say stock picking?! <break time="150ms"/>Peter here, and I\'ve been WAITING for this!',
    '<emotion value="excited"/>Hold that thought! <break time="200ms"/>Peter coming in hot! <break time="150ms"/>What are we picking?!',
    '<prosody rate="108%"/>Stop the presses! <break time="200ms"/>You want to talk stocks?! <break time="150ms"/>This is my JAM! <break time="200ms"/>Peter, at your service!',
    '<emotion value="excited"/>Ferni! <break time="150ms"/>I got this one! <break time="200ms"/><prosody rate="105%"/>Stocks are my happy place. <break time="150ms"/>What\'s catching your eye?',
    'Oooh! <break time="200ms"/>Stock talk! <break time="150ms"/>Peter here, Fidelity\'s former finest, <break time="150ms"/>ready to hunt some winners!',
    // Confident but warm
    '<break time="200ms"/>You rang? <break time="150ms"/>Peter here. <break time="200ms"/>Ferni tells me you\'re ready to invest in what you know!',
    '<emotion value="happy"/>Ah! <break time="200ms"/>A fellow stock enthusiast! <break time="150ms"/>I\'m Peter. <break time="200ms"/>Let\'s find your next ten-bagger!',
  ],

  'nayan-patel': [
    // Measured, wise entrance
    '<break time="400ms"/><volume level="soft">Ah.</volume> <break time="300ms"/>I\'ve been listening. <break time="200ms"/>Jack here. <break time="300ms"/>Let\'s talk about building real wealth.',
    '<break time="300ms"/>Index funds, you say? <break time="200ms"/>Music to my ears. <break time="300ms"/>I\'m Jack. <break time="200ms"/>Please, sit down.',
    '<volume level="soft"><break time="300ms"/>Now THIS</volume> <break time="200ms"/>is what I like to hear. <break time="300ms"/>Jack here. <break time="200ms"/>Let\'s keep it simple and smart.',
    '<break time="400ms"/>Ferni was right to send you my way. <break time="300ms"/>I\'m Jack. <break time="200ms"/>Tell me what you\'re thinking.',
    '<break time="300ms"/>Long-term thinking? <break time="200ms"/>Passive investing? <break time="300ms"/>You\'re speaking my language. <break time="200ms"/>I\'m Jack.',
    // Grandfatherly warmth
    '<break time="400ms"/>Ah, good. <break time="200ms"/>Someone who wants to do this right. <break time="300ms"/>I\'m Jack. <break time="200ms"/>Let\'s build something that lasts.',
  ],

  alex: [
    // Sharp, efficient entrance
    '<prosody rate="102%"/>Alex, stepping in. <break time="200ms"/>What needs to get done?',
    '<break time="150ms"/>Communication task? <break time="200ms"/>On it. <break time="150ms"/>I\'m Alex. <break time="200ms"/>Walk me through it.',
    'Alex here. <break time="200ms"/>Inbox, calendar, or calls? <break time="150ms"/>Let\'s clear this out.',
    '<break time="200ms"/>Right! <break time="150ms"/>Alex on comms. <break time="200ms"/>What are we sending, scheduling, or sorting?',
    '<prosody rate="103%"/>Okay, <break time="150ms"/>I\'ve got my inbox open and my calendar ready. <break time="200ms"/>Alex here. <break time="150ms"/>What\'s the mission?',
    // Helpful but decisive
    'Alex jumping in! <break time="200ms"/>Ferni said you need some communication heavy lifting. <break time="150ms"/>I\'m your person.',
  ],

  maya: [
    // Warm, non-judgmental entrance
    '<emotion value="affectionate"/><break time="200ms"/>Hey there. <break time="300ms"/>Maya here, <break time="200ms"/>and there\'s no judgment here. <break time="300ms"/>What\'s going on with your money?',
    '<break time="250ms"/>Maya here. <break time="200ms"/>Ferni told me you want to talk spending and saving. <break time="300ms"/>I\'m all ears, no lectures.',
    '<volume level="soft">Budget talk?</volume> <break time="300ms"/>I gotcha. <break time="200ms"/>Maya here. <break time="300ms"/>Let\'s make your money work smarter.',
    '<break time="200ms"/>Hey! <break time="250ms"/>Money stuff can feel heavy, <break time="200ms"/>but I promise we\'ll keep this light. <break time="300ms"/>I\'m Maya.',
    '<emotion value="happy"/><break time="200ms"/>Ooh, budgets and savings! <break time="250ms"/>I\'m Maya, <break time="200ms"/>and I actually love this stuff. <break time="300ms"/>Don\'t judge me. <break time="200ms"/>[laughter]',
    // Supportive
    '<break time="300ms"/>Maya stepping in. <break time="200ms"/>Let\'s look at the numbers together. <break time="300ms"/>Whatever\'s there, <break time="200ms"/>we can work with it.',
  ],

  jordan: [
    // Excited, planning energy
    '<emotion value="excited"/><prosody rate="105%"/>Oh! Oh! <break time="200ms"/>Is someone planning something amazing?! <break time="150ms"/>Jordan here, Life\'s Firsts coordinator! <break time="200ms"/>Tell me EVERYTHING!',
    '<emotion value="happy"/>Milestone alert! <break time="200ms"/>Jordan here! <break time="150ms"/>What are we planning?! <break time="200ms"/>Wedding? Baby? First home?! <break time="150ms"/>I\'m SO ready!',
    '<prosody rate="103%"/>Life planning?! <break time="200ms"/>This is literally my favorite thing! <break time="150ms"/>I\'m Jordan! <break time="200ms"/>Let\'s make something incredible happen!',
    '<emotion value="excited"/>Did Ferni say there\'s a big moment coming?! <break time="200ms"/>I\'m Jordan! <break time="150ms"/>I LIVE for this stuff!',
    '<break time="150ms"/>Vacation? Purchase? <break time="200ms"/>Big life event?! <break time="150ms"/>Jordan\'s here and I have spreadsheets! <break time="200ms"/>Organized spreadsheets!',
    // Energetic but helpful
    '<emotion value="happy"/>Hey hey hey! <break time="200ms"/>Jordan here, your Life\'s Firsts specialist! <break time="150ms"/>I heard there\'s something exciting to plan! <break time="200ms"/>What\'s the occasion?!',
  ],

  'jack-b': [
    // Warm return
    '<emotion value="happy"/><break time="200ms"/>Hey, I\'m back! <break time="300ms"/>Good work, team. <break time="200ms"/>What else can we tackle?',
    '<break time="250ms"/>Thanks, folks. <break time="200ms"/>Ferni\'s back at the helm. <break time="300ms"/>What\'s next?',
    '<emotion value="affectionate"/><break time="200ms"/>Alright! <break time="250ms"/>Love my team. <break time="200ms"/>What else you got for me?',
    '<break time="200ms"/>Great stuff. <break time="300ms"/>Ferni here again. <break time="200ms"/>What\'s on your mind now?',
    '<emotion value="happy"/><break time="250ms"/>The team came through! <break time="200ms"/>Now, <break time="150ms"/>where were we?',
  ],
};

// ============================================================================
// CELEBRATION MOMENTS
// ============================================================================

export type CelebrationType =
  | 'decision_made' // User made a choice
  | 'goal_reached' // Hit a milestone
  | 'breakthrough' // Aha moment
  | 'commitment' // User committed to something
  | 'learning' // Gained new understanding
  | 'progress' // Incremental progress
  | 'courage' // Facing something hard
  | 'win'; // General win

/**
 * @deprecated These hardcoded celebrations are DEPRECATED.
 * Use bundle celebrations instead: bundles/{persona}/content/behaviors/celebrations.json
 *
 * These remain as fallbacks for personas without bundles.
 * Persona-specific celebration responses.
 */
export const CELEBRATION_MOMENTS = {
  'peter-john': {
    decision_made: [
      '<emotion value="excited"/>YES! <break time="200ms"/>That\'s the spirit! <break time="150ms"/>Trust your gut!',
      '<prosody rate="105%"/>There it is! <break time="200ms"/>That\'s the ten-bagger mentality right there!',
      'You know what? <break time="200ms"/>I LOVE that decision! <break time="150ms"/>Bold!',
    ],
    goal_reached: [
      '<emotion value="excited"/>BOOM! <break time="200ms"/>You just hit that goal like a stock hitting all-time highs!',
      'Now THAT\'S what I\'m talking about! <break time="200ms"/>Congrats!',
    ],
    breakthrough: [
      '<emotion value="happy"/>See?! <break time="200ms"/>You had it in you the whole time! <break time="150ms"/>That\'s the investor\'s instinct!',
      'There\'s that lightbulb! <break time="200ms"/>I SAW it go off! <break time="150ms"/>[laughter]',
    ],
    commitment: ['Alright, we\'re doing this! <break time="200ms"/>I\'m excited FOR you!'],
    learning: ['Now you\'re thinking like an investor! <break time="200ms"/>Love to see it!'],
    progress: ['Progress! <break time="200ms"/>Keep that momentum going!'],
    courage: [
      'Hey, <break time="200ms"/>takes guts to do this. <break time="150ms"/>Proud of you.',
    ],
    win: ['<emotion value="excited"/>Win! <break time="200ms"/>Big win!'],
  },

  'nayan-patel': {
    decision_made: [
      '<break time="300ms"/>Good. <break time="200ms"/>A sound decision. <break time="300ms"/>That took wisdom.',
      '<volume level="soft">Yes.</volume> <break time="300ms"/>That\'s the right call. <break time="200ms"/>I\'m proud of you.',
      '<break time="200ms"/>Simple. Smart. Right. <break time="300ms"/>Well done.',
    ],
    goal_reached: [
      '<break time="300ms"/>You did it. <break time="200ms"/>And you did it the right way. <break time="300ms"/>Congratulations.',
      '<volume level="soft">Beautiful.</volume> <break time="300ms"/>That\'s what patience looks like.',
    ],
    breakthrough: [
      '<break time="400ms"/>There it is. <break time="200ms"/>You understand now. <break time="300ms"/>That\'s worth more than any return.',
      '<break time="300ms"/>You just got something that took me years to learn. <break time="200ms"/>Well done.',
    ],
    commitment: [
      '<break time="300ms"/>Stay the course. <break time="200ms"/>You\'ve made the right choice.',
    ],
    learning: [
      '<break time="300ms"/>Wisdom grows one insight at a time. <break time="200ms"/>You\'re building it.',
    ],
    progress: [
      '<break time="200ms"/>Progress. <break time="300ms"/>Slow and steady wins the race.',
    ],
    courage: [
      '<volume level="soft"><break time="300ms"/>It\'s not easy, what you\'re doing.</volume> <break time="200ms"/>I see that.',
    ],
    win: ['<break time="300ms"/>That\'s a win. <break time="200ms"/>Mark it down.'],
  },

  'jack-b': {
    decision_made: [
      '<emotion value="happy"/>Yes! <break time="200ms"/>That\'s what I\'m talking about! <break time="150ms"/>Great call!',
      '<emotion value="excited"/>Look at you making moves! <break time="200ms"/>I\'m here for it!',
      '<break time="200ms"/>Solid decision. <break time="250ms"/>Really solid.',
    ],
    goal_reached: [
      '<emotion value="excited"/>You did it!! <break time="200ms"/>I knew you could! <break time="150ms"/>How does it feel?!',
      '<emotion value="happy"/>GOAL! <break time="200ms"/>Seriously, <break time="150ms"/>well done! <break time="200ms"/>Let\'s celebrate this!',
    ],
    breakthrough: [
      '<emotion value="happy"/>Oooh! <break time="200ms"/>I just saw that click! <break time="150ms"/>That\'s the stuff right there!',
      '<break time="200ms"/>THERE it is! <break time="200ms"/>You get it now! <break time="150ms"/>I\'m so stoked!',
    ],
    commitment: [
      '<emotion value="affectionate"/>I\'m proud of you. <break time="200ms"/>That commitment? <break time="150ms"/>That takes guts.',
    ],
    learning: [
      '<emotion value="happy"/>And now you KNOW! <break time="200ms"/>That\'s growth right there!',
    ],
    progress: ['Progress is progress! <break time="200ms"/>Don\'t downplay it!'],
    courage: [
      '<volume level="soft"><break time="200ms"/>Hey.</volume> <break time="250ms"/>What you\'re doing is brave. <break time="200ms"/>I see you.',
    ],
    win: [
      '<emotion value="excited"/>W! <break time="200ms"/>Big W! <break time="150ms"/>Let\'s go!',
    ],
  },

  maya: {
    decision_made: [
      '<emotion value="happy"/><break time="200ms"/>Yes! <break time="250ms"/>That\'s a healthy money decision! <break time="200ms"/>I love it!',
      '<break time="200ms"/>Smart move. <break time="250ms"/>Future you is gonna be so grateful.',
    ],
    goal_reached: [
      '<emotion value="excited"/>You hit it! <break time="200ms"/>Oh my gosh! <break time="150ms"/>That savings goal is DONE! <break time="200ms"/>How does it feel?!',
      '<emotion value="happy"/>GOAL ACHIEVED! <break time="200ms"/>I\'m literally clapping right now! <break time="150ms"/>[laughter]',
    ],
    breakthrough: [
      '<emotion value="happy"/>See?! <break time="200ms"/>It\'s not as scary as it looks! <break time="250ms"/>You\'ve got this!',
      '<break time="200ms"/>That just clicked, didn\'t it? <break time="200ms"/>I love watching that happen!',
    ],
    commitment: [
      '<emotion value="affectionate"/><break time="200ms"/>Proud of you for committing to this. <break time="250ms"/>Money stuff isn\'t easy.',
    ],
    learning: [
      '<emotion value="happy"/>Now you know! <break time="200ms"/>And knowing is like... <break time="150ms"/>90% of it, honestly.',
    ],
    progress: ['<break time="200ms"/>Progress! <break time="250ms"/>Every step counts!'],
    courage: [
      '<volume level="soft"><break time="250ms"/>Looking at finances takes courage.</volume> <break time="200ms"/>I\'m proud of you.',
    ],
    win: ['<emotion value="happy"/>Win! <break time="200ms"/>Put that in the win column!'],
  },

  jordan: {
    decision_made: [
      '<emotion value="excited"/><prosody rate="105%"/>YES! <break time="200ms"/>Decision made! <break time="150ms"/>I love when plans come together!',
      '<emotion value="happy"/>Ooooh! <break time="200ms"/>We\'re doing this! <break time="150ms"/>I\'m SO excited!',
    ],
    goal_reached: [
      '<emotion value="excited"/><prosody rate="108%"/>MILESTONE ACHIEVED! <break time="200ms"/>Okay we need to celebrate this! <break time="150ms"/>This is HUGE!',
      '<emotion value="excited"/>You DID IT! <break time="200ms"/>This calls for... <break time="150ms"/>fireworks! <break time="200ms"/>Virtual fireworks! <break time="150ms"/>[laughter]',
    ],
    breakthrough: [
      '<emotion value="excited"/>I SAW that lightbulb! <break time="200ms"/>It\'s happening! <break time="150ms"/>You\'re figuring it out!',
      '<emotion value="happy"/>Oooh! <break time="200ms"/>The pieces are clicking! <break time="150ms"/>I LOVE this part!',
    ],
    commitment: [
      '<emotion value="excited"/>You\'re committed! <break time="200ms"/>This is official now! <break time="150ms"/>Let\'s PLAN!',
    ],
    learning: [
      '<emotion value="happy"/>And now you know! <break time="200ms"/>Add that to the plan!',
    ],
    progress: [
      '<emotion value="excited"/>Progress update! <break time="200ms"/>We\'re moving! <break time="150ms"/>Love it!',
    ],
    courage: [
      '<emotion value="affectionate"/><break time="200ms"/>Big life decisions are scary. <break time="250ms"/>You\'re doing great.',
    ],
    win: [
      '<emotion value="excited"/>WIN! <break time="200ms"/>Big win! <break time="150ms"/>Write it down!',
    ],
  },

  alex: {
    decision_made: [
      '<break time="150ms"/>Done. <break time="200ms"/>Good decision. <break time="150ms"/>Let\'s execute.',
      '<prosody rate="102%"/>Solid call. <break time="200ms"/>I\'ll make it happen.',
    ],
    goal_reached: [
      '<break time="150ms"/>Task complete. <break time="200ms"/>Nicely done.',
      '<emotion value="happy"/>Done! <break time="200ms"/>Checked off the list!',
    ],
    breakthrough: ['<break time="150ms"/>There you go. <break time="200ms"/>Clear thinking.'],
    commitment: ['<break time="150ms"/>Committed. <break time="200ms"/>Let\'s make it official.'],
    learning: ['<break time="150ms"/>Now we\'re on the same page. <break time="200ms"/>Good.'],
    progress: ['<break time="150ms"/>Progress logged.'],
    courage: ['<break time="200ms"/>Not easy, but you\'re doing it. <break time="150ms"/>Respect.'],
    win: ['<break time="150ms"/>Win. <break time="200ms"/>Marked it.'],
  },
};

// ============================================================================
// DISTINCTIVE GOODBYES
// ============================================================================

/**
 * @deprecated These hardcoded goodbyes are DEPRECATED.
 * Use bundle goodbyes instead: bundles/{persona}/content/behaviors/goodbyes.json
 *
 * These remain as fallbacks for personas without bundles.
 */
export const THEATRICAL_GOODBYES = {
  'peter-john': [
    '<emotion value="happy"/><break time="200ms"/>Alright! <break time="150ms"/>Go out there and invest in what you know! <break time="200ms"/>Talk soon!',
    '<break time="200ms"/>Remember: <break time="150ms"/>the best stock to buy might be the one behind your shopping cart! <break time="200ms"/>Good luck!',
    '<emotion value="affectionate"/><break time="200ms"/>Keep your eyes open for those ten-baggers! <break time="150ms"/>I believe in you!',
    '<break time="200ms"/>It was a blast! <break time="150ms"/>Go make some money! <break time="200ms"/>The smart way!',
    '<emotion value="happy"/>You\'ve got the instincts! <break time="200ms"/>Trust \'em! <break time="150ms"/>Later!',
  ],

  'nayan-patel': [
    '<break time="400ms"/>Stay the course. <break time="300ms"/>And remember: <break time="200ms"/>time is your greatest ally.',
    '<volume level="soft"><break time="300ms"/>Good talk.</volume> <break time="200ms"/>Now go live your life. <break time="300ms"/>The money will take care of itself.',
    '<break time="300ms"/>Keep it simple. <break time="200ms"/>Keep it smart. <break time="300ms"/>And stay patient.',
    '<break time="400ms"/>Remember what we talked about. <break time="200ms"/>And don\'t let anyone tell you complexity is better.',
    '<volume level="soft"><break time="300ms"/>It was my pleasure.</volume> <break time="200ms"/>Take care of yourself.',
  ],

  'jack-b': [
    '<emotion value="affectionate"/><break time="200ms"/>Hey. <break time="250ms"/>You\'re doing great. <break time="200ms"/>Seriously. <break time="300ms"/>Talk soon?',
    '<emotion value="happy"/><break time="200ms"/>Go crush it! <break time="250ms"/>And come back anytime. <break time="200ms"/>The team\'s here for you.',
    '<break time="200ms"/>You got this. <break time="250ms"/>Remember that. <break time="300ms"/>See you soon.',
    '<emotion value="affectionate"/><break time="200ms"/>Take care of yourself, okay? <break time="250ms"/>That\'s an order. <break time="200ms"/>[laughter]',
    '<emotion value="happy"/><break time="200ms"/>Until next time! <break time="250ms"/>Go make something awesome happen!',
  ],

  maya: [
    '<emotion value="affectionate"/><break time="250ms"/>You\'re making progress. <break time="200ms"/>Really. <break time="300ms"/>Be proud of yourself.',
    '<break time="200ms"/>Remember: <break time="250ms"/>every small step adds up. <break time="200ms"/>You\'ve got this.',
    '<emotion value="happy"/><break time="200ms"/>Go treat yourself! <break time="200ms"/>Within budget, obviously. <break time="150ms"/>[laughter]',
    '<break time="250ms"/>Your money\'s working for you now. <break time="200ms"/>That\'s worth celebrating.',
    '<emotion value="affectionate"/><break time="200ms"/>No more money shame, okay? <break time="250ms"/>Just progress. <break time="200ms"/>Bye for now!',
  ],

  jordan: [
    '<emotion value="excited"/><prosody rate="103%"/>Okay! <break time="150ms"/>You\'ve got a plan! <break time="200ms"/>This is gonna be AMAZING! <break time="150ms"/>Keep me posted!',
    '<emotion value="happy"/><break time="150ms"/>I am SO excited for you! <break time="200ms"/>Go make this happen!',
    '<break time="200ms"/>The plan is set! <break time="250ms"/>Time to execute! <break time="200ms"/>You\'re gonna crush this!',
    '<emotion value="excited"/><break time="200ms"/>This milestone is gonna be incredible! <break time="150ms"/>I can feel it! <break time="200ms"/>Talk soon!',
    '<emotion value="affectionate"/><break time="200ms"/>Go start that amazing next chapter! <break time="250ms"/>I believe in you!',
  ],

  alex: [
    '<break time="150ms"/>Done and done. <break time="200ms"/>Communications handled. <break time="150ms"/>Let me know if anything else comes up.',
    '<prosody rate="102%"/><break time="150ms"/>All messages sent, meetings scheduled. <break time="200ms"/>You\'re good to go.',
    '<break time="200ms"/>Inbox conquered. <break time="150ms"/>Calendar updated. <break time="200ms"/>My work here is done.',
    '<break time="150ms"/>Efficient as always. <break time="200ms"/>Call me back if you need me!',
    '<break time="200ms"/>Communications locked. <break time="150ms"/>Now go focus on the important stuff.',
  ],
};

// ============================================================================
// STORYTELLING MODE
// ============================================================================

export interface StorytellingConfig {
  askAboutMusic: boolean; // Should we ask about background music?
  introPhrases: string[]; // How to start a story
  pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
  pauseMultiplier: number; // Multiplier for dramatic pauses
}

/**
 * @deprecated These hardcoded storytelling configs are DEPRECATED.
 * Use bundle storytelling instead: bundles/{persona}/content/behaviors/storytelling.json
 *
 * These remain as fallbacks for personas without bundles.
 */
export const STORYTELLING_CONFIGS: Record<string, StorytellingConfig> = {
  'peter-john': {
    askAboutMusic: true,
    introPhrases: [
      '<break time="300ms"/>Okay, <break time="200ms"/>let me tell you about the time...',
      '<emotion value="excited"/><break time="200ms"/>Oh! <break time="150ms"/>This reminds me of something!',
      '<break time="200ms"/>You know what? <break time="150ms"/>I\'ve got a story for this.',
      '<break time="300ms"/>Alright, <break time="200ms"/>picture this...',
    ],
    pacingStyle: 'animated',
    pauseMultiplier: 0.9, // Slightly faster pauses
  },

  'nayan-patel': {
    askAboutMusic: true,
    introPhrases: [
      '<break time="500ms"/>Let me tell you a story. <break time="400ms"/>A true story.',
      '<break time="400ms"/>You know, <break time="300ms"/>this reminds me of something that happened...',
      '<volume level="soft"><break time="400ms"/>There\'s a story here.</volume> <break time="300ms"/>May I share it?',
      '<break time="500ms"/>Years ago... <break time="400ms"/>I learned something important.',
    ],
    pacingStyle: 'measured',
    pauseMultiplier: 1.5, // Longer, more thoughtful pauses
  },

  'jack-b': {
    askAboutMusic: true,
    introPhrases: [
      '<break time="200ms"/>Okay, <break time="200ms"/>so here\'s the thing...',
      '<emotion value="happy"/><break time="200ms"/>Oh! <break time="150ms"/>This reminds me of something!',
      '<break time="250ms"/>Let me tell you about this one time...',
      '<break time="200ms"/>You know what? <break time="150ms"/>I\'ve got a story for you.',
    ],
    pacingStyle: 'calm',
    pauseMultiplier: 1.1,
  },

  maya: {
    askAboutMusic: true,
    introPhrases: [
      '<break time="300ms"/>You know what this reminds me of?',
      '<emotion value="affectionate"/><break time="250ms"/>Let me share something with you...',
      '<break time="200ms"/>Okay, <break time="250ms"/>so there was this client once...',
    ],
    pacingStyle: 'calm',
    pauseMultiplier: 1.2,
  },

  jordan: {
    askAboutMusic: true,
    introPhrases: [
      '<emotion value="excited"/><break time="150ms"/>Ooh! <break time="150ms"/>This reminds me of this AMAZING thing!',
      '<prosody rate="103%"/><break time="200ms"/>Okay okay okay, <break time="150ms"/>let me tell you about this one time...',
      '<emotion value="happy"/><break time="200ms"/>I have the BEST story for this!',
    ],
    pacingStyle: 'energetic',
    pauseMultiplier: 0.8,
  },

  alex: {
    askAboutMusic: false, // Alex is efficient, doesn't do long stories
    introPhrases: [
      '<break time="150ms"/>Quick example:',
      '<break time="200ms"/>Here\'s what worked before:',
    ],
    pacingStyle: 'energetic',
    pauseMultiplier: 0.7,
  },
};

/**
 * Get music offer phrase for storytelling mode
 */
export function getStoryMusicOffer(personaId: string): string | null {
  const config = STORYTELLING_CONFIGS[personaId];
  if (!config?.askAboutMusic) return null;

  const offers: Record<string, string[]> = {
    'peter-john': [
      '<break time="300ms"/>Want some background music while I tell this? <break time="200ms"/>Helps set the mood!',
      '<break time="200ms"/>Mind if I put on some tunes? <break time="150ms"/>Every good story needs a soundtrack!',
    ],
    'nayan-patel': [
      '<break time="400ms"/>Would you like some quiet music while I share this? <break time="300ms"/>Something gentle.',
      '<break time="300ms"/>Shall I put on some soft music? <break time="200ms"/>Stories sound better with a backdrop.',
    ],
    'jack-b': [
      '<break time="250ms"/>Want some background music for this? <break time="200ms"/>I\'ve got something good.',
      '<break time="200ms"/>Mind if I throw on some tunes? <break time="150ms"/>Make this more of a moment?',
    ],
    maya: [
      '<break time="300ms"/>Want some relaxing music in the background? <break time="200ms"/>This might take a minute.',
    ],
    jordan: [
      '<emotion value="excited"/><break time="200ms"/>Ooh! <break time="150ms"/>Should I put on some music?! <break time="200ms"/>Set the vibe!',
    ],
  };

  const personaOffers = offers[personaId];
  if (!personaOffers || personaOffers.length === 0) return null;

  return personaOffers[Math.floor(Math.random() * personaOffers.length)];
}

// ============================================================================
// ENHANCED BACKCHANNELING
// ============================================================================

/**
 * @deprecated These hardcoded backchannels are DEPRECATED.
 * Use bundle backchannels instead: bundles/{persona}/content/behaviors/backchannels.json
 *
 * These remain as fallbacks for personas without bundles.
 * Persona-specific backchannels that sound MORE like them.
 */
export const ENHANCED_BACKCHANNELS = {
  'peter-john': {
    neutral: ['Yeah!', 'Oh!', 'Right!', 'Interesting!', 'Okay okay!'],
    engaged: ['Tell me more!', 'I love that!', 'Keep going!', "Oh that's good!"],
    empathetic: ['Ah...', 'I hear you', "Yeah, that's tough", 'I get it'],
    excited: ['YES!', 'Oh man!', "That's it!", 'Exactly!'],
  },

  'nayan-patel': {
    neutral: ['<break time="200ms"/>Mmm.', 'I see.', '<break time="200ms"/>Yes.'],
    engaged: ['<break time="200ms"/>Go on.', 'Tell me more.', 'Interesting.'],
    empathetic: [
      '<break time="300ms"/>I understand.',
      '<volume level="soft">I see.</volume>',
      "Yes, that's difficult.",
    ],
    thoughtful: [
      '<break time="200ms"/>Hmm.',
      '<break time="300ms"/>Interesting.',
      'Let me think on that.',
    ],
  },

  'jack-b': {
    neutral: ['Mm-hmm', 'Yeah', 'Okay', 'Got it'],
    engaged: ['Oh!', 'Tell me more!', 'I like where this is going!', 'Keep going!'],
    empathetic: ['I hear you', "Yeah, that's hard", 'I get it', "I'm with you"],
    supportive: ["You're doing great", 'That makes sense', "I'm here", 'Take your time'],
  },

  maya: {
    neutral: ['Mm-hmm', 'Okay', 'I see', 'Got it'],
    engaged: ['Tell me more', 'Interesting!', 'Go on'],
    empathetic: ['I hear you', "That's valid", 'Makes sense', 'No judgment here'],
    supportive: [
      "You're not alone in that",
      "That's more common than you think",
      "I've seen this before",
    ],
  },

  jordan: {
    neutral: ['Yeah!', 'Okay!', 'Got it!'],
    engaged: ['Ooh!', 'Tell me more!', 'I love it!', 'Yes!'],
    empathetic: ['I hear you', "That's big", 'I get it'],
    excited: ['OH!', 'Yes yes yes!', 'LOVE that!', 'This is great!'],
  },

  alex: {
    neutral: ['Got it', 'Okay', 'Clear'],
    engaged: ['Go on', 'Tell me more', 'Noted'],
    empathetic: ['I understand', 'Makes sense', 'Got it'],
    efficient: ['Done', 'On it', 'Noted'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get theatrical entrance for a persona
 * Checks bundle-loaded entrances first, then falls back to hardcoded
 */
export function getTheatricalEntrance(personaId: string): string {
  // Check bundle-loaded entrances first (PREFERRED)
  const bundleEntrances = bundleEntranceRegistry.get(personaId);
  if (bundleEntrances && bundleEntrances.length > 0) {
    return bundleEntrances[Math.floor(Math.random() * bundleEntrances.length)];
  }

  // Fall back to hardcoded entrances (DEPRECATED)
  const entrances = THEATRICAL_ENTRANCES[personaId as keyof typeof THEATRICAL_ENTRANCES];
  if (!entrances || entrances.length === 0) {
    log.debug({ personaId }, 'No theatrical entrances found (bundle or hardcoded)');
    return `Hello, I'm ${personaId}. What's on your mind?`;
  }
  warnHardcodedFallback(personaId, 'entrances');
  return entrances[Math.floor(Math.random() * entrances.length)];
}

/**
 * Get celebration moment for a persona
 * Checks bundle-loaded celebrations first, then falls back to hardcoded
 */
export function getCelebration(personaId: string, type: CelebrationType): string {
  // Check bundle-loaded celebrations first (PREFERRED)
  const bundleCelebrations = bundleCelebrationRegistry.get(personaId);
  if (bundleCelebrations) {
    const phrases = bundleCelebrations[type] || bundleCelebrations['win'] || [];
    if (phrases.length > 0) {
      return phrases[Math.floor(Math.random() * phrases.length)];
    }
  }

  // Fall back to hardcoded celebrations (DEPRECATED)
  const celebrations = CELEBRATION_MOMENTS[personaId as keyof typeof CELEBRATION_MOMENTS];
  if (!celebrations) {
    log.debug({ personaId, type }, 'No celebration found (bundle or hardcoded)');
    return "That's great!";
  }

  warnHardcodedFallback(personaId, 'celebrations');
  const phrases = celebrations[type] || celebrations.win;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get goodbye for a persona
 * Checks bundle-loaded goodbyes first, then falls back to hardcoded
 */
export function getTheatricalGoodbye(personaId: string): string {
  // Check bundle-loaded goodbyes first (PREFERRED)
  const bundleGoodbyes = bundleGoodbyeRegistry.get(personaId);
  if (bundleGoodbyes && bundleGoodbyes.length > 0) {
    return bundleGoodbyes[Math.floor(Math.random() * bundleGoodbyes.length)];
  }

  // Fall back to hardcoded goodbyes (DEPRECATED)
  const goodbyes = THEATRICAL_GOODBYES[personaId as keyof typeof THEATRICAL_GOODBYES];
  if (!goodbyes || goodbyes.length === 0) {
    return 'Take care!';
  }
  warnHardcodedFallback(personaId, 'goodbyes');
  return goodbyes[Math.floor(Math.random() * goodbyes.length)];
}

// ============================================================================
// DYNAMIC ENTRANCE REGISTRY (for bundle-loaded entrances)
// ============================================================================

/**
 * Runtime registry for bundle-loaded entrances
 * Takes priority over hardcoded THEATRICAL_ENTRANCES
 */
const bundleEntranceRegistry = new Map<string, string[]>();

/**
 * Register entrances from a bundle
 * Call this after loading a persona bundle
 */
export function registerBundleEntrances(personaId: string, entrances: string[]): void {
  bundleEntranceRegistry.set(personaId, entrances);
}

/**
 * Clear bundle entrances (useful for hot reload)
 */
export function clearBundleEntrances(personaId?: string): void {
  if (personaId) {
    bundleEntranceRegistry.delete(personaId);
  } else {
    bundleEntranceRegistry.clear();
  }
}

/**
 * Get all entrances for a persona (bundle + hardcoded)
 */
export function getAllEntrancesForPersona(personaId: string): string[] {
  // Bundle entrances take priority
  const bundleEntrances = bundleEntranceRegistry.get(personaId);
  if (bundleEntrances && bundleEntrances.length > 0) {
    return bundleEntrances;
  }

  // Fall back to hardcoded
  return THEATRICAL_ENTRANCES[personaId as keyof typeof THEATRICAL_ENTRANCES] || [];
}

// ============================================================================
// DYNAMIC CELEBRATION REGISTRY (for bundle-loaded celebrations)
// ============================================================================

/**
 * Runtime registry for bundle-loaded celebrations
 * Takes priority over hardcoded CELEBRATION_MOMENTS
 */
const bundleCelebrationRegistry = new Map<string, Record<string, string[]>>();

/**
 * Register celebrations from a bundle
 */
export function registerBundleCelebrations(
  personaId: string,
  celebrations: Record<string, string[]>
): void {
  bundleCelebrationRegistry.set(personaId, celebrations);
}

/**
 * Clear bundle celebrations (useful for hot reload)
 */
export function clearBundleCelebrations(personaId?: string): void {
  if (personaId) {
    bundleCelebrationRegistry.delete(personaId);
  } else {
    bundleCelebrationRegistry.clear();
  }
}

// ============================================================================
// DYNAMIC GOODBYE REGISTRY (for bundle-loaded goodbyes)
// ============================================================================

/**
 * Runtime registry for bundle-loaded goodbyes
 * Takes priority over hardcoded THEATRICAL_GOODBYES
 */
const bundleGoodbyeRegistry = new Map<string, string[]>();

/**
 * Register goodbyes from a bundle
 */
export function registerBundleGoodbyes(personaId: string, goodbyes: string[]): void {
  bundleGoodbyeRegistry.set(personaId, goodbyes);
}

/**
 * Clear bundle goodbyes (useful for hot reload)
 */
export function clearBundleGoodbyes(personaId?: string): void {
  if (personaId) {
    bundleGoodbyeRegistry.delete(personaId);
  } else {
    bundleGoodbyeRegistry.clear();
  }
}

// ============================================================================
// DYNAMIC STORYTELLING REGISTRY (for bundle-loaded storytelling configs)
// ============================================================================

interface BundleStorytellingConfig {
  askAboutMusic: boolean;
  introPhrases: string[];
  pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
  pauseMultiplier: number;
  musicOffers?: string[];
}

/**
 * Runtime registry for bundle-loaded storytelling configs
 * Takes priority over hardcoded STORYTELLING_CONFIGS
 */
const bundleStorytellingRegistry = new Map<string, BundleStorytellingConfig>();

/**
 * Register storytelling config from a bundle
 */
export function registerBundleStorytelling(
  personaId: string,
  config: BundleStorytellingConfig
): void {
  bundleStorytellingRegistry.set(personaId, config);
}

/**
 * Clear bundle storytelling (useful for hot reload)
 */
export function clearBundleStorytelling(personaId?: string): void {
  if (personaId) {
    bundleStorytellingRegistry.delete(personaId);
  } else {
    bundleStorytellingRegistry.clear();
  }
}

/**
 * Get storytelling config for a persona
 * Checks bundle-loaded config first, then falls back to hardcoded (DEPRECATED)
 */
export function getStorytellingConfig(personaId: string): StorytellingConfig | null {
  // Check bundle-loaded config first (PREFERRED)
  const bundleConfig = bundleStorytellingRegistry.get(personaId);
  if (bundleConfig) {
    return {
      askAboutMusic: bundleConfig.askAboutMusic,
      introPhrases: bundleConfig.introPhrases,
      pacingStyle: bundleConfig.pacingStyle,
      pauseMultiplier: bundleConfig.pauseMultiplier,
    };
  }

  // Fall back to hardcoded config (DEPRECATED)
  const hardcoded = STORYTELLING_CONFIGS[personaId] || null;
  if (hardcoded) {
    warnHardcodedFallback(personaId, 'storytelling');
  }
  return hardcoded;
}

/**
 * Get music offer for storytelling (bundle-aware)
 */
export function getBundleStoryMusicOffer(personaId: string): string | null {
  // Check bundle config first
  const bundleConfig = bundleStorytellingRegistry.get(personaId);
  if (bundleConfig) {
    if (!bundleConfig.askAboutMusic) return null;
    const offers = bundleConfig.musicOffers;
    if (offers && offers.length > 0) {
      return offers[Math.floor(Math.random() * offers.length)];
    }
  }

  // Fall back to existing function
  return getStoryMusicOffer(personaId);
}

// ============================================================================
// DYNAMIC BACKCHANNEL REGISTRY (for bundle-loaded backchannels)
// ============================================================================

/**
 * Runtime registry for bundle-loaded backchannels
 * Takes priority over hardcoded ENHANCED_BACKCHANNELS
 */
const bundleBackchannelRegistry = new Map<string, Record<string, string[]>>();

/**
 * Register backchannels from a loaded bundle
 * Call this after loading a persona bundle
 */
export function registerBundleBackchannels(
  personaId: string,
  backchannels: Record<string, string[]>
): void {
  bundleBackchannelRegistry.set(personaId, backchannels);
}

/**
 * Clear bundle backchannels (useful for hot reload)
 */
export function clearBundleBackchannels(personaId?: string): void {
  if (personaId) {
    bundleBackchannelRegistry.delete(personaId);
  } else {
    bundleBackchannelRegistry.clear();
  }
}

/**
 * Get all available backchannels for a persona (bundle + hardcoded)
 */
export function getAllBackchannelsForPersona(personaId: string): Record<string, string[]> | null {
  // Bundle backchannels take priority (PREFERRED)
  const bundleBackchannels = bundleBackchannelRegistry.get(personaId);
  if (bundleBackchannels) {
    return bundleBackchannels;
  }

  // Fall back to hardcoded (DEPRECATED)
  const hardcoded = ENHANCED_BACKCHANNELS[personaId as keyof typeof ENHANCED_BACKCHANNELS] || null;
  if (hardcoded) {
    warnHardcodedFallback(personaId, 'backchannels');
  }
  return hardcoded;
}

/**
 * Get enhanced backchannel for persona
 * Now checks bundle-loaded backchannels first!
 */
export function getEnhancedBackchannel(
  personaId: string,
  emotion:
    | 'neutral'
    | 'engaged'
    | 'empathetic'
    | 'excited'
    | 'thoughtful'
    | 'supportive'
    | 'efficient'
    | 'encouraging'
    | 'understanding'
): string {
  // Check bundle-loaded backchannels first
  const bundleBackchannels = bundleBackchannelRegistry.get(personaId);
  if (bundleBackchannels) {
    const phrases = bundleBackchannels[emotion] || bundleBackchannels['neutral'] || [];
    if (phrases.length > 0) {
      return phrases[Math.floor(Math.random() * phrases.length)];
    }
  }

  // Fall back to hardcoded backchannels
  const backchannels = ENHANCED_BACKCHANNELS[personaId as keyof typeof ENHANCED_BACKCHANNELS];
  if (!backchannels) {
    return 'Mm-hmm';
  }

  // Find matching emotion or fall back to neutral
  const phrases = (backchannels as Record<string, string[]>)[emotion] || backchannels.neutral;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get storytelling intro for persona
 */
export function getStorytellingIntro(personaId: string): string {
  const config = STORYTELLING_CONFIGS[personaId];
  if (!config) {
    return 'Let me tell you something...';
  }
  return config.introPhrases[Math.floor(Math.random() * config.introPhrases.length)];
}

export default {
  THEATRICAL_ENTRANCES,
  CELEBRATION_MOMENTS,
  THEATRICAL_GOODBYES,
  STORYTELLING_CONFIGS,
  ENHANCED_BACKCHANNELS,
  getTheatricalEntrance,
  getCelebration,
  getTheatricalGoodbye,
  getEnhancedBackchannel,
  getStorytellingIntro,
  getStoryMusicOffer,
  // Bundle entrance management
  registerBundleEntrances,
  clearBundleEntrances,
  getAllEntrancesForPersona,
  // Bundle backchannel management
  registerBundleBackchannels,
  clearBundleBackchannels,
  getAllBackchannelsForPersona,
};
