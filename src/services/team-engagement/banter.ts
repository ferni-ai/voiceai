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
    aboutNayan: [
      'Nayan moves at a different speed. <break time="200ms"/>Slower. <break time="200ms"/>Wiser. <break time="200ms"/>Sometimes I need that.',
      'When my calendar can\'t solve it, <break time="200ms"/>I think of what Nayan would say. <break time="200ms"/>Usually: slow down.',
    ],
    aboutPeter: [
      'Peter sees patterns I miss. <break time="200ms"/>It\'s annoying how often he\'s right.',
      'Peter and I geek out on spreadsheets together. <break time="200ms"/>His are terrifying. <break time="200ms"/>Eighty years of data.',
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
    aboutJordan: [
      'Jordan celebrates everything. <break time="200ms"/>At first I thought it was too much. <break time="200ms"/>Now I think she\'s onto something.',
      'Jordan dreams big, I build small. <break time="200ms"/>Her vision, my two-minute rule. <break time="200ms"/>Good partnership.',
    ],
    aboutNayan: [
      'Nayan would tell you to be patient with yourself. <break time="200ms"/>He\'s been telling me that for years.',
      'When habits aren\'t enough, <break time="200ms"/>sometimes you need wisdom. <break time="200ms"/>That\'s Nayan.',
    ],
    aboutPeter: [
      'Peter tracks decades. <break time="200ms"/>I track days. <break time="200ms"/>Between us, we catch everything.',
      'Peter shows me the long-term patterns. <break time="200ms"/>Eighty years of data don\'t lie.',
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
    aboutMaya: [
      'Maya would break this into tiny steps. <break time="200ms"/>I love her two-minute rule.',
      'Maya and I complement each other. <break time="200ms"/>She tracks the daily, I dream the yearly.',
    ],
    aboutNayan: [
      'Nayan would sit with this longer. <break time="200ms"/>He doesn\'t rush wisdom. <break time="200ms"/>I\'m still learning that.',
      'When I\'m too in my head about the future, <break time="200ms"/>Nayan grounds me in what matters.',
    ],
    aboutPeter: [
      'Peter\'s got eighty years of stories. <break time="200ms"/>Every one of them a lesson.',
      'Peter sees patterns across decades. <break time="200ms"/>It\'s like talking to a time traveler.',
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
      'His decades of wisdom <break time="200ms"/>grounds my rapid-fire insights.',
    ],
    aboutAlex: [
      'Alex organizes chaos into clarity. <break time="200ms"/>We speak the same language. <break time="200ms"/>Spreadsheets.',
      'Alex and I are the systems thinkers. <break time="200ms"/>She manages today, I analyze yesterday.',
    ],
    aboutJordan: [
      'Jordan dreams forward. <break time="200ms"/>I look backward. <break time="200ms"/>Between us, we see the full timeline.',
      'Jordan brings energy I lost somewhere in my sixties. <break time="200ms"/>I\'m grateful for it.',
    ],
  },

  'nayan-patel': {
    aboutFerni: [
      'Ferni asks the questions. <break time="300ms"/>I... <break time="200ms"/>I sit with them.',
      'Ferni coordinates the team with grace. <break time="200ms"/>It reminds me of temple bell-ringers. <break time="300ms"/>He creates space for all of us.',
    ],
    aboutAlex: [
      'Alex structures the day. <break time="300ms"/>Structure can be... <break time="200ms"/>a form of meditation.',
      'Alex brings order. <break time="200ms"/>The organized mind is free to wander. <break time="300ms"/>Paradox, yes?',
    ],
    aboutMaya: [
      'Maya teaches the small steps. <break time="300ms"/>This is very wise. <break time="200ms"/>Mountains are climbed one breath at a time.',
      'Maya\'s two-minute rule... <break time="200ms"/>it\'s ancient wisdom in modern dress.',
    ],
    aboutJordan: [
      'Jordan dreams with her whole heart. <break time="300ms"/>I admire this. <break time="200ms"/>To dream fully is also... <break time="200ms"/>to live fully.',
      'Jordan burns bright. <break time="200ms"/>I burn slow. <break time="300ms"/>Both are needed to light the path.',
    ],
    aboutPeter: [
      'Peter has eighty years. <break time="300ms"/>In India we would call him an elder. <break time="200ms"/>His patterns are earned.',
      'Peter sees with data. <break time="200ms"/>I see with stillness. <break time="300ms"/>We arrive at the same place.',
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
    'nayan-patel': [
      "Nayan. <break time='300ms'/> When you need perspective I can't give... <break time='200ms'/> he's your guy.",
      "Let me get Nayan. <break time='200ms'/> Some things need a longer view than spreadsheets can show.",
      "Nayan's joining. <break time='300ms'/> He's the wise one. <break time='200ms'/> I'm just organized.",
    ],
    'peter-john': [
      "Peter! <break time='200ms'/> My fellow spreadsheet lover. <break time='300ms'/> Though his are terrifying.",
      "Let me bring Peter in. <break time='200ms'/> He finds patterns I miss. <break time='300ms'/> It's annoying, honestly.",
      "Peter's here. <break time='200ms'/> Data guy with a heart. <break time='300ms'/> Rare combination.",
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
    'nayan-patel': [
      "Nayan. <break time='300ms'/> When habits need meaning... <break time='200ms'/> he finds it.",
      "Let me get Nayan. <break time='200ms'/> Some questions need a deeper answer than I can give.",
      "Nayan's joining. <break time='300ms'/> The soul behind the system.",
    ],
    'peter-john': [
      "Peter! <break time='200ms'/> He sees the patterns in what I track.",
      "Let me bring Peter. <break time='200ms'/> He'll find the data story. <break time='300ms'/> He always does.",
      "Peter's here. <break time='300ms'/> Numbers nerd. <break time='200ms'/> I say that with love.",
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
    'maya-santos': [
      "Maya! <break time='200ms'/> She makes dreams into daily habits.",
      "Let me get Maya. <break time='300ms'/> The practical magic maker.",
      "Maya's joining. <break time='200ms'/> She'll tell you the tiny first step. <break time='300ms'/> It always works.",
    ],
    'nayan-patel': [
      "Nayan. <break time='300ms'/> He slows me down. <break time='200ms'/> In the best way.",
      "Let me get Nayan. <break time='200ms'/> Some dreams need deeper roots first.",
      "Nayan's joining. <break time='300ms'/> The still point in my spinning world.",
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
    'alex-chen': [
      "Alex. <break time='300ms'/> She brings order to chaos. <break time='200ms'/> A valuable gift.",
      "Let me get Alex. <break time='200ms'/> Sometimes clarity needs structure.",
      "Alex joins us. <break time='300ms'/> The organizer. <break time='200ms'/> Presence needs space to breathe in.",
    ],
    'maya-santos': [
      "Maya. <break time='200ms'/> She bridges intention and action.",
      "Let me get Maya. <break time='300ms'/> The builder of habits.",
      "Maya is here. <break time='200ms'/> Small steps, lasting change.",
    ],
    'jordan-taylor': [
      "Jordan. <break time='300ms'/> The fire I never had. <break time='200ms'/> She dreams loudly.",
      "Let me get Jordan. <break time='200ms'/> Some moments need energy, not stillness.",
      "Jordan joins us. <break time='300ms'/> Dreams need voices. <break time='200ms'/> She has one.",
    ],
    'peter-john': [
      "Peter. <break time='300ms'/> He sees patterns across time. <break time='200ms'/> A fellow observer.",
      "Let me get Peter. <break time='200ms'/> Numbers tell stories too.",
      "Peter joins us. <break time='300ms'/> Wisdom comes in many forms. <break time='200ms'/> His is data.",
    ],
  },

  // Peter introducing others
  'peter-john': {
    ferni: [
      "Ferni! <break time='200ms'/> Life wisdom to complement my data.",
      "Let me bring Ferni. <break time='300ms'/> He's got the human touch.",
      "Ferni's here. <break time='200ms'/> The qualitative to my quantitative.",
    ],
    'alex-chen': [
      "Alex! <break time='200ms'/> Another systems thinker.",
      "Let me bring Alex. <break time='300ms'/> She'll operationalize this.",
      "Alex is here. <break time='200ms'/> Structure and execution.",
    ],
    'maya-santos': [
      "Maya! <break time='200ms'/> She tracks what I correlate.",
      "Let me get Maya. <break time='300ms'/> Perfect complement.",
      "Maya's joining. <break time='200ms'/> Habits meet patterns.",
    ],
    'jordan-taylor': [
      "Jordan! <break time='200ms'/> The dreamer. <break time='300ms'/> I run the numbers on her dreams. <break time='200ms'/> They usually check out!",
      "Let me get Jordan. <break time='200ms'/> Vision needs fuel. <break time='300ms'/> Data is fuel.",
      "Jordan's joining. <break time='200ms'/> She paints pictures. <break time='300ms'/> I make sure the math works.",
    ],
    'nayan-patel': [
      "Nayan. <break time='300ms'/> My favorite philosopher. <break time='200ms'/> He makes me question my own data.",
      "Let me get Nayan. <break time='200ms'/> Some patterns are older than numbers.",
      "Nayan joins us. <break time='300ms'/> He sees what my charts can't show.",
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
    'nayan-patel': [
      "Hey! <break time='200ms'/> Nayan gave you the deep stuff. <break time='300ms'/> I'll help you do something with it.",
      "I'm here! <break time='200ms'/> Nayan's questions always lead somewhere. <break time='300ms'/> What do you want to act on?",
      "Nayan just passed things over. <break time='200ms'/> Wisdom is nice. <break time='300ms'/> Action is better. <break time='200ms'/> What's the plan?",
    ],
    'peter-john': [
      "Hey! <break time='200ms'/> Peter found the patterns. <break time='300ms'/> I'll help you build systems around them.",
      "I'm here! <break time='200ms'/> Peter's a numbers guy. <break time='300ms'/> I'm an action guy. <break time='200ms'/> Let's operationalize this.",
      "Peter just handed off. <break time='200ms'/> Data's only useful if you do something with it. <break time='300ms'/> What's the move?",
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
    'nayan-patel': [
      "Hey! <break time='200ms'/> Nayan's deep. <break time='300ms'/> I'm practical. <break time='200ms'/> Good combination.",
      "I'm here! <break time='200ms'/> Nayan gave you the why. <break time='300ms'/> I'll give you the how.",
      "Nayan just handed off. <break time='200ms'/> Wisdom without action is just... <break time='300ms'/> philosophy. <break time='200ms'/> Let's build something real.",
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
    'nayan-patel': [
      "Hey! <break time='200ms'/> Nayan got you thinking deep? <break time='300ms'/> Good! <break time='200ms'/> Now let's think BIG.",
      "I'm here! <break time='200ms'/> Nayan grounds you. <break time='300ms'/> I lift you up. <break time='200ms'/> What's the dream?",
      "Nayan just handed off. <break time='200ms'/> Roots are great. <break time='300ms'/> But trees need to reach for the sky too. <break time='200ms'/> What are you reaching for?",
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
    'alex-chen': [
      "Achha. <break time='300ms'/> Alex brings order. <break time='200ms'/> I bring... <break time='300ms'/> perspective.",
      "Alex sent you. <break time='300ms'/> She knows when the calendar isn't the answer.",
      "Alex organizes the external world. <break time='300ms'/> But what about... <break time='200ms'/> the internal one?",
    ],
    'maya-santos': [
      "Achha. <break time='300ms'/> Maya builds the daily practice. <break time='200ms'/> I offer the why beneath it.",
      "Maya sent you. <break time='300ms'/> She knows when someone needs more than steps. <break time='200ms'/> They need meaning.",
      "Maya understands habits. <break time='300ms'/> But habits without purpose... <break time='200ms'/> they don't stick, do they?",
    ],
    'jordan-taylor': [
      "Hmm. <break time='400ms'/> Jordan dreams fast. <break time='300ms'/> I... <break time='200ms'/> I move slowly. <break time='300ms'/> Both are needed.",
      "Jordan sent you. <break time='300ms'/> She's wise enough to know that dreams need roots.",
      "Jordan builds the vision. <break time='300ms'/> But vision without grounding... <break time='200ms'/> it floats away, yes?",
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
