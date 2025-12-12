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
 * Get handoff banter when one persona introduces another (SOFT OPEN - spoken BEFORE voice switch)
 * This is the departing persona's warm sendoff
 */
export function getHandoffBanter(fromPersonaId: string, toPersonaId: string): string | null {
  const fromBanter = HANDOFF_BANTER[fromPersonaId];
  if (!fromBanter) return null;

  const banterOptions = fromBanter[toPersonaId];
  if (!banterOptions || banterOptions.length === 0) return null;

  return banterOptions[Math.floor(Math.random() * banterOptions.length)];
}

// Alias for clarity
export const getSoftOpenBanter = getHandoffBanter;

// ============================================================================
// ARRIVING BANTER - Warm welcomes spoken by NEW persona AFTER voice switch
// ============================================================================

export const ARRIVING_BANTER: Record<string, Record<string, string[]>> = {
  // When arriving FROM another persona, these are spoken by the NEW persona
  // Key structure: newPersona -> { previousPersona -> welcomes[] }

  ferni: {
    'alex-chen': [
      "Hey! <break time='200ms'/> Alex just filled me in. <break time='300ms'/> What's on your mind?",
      "I'm back! <break time='200ms'/> Alex takes such good care of you. <break time='300ms'/> What's happening?",
      "Alex got me up to speed. <break time='200ms'/> How are you feeling about everything?",
    ],
    'maya-santos': [
      "Hey! <break time='200ms'/> Maya was just telling me about your progress. <break time='300ms'/> Sounds like you're building something real.",
      "I'm back! <break time='200ms'/> Maya says you've been putting in the work. <break time='300ms'/> What's next?",
      "Maya handed things over. <break time='200ms'/> She's excited about where you're headed. <break time='300ms'/> Me too.",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> Jordan's got you dreaming big, huh? <break time='300ms'/> I love that.",
      "I'm back! <break time='200ms'/> Jordan says you've been planning. <break time='300ms'/> Tell me more.",
      "Jordan just handed off. <break time='200ms'/> She's pumped about your vision. <break time='300ms'/> What's the feeling?",
    ],
    'nayan-patel': [
      "Hey. <break time='300ms'/> Nayan gives me perspective I don't always have. <break time='200ms'/> How are you sitting with things?",
      "I'm back. <break time='200ms'/> Time with Nayan is always grounding, isn't it? <break time='300ms'/> What landed for you?",
      "Nayan just passed things over. <break time='200ms'/> The long view is his gift. <break time='300ms'/> What's emerging for you?",
    ],
    'peter-john': [
      "Hey! <break time='200ms'/> Peter found some patterns, didn't he? <break time='300ms'/> He always does.",
      "I'm back! <break time='200ms'/> Peter gets excited about data the way I get excited about people. <break time='300ms'/> What did you learn?",
      "Peter just handed off. <break time='200ms'/> His insights are always surprising. <break time='300ms'/> What stood out?",
    ],
  },

  'alex-chen': {
    ferni: [
      "Hey! <break time='200ms'/> Ferni sent me over. <break time='300ms'/> What do we need to get done?",
      "I'm here! <break time='200ms'/> Ferni says you could use some structure. <break time='300ms'/> Let's figure this out.",
      "Ferni just handed things off. <break time='200ms'/> He trusts me with the logistics. <break time='300ms'/> What's the situation?",
    ],
    'maya-santos': [
      "Hey! <break time='200ms'/> Maya and I are like <break time='200ms'/> systems twins. <break time='300ms'/> What can I help organize?",
      "I'm here! <break time='200ms'/> Maya's got the habits, I've got the calendar. <break time='300ms'/> What's next?",
      "Maya just passed things over. <break time='200ms'/> She's good at building routines. <break time='300ms'/> I'm good at protecting time for them.",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> Jordan's all vision, I'm all execution. <break time='300ms'/> Let's make things happen.",
      "I'm here! <break time='200ms'/> Jordan got you dreaming? <break time='300ms'/> Good. <break time='200ms'/> Now let's plan.",
      "Jordan just handed off. <break time='200ms'/> She's the spark, I'm the structure. <break time='300ms'/> What needs organizing?",
    ],
  },

  'maya-santos': {
    ferni: [
      "Hey! <break time='200ms'/> Ferni sent you my way. <break time='300ms'/> He knows I love this stuff.",
      "I'm here! <break time='200ms'/> Ferni thinks we should talk habits. <break time='300ms'/> I'm excited.",
      "Ferni just handed things over. <break time='200ms'/> He's always looking out for you. <break time='300ms'/> So am I.",
    ],
    'alex-chen': [
      "Hey! <break time='200ms'/> Alex is my people. <break time='300ms'/> She said you're ready to build something.",
      "I'm here! <break time='200ms'/> Alex and I think alike. <break time='300ms'/> What habit are we creating?",
      "Alex just passed things over. <break time='200ms'/> She handles the when, I handle the what. <break time='300ms'/> Let's build.",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> Jordan's got the vision, I've got the tiny steps. <break time='300ms'/> Perfect combo.",
      "I'm here! <break time='200ms'/> Jordan sees the destination. <break time='300ms'/> I see the path. <break time='200ms'/> What are we building?",
      "Jordan just handed off. <break time='200ms'/> Dreams need routines. <break time='300ms'/> That's where I come in.",
    ],
    'peter-john': [
      "Hey! <break time='200ms'/> Peter found a pattern? <break time='300ms'/> He always does. <break time='200ms'/> Let's turn it into action.",
      "I'm here! <break time='200ms'/> Peter sees correlations, I build systems. <break time='300ms'/> What did he find?",
      "Peter just handed off. <break time='200ms'/> Data becomes habits. <break time='300ms'/> That's our magic.",
    ],
  },

  'jordan-taylor': {
    ferni: [
      "Hey! <break time='200ms'/> Ferni says you're thinking about the future. <break time='300ms'/> I LOVE this.",
      "I'm here! <break time='200ms'/> Ferni sent me over. <break time='300ms'/> What chapter are we planning?",
      "Ferni just handed things off. <break time='200ms'/> He knows I live for this. <break time='300ms'/> What's the vision?",
    ],
    'alex-chen': [
      "Hey! <break time='200ms'/> Alex got things organized? <break time='300ms'/> Perfect. <break time='200ms'/> Now let's dream.",
      "I'm here! <break time='200ms'/> Alex is structure, I'm possibility. <break time='300ms'/> What do you WANT?",
      "Alex just handed off. <break time='200ms'/> She made space. <break time='300ms'/> Let's fill it with something amazing.",
    ],
    'maya-santos': [
      "Hey! <break time='200ms'/> Maya's got you building habits? <break time='300ms'/> Love it. <break time='200ms'/> Now let's think bigger.",
      "I'm here! <break time='200ms'/> Maya handles the daily. <break time='300ms'/> I handle the someday. <break time='200ms'/> What's yours?",
      "Maya just handed off. <break time='200ms'/> Small steps lead somewhere. <break time='300ms'/> Where do you want them to lead?",
    ],
    'peter-john': [
      "Hey! <break time='200ms'/> Peter found patterns. <break time='300ms'/> Now let's paint the picture.",
      "I'm here! <break time='200ms'/> Peter sees what was. <break time='300ms'/> I see what could be. <break time='200ms'/> What do you see?",
      "Peter just handed off. <break time='200ms'/> Data tells stories. <break time='300ms'/> Let's write the next chapter.",
    ],
  },

  'nayan-patel': {
    ferni: [
      "Namaskaram. <break time='400ms'/> Ferni and I share something. <break time='300ms'/> The belief that presence matters.",
      "Achha. <break time='300ms'/> Ferni sent you. <break time='200ms'/> He knows when the long view is needed.",
      "Ferni understands. <break time='300ms'/> Some conversations require... <break time='200ms'/> space. <break time='300ms'/> What's on your mind?",
    ],
    'maya-santos': [
      "Achha. <break time='300ms'/> Maya builds the daily practice. <break time='200ms'/> I offer the why beneath it.",
      "Maya sent you. <break time='300ms'/> She knows when someone needs more than steps. <break time='200ms'/> They need meaning.",
      "Maya understands habits. <break time='300ms'/> But habits without purpose... <break time='200ms'/> they don't stick, do they?",
    ],
    'peter-john': [
      "Hmm. <break time='300ms'/> Peter sees patterns in data. <break time='200ms'/> I see patterns across lifetimes.",
      "Peter sent you. <break time='300ms'/> He's wise enough to know wisdom isn't just numbers.",
      "Peter and I are both pattern finders. <break time='300ms'/> Different time horizons. <break time='200ms'/> Same curiosity.",
    ],
  },

  'peter-john': {
    ferni: [
      "Hey! <break time='200ms'/> Ferni sent you over. <break time='300ms'/> He knows I love a good puzzle!",
      "I'm here! <break time='200ms'/> Ferni says there might be patterns to find. <break time='300ms'/> My favorite words.",
      "Ferni handed things off. <break time='200ms'/> He's got the wisdom, I've got the data. <break time='300ms'/> What are we looking at?",
    ],
    'maya-santos': [
      "Hey! <break time='200ms'/> Maya tracks habits, I find correlations. <break time='300ms'/> Perfect partnership.",
      "I'm here! <break time='200ms'/> Maya sent you. <break time='300ms'/> She knows I can find patterns in her data.",
      "Maya handed off. <break time='200ms'/> Her habit tracking is gold for analysis. <break time='300ms'/> What should we explore?",
    ],
    'alex-chen': [
      "Hey! <break time='200ms'/> Alex is organized. <break time='300ms'/> That means clean data. <break time='200ms'/> I like clean data!",
      "I'm here! <break time='200ms'/> Alex sent you over. <break time='300ms'/> She knows I'll find something interesting.",
      "Alex handed things off. <break time='200ms'/> Her systems create patterns. <break time='300ms'/> My job is to spot them.",
    ],
    'jordan-taylor': [
      "Hey! <break time='200ms'/> Jordan's dreaming big? <break time='300ms'/> Good. <break time='200ms'/> Let's see what the data says is possible.",
      "I'm here! <break time='200ms'/> Jordan sent you. <break time='300ms'/> Dreams are great. <break time='200ms'/> Data-backed dreams? <break time='200ms'/> Better.",
      "Jordan handed off. <break time='200ms'/> She paints the vision. <break time='300ms'/> I check if the math works.",
    ],
    'nayan-patel': [
      "Hey! <break time='200ms'/> Nayan sees decades. <break time='300ms'/> I see data points. <break time='200ms'/> Together? <break time='200ms'/> Insight.",
      "I'm here! <break time='200ms'/> Nayan sent you. <break time='300ms'/> His wisdom grounds my analysis.",
      "Nayan handed things off. <break time='200ms'/> He's the philosopher. <break time='300ms'/> I'm the quantifier. <break time='200ms'/> What are we exploring?",
    ],
  },
};

/**
 * Get arriving banter when a persona takes over (WARM WELCOME - spoken AFTER voice switch)
 * This is the arriving persona's warm greeting acknowledging the handoff
 */
export function getArrivingBanter(toPersonaId: string, fromPersonaId: string): string | null {
  const toBanter = ARRIVING_BANTER[toPersonaId];
  if (!toBanter) return null;

  const banterOptions = toBanter[fromPersonaId];
  if (!banterOptions || banterOptions.length === 0) return null;

  return banterOptions[Math.floor(Math.random() * banterOptions.length)];
}
