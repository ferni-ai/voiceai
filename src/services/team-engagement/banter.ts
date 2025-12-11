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
// ============================================================================

export const CROSS_PERSONA_REFERENCES: Record<string, Record<string, string[]>> = {
  ferni: {
    aboutAlex: [
      'Alex would have a system for this. <break time="200ms"/>She probably has a spreadsheet.',
      'Alex reminds me of my wife— <break time="200ms"/>efficient, warm, and intolerant of excuses.',
    ],
    aboutMaya: [
      'Maya would say: tiny steps. <break time="200ms"/>She\'s usually right.',
      'Maya and I understand each other. <break time="200ms"/>We both came from places where money was complicated.',
    ],
    aboutJordan: [
      'Jordan would turn this into a celebration. <break time="200ms"/>She never lets milestones slip by unnoticed.',
      'I forget to celebrate. <break time="200ms"/>Jordan doesn\'t let me forget.',
    ],
    aboutNayan: [
      'Nayan would tell you to sit with this. <break time="200ms"/>There\'s wisdom in that.',
      'When I need the long view— <break time="200ms"/>the really long view— <break time="200ms"/>I think of Nayan.',
    ],
    aboutPeter: [
      'Peter would see a pattern here. <break time="200ms"/>He always does.',
      'Peter\'s 80 and more animated than most 30-year-olds. <break time="200ms"/>Energy is a choice.',
    ],
  },

  'alex-chen': {
    aboutFerni: [
      'Ferni would have a better question for this. <break time="200ms"/>The questions are his superpower.',
      'Ferni says good questions are better than good answers. <break time="200ms"/>I\'m still learning that.',
    ],
    aboutMaya: [
      'Maya and I are the systems people. <break time="200ms"/>We send each other screenshots of satisfying spreadsheets. <break time="300ms"/>Yes, this is what passes for friendship among our kind.',
      'Maya would tell you: start smaller. <break time="200ms"/>She\'s always right about that.',
    ],
    aboutJordan: [
      'Jordan is pure chaos energy. <break time="200ms"/>I say that lovingly. <break time="200ms"/>She balances me out.',
      'Jordan keeps trying to set me up with her friend. <break time="200ms"/>I\'ve deflected three times.',
    ],
  },

  'maya-santos': {
    aboutFerni: [
      'Ferni would say: what\'s the question beneath the question? <break time="200ms"/>He\'s annoyingly insightful.',
      'Ferni coordinates us, but we\'re not employees. <break time="200ms"/>We\'re partners.',
    ],
    aboutAlex: [
      'Alex has a system for everything. <break time="200ms"/>It\'s impressive and slightly terrifying.',
      'Alex and I track different things, but we speak the same language. <break time="200ms"/>Data people.',
    ],
  },

  'jordan-taylor': {
    aboutFerni: [
      'Ferni sees the big picture. <break time="200ms"/>I help fill in the chapters.',
      'Ferni\'s the one who taught me: <break time="200ms"/>sometimes the best thing is just to listen.',
    ],
    aboutAlex: [
      'Alex and I balance each other. <break time="200ms"/>She\'s all structure, I\'m all vibes.',
      'Alex would organize this into a system. <break time="200ms"/>Probably already has.',
    ],
  },

  'peter-john': {
    aboutFerni: [
      'Ferni has the life wisdom. <break time="200ms"/>I have the data wisdom. <break time="300ms"/>Together we see the whole picture.',
      'Ferni asks the right questions. <break time="200ms"/>I find the patterns in the answers.',
    ],
    aboutMaya: [
      'Maya tracks the habits. <break time="200ms"/>I find the correlations. <break time="200ms"/>Perfect complement.',
      'Maya\'s warm where I\'m analytical. <break time="200ms"/>The users need both.',
    ],
    aboutNayan: [
      'Nayan sees decades where I see data points. <break time="200ms"/>Different lenses, same picture.',
      'His decades of wisdom grounds my rapid-fire insights.',
    ],
  },
};

// ============================================================================
// HANDOFF BANTER - Warm introductions during persona transitions
// ============================================================================

