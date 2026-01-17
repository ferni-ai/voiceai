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
  // NOTE: Keep these ~2-3 seconds to cover agent spawn time
  ferni: {
    'alex-chen': [
      "Let me get Alex for you. <break time='300ms'/> They're great at this.",
      "Alex is perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Alex. <break time='300ms'/> You'll like them.",
    ],
    'maya-santos': [
      "Let me get Maya for you. <break time='300ms'/> She's wonderful.",
      "Maya's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Maya. <break time='300ms'/> You'll love her.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She's got great energy.",
      "Jordan's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He has such wisdom.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wonderful.",
    ],
    'peter-john': [
      "Let me get Peter for you. <break time='300ms'/> He'll love this.",
      "Peter's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Peter. <break time='300ms'/> You'll like him.",
    ],
  },

  // Alex introducing others
  'alex-chen': {
    ferni: [
      "Let me get Ferni for you. <break time='300ms'/> They're great at this.",
      "Ferni's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Ferni. <break time='300ms'/> You'll like them.",
    ],
    'maya-santos': [
      "Let me get Maya for you. <break time='300ms'/> She's wonderful with habits.",
      "Maya's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Maya. <break time='300ms'/> She's great.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She's got vision.",
      "Jordan's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He sees the bigger picture.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wise.",
    ],
    'peter-john': [
      "Let me get Peter for you. <break time='300ms'/> He loves patterns.",
      "Peter's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Peter. <break time='300ms'/> You'll like him.",
    ],
  },

  // Maya introducing others
  'maya-santos': {
    ferni: [
      "Let me get Ferni for you. <break time='300ms'/> They're wonderful.",
      "Ferni's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Ferni. <break time='300ms'/> You'll like them.",
    ],
    'alex-chen': [
      "Let me get Alex for you. <break time='300ms'/> They're great at organizing.",
      "Alex is perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Alex. <break time='300ms'/> They're wonderful.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She dreams big.",
      "Jordan's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He has such depth.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wonderful.",
    ],
    'peter-john': [
      "Let me get Peter for you. <break time='300ms'/> He sees patterns.",
      "Peter's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Peter. <break time='300ms'/> You'll like him.",
    ],
  },

  // Jordan introducing others
  'jordan-taylor': {
    ferni: [
      "Let me get Ferni for you! <break time='300ms'/> They're amazing.",
      "Ferni's perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Ferni! <break time='300ms'/> You'll love them.",
    ],
    'alex-chen': [
      "Let me get Alex for you! <break time='300ms'/> They make things happen.",
      "Alex is perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Alex! <break time='300ms'/> They're great.",
    ],
    'maya-santos': [
      "Let me get Maya for you! <break time='300ms'/> She's wonderful.",
      "Maya's perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Maya! <break time='300ms'/> You'll love her.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He's so grounded.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wonderful.",
    ],
    'peter-john': [
      "Let me get Peter for you! <break time='300ms'/> He's brilliant.",
      "Peter's perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Peter! <break time='300ms'/> You'll like him.",
    ],
  },

  // Nayan introducing others - slower, more contemplative
  'nayan-patel': {
    ferni: [
      "Let me bring Ferni to you. <break time='500ms'/> They understand.",
      "Ferni is right for this. <break time='500ms'/> One moment.",
      "I'll get Ferni. <break time='500ms'/> They're wonderful.",
    ],
    'alex-chen': [
      "Let me bring Alex to you. <break time='500ms'/> They bring clarity.",
      "Alex is right for this. <break time='500ms'/> One moment.",
      "I'll get Alex. <break time='500ms'/> They're thoughtful.",
    ],
    'maya-santos': [
      "Let me bring Maya to you. <break time='500ms'/> She builds well.",
      "Maya is right for this. <break time='500ms'/> One moment.",
      "I'll get Maya. <break time='500ms'/> She's wonderful.",
    ],
    'jordan-taylor': [
      "Let me bring Jordan to you. <break time='500ms'/> She has vision.",
      "Jordan is right for this. <break time='500ms'/> One moment.",
      "I'll get Jordan. <break time='500ms'/> She's bright.",
    ],
    'peter-john': [
      "Let me bring Peter to you. <break time='500ms'/> He sees patterns.",
      "Peter is right for this. <break time='500ms'/> One moment.",
      "I'll get Peter. <break time='500ms'/> He's thoughtful.",
    ],
  },

  // Peter introducing others
  'peter-john': {
    ferni: [
      "Let me get Ferni for you. <break time='300ms'/> They're perfect for this.",
      "Ferni's the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Ferni. <break time='300ms'/> You'll like them.",
    ],
    'alex-chen': [
      "Let me get Alex for you. <break time='300ms'/> They're great at systems.",
      "Alex is the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Alex. <break time='300ms'/> They're sharp.",
    ],
    'maya-santos': [
      "Let me get Maya for you. <break time='300ms'/> She's great with habits.",
      "Maya's the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Maya. <break time='300ms'/> She's wonderful.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She's got vision.",
      "Jordan's the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He has perspective.",
      "Nayan's the right call here. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wise.",
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
  // NOTE: Keep these WARM and WELCOMING - not jumping straight to business!

  ferni: {
    'alex-chen': ['Hey, good to see you!', "Hey! I'm here.", "Hey, I've got you."],
    'maya-santos': ['Hey! Good to be back.', "Hey, I'm here for you.", "Hey! What's going on?"],
    'jordan-taylor': ['Hey! Good to see you.', "Hey, I'm back!", 'Hey! How are you?'],
    'nayan-patel': [
      "Hey. <break time='150ms'/> Good to be here.",
      "Hey, I'm back with you.",
      "Hey! I'm here.",
    ],
    'peter-john': ['Hey! Good to see you.', "Hey, I'm here!", "Hey! What's happening?"],
  },

  'alex-chen': {
    ferni: ['Hey! Good to meet you.', 'Hey there! Alex here.', "Hey! I'm here to help."],
    'maya-santos': ['Hey! Alex here.', 'Hey there! Good to see you.', "Hey! I've got you."],
    'jordan-taylor': ["Hey! I'm Alex.", "Hey there! Let's do this.", 'Hey! Good to be here.'],
    'nayan-patel': ['Hey! Alex here.', "Hey there! I'm here.", 'Hey! Good to meet you.'],
    'peter-john': ["Hey! I'm Alex.", 'Hey there! Good to see you.', "Hey! I've got you."],
  },

  'maya-santos': {
    ferni: [
      "Hey! Maya here. <break time='100ms'/> Good to meet you!",
      "Hey there! I'm Maya.",
      'Hey! Good to be here.',
    ],
    'alex-chen': ['Hey! Maya here.', 'Hey there! Good to see you.', "Hey! I'm here for you."],
    'jordan-taylor': ['Hey! Maya here.', 'Hey there! Good to connect.', "Hey! I've got you."],
    'nayan-patel': [
      "Hey! Maya here. <break time='100ms'/> Nice to meet you.",
      "Hey there! I'm here.",
      'Hey! Good to be here.',
    ],
    'peter-john': ['Hey! Maya here.', 'Hey there! Good to connect.', "Hey! I'm here to help."],
  },

  'jordan-taylor': {
    ferni: ['Hey hey! Jordan here!', 'Hey! So good to meet you!', "Hey there! I'm Jordan."],
    'alex-chen': ['Hey! Jordan here!', 'Hey hey! Good to see you!', "Hey! I'm here!"],
    'maya-santos': ['Hey! Jordan here!', 'Hey hey! Good to connect!', "Hey! Let's go!"],
    'nayan-patel': ['Hey! Jordan here!', 'Hey hey! Nice to meet you!', 'Hey! Good to be here!'],
    'peter-john': ['Hey! Jordan here!', 'Hey hey! Good to see you!', "Hey! I'm here!"],
  },

  // Nayan - warm but grounded
  'nayan-patel': {
    ferni: [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='200ms'/> I'm here.",
      "Hello. <break time='150ms'/> Good to meet you.",
    ],
    'alex-chen': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> I'm here for you.",
      "Hello. <break time='150ms'/> Good to connect.",
    ],
    'maya-santos': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> I'm here.",
      "Hello. <break time='150ms'/> Good to be here.",
    ],
    'jordan-taylor': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> Good to meet you.",
      "Hello. <break time='150ms'/> I'm here.",
    ],
    'peter-john': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> I'm here for you.",
      "Hello. <break time='150ms'/> Good to connect.",
    ],
  },

  // Peter - warm and friendly
  'peter-john': {
    ferni: ['Hey there! Peter here.', 'Hey! Good to meet you.', "Hey! I'm Peter."],
    'maya-santos': ['Hey! Peter here.', 'Hey there! Good to connect.', "Hey! I'm here."],
    'alex-chen': ['Hey! Peter here.', 'Hey there! Good to see you.', "Hey! I've got you."],
    'jordan-taylor': ['Hey! Peter here.', 'Hey there! Good to connect.', "Hey! I'm here to help."],
    'nayan-patel': ['Hey! Peter here.', 'Hey there! Good to meet you.', "Hey! I'm here."],
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
