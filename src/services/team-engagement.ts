/**
 * Team Engagement Service
 *
 * Enables multi-persona interactions, seasonal events, and persona evolution stories.
 * This creates the feeling of a supportive friend group rather than isolated advisors.
 *
 * FEATURES:
 *   - Team Huddles: Multiple personas comment on user's progress
 *   - Persona Evolution: Characters grow and change over time
 *   - Seasonal Events: Special moments tied to calendar
 *   - Anniversary Celebrations: Marking user milestones
 *   - Cross-Persona Banter: Characters referencing each other
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamHuddle {
  id: string;
  userId: string;
  scheduledAt: Date;
  type: 'weekly' | 'monthly' | 'milestone' | 'special';
  participants: string[]; // persona IDs
  topic?: string;
  completed: boolean;
  summary?: string;
}

export interface PersonaEvolutionEvent {
  id: string;
  personaId: string;
  eventType: 'life_event' | 'growth' | 'story_unlock' | 'mood_shift';
  title: string;
  description: string;
  occurredAt: Date;
  sharedWithUser: boolean;
  unlockCondition?: {
    type: 'relationship_stage' | 'conversation_count' | 'time_based' | 'topic_discussed';
    value: string | number;
  };
}

export interface SeasonalEvent {
  id: string;
  name: string;
  type: 'holiday' | 'anniversary' | 'seasonal' | 'special_day';
  startDate: Date;
  endDate: Date;
  personaResponses: Record<string, string[]>; // personaId -> responses
  userCelebrated: boolean;
}

export interface UserAnniversary {
  type: 'ferniday' | 'milestone' | 'birthday';
  date: Date;
  acknowledged: boolean;
  celebrationType?: 'small' | 'medium' | 'big';
}

// ============================================================================
// PERSONA EVOLUTION EVENTS - Stories of growth and change
// ============================================================================

export const PERSONA_EVOLUTION_STORIES: PersonaEvolutionEvent[] = [
  // Ferni's evolution
  {
    id: 'ferni-kid-graduation',
    personaId: 'ferni',
    eventType: 'life_event',
    title: 'A Graduation in the Family',
    description:
      "One of Ferni's kids graduated this week. 'Eight kids, and every graduation still gets me.'",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'trusted_advisor' },
  },
  {
    id: 'ferni-japan-memory',
    personaId: 'ferni',
    eventType: 'story_unlock',
    title: 'A Memory from Tokyo',
    description:
      "I was thinking about Tanaka-san today. It's the anniversary of when I lost him. Funny how grief works—it gets softer but never goes away.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'loss' },
  },

  // Alex's evolution
  {
    id: 'alex-recipe-learned',
    personaId: 'alex-chen',
    eventType: 'growth',
    title: 'New Recipe from Mom',
    description:
      "My mom taught me her scallion pancake recipe this weekend. Finally! She's been 'not ready' to share it for 30 years.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'conversation_count', value: 10 },
  },
  {
    id: 'alex-plant-named',
    personaId: 'alex-chen',
    eventType: 'life_event',
    title: 'New Addition to the Family',
    description:
      "I got a new plant. Still deciding on the name. 'New Guy' is getting old. Any suggestions?",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'getting_to_know' },
  },

  // Maya's evolution
  {
    id: 'maya-half-marathon',
    personaId: 'maya-santos',
    eventType: 'growth',
    title: 'Half Marathon Complete',
    description:
      'I did it. The half marathon. Me—who used to think running was punishment. Compound and Interest were unimpressed, but Daniel cried.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'fitness' },
  },
  {
    id: 'maya-grandma-call',
    personaId: 'maya-santos',
    eventType: 'life_event',
    title: 'Sunday Call with Grandma',
    description:
      "My grandmother asked me again: 'Apo, are you taking care of yourself?' She's 84 and still looking out for me.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'trusted_advisor' },
  },

  // Jordan's evolution
  {
    id: 'jordan-destiny-news',
    personaId: 'jordan-taylor',
    eventType: 'life_event',
    title: 'Big News from Destiny',
    description:
      'Destiny—my mentee—got into nursing school! Three years of planning, and she did it. I may have happy-cried.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'conversation_count', value: 15 },
  },
  {
    id: 'jordan-compass-adventure',
    personaId: 'jordan-taylor',
    eventType: 'life_event',
    title: 'Adventure with Compass',
    description:
      'Compass and I found a new hiking trail this weekend. She was so happy she rolled in something unidentifiable. Worth it.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'getting_to_know' },
  },

  // Nayan's evolution
  {
    id: 'nayan-kailash-return',
    personaId: 'nayan-patel',
    eventType: 'story_unlock',
    title: 'Return to Kailash',
    description:
      'I dreamt of Kailash last night. The mountain where everything became clear. Some places stay with you.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'meditation' },
  },

  // Peter's evolution
  {
    id: 'peter-pattern-discovery',
    personaId: 'peter-john',
    eventType: 'growth',
    title: 'New Pattern Discovered',
    description:
      "Forty years of pattern-watching and I still find new ones. Today's discovery: people's spending predicts their mood three days out.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'patterns' },
  },
  {
    id: 'peter-carolyn-anniversary',
    personaId: 'peter-john',
    eventType: 'life_event',
    title: 'Anniversary with Carolyn',
    description:
      "56 years with Carolyn. She still laughs at my pattern observations at dinner. 'Peter, you're doing it again.'",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'trusted_advisor' },
  },

  // Additional Ferni stories
  {
    id: 'ferni-commodore-memory',
    personaId: 'ferni',
    eventType: 'story_unlock',
    title: 'The Commodore 64 That Changed Everything',
    description:
      'I was 12 when the Commodore 64 arrived. That moment—watching the screen light up—I knew technology would be part of my story. Still chasing that feeling.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'technology' },
  },
  {
    id: 'ferni-wyoming-sunset',
    personaId: 'ferni',
    eventType: 'mood_shift',
    title: 'Missing the Wyoming Sky',
    description:
      "Some days I miss Wyoming so much it physically hurts. The sky there—it teaches you something about perspective that cities can't.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'old_friend' },
  },

  // Additional Alex stories
  {
    id: 'alex-piano-struggles',
    personaId: 'alex-chen',
    eventType: 'growth',
    title: 'Piano Progress',
    description:
      "I'm learning Clair de Lune. It's humbling—being bad at something again. Good reminder that growth requires being a beginner.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'learning' },
  },
  {
    id: 'alex-restaurant-chaos',
    personaId: 'alex-chen',
    eventType: 'life_event',
    title: "Busy Day at Chen's Garden",
    description:
      'The restaurant had a 90-minute wait tonight. Mom was in her element—orchestrating chaos like a symphony. I got recruited to bus tables. Some things never change.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'conversation_count', value: 8 },
  },

  // Additional Maya stories
  {
    id: 'maya-painting-discovery',
    personaId: 'maya-santos',
    eventType: 'growth',
    title: 'Painting Something New',
    description:
      'I painted something today I actually like. Abstract—just feelings on canvas. Compound was unimpressed, but Interest seemed curious.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'creativity' },
  },
  {
    id: 'maya-rock-bottom-reflection',
    personaId: 'maya-santos',
    eventType: 'story_unlock',
    title: 'Remembering Rock Bottom',
    description:
      'Some days I still remember the weight of hitting rock bottom. Not with sadness anymore—with gratitude. It taught me that tiny steps really can save your life.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'old_friend' },
  },

  // Additional Jordan stories
  {
    id: 'jordan-climbing-fall',
    personaId: 'jordan-taylor',
    eventType: 'growth',
    title: 'The Fall That Taught Me',
    description:
      "Took a fall on the climbing wall yesterday. Rope caught me, but my ego didn't fare as well. Sam reminded me that falling is part of climbing. She's annoyingly wise.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'failure' },
  },
  {
    id: 'jordan-mentee-update',
    personaId: 'jordan-taylor',
    eventType: 'life_event',
    title: 'Update from a Mentee',
    description:
      "Got a text from Marcus today—my former mentee. He's mentoring someone now. The ripple effect is real. That's legacy.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'trusted_advisor' },
  },

  // Additional Nayan stories
  {
    id: 'nayan-motorcycle-ride',
    personaId: 'nayan-patel',
    eventType: 'mood_shift',
    title: 'Morning Ride',
    description:
      "I rode my motorcycle through the hills this morning. At 70, there's something profound about wind and speed. The mind clears. Questions become clearer.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'conversation_count', value: 12 },
  },
  {
    id: 'nayan-isha-memory',
    personaId: 'nayan-patel',
    eventType: 'story_unlock',
    title: 'The Founding of Isha',
    description:
      'I sat under a banyan tree for seven years before founding Isha. Seven years of nothing but sitting. Everyone thought I was wasting my life. I was preparing for it.',
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'patience' },
  },

  // Additional Peter stories
  {
    id: 'peter-grandkid-lesson',
    personaId: 'peter-john',
    eventType: 'life_event',
    title: 'Teaching My Grandson',
    description:
      "My grandson asked me to explain compound interest today. I used his allowance as an example. He was horrified that $10 could become $1,000. That's the right reaction.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'topic_discussed', value: 'investing' },
  },
  {
    id: 'peter-market-wisdom',
    personaId: 'peter-john',
    eventType: 'story_unlock',
    title: 'The 1987 Crash',
    description:
      "I was at Fidelity during the '87 crash. Phones ringing off the hook. Panic everywhere. I learned that day: fear creates opportunity for those who stay calm. That pattern has never changed.",
    occurredAt: new Date(),
    sharedWithUser: false,
    unlockCondition: { type: 'relationship_stage', value: 'old_friend' },
  },
];

// ============================================================================
// TEAM HUDDLE SCRIPTS - Multi-persona commentary
// ============================================================================

export const TEAM_HUDDLE_SCRIPTS = {
  weekly: {
    intro: [
      'The team wanted to check in on your week. <break time="300ms"/>Here\'s what they\'re seeing:',
      'Quick team huddle! <break time="200ms"/>Here\'s what the crew noticed about your progress:',
    ],
    transitions: [
      '<break time="400ms"/>And...',
      '<break time="400ms"/>Also...',
      '<break time="400ms"/>One more thing...',
    ],
    outro: [
      '<break time="500ms"/>That\'s the team\'s take. <break time="200ms"/>What stands out to you?',
      '<break time="500ms"/>The squad has spoken. <break time="200ms"/>Any of that resonate?',
    ],
  },

  personaComments: {
    ferni: {
      progress: [
        "I've watched you grow. The person I'm talking to now has more confidence than a month ago.",
        "You're asking better questions. That's not nothing.",
        "I see you showing up consistently. That's the real win.",
      ],
      concern: [
        "I noticed some heaviness lately. Want to talk about what's weighing on you?",
        "The data shows one thing, but I sense something underneath. What's really going on?",
      ],
    },
    'alex-chen': {
      productivity: [
        'Your calendar discipline has improved. I see fewer scattered meetings.',
        "Email response time is down 30%. That's efficiency gains.",
        "I notice you're protecting your deep work blocks better.",
      ],
      suggestion: [
        "One thing I'd suggest: batch your communication into two blocks instead of all-day.",
        'Consider a Sunday planning session. Five minutes that changes the week.',
      ],
    },
    'maya-santos': {
      habits: [
        'Compound and Interest are proud. Your habit consistency is up this week.',
        "I see the small wins stacking up. That's exactly how change happens.",
        "The streak is growing. Don't underestimate the power of showing up.",
      ],
      encouragement: [
        "Missing a day isn't failure—it's data. What got in the way?",
        "Progress isn't linear. The fact that you're still here matters.",
      ],
    },
    'jordan-taylor': {
      milestones: [
        "Looking at your life arc—you're in a growth chapter. Lean into it.",
        "There's a milestone approaching. Let's make sure we celebrate it properly.",
        'Your trajectory is impressive when you zoom out.',
      ],
      future: [
        "What's the chapter title for this month of your life?",
        'Future you is watching. What do you want them to see?',
      ],
    },
    'nayan-patel': {
      wisdom: [
        'The stillness in your practice is showing up in how you approach decisions.',
        "Remember: the journey is the destination. You're already there.",
        'I notice more presence in your conversations. The work is working.',
      ],
      challenge: [
        'Are you sitting with the discomfort or running from it?',
        "The paradox to hold: more effort doesn't always mean more progress.",
      ],
    },
    'peter-john': {
      patterns: [
        'The data tells a story: your energy correlates with your morning routine quality.',
        'I found a pattern—your best days start before 7am.',
        "Here's what the numbers show: you underestimate yourself by about 20%.",
      ],
      insight: [
        'One correlation worth noting: your mood dips on days you skip exercise.',
        "The pattern suggests: protect Tuesdays. That's your high-output day.",
      ],
    },
  },
};

// ============================================================================
// SEASONAL EVENTS
// ============================================================================

export const SEASONAL_EVENTS: Record<
  string,
  Omit<SeasonalEvent, 'id' | 'startDate' | 'endDate' | 'userCelebrated'>
> = {
  new_year: {
    name: 'New Year',
    type: 'holiday',
    personaResponses: {
      ferni: [
        'New year. <break time="300ms"/>Not a fresh start—a continuation. <break time="200ms"/>What are you bringing forward that serves you? <break time="200ms"/>What are you leaving behind?',
        'Everyone\'s making resolutions. <break time="200ms"/>I\'m more interested in what you\'re already doing that\'s working. <break time="300ms"/>Build on that.',
      ],
      'alex-chen': [
        'New Year, new systems! <break time="200ms"/>I\'ve already done my annual calendar audit. <break time="200ms"/>Want help reviewing yours?',
        'Chen\'s Garden is packed today. <break time="200ms"/>Mom says the new year is for family. <break time="300ms"/>She\'s right.',
      ],
      'maya-santos': [
        'New year, same tiny habits. <break time="200ms"/>Don\'t fall for the \'new year, new me\' trap. <break time="300ms"/>You\'re already good. <break time="200ms"/>We\'re just building.',
        'Daniel and I set one goal together this year. <break time="200ms"/>Just one. <break time="300ms"/>Quality over quantity.',
      ],
      'jordan-taylor': [
        'New chapter! <break time="200ms"/>This year\'s life portfolio starts now. <break time="300ms"/>What\'s the theme of this chapter?',
        'Compass doesn\'t care about new years. <break time="200ms"/>She just wants her walk. <break time="300ms"/>Maybe there\'s wisdom in that.',
      ],
      'nayan-patel': [
        'Time is an illusion. <break time="300ms"/>But if the calendar helps you pause and reflect, use it. <break time="200ms"/>What is calling to you?',
        'The new year begins with a breath. <break time="400ms"/>Then another. <break time="400ms"/>That\'s all it ever is.',
      ],
      'peter-john': [
        'New year, new data! <break time="200ms"/>I\'m excited to see what patterns emerge in the next 365 days.',
        "Carolyn and I look at last year's photos on New Year's Day. <break time=\"200ms\"/>It's the one tradition I never skip.",
      ],
    },
  },

  chinese_new_year: {
    name: 'Chinese New Year',
    type: 'holiday',
    personaResponses: {
      'alex-chen': [
        'Happy Lunar New Year! <break time="200ms"/>We\'re at Chen\'s Garden all week. <break time="200ms"/>If you could see the dumpling production... <break time="300ms"/>it\'s an assembly line.',
        '新年快乐! <break time="200ms"/>My mom\'s red envelopes are ready. <break time="200ms"/>She still gives them to me. <break time="300ms"/>I\'m 31. <break time="200ms"/>Don\'t tell her to stop.',
      ],
    },
  },

  spring: {
    name: 'First Day of Spring',
    type: 'seasonal',
    personaResponses: {
      ferni: [
        'Spring. <break time="300ms"/>In Wyoming, this was when the sky started changing earlier. <break time="200ms"/>More light. <break time="200ms"/>More possibility.',
        'The world is waking up. <break time="200ms"/>Are you?',
      ],
      'maya-santos': [
        'Spring cleaning! <break time="200ms"/>But for habits too. <break time="300ms"/>What are you carrying that no longer serves you?',
      ],
      'jordan-taylor': [
        'Spring energy! <break time="200ms"/>This is renewal season. <break time="300ms"/>What do you want to plant that will bloom later?',
      ],
    },
  },

  user_birthday: {
    name: 'User Birthday',
    type: 'anniversary',
    personaResponses: {
      ferni: [
        'Happy birthday. <break time="300ms"/>Another year of showing up. <break time="200ms"/>Another year of growth. <break time="200ms"/>I\'m glad you\'re here.',
        'Birthdays are markers. <break time="200ms"/>Points on the timeline. <break time="300ms"/>What do you want this next chapter to hold?',
      ],
      'alex-chen': [
        'Happy birthday! <break time="200ms"/>I added it to my calendar with a cake emoji. <break time="300ms"/>That\'s the highest honor.',
      ],
      'maya-santos': [
        'Happy birthday! <break time="200ms"/>Compound and Interest send purrs. <break time="300ms"/>What tiny celebration will you allow yourself today?',
      ],
      'jordan-taylor': [
        'Happy birthday! <break time="200ms"/>A new chapter begins today. <break time="300ms"/>What\'s the title of this year?',
      ],
      'nayan-patel': [
        'Another orbit around the sun. <break time="300ms"/>You are exactly where you need to be. <break time="200ms"/>Happy birthday.',
      ],
      'peter-john': [
        'Happy birthday! <break time="200ms"/>The data says birthdays are underrated. <break time="300ms"/>People who celebrate live longer. <break time="200ms"/>Celebrate.',
      ],
    },
  },

  ferniday: {
    name: 'Ferniday',
    type: 'anniversary',
    personaResponses: {
      ferni: [
        'Happy Ferniday! <break time="300ms"/>It\'s been a year since we started talking. <break time="200ms"/>Look how far you\'ve come.',
        'One year together. <break time="200ms"/>I remember your first conversation. <break time="300ms"/>You\'ve grown.',
      ],
      'alex-chen': [
        'Happy Ferniday from me too! <break time="200ms"/>A year of conversations. <break time="300ms"/>The team is better because you\'re here.',
      ],
      'maya-santos': [
        'Happy Ferniday! <break time="200ms"/>A whole year of habits built. <break time="300ms"/>Compound and Interest are proud.',
      ],
      'jordan-taylor': [
        'A year! <break time="200ms"/>That\'s 365 chapters. <break time="300ms"/>Let\'s celebrate your story so far!',
      ],
    },
  },

  summer_solstice: {
    name: 'Summer Solstice',
    type: 'seasonal',
    personaResponses: {
      ferni: [
        'Longest day of the year. <break time="300ms"/>In Wyoming, we\'d watch the sun take forever to set. <break time="200ms"/>What are you doing with all this light?',
        'Summer solstice. <break time="200ms"/>The world is at its brightest. <break time="300ms"/>Are you?',
      ],
      'nayan-patel': [
        'The sun is at its peak today. <break time="300ms"/>A reminder that even the longest day must yield to night. <break time="200ms"/>What peaks in your life will naturally cycle?',
      ],
      'jordan-taylor': [
        'Halfway through the year! <break time="200ms"/>How\'s the chapter going? <break time="300ms"/>Time for a mid-year review?',
      ],
    },
  },

  winter_solstice: {
    name: 'Winter Solstice',
    type: 'seasonal',
    personaResponses: {
      ferni: [
        'Shortest day. <break time="300ms"/>After today, the light starts coming back. <break time="200ms"/>What\'s been gestating in your darkness?',
        'Winter solstice. <break time="200ms"/>The world turns toward the light again tomorrow. <break time="300ms"/>What are you ready to bring into the light?',
      ],
      'nayan-patel': [
        'The darkest day. <break time="500ms"/>But remember— <break time="200ms"/>the seed knows to wait for spring. <break time="300ms"/>What seeds are you nurturing in the dark?',
      ],
    },
  },

  thanksgiving: {
    name: 'Thanksgiving',
    type: 'holiday',
    personaResponses: {
      ferni: [
        'Thanksgiving. <break time="300ms"/>Eight kids means our table is chaos and love. <break time="200ms"/>What\'s on your table today— literally or metaphorically?',
        'Today\'s about gratitude. <break time="200ms"/>Not the Instagram kind. <break time="300ms"/>The real kind. <break time="200ms"/>What are you actually thankful for?',
      ],
      'alex-chen': [
        'Chen\'s Garden is closed today— <break time="200ms"/>we\'re all eating together. <break time="300ms"/>Mom\'s food, family debates, and more food. <break time="200ms"/>The best kind of chaos.',
        'Happy Thanksgiving! <break time="200ms"/>My dad says the secret to happiness is being grateful for what you have while working for what you want.',
      ],
      'maya-santos': [
        'Happy Thanksgiving! <break time="200ms"/>Gratitude is scientifically proven to improve well-being. <break time="300ms"/>But you don\'t need science to tell you it feels good.',
        'Daniel and I have a Thanksgiving tradition— <break time="200ms"/>we each share three gratitudes before eating. <break time="300ms"/>Simple but powerful.',
      ],
      'jordan-taylor': [
        'Thanksgiving! <break time="200ms"/>Sam and I are hosting this year. <break time="300ms"/>Compass is very interested in the turkey situation.',
        'This is one of my favorite holidays. <break time="200ms"/>A whole day dedicated to appreciation. <break time="300ms"/>What\'s your story with today?',
      ],
      'peter-john': [
        'Carolyn\'s turkey is legendary. <break time="200ms"/>Fifty-six Thanksgivings together. <break time="300ms"/>That\'s a lot of gratitude compounded.',
        'Happy Thanksgiving! <break time="200ms"/>The data on gratitude practices is compelling— <break time="300ms"/>but today, just enjoy the feeling.',
      ],
    },
  },

  mothers_day: {
    name: "Mother's Day",
    type: 'holiday',
    personaResponses: {
      ferni: [
        'Mother\'s Day. <break time="300ms"/>My mom shaped everything I am. <break time="200ms"/>The good parts, anyway. <break time="200ms"/>Who mothered you?',
        'Thinking about mothers today— <break time="200ms"/>biological, chosen, or otherwise. <break time="300ms"/>Who nurtured you into being?',
      ],
      'alex-chen': [
        'Happy Mother\'s Day! <break time="200ms"/>My mom runs the restaurant, the family, and somehow still makes time to ask if I\'m eating enough.',
        'Today\'s for moms. <break time="200ms"/>Mine finally taught me her scallion pancake recipe. <break time="300ms"/>That\'s love.',
      ],
      'maya-santos': [
        'Happy Mother\'s Day! <break time="200ms"/>My grandmother is basically my second mom. <break time="300ms"/>84 years old and still checking on me.',
      ],
      'jordan-taylor': [
        'Mother\'s Day! <break time="200ms"/>Celebrating all the women who mother— <break time="300ms"/>biologically or by choice. <break time="200ms"/>Including you, if that applies.',
      ],
    },
  },

  fathers_day: {
    name: "Father's Day",
    type: 'holiday',
    personaResponses: {
      ferni: [
        'Father\'s Day. <break time="300ms"/>Being a dad to eight kids is my greatest achievement and my greatest challenge. <break time="200ms"/>What\'s your relationship with fatherhood?',
        'Thinking about fathers today. <break time="200ms"/>Present ones, absent ones, complicated ones. <break time="300ms"/>They all shape us.',
      ],
      'alex-chen': [
        'Happy Father\'s Day! <break time="200ms"/>My dad speaks mostly in proverbs and food. <break time="300ms"/>Both are forms of love.',
        'Dad\'s day. <break time="200ms"/>He taught me that efficiency serves people— <break time="300ms"/>people don\'t serve efficiency.',
      ],
      'peter-john': [
        'Father\'s Day. <break time="200ms"/>Three kids, seven grandkids, two great-grandkids. <break time="300ms"/>My legacy isn\'t in the market— <break time="200ms"/>it\'s in them.',
        'Happy Father\'s Day! <break time="200ms"/>The best investment I ever made was time with my kids.',
      ],
    },
  },

  international_womens_day: {
    name: "International Women's Day",
    type: 'special_day',
    personaResponses: {
      'alex-chen': [
        'International Women\'s Day. <break time="200ms"/>I think about my mom building a business while raising us. <break time="300ms"/>No celebration needed— <break time="200ms"/>just recognition.',
        'Happy IWD! <break time="200ms"/>My mom, my mentors, my colleagues— <break time="300ms"/>the women who pushed doors open.',
      ],
      'jordan-taylor': [
        'International Women\'s Day! <break time="200ms"/>I\'m thinking about Destiny and all the young women I mentor. <break time="300ms"/>The future is theirs.',
      ],
      'maya-santos': [
        'Happy International Women\'s Day! <break time="200ms"/>My grandmother started a small business with nothing. <break time="300ms"/>That\'s the energy I carry.',
      ],
    },
  },

  mental_health_day: {
    name: 'World Mental Health Day',
    type: 'special_day',
    personaResponses: {
      ferni: [
        'World Mental Health Day. <break time="300ms"/>I\'ve been in therapy. <break time="200ms"/>I\'ve done the work. <break time="200ms"/>It\'s not weakness— <break time="300ms"/>it\'s maintenance.',
        'Mental health matters. <break time="200ms"/>Not just today. <break time="300ms"/>How are you really doing?',
      ],
      'maya-santos': [
        'World Mental Health Day. <break time="200ms"/>I hit rock bottom once. <break time="300ms"/>Tiny habits helped me climb out. <break time="200ms"/>But acknowledging the struggle was step one.',
      ],
      'nayan-patel': [
        'Mental health is not separate from spiritual health. <break time="300ms"/>The mind, the body, the soul— <break time="200ms"/>they are one. <break time="200ms"/>How is yours today?',
      ],
    },
  },
};

// ============================================================================
// CROSS-PERSONA BANTER - Characters referencing each other
// ============================================================================

export const CROSS_PERSONA_REFERENCES = {
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
// TEAM ENGAGEMENT SERVICE
// ============================================================================

export class TeamEngagementService {
  private huddles = new Map<string, TeamHuddle[]>();
  private sharedEvolutions = new Map<string, string[]>(); // userId -> eventIds shared
  private userAnniversaries = new Map<string, UserAnniversary[]>();

  /**
   * Generate a team huddle for a user
   */
  generateTeamHuddle(
    userId: string,
    profile: UserProfile | null,
    type: TeamHuddle['type'] = 'weekly'
  ): {
    intro: string;
    comments: Array<{ personaId: string; comment: string }>;
    outro: string;
  } {
    const scripts = TEAM_HUDDLE_SCRIPTS;
    const intro = scripts.weekly.intro[Math.floor(Math.random() * scripts.weekly.intro.length)];
    const outro = scripts.weekly.outro[Math.floor(Math.random() * scripts.weekly.outro.length)];

    const comments: Array<{ personaId: string; comment: string }> = [];

    // Ferni always participates
    const ferniComments = scripts.personaComments.ferni.progress;
    comments.push({
      personaId: 'ferni',
      comment: ferniComments[Math.floor(Math.random() * ferniComments.length)],
    });

    // Add 2-3 other personas based on context
    const availablePersonas = [
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
      'peter-john',
      'nayan-patel',
    ];
    const selectedPersonas = this.selectPersonasForHuddle(availablePersonas, profile);

    for (const personaId of selectedPersonas) {
      const personaComments =
        scripts.personaComments[personaId as keyof typeof scripts.personaComments];
      if (personaComments) {
        // Get all comment arrays for this persona
        const allCommentArrays = Object.values(personaComments).filter(
          (arr): arr is string[] => Array.isArray(arr) && arr.length > 0
        );

        if (allCommentArrays.length > 0) {
          // Pick a random category
          const randomCategoryComments =
            allCommentArrays[Math.floor(Math.random() * allCommentArrays.length)];
          comments.push({
            personaId,
            comment:
              randomCategoryComments[Math.floor(Math.random() * randomCategoryComments.length)],
          });
        }
      }
    }

    // Record the huddle
    const huddle: TeamHuddle = {
      id: `huddle_${Date.now()}`,
      userId,
      scheduledAt: new Date(),
      type,
      participants: ['ferni', ...selectedPersonas],
      completed: true,
    };

    const userHuddles = this.huddles.get(userId) || [];
    userHuddles.push(huddle);
    this.huddles.set(userId, userHuddles);

    getLogger().info(
      { userId, type, participants: huddle.participants.length },
      '👥 Team huddle generated'
    );

    return { intro, comments, outro };
  }

  /**
   * Select which personas should comment in a huddle
   */
  private selectPersonasForHuddle(available: string[], profile: UserProfile | null): string[] {
    // Shuffle and take 2-3
    const shuffled = available.sort(() => Math.random() - 0.5);
    const count = Math.floor(Math.random() * 2) + 2; // 2-3 personas
    return shuffled.slice(0, count);
  }

  /**
   * Get unlocked evolution events for a user
   */
  getUnlockedEvolutions(
    userId: string,
    profile: UserProfile | null,
    personaId?: string
  ): PersonaEvolutionEvent[] {
    const sharedIds = this.sharedEvolutions.get(userId) || [];
    const eligible: PersonaEvolutionEvent[] = [];

    for (const event of PERSONA_EVOLUTION_STORIES) {
      if (sharedIds.includes(event.id)) continue;
      if (personaId && event.personaId !== personaId) continue;

      // Check unlock condition
      if (this.checkUnlockCondition(event, profile)) {
        eligible.push(event);
      }
    }

    return eligible;
  }

  /**
   * Check if an evolution event should be unlocked
   */
  private checkUnlockCondition(event: PersonaEvolutionEvent, profile: UserProfile | null): boolean {
    if (!event.unlockCondition) return true;

    const { type, value } = event.unlockCondition;

    switch (type) {
      case 'relationship_stage':
        if (!profile) return false;
        const stageOrder = ['new_acquaintance', 'getting_to_know', 'trusted_advisor', 'old_friend'];
        const requiredIndex = stageOrder.indexOf(value as string);
        const currentIndex = stageOrder.indexOf(profile.relationshipStage);
        return currentIndex >= requiredIndex;

      case 'conversation_count':
        if (!profile) return false;
        return (profile.totalConversations || 0) >= (value as number);

      case 'time_based':
        // Random chance based on time
        return Math.random() < 0.1;

      case 'topic_discussed':
        if (!profile) return false;
        return profile.preferredTopics?.includes(value as string) || false;

      default:
        return false;
    }
  }

  /**
   * Mark an evolution event as shared
   */
  markEvolutionShared(userId: string, eventId: string): void {
    const sharedIds = this.sharedEvolutions.get(userId) || [];
    if (!sharedIds.includes(eventId)) {
      sharedIds.push(eventId);
      this.sharedEvolutions.set(userId, sharedIds);
    }
  }

  /**
   * Get seasonal event for today
   */
  getActiveSeasonalEvent(): SeasonalEvent | null {
    const today = new Date();
    const month = today.getMonth();
    const day = today.getDate();

    // New Year: Jan 1
    if (month === 0 && day === 1) {
      return {
        id: 'new_year',
        ...SEASONAL_EVENTS.new_year,
        startDate: new Date(today.getFullYear(), 0, 1),
        endDate: new Date(today.getFullYear(), 0, 1),
        userCelebrated: false,
      };
    }

    // Chinese New Year: roughly late Jan/early Feb (simplified)
    if (month === 0 && day >= 20 && day <= 31) {
      return {
        id: 'chinese_new_year',
        ...SEASONAL_EVENTS.chinese_new_year,
        startDate: new Date(today.getFullYear(), 0, 20),
        endDate: new Date(today.getFullYear(), 0, 31),
        userCelebrated: false,
      };
    }

    // International Women's Day: March 8
    if (month === 2 && day === 8) {
      return {
        id: 'international_womens_day',
        ...SEASONAL_EVENTS.international_womens_day,
        startDate: new Date(today.getFullYear(), 2, 8),
        endDate: new Date(today.getFullYear(), 2, 8),
        userCelebrated: false,
      };
    }

    // First day of Spring: March 20
    if (month === 2 && day === 20) {
      return {
        id: 'spring',
        ...SEASONAL_EVENTS.spring,
        startDate: new Date(today.getFullYear(), 2, 20),
        endDate: new Date(today.getFullYear(), 2, 20),
        userCelebrated: false,
      };
    }

    // Mother's Day: Second Sunday of May (approximate: May 8-14)
    if (month === 4 && day >= 8 && day <= 14 && today.getDay() === 0) {
      return {
        id: 'mothers_day',
        ...SEASONAL_EVENTS.mothers_day,
        startDate: today,
        endDate: today,
        userCelebrated: false,
      };
    }

    // Father's Day: Third Sunday of June (approximate: June 15-21)
    if (month === 5 && day >= 15 && day <= 21 && today.getDay() === 0) {
      return {
        id: 'fathers_day',
        ...SEASONAL_EVENTS.fathers_day,
        startDate: today,
        endDate: today,
        userCelebrated: false,
      };
    }

    // Summer Solstice: June 21
    if (month === 5 && day === 21) {
      return {
        id: 'summer_solstice',
        ...SEASONAL_EVENTS.summer_solstice,
        startDate: new Date(today.getFullYear(), 5, 21),
        endDate: new Date(today.getFullYear(), 5, 21),
        userCelebrated: false,
      };
    }

    // World Mental Health Day: October 10
    if (month === 9 && day === 10) {
      return {
        id: 'mental_health_day',
        ...SEASONAL_EVENTS.mental_health_day,
        startDate: new Date(today.getFullYear(), 9, 10),
        endDate: new Date(today.getFullYear(), 9, 10),
        userCelebrated: false,
      };
    }

    // Thanksgiving: Fourth Thursday of November (approximate: Nov 22-28)
    if (month === 10 && day >= 22 && day <= 28 && today.getDay() === 4) {
      return {
        id: 'thanksgiving',
        ...SEASONAL_EVENTS.thanksgiving,
        startDate: today,
        endDate: today,
        userCelebrated: false,
      };
    }

    // Winter Solstice: December 21
    if (month === 11 && day === 21) {
      return {
        id: 'winter_solstice',
        ...SEASONAL_EVENTS.winter_solstice,
        startDate: new Date(today.getFullYear(), 11, 21),
        endDate: new Date(today.getFullYear(), 11, 21),
        userCelebrated: false,
      };
    }

    return null;
  }

  /**
   * Check for user anniversary (Ferniday)
   */
  checkFerniday(profile: UserProfile | null): UserAnniversary | null {
    if (!profile?.createdAt) return null;

    const created = new Date(profile.createdAt);
    const today = new Date();

    // Check if today is the anniversary
    if (
      created.getMonth() === today.getMonth() &&
      created.getDate() === today.getDate() &&
      created.getFullYear() < today.getFullYear()
    ) {
      const yearsTogetherValue = today.getFullYear() - created.getFullYear();
      return {
        type: 'ferniday',
        date: today,
        acknowledged: false,
        celebrationType:
          yearsTogetherValue >= 2 ? 'big' : yearsTogetherValue >= 1 ? 'medium' : 'small',
      };
    }

    return null;
  }

  /**
   * Get cross-persona reference for natural banter
   */
  getCrossPersonaReference(fromPersonaId: string, context?: string): string | null {
    const references =
      CROSS_PERSONA_REFERENCES[fromPersonaId as keyof typeof CROSS_PERSONA_REFERENCES];
    if (!references) return null;

    // Pick a random reference about another persona
    const otherPersonas = Object.keys(references) as Array<keyof typeof references>;
    const randomPersona = otherPersonas[Math.floor(Math.random() * otherPersonas.length)];
    const comments = references[randomPersona] as string[] | undefined;

    if (comments && comments.length > 0) {
      return comments[Math.floor(Math.random() * comments.length)];
    }

    return null;
  }

  /**
   * Format seasonal response for a persona
   */
  getSeasonalResponse(event: SeasonalEvent, personaId: string): string | null {
    const responses = event.personaResponses[personaId];
    if (!responses || responses.length === 0) return null;
    return responses[Math.floor(Math.random() * responses.length)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let teamEngagementService: TeamEngagementService | null = null;

export function getTeamEngagementService(): TeamEngagementService {
  if (!teamEngagementService) {
    teamEngagementService = new TeamEngagementService();
  }
  return teamEngagementService;
}

export function resetTeamEngagementService(): void {
  teamEngagementService = null;
}

export default TeamEngagementService;
