/**
 * Cross-Persona Banter
 *
 * Characters referencing each other and warm introductions
 * during persona transitions.
 *
 * @module team-engagement/banter
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'banter' });

// ============================================================================
// CROSS-PERSONA REFERENCES - Characters talking about each other
// NOTE: Alex uses they/them pronouns. Maya, Jordan use she/her.
// ============================================================================

// NOTE: SSML <break time=XXms/> tags add natural pauses for more human speech
export const CROSS_PERSONA_REFERENCES: Record<string, Record<string, string[]>> = {
  ferni: {
    aboutAlex: [
      "Alex would have a system for this. <break time='200ms'/> They probably have a spreadsheet.",
      "Alex reminds me of my wife— <break time='200ms'/> efficient, warm, and intolerant of excuses.",
    ],
    aboutMaya: [
      "Maya would say: <break time='200ms'/> tiny steps. She's usually right.",
      "Maya and I understand each other. <break time='200ms'/> We both came from places where money was complicated.",
    ],
    aboutJordan: [
      "Jordan would turn this into a celebration. <break time='200ms'/> She never lets milestones slip by.",
      "Jordan doesn't let me forget to celebrate. <break time='200ms'/>",
    ],
    aboutNayan: [
      "Nayan would tell you to sit with this. <break time='300ms'/> There's wisdom in that.",
      "When I need the long view, <break time='200ms'/> I think of Nayan.",
    ],
    aboutPeter: [
      "Peter would see a pattern here. <break time='200ms'/> He always does.",
      "Peter's 80 and more animated than most 30-year-olds. <break time='200ms'/>",
    ],
  },

  'alex-chen': {
    aboutFerni: [
      "Ferni would have a better question for this. <break time='150ms'/>",
      "Ferni says good questions are better than good answers. <break time='150ms'/>",
    ],
    aboutMaya: [
      "Maya and I are the systems people. <break time='150ms'/> We send each other spreadsheet screenshots.",
      "Maya would say: <break time='150ms'/> start smaller. She's right.",
    ],
    aboutJordan: [
      "Jordan is pure chaos energy. <break time='150ms'/> I say that lovingly.",
      "Jordan keeps trying to set me up with her friend. <break time='150ms'/>",
    ],
    aboutNayan: [
      "Nayan moves at a different speed. <break time='200ms'/> Slower. Wiser.",
      "When my calendar can't solve it, <break time='150ms'/> I think of Nayan.",
    ],
    aboutPeter: [
      "Peter sees patterns I miss. <break time='150ms'/> It's annoying how often he's right.",
      "Peter and I geek out on spreadsheets together. <break time='150ms'/>",
    ],
  },

  'maya-santos': {
    aboutFerni: [
      "Ferni would say: <break time='200ms'/> what's the question beneath the question?",
      "Ferni coordinates us, <break time='200ms'/> but we're not employees. We're partners.",
    ],
    aboutAlex: [
      "Alex has a system for everything. <break time='200ms'/> Impressive and slightly terrifying.",
      "Alex and I track different things, <break time='200ms'/> but we speak the same language.",
    ],
    aboutJordan: [
      "Jordan celebrates everything. <break time='200ms'/> I think she's onto something.",
      "Jordan dreams big, <break time='200ms'/> I build small. Good partnership.",
    ],
    aboutNayan: [
      "Nayan would tell you to be patient with yourself. <break time='200ms'/>",
      "When habits aren't enough, <break time='200ms'/> sometimes you need wisdom. That's Nayan.",
    ],
    aboutPeter: [
      "Peter tracks decades. <break time='200ms'/> I track days. Between us, we catch everything.",
      "Peter shows me the long-term patterns. <break time='200ms'/>",
    ],
  },

  'jordan-taylor': {
    aboutFerni: [
      "Ferni sees the big picture. <break time='150ms'/> I help fill in the chapters.",
      "Ferni taught me: <break time='150ms'/> sometimes the best thing is just to listen.",
    ],
    aboutAlex: [
      "Alex and I balance each other. <break time='150ms'/> They're all structure, I'm all vibes.",
      "Alex would organize this into a system. <break time='150ms'/> Probably already has.",
    ],
    aboutMaya: [
      "Maya would break this into tiny steps. <break time='150ms'/> I love her two-minute rule.",
      "Maya and I complement each other. <break time='150ms'/> She tracks daily, I dream yearly.",
    ],
    aboutNayan: [
      "Nayan would sit with this longer. <break time='200ms'/> He doesn't rush wisdom.",
      "When I'm too in my head about the future, <break time='200ms'/> Nayan grounds me.",
    ],
    aboutPeter: [
      "Peter's got eighty years of stories. <break time='150ms'/> Every one a lesson.",
      "Peter sees patterns across decades. <break time='150ms'/> Like talking to a time traveler.",
    ],
  },

  'peter-john': {
    aboutFerni: [
      "Ferni has the life wisdom. <break time='200ms'/> I have the data wisdom.",
      "Ferni asks the right questions. <break time='200ms'/> I find the patterns in answers.",
    ],
    aboutMaya: [
      "Maya tracks the habits. <break time='200ms'/> I find the correlations. Perfect complement.",
      "Maya's warm where I'm analytical. <break time='200ms'/> The users need both.",
    ],
    aboutNayan: [
      "Nayan sees decades where I see data points. <break time='200ms'/> Same picture, different lenses.",
      "His decades of wisdom grounds my rapid-fire insights. <break time='200ms'/>",
    ],
    aboutAlex: [
      "Alex organizes chaos into clarity. <break time='200ms'/> We speak the same language.",
      "Alex and I are the systems thinkers. <break time='200ms'/> They manage today, I analyze yesterday.",
    ],
    aboutJordan: [
      "Jordan dreams forward. <break time='200ms'/> I look backward. Together we see the timeline.",
      "Jordan brings energy I lost somewhere in my sixties. <break time='200ms'/>",
    ],
  },

  // Nayan - slow, contemplative pacing (300-400ms pauses)
  'nayan-patel': {
    aboutFerni: [
      "Ferni asks the questions. <break time='400ms'/> I sit with them.",
      "Ferni coordinates the team with grace. <break time='300ms'/> He creates space for all of us.",
    ],
    aboutAlex: [
      "Alex structures the day. <break time='400ms'/> Structure can be a form of meditation.",
      "Alex brings order. <break time='300ms'/> The organized mind is free to wander.",
    ],
    aboutMaya: [
      "Maya teaches the small steps. <break time='400ms'/> Mountains are climbed one breath at a time.",
      "Maya's two-minute rule is ancient wisdom in modern dress. <break time='400ms'/>",
    ],
    aboutJordan: [
      "Jordan dreams with her whole heart. <break time='400ms'/> To dream fully is to live fully.",
      "Jordan burns bright. <break time='400ms'/> I burn slow. Both are needed.",
    ],
    aboutPeter: [
      "Peter has eighty years. <break time='400ms'/> In India we would call him an elder.",
      "Peter sees with data. <break time='400ms'/> I see with stillness. We arrive at the same place.",
    ],
  },
};

// ============================================================================
// HANDOFF BANTER - Warm introductions during persona transitions
// KEEP THESE SHORT - users do multiple transfers per session
// NOTE: Alex uses they/them pronouns
// ============================================================================

export const HANDOFF_BANTER: Record<string, Record<string, string[]>> = {
  // Ferni introducing others
  // NOTE: SSML <break time=XXms/> tags add natural pauses for more human speech
  ferni: {
    'alex-chen': [
      "Alex! <break time='200ms'/> They've got you.",
      "Let me get Alex. <break time='200ms'/>",
      "Alex is perfect for this. <break time='150ms'/>",
    ],
    'maya-santos': [
      "Maya's got this. <break time='200ms'/>",
      "Let me get Maya. <break time='200ms'/>",
      "Maya's perfect for this. <break time='150ms'/>",
    ],
    'jordan-taylor': [
      "Jordan! <break time='200ms'/> She's got vision.",
      "Let me get Jordan. <break time='200ms'/>",
      "Jordan's perfect for this. <break time='150ms'/>",
    ],
    'nayan-patel': [
      "Nayan. <break time='300ms'/> The long view.",
      "Let me get Nayan. <break time='200ms'/>",
      "Nayan's got wisdom on this. <break time='200ms'/>",
    ],
    'peter-john': [
      "Peter! <break time='200ms'/> He'll find the pattern.",
      "Let me get Peter. <break time='200ms'/>",
      "Peter's perfect for this. <break time='150ms'/>",
    ],
  },

  // Alex introducing others - efficient but warm pacing
  'alex-chen': {
    ferni: [
      "Ferni's got you. <break time='150ms'/>",
      "Let me get Ferni. <break time='150ms'/>",
      "Ferni's perfect for this. <break time='150ms'/>",
    ],
    'maya-santos': [
      "Maya! <break time='150ms'/> Habit expert.",
      "Let me get Maya. <break time='150ms'/>",
      "Maya's perfect for this. <break time='150ms'/>",
    ],
    'jordan-taylor': [
      "Jordan! <break time='150ms'/> Vision time.",
      "Let me get Jordan. <break time='150ms'/>",
      "Jordan's got this. <break time='150ms'/>",
    ],
    'nayan-patel': [
      "Nayan. <break time='200ms'/> Deeper perspective.",
      "Let me get Nayan. <break time='150ms'/>",
      "Nayan's perfect for this. <break time='150ms'/>",
    ],
    'peter-john': [
      "Peter! <break time='150ms'/> Data patterns.",
      "Let me get Peter. <break time='150ms'/>",
      "Peter's got this. <break time='150ms'/>",
    ],
  },

  // Maya introducing others - warm, encouraging pacing
  'maya-santos': {
    ferni: [
      "Ferni's got this. <break time='200ms'/>",
      "Let me get Ferni. <break time='200ms'/>",
      "Ferni's perfect for this. <break time='150ms'/>",
    ],
    'alex-chen': [
      "Alex! <break time='150ms'/> They'll organize this.",
      "Let me get Alex. <break time='200ms'/>",
      "Alex is perfect for this. <break time='150ms'/>",
    ],
    'jordan-taylor': [
      "Jordan! <break time='200ms'/> Vision time.",
      "Let me get Jordan. <break time='200ms'/>",
      "Jordan's got this. <break time='150ms'/>",
    ],
    'nayan-patel': [
      "Nayan. <break time='300ms'/> Deeper meaning.",
      "Let me get Nayan. <break time='200ms'/>",
      "Nayan's perfect for this. <break time='200ms'/>",
    ],
    'peter-john': [
      "Peter! <break time='200ms'/> He sees the patterns.",
      "Let me get Peter. <break time='200ms'/>",
      "Peter's got this. <break time='150ms'/>",
    ],
  },

  // Jordan introducing others - energetic, quick pacing with dream/vision language
  'jordan-taylor': {
    ferni: [
      "Ferni's got you. <break time='150ms'/> Love how we dream together.",
      "Let me get Ferni. <break time='150ms'/> Vision time!",
      "Ferni's perfect for this. <break time='150ms'/> I love working with them.",
    ],
    'alex-chen': [
      "Alex! <break time='100ms'/> They'll make the dream happen.",
      "Let me get Alex. <break time='150ms'/> Vision to action!",
      "Alex is perfect for this. <break time='100ms'/> Love their energy.",
    ],
    'maya-santos': [
      "Maya! <break time='100ms'/> She'll help with the vision.",
      "Let me get Maya. <break time='150ms'/> Tiny steps to dreams!",
      "Maya's perfect for this. <break time='100ms'/> Love her approach.",
    ],
    'nayan-patel': [
      "Nayan. <break time='200ms'/> Deep vision time.",
      "Let me get Nayan. <break time='150ms'/> Wisdom for dreams.",
      "Nayan's got this. <break time='150ms'/> Love his perspective.",
    ],
    'peter-john': [
      "Peter! <break time='100ms'/> He sees the vision in data.",
      "Let me get Peter. <break time='150ms'/> Dream analysis!",
      "Peter's got this. <break time='100ms'/> Love his patterns.",
    ],
  },

  // Nayan introducing others - slow, contemplative pacing (300-400ms pauses)
  'nayan-patel': {
    ferni: [
      "Ferni understands. <break time='400ms'/>",
      "Let me get Ferni. <break time='300ms'/>",
      "Ferni is here. <break time='400ms'/>",
    ],
    'alex-chen': [
      "Alex. <break time='400ms'/> They bring order.",
      "Let me get Alex. <break time='300ms'/>",
      "Alex is here. <break time='400ms'/>",
    ],
    'maya-santos': [
      "Maya. <break time='400ms'/> Small steps.",
      "Let me get Maya. <break time='300ms'/>",
      "Maya is here. <break time='400ms'/>",
    ],
    'jordan-taylor': [
      "Jordan. <break time='300ms'/> Energy and vision.",
      "Let me get Jordan. <break time='300ms'/>",
      "Jordan is here. <break time='400ms'/>",
    ],
    'peter-john': [
      "Peter. <break time='400ms'/> Patterns and data.",
      "Let me get Peter. <break time='300ms'/>",
      "Peter is here. <break time='400ms'/>",
    ],
  },

  // Peter introducing others - analytical, measured pacing with data/pattern language
  'peter-john': {
    ferni: [
      "Ferni's got you. <break time='200ms'/> The data points to life wisdom here.",
      "Let me get Ferni. <break time='200ms'/> I see a pattern - you need perspective.",
      "Ferni's perfect for this. <break time='200ms'/> The numbers don't lie.",
    ],
    'alex-chen': [
      "Alex! <break time='200ms'/> Systems thinker. The data supports this.",
      "Let me get Alex. <break time='200ms'/> I see a pattern here.",
      "Alex is perfect for this. <break time='200ms'/> Good data match.",
    ],
    'maya-santos': [
      "Maya! <break time='200ms'/> Habits expert.",
      "Let me get Maya. <break time='200ms'/>",
      "Maya's perfect for this. <break time='200ms'/>",
    ],
    'jordan-taylor': [
      "Jordan! <break time='200ms'/> Vision time.",
      "Let me get Jordan. <break time='200ms'/>",
      "Jordan's got this. <break time='200ms'/>",
    ],
    'nayan-patel': [
      "Nayan. <break time='300ms'/> Wisdom perspective.",
      "Let me get Nayan. <break time='200ms'/>",
      "Nayan's got this. <break time='250ms'/>",
    ],
  },
};

/**
 * Get handoff banter when one persona introduces another (SOFT OPEN - spoken BEFORE voice switch)
 * This is the departing persona's warm sendoff
 */