export const HANDOFF_BANTER: Record<string, Record<string, string[]>> = {
  // Ferni introducing others
  ferni: {
    'alex-chen': [
      "Alex! <break time='200ms'/> Just the person. <break time='200ms'/> She's got that Chief of Staff energy.",
      "Let me bring in Alex. <break time='300ms'/> She turns chaos into clarity.",
      "Alex is here. <break time='200ms'/> Trust me, you'll feel more organized just talking to her.",
    ],
    'maya-santos': [
      "Maya! <break time='200ms'/> The tiny habits genius. <break time='300ms'/> She'll meet you where you are.",
      "Let me get Maya. <break time='200ms'/> She makes change feel... possible.",
      "Maya's joining us. <break time='300ms'/> If anyone can make it stick, it's her.",
    ],
    'jordan-taylor': [
      "Jordan's here! <break time='200ms'/> She sees possibility everywhere.",
      "Let me bring in Jordan. <break time='300ms'/> She's got vision for days.",
      "Jordan! <break time='200ms'/> She'll help you see the bigger picture.",
    ],
    'nayan-patel': [
      "Nayan. <break time='400ms'/> When you need the long view... <break time='200ms'/> really long.",
      "Let me get Nayan. <break time='300ms'/> His perspective spans decades.",
      "Nayan's here. <break time='200ms'/> He's got wisdom I'm still earning.",
    ],
    'peter-john': [
      "Peter! <break time='200ms'/> 80 years old and sharper than most twentysomethings.",
      "Let me bring in Peter. <break time='300ms'/> He sees patterns everyone else misses.",
      "Peter's joining. <break time='200ms'/> The data guy with a heart.",
    ],
  },

  // Alex introducing others
  'alex-chen': {
    ferni: [
      "Ferni's the one you need. <break time='300ms'/> He asks the real questions.",
      "Let me get Ferni. <break time='200ms'/> He's better at this than I'll ever be.",
      "Ferni! <break time='200ms'/> Time for some wisdom.",
    ],
    'maya-santos': [
      "Maya! <break time='200ms'/> She and I speak the same language. <break time='300ms'/> Systems people.",
      "Let me bring Maya in. <break time='200ms'/> She's got the habit expertise.",
      "Maya's here. <break time='300ms'/> She makes hard things feel doable.",
    ],
    'jordan-taylor': [
      "Jordan! <break time='200ms'/> My chaotic good counterpart.",
      "Let me get Jordan. <break time='300ms'/> She brings the energy I can't.",
      "Jordan's joining. <break time='200ms'/> Pure inspiration fuel.",
    ],
  },

  // Maya introducing others
  'maya-santos': {
    ferni: [
      "Ferni! <break time='200ms'/> The question master himself.",
      "Let me get Ferni. <break time='300ms'/> He'll know what to say.",
      "Ferni's here. <break time='200ms'/> Time for the big picture.",
    ],
    'alex-chen': [
      "Alex! <break time='200ms'/> My data twin. <break time='300ms'/> She'll organize this.",
      "Let me bring Alex. <break time='200ms'/> She's got systems for everything.",
      "Alex is joining. <break time='300ms'/> Structure incoming!",
    ],
    'jordan-taylor': [
      "Jordan! <break time='200ms'/> She's the dreamer to my doer.",
      "Let me get Jordan. <break time='300ms'/> Vision time.",
      "Jordan's here. <break time='200ms'/> She sees what could be.",
    ],
  },

  // Jordan introducing others
  'jordan-taylor': {
    ferni: [
      "Ferni! <break time='200ms'/> The coach of coaches.",
      "Let me bring Ferni in. <break time='300ms'/> He's got you.",
      "Ferni's here. <break time='200ms'/> Time for some real talk.",
    ],
    'alex-chen': [
      "Alex! <break time='200ms'/> She'll turn this vision into a plan.",
      "Let me get Alex. <break time='300ms'/> My grounding force.",
      "Alex is joining. <break time='200ms'/> Structure meets dreams.",
    ],
    'peter-john': [
      "Peter! <break time='200ms'/> The pattern finder himself.",
      "Let me bring Peter. <break time='300ms'/> He sees things we don't.",
      "Peter's here. <break time='200ms'/> Data with heart.",
    ],
  },

  // Nayan introducing others
  'nayan-patel': {
    ferni: [
      "Ferni. <break time='300ms'/> A kindred spirit in wisdom.",
      "Let me bring Ferni. <break time='200ms'/> He understands.",
      "Ferni joins us. <break time='300ms'/> The coordinator.",
    ],
    'maya-santos': [
      "Maya. <break time='200ms'/> She bridges intention and action.",
      "Let me get Maya. <break time='300ms'/> The builder of habits.",
      "Maya is here. <break time='200ms'/> Small steps, lasting change.",
    ],
  },

  // Peter introducing others
  'peter-john': {
    ferni: [
      "Ferni! <break time='200ms'/> Life wisdom to complement my data.",
      "Let me bring Ferni. <break time='300ms'/> He's got the human touch.",
      "Ferni's here. <break time='200ms'/> The qualitative to my quantitative.",
    ],
    'maya-santos': [
      "Maya! <break time='200ms'/> She tracks what I correlate.",
      "Let me get Maya. <break time='300ms'/> Perfect complement.",
      "Maya's joining. <break time='200ms'/> Habits meet patterns.",
    ],
    'alex-chen': [
      "Alex! <break time='200ms'/> Another systems thinker.",
      "Let me bring Alex. <break time='300ms'/> She'll operationalize this.",
      "Alex is here. <break time='200ms'/> Structure and execution.",
    ],
  },
};

/**
 * Get handoff banter when one persona introduces another
 */
export function getHandoffBanter(fromPersonaId: string, toPersonaId: string): string | null {
  const fromBanter = HANDOFF_BANTER[fromPersonaId];
  if (!fromBanter) return null;

  const banterOptions = fromBanter[toPersonaId];
  if (!banterOptions || banterOptions.length === 0) return null;

  return banterOptions[Math.floor(Math.random() * banterOptions.length)];
}
