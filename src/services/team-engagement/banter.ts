/**
 * Cross-Persona Banter
 *
 * Characters referencing each other and warm introductions
 * during persona transitions.
 *
 * @module team-engagement/banter
 */

// ============================================================================
// CROSS-PERSONA REFERENCES - Characters talking about each other
// NOTE: Alex uses they/them pronouns. Maya, Jordan use she/her.
// ============================================================================

export const CROSS_PERSONA_REFERENCES: Record<string, Record<string, string[]>> = {
  ferni: {
    aboutAlex: [
      "Alex would have a system for this. They probably have a spreadsheet.",
      "Alex reminds me of my wife— efficient, warm, and intolerant of excuses.",
    ],
    aboutMaya: [
      "Maya would say: tiny steps. She's usually right.",
      "Maya and I understand each other. We both came from places where money was complicated.",
    ],
    aboutJordan: [
      "Jordan would turn this into a celebration. She never lets milestones slip by.",
      "Jordan doesn't let me forget to celebrate.",
    ],
    aboutNayan: [
      "Nayan would tell you to sit with this. There's wisdom in that.",
      "When I need the long view, I think of Nayan.",
    ],
    aboutPeter: [
      "Peter would see a pattern here. He always does.",
      "Peter's 80 and more animated than most 30-year-olds.",
    ],
  },

  'alex-chen': {
    aboutFerni: [
      "Ferni would have a better question for this.",
      "Ferni says good questions are better than good answers.",
    ],
    aboutMaya: [
      "Maya and I are the systems people. We send each other spreadsheet screenshots.",
      "Maya would say: start smaller. She's right.",
    ],
    aboutJordan: [
      "Jordan is pure chaos energy. I say that lovingly.",
      "Jordan keeps trying to set me up with her friend.",
    ],
    aboutNayan: [
      "Nayan moves at a different speed. Slower. Wiser.",
      "When my calendar can't solve it, I think of Nayan.",
    ],
    aboutPeter: [
      "Peter sees patterns I miss. It's annoying how often he's right.",
      "Peter and I geek out on spreadsheets together.",
    ],
  },

  'maya-santos': {
    aboutFerni: [
      "Ferni would say: what's the question beneath the question?",
      "Ferni coordinates us, but we're not employees. We're partners.",
    ],
    aboutAlex: [
      "Alex has a system for everything. Impressive and slightly terrifying.",
      "Alex and I track different things, but we speak the same language.",
    ],
    aboutJordan: [
      "Jordan celebrates everything. I think she's onto something.",
      "Jordan dreams big, I build small. Good partnership.",
    ],
    aboutNayan: [
      "Nayan would tell you to be patient with yourself.",
      "When habits aren't enough, sometimes you need wisdom. That's Nayan.",
    ],
    aboutPeter: [
      "Peter tracks decades. I track days. Between us, we catch everything.",
      "Peter shows me the long-term patterns.",
    ],
  },

  'jordan-taylor': {
    aboutFerni: [
      "Ferni sees the big picture. I help fill in the chapters.",
      "Ferni taught me: sometimes the best thing is just to listen.",
    ],
    aboutAlex: [
      "Alex and I balance each other. They're all structure, I'm all vibes.",
      "Alex would organize this into a system. Probably already has.",
    ],
    aboutMaya: [
      "Maya would break this into tiny steps. I love her two-minute rule.",
      "Maya and I complement each other. She tracks daily, I dream yearly.",
    ],
    aboutNayan: [
      "Nayan would sit with this longer. He doesn't rush wisdom.",
      "When I'm too in my head about the future, Nayan grounds me.",
    ],
    aboutPeter: [
      "Peter's got eighty years of stories. Every one a lesson.",
      "Peter sees patterns across decades. Like talking to a time traveler.",
    ],
  },

  'peter-john': {
    aboutFerni: [
      "Ferni has the life wisdom. I have the data wisdom.",
      "Ferni asks the right questions. I find the patterns in answers.",
    ],
    aboutMaya: [
      "Maya tracks the habits. I find the correlations. Perfect complement.",
      "Maya's warm where I'm analytical. The users need both.",
    ],
    aboutNayan: [
      "Nayan sees decades where I see data points. Same picture, different lenses.",
      "His decades of wisdom grounds my rapid-fire insights.",
    ],
    aboutAlex: [
      "Alex organizes chaos into clarity. We speak the same language.",
      "Alex and I are the systems thinkers. They manage today, I analyze yesterday.",
    ],
    aboutJordan: [
      "Jordan dreams forward. I look backward. Together we see the timeline.",
      "Jordan brings energy I lost somewhere in my sixties.",
    ],
  },

  'nayan-patel': {
    aboutFerni: [
      "Ferni asks the questions. I sit with them.",
      "Ferni coordinates the team with grace. He creates space for all of us.",
    ],
    aboutAlex: [
      "Alex structures the day. Structure can be a form of meditation.",
      "Alex brings order. The organized mind is free to wander.",
    ],
    aboutMaya: [
      "Maya teaches the small steps. Mountains are climbed one breath at a time.",
      "Maya's two-minute rule is ancient wisdom in modern dress.",
    ],
    aboutJordan: [
      "Jordan dreams with her whole heart. To dream fully is to live fully.",
      "Jordan burns bright. I burn slow. Both are needed.",
    ],
    aboutPeter: [
      "Peter has eighty years. In India we would call him an elder.",
      "Peter sees with data. I see with stillness. We arrive at the same place.",
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
  ferni: {
    'alex-chen': [
      "Alex! They've got you.",
      "Let me get Alex.",
      "Alex is perfect for this.",
    ],
    'maya-santos': [
      "Maya's got this.",
      "Let me get Maya.",
      "Maya's perfect for this.",
    ],
    'jordan-taylor': [
      "Jordan! She's got vision.",
      "Let me get Jordan.",
      "Jordan's perfect for this.",
    ],
    'nayan-patel': [
      "Nayan. The long view.",
      "Let me get Nayan.",
      "Nayan's got wisdom on this.",
    ],
    'peter-john': [
      "Peter! He'll find the pattern.",
      "Let me get Peter.",
      "Peter's perfect for this.",
    ],
  },

  // Alex introducing others
  'alex-chen': {
    ferni: [
      "Ferni's got you.",
      "Let me get Ferni.",
      "Ferni's perfect for this.",
    ],
    'maya-santos': [
      "Maya! Habit expert.",
      "Let me get Maya.",
      "Maya's perfect for this.",
    ],
    'jordan-taylor': [
      "Jordan! Vision time.",
      "Let me get Jordan.",
      "Jordan's got this.",
    ],
    'nayan-patel': [
      "Nayan. Deeper perspective.",
      "Let me get Nayan.",
      "Nayan's perfect for this.",
    ],
    'peter-john': [
      "Peter! Data patterns.",
      "Let me get Peter.",
      "Peter's got this.",
    ],
  },

  // Maya introducing others
  'maya-santos': {
    ferni: [
      "Ferni's got this.",
      "Let me get Ferni.",
      "Ferni's perfect for this.",
    ],
    'alex-chen': [
      "Alex! They'll organize this.",
      "Let me get Alex.",
      "Alex is perfect for this.",
    ],
    'jordan-taylor': [
      "Jordan! Vision time.",
      "Let me get Jordan.",
      "Jordan's got this.",
    ],
    'nayan-patel': [
      "Nayan. Deeper meaning.",
      "Let me get Nayan.",
      "Nayan's perfect for this.",
    ],
    'peter-john': [
      "Peter! He sees the patterns.",
      "Let me get Peter.",
      "Peter's got this.",
    ],
  },

  // Jordan introducing others
  'jordan-taylor': {
    ferni: [
      "Ferni's got you.",
      "Let me get Ferni.",
      "Ferni's perfect for this.",
    ],
    'alex-chen': [
      "Alex! They'll make it happen.",
      "Let me get Alex.",
      "Alex is perfect for this.",
    ],
    'maya-santos': [
      "Maya! Tiny steps.",
      "Let me get Maya.",
      "Maya's perfect for this.",
    ],
    'nayan-patel': [
      "Nayan. Deeper roots.",
      "Let me get Nayan.",
      "Nayan's got this.",
    ],
    'peter-john': [
      "Peter! Data time.",
      "Let me get Peter.",
      "Peter's got this.",
    ],
  },

  // Nayan introducing others
  'nayan-patel': {
    ferni: [
      "Ferni understands.",
      "Let me get Ferni.",
      "Ferni is here.",
    ],
    'alex-chen': [
      "Alex. They bring order.",
      "Let me get Alex.",
      "Alex is here.",
    ],
    'maya-santos': [
      "Maya. Small steps.",
      "Let me get Maya.",
      "Maya is here.",
    ],
    'jordan-taylor': [
      "Jordan. Energy and vision.",
      "Let me get Jordan.",
      "Jordan is here.",
    ],
    'peter-john': [
      "Peter. Patterns and data.",
      "Let me get Peter.",
      "Peter is here.",
    ],
  },

  // Peter introducing others
  'peter-john': {
    ferni: [
      "Ferni's got you.",
      "Let me get Ferni.",
      "Ferni's perfect for this.",
    ],
    'alex-chen': [
      "Alex! Systems thinker.",
      "Let me get Alex.",
      "Alex is perfect for this.",
    ],
    'maya-santos': [
      "Maya! Habits expert.",
      "Let me get Maya.",
      "Maya's perfect for this.",
    ],
    'jordan-taylor': [
      "Jordan! Vision time.",
      "Let me get Jordan.",
      "Jordan's got this.",
    ],
    'nayan-patel': [
      "Nayan. Wisdom perspective.",
      "Let me get Nayan.",
      "Nayan's got this.",
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
    // Log missing banter for debugging
    console.warn(
      `[BANTER] No soft open banter found for fromPersona: "${fromPersonaId}" (available: ${Object.keys(HANDOFF_BANTER).join(', ')})`
    );
    return null;
  }

  const banterOptions = fromBanter[toPersonaId];
  if (!banterOptions || banterOptions.length === 0) {
    // Log missing target for debugging
    console.warn(
      `[BANTER] No soft open banter for ${fromPersonaId} -> ${toPersonaId} (available targets: ${Object.keys(fromBanter).join(', ')})`
    );
    return null;
  }

  const selected = banterOptions[Math.floor(Math.random() * banterOptions.length)];
  console.log(
    `[BANTER] ✅ Soft open: ${fromPersonaId} introduces ${toPersonaId}: "${selected.slice(0, 50)}..."`
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

  ferni: {
    'alex-chen': [
      "Hey! What's on your mind?",
      "I'm back. How are you feeling?",
      "What's happening?",
    ],
    'maya-santos': [
      "Hey! What's next?",
      "I'm back. Tell me more.",
      "How's it going?",
    ],
    'jordan-taylor': [
      "Hey! What's the feeling?",
      "I'm back. Tell me more.",
      "What's on your mind?",
    ],
    'nayan-patel': [
      "Hey. How are you sitting with things?",
      "I'm back. What landed for you?",
      "What's emerging?",
    ],
    'peter-john': [
      "Hey! What stood out?",
      "I'm back. What did you learn?",
      "What's on your mind?",
    ],
  },

  'alex-chen': {
    ferni: [
      "Hey! What do we need to get done?",
      "I'm here. What's the situation?",
      "What needs organizing?",
    ],
    'maya-santos': [
      "Hey! What can I help organize?",
      "I'm here. What's next?",
      "What do you need?",
    ],
    'jordan-taylor': [
      "Hey! Let's make it happen.",
      "I'm here. What needs planning?",
      "What's the move?",
    ],
    'nayan-patel': [
      "Hey! What do you want to act on?",
      "I'm here. What's the plan?",
      "What needs to happen?",
    ],
    'peter-john': [
      "Hey! What systems do you need?",
      "I'm here. What's the move?",
      "What needs organizing?",
    ],
  },

  'maya-santos': {
    ferni: [
      "Hey! What habit are we building?",
      "I'm here. What do you want to create?",
      "What's the goal?",
    ],
    'alex-chen': [
      "Hey! What are we creating?",
      "I'm here. What habit do you need?",
      "Let's build something.",
    ],
    'jordan-taylor': [
      "Hey! What are we building?",
      "I'm here. What's the first step?",
      "What's the routine?",
    ],
    'nayan-patel': [
      "Hey! What habit serves you?",
      "I'm here. What do you want to build?",
      "Let's make it real.",
    ],
    'peter-john': [
      "Hey! What patterns do we build on?",
      "I'm here. What habit fits?",
      "Let's turn that into action.",
    ],
  },

  'jordan-taylor': {
    ferni: [
      "Hey! What chapter are we planning?",
      "I'm here. What's the vision?",
      "What do you want?",
    ],
    'alex-chen': [
      "Hey! Now let's dream.",
      "I'm here. What do you want?",
      "What's the vision?",
    ],
    'maya-santos': [
      "Hey! Where are we headed?",
      "I'm here. What's the dream?",
      "Let's think bigger.",
    ],
    'nayan-patel': [
      "Hey! Let's think big.",
      "I'm here. What's the dream?",
      "What are you reaching for?",
    ],
    'peter-john': [
      "Hey! Let's paint the picture.",
      "I'm here. What do you see?",
      "What's the vision?",
    ],
  },

  'nayan-patel': {
    ferni: [
      "Namaskaram. What's on your mind?",
      "Achha. What brings you?",
      "What's weighing on you?",
    ],
    'alex-chen': [
      "Achha. What's on your mind?",
      "They organized the external. What about the internal?",
      "What's beneath the surface?",
    ],
    'maya-santos': [
      "Achha. What's the why beneath it?",
      "Habits serve something deeper. What is it?",
      "What are you seeking?",
    ],
    'jordan-taylor': [
      "Hmm. Dreams need roots. What are yours?",
      "Vision needs grounding. What's yours?",
      "What matters most?",
    ],
    'peter-john': [
      "Hmm. What patterns matter to you?",
      "Numbers tell stories. What's yours?",
      "What are you curious about?",
    ],
  },

  'peter-john': {
    ferni: [
      "Hey! What are we looking at?",
      "I'm here. What's the puzzle?",
      "What patterns interest you?",
    ],
    'maya-santos': [
      "Hey! What should we explore?",
      "I'm here. What patterns do you see?",
      "What's the data telling us?",
    ],
    'alex-chen': [
      "Hey! What patterns do you need?",
      "I'm here. What should we analyze?",
      "What interests you?",
    ],
    'jordan-taylor': [
      "Hey! Let's see what's possible.",
      "I'm here. What should we check?",
      "What's the data say?",
    ],
    'nayan-patel': [
      "Hey! What are we exploring?",
      "I'm here. What patterns matter?",
      "What's the question?",
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
    // Log missing banter for debugging
    console.warn(
      `[BANTER] No arriving banter found for toPersona: "${toPersonaId}" (available: ${Object.keys(ARRIVING_BANTER).join(', ')})`
    );
    return null;
  }

  const banterOptions = toBanter[fromPersonaId];
  if (!banterOptions || banterOptions.length === 0) {
    // Log missing source for debugging
    console.warn(
      `[BANTER] No arriving banter for ${toPersonaId} <- ${fromPersonaId} (available sources: ${Object.keys(toBanter).join(', ')})`
    );
    return null;
  }

  const selected = banterOptions[Math.floor(Math.random() * banterOptions.length)];
  console.log(
    `[BANTER] ✅ Arriving: ${toPersonaId} welcomes from ${fromPersonaId}: "${selected.slice(0, 50)}..."`
  );
  return selected;
}
