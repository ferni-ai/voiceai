/**
 * Persona Evolution Stories
 *
 * Stories of growth and change that unlock as users build relationships
 * with each persona.
 *
 * @module team-engagement/evolution-stories
 */

import type { PersonaEvolutionEvent } from './types.js';

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