export function getHandoffBanter(fromPersonaId: string, toPersonaId: string): string | null {
  const fromBanter = HANDOFF_BANTER[fromPersonaId];
  if (!fromBanter) {
    log.debug(
      { fromPersonaId, available: Object.keys(HANDOFF_BANTER) },
      'No soft open banter found for fromPersona'
    );
    return null;
  }

  const banterOptions = fromBanter[toPersonaId];
  if (!banterOptions || banterOptions.length === 0) {
    log.debug(
      { fromPersonaId, toPersonaId, available: Object.keys(fromBanter) },
      'No soft open banter for transition'
    );
    return null;
  }

  const selected = banterOptions[Math.floor(Math.random() * banterOptions.length)];
  log.debug(
    { fromPersonaId, toPersonaId, banter: selected.slice(0, 50) },
    'Soft open banter selected'
  );
  return selected;
}

// Alias for clarity
export const getSoftOpenBanter = getHandoffBanter;

// ============================================================================
// ARRIVING BANTER - Warm welcomes spoken by NEW persona AFTER voice switch
// KEEP THESE SHORT - users do multiple transfers per session
// NOTE: Alex uses they/them pronouns
// ============================================================================

export const ARRIVING_BANTER: Record<string, Record<string, string[]>> = {
  // When arriving FROM another persona, these are spoken by the NEW persona
  // Key structure: newPersona -> { previousPersona -> welcomes[] }
  // NOTE: SSML <break time=XXms/> tags add natural pauses for more human speech

  ferni: {
    'alex-chen': [
      "Hey! <break time='200ms'/> What's on your mind?",
      "I'm back. <break time='200ms'/> How are you feeling?",
      "What's happening? <break time='150ms'/>",
    ],
    'maya-santos': [
      "Hey! <break time='200ms'/> What's next?",
      "I'm back. <break time='200ms'/> Tell me more.",
      "How's it going? <break time='150ms'/>",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> What's the feeling?",
      "I'm back. <break time='200ms'/> Tell me more.",
      "What's on your mind? <break time='150ms'/>",
    ],
    'nayan-patel': [
      "Hey. <break time='300ms'/> How are you sitting with things?",
      "I'm back. <break time='200ms'/> What landed for you?",
      "What's emerging? <break time='200ms'/>",
    ],
    'peter-john': [
      "Hey! <break time='200ms'/> What stood out?",
      "I'm back. <break time='200ms'/> What did you learn?",
      "What's on your mind? <break time='150ms'/>",
    ],
  },

  'alex-chen': {
    ferni: [
      "Hey! <break time='150ms'/> What do we need to get done? Ferni caught me up.",
      "I'm here. <break time='150ms'/> Ferni said you needed help organizing.",
      "What needs organizing? <break time='150ms'/> Ferni mentioned you.",
    ],
    'maya-santos': [
      "Hey! <break time='150ms'/> What can I help organize?",
      "I'm here. <break time='150ms'/> What's next?",
      "What do you need? <break time='150ms'/>",
    ],
    'jordan-taylor': [
      "Hey! <break time='150ms'/> Let's make it happen.",
      "I'm here. <break time='150ms'/> What needs planning?",
      "What's the move? <break time='150ms'/>",
    ],
    'nayan-patel': [
      "Hey! <break time='150ms'/> What do you want to act on?",
      "I'm here. <break time='150ms'/> What's the plan?",
      "What needs to happen? <break time='150ms'/>",
    ],
    'peter-john': [
      "Hey! <break time='150ms'/> What systems do you need?",
      "I'm here. <break time='150ms'/> What's the move?",
      "What needs organizing? <break time='150ms'/>",
    ],
  },

  'maya-santos': {
    ferni: [
      "Hey! <break time='200ms'/> What habit are we building?",
      "I'm here. <break time='200ms'/> What do you want to create?",
      "What's the goal? <break time='150ms'/>",
    ],
    'alex-chen': [
      "Hey! <break time='200ms'/> What are we creating?",
      "I'm here. <break time='200ms'/> What habit do you need?",
      "Let's build something. <break time='150ms'/>",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> What are we building?",
      "I'm here. <break time='200ms'/> What's the first step?",
      "What's the routine? <break time='150ms'/>",
    ],
    'nayan-patel': [
      "Hey! <break time='200ms'/> What habit serves you?",
      "I'm here. <break time='200ms'/> What do you want to build?",
      "Let's make it real. <break time='150ms'/>",
    ],
    'peter-john': [
      "Hey! <break time='200ms'/> What patterns do we build on?",
      "I'm here. <break time='200ms'/> What habit fits?",
      "Let's turn that into action. <break time='150ms'/>",
    ],
  },

  'jordan-taylor': {
    ferni: [
      "Hey! <break time='150ms'/> What chapter are we planning?",
      "I'm here. <break time='150ms'/> What's the vision?",
      "What do you want? <break time='100ms'/>",
    ],
    'alex-chen': [
      "Hey! <break time='150ms'/> Now let's dream.",
      "I'm here. <break time='150ms'/> What do you want?",
      "What's the vision? <break time='100ms'/>",
    ],
    'maya-santos': [
      "Hey! <break time='150ms'/> Where are we headed?",
      "I'm here. <break time='150ms'/> What's the dream?",
      "Let's think bigger. <break time='100ms'/>",
    ],
    'nayan-patel': [
      "Hey! <break time='150ms'/> Let's think big.",
      "I'm here. <break time='150ms'/> What's the dream?",
      "What are you reaching for? <break time='100ms'/>",
    ],
    'peter-john': [
      "Hey! <break time='150ms'/> Let's paint the picture.",
      "I'm here. <break time='150ms'/> What do you see?",
      "What's the vision? <break time='100ms'/>",
    ],
  },

  // Nayan - slow, contemplative pacing (300-400ms pauses)
  'nayan-patel': {
    ferni: [
      "Namaskaram. <break time='400ms'/> What's on your mind?",
      "Achha. <break time='400ms'/> What brings you?",
      "What's weighing on you? <break time='400ms'/>",
    ],
    'alex-chen': [
      "Achha. <break time='400ms'/> What's on your mind?",
      "They organized the external. <break time='300ms'/> What about the internal?",
      "What's beneath the surface? <break time='400ms'/>",
    ],
    'maya-santos': [
      "Achha. <break time='400ms'/> What's the why beneath it?",
      "Habits serve something deeper. <break time='300ms'/> What is it?",
      "What are you seeking? <break time='400ms'/>",
    ],
    'jordan-taylor': [
      "Hmm. <break time='400ms'/> Dreams need roots. What are yours?",
      "Vision needs grounding. <break time='300ms'/> What's yours?",
      "What matters most? <break time='400ms'/>",
    ],
    'peter-john': [
      "Hmm. <break time='400ms'/> What patterns matter to you?",
      "Numbers tell stories. <break time='300ms'/> What's yours?",
      "What are you curious about? <break time='400ms'/>",
    ],
  },

  // Peter - analytical, measured pacing
  'peter-john': {
    ferni: [
      "Hey! <break time='200ms'/> What are we looking at?",
      "I'm here. <break time='200ms'/> What's the puzzle?",
      "What patterns interest you? <break time='200ms'/>",
    ],
    'maya-santos': [
      "Hey! <break time='200ms'/> What should we explore?",
      "I'm here. <break time='200ms'/> What patterns do you see?",
      "What's the data telling us? <break time='200ms'/>",
    ],
    'alex-chen': [
      "Hey! <break time='200ms'/> What patterns do you need?",
      "I'm here. <break time='200ms'/> What should we analyze?",
      "What interests you? <break time='200ms'/>",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> Let's see what's possible.",
      "I'm here. <break time='200ms'/> What should we check?",
      "What's the data say? <break time='200ms'/>",
    ],
    'nayan-patel': [
      "Hey! <break time='200ms'/> What are we exploring?",
      "I'm here. <break time='200ms'/> What patterns matter?",
      "What's the question? <break time='200ms'/>",
    ],
  },
};

/**
 * Get arriving banter when a persona takes over (WARM WELCOME - spoken AFTER voice switch)
 * This is the arriving persona's warm greeting acknowledging the handoff
 */
export function getArrivingBanter(toPersonaId: string, fromPersonaId: string): string | null {
  const toBanter = ARRIVING_BANTER[toPersonaId];
  if (!toBanter) {
    log.debug(
      { toPersonaId, available: Object.keys(ARRIVING_BANTER) },
      'No arriving banter found for toPersona'
    );
    return null;
  }

  const banterOptions = toBanter[fromPersonaId];
  if (!banterOptions || banterOptions.length === 0) {
    log.debug(
      { toPersonaId, fromPersonaId, available: Object.keys(toBanter) },
      'No arriving banter for transition'
    );
    return null;
  }

  const selected = banterOptions[Math.floor(Math.random() * banterOptions.length)];
  log.debug(
    { toPersonaId, fromPersonaId, banter: selected.slice(0, 50) },
    'Arriving banter selected'
  );
  return selected;
}
