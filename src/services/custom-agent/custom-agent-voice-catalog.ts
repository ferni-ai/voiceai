/**
 * The voices a person can pick for their own agent: Cartesia stock voices, each one
 * checked to exist and be active, labelled with what it actually sounds like.
 *
 * Chosen 2026-10-23 from 33 candidates in 11 roles (warm / upbeat / professional / older,
 * woman and man, plus British, Australian and Indian English). The candidates excluded
 * one-emotion, character and meditation voices, every voice a Ferni persona speaks in,
 * and the flattest quarter by pitch movement. Twelve randomized AI judges (Gemini,
 * counterbalanced clip order) scored each role; the clear winner of each role is in,
 * plus every voice within noise of it, plus a man and a woman for each accent.
 * Evidence: ferni-rater round r5, judge votes in ferni-rater/judge-votes/r5.
 *
 * This list replaces a placeholder whose labels did not match its voices ("Rose, warm
 * elderly Southern woman" was a deep male voice) and which pointed at an archived one.
 *
 * @module services/custom-agent/custom-agent-voice-catalog
 */

export type CatalogVoiceGender = 'female' | 'male';
export type CatalogVoiceAge = 'young' | 'adult' | 'older';
export type CatalogVoiceAccent = 'american' | 'british' | 'australian' | 'indian';

export interface CatalogVoice {
  voiceId: string;
  name: string;
  description: string;
  gender: CatalogVoiceGender;
  age: CatalogVoiceAge;
  accent: CatalogVoiceAccent;
  tags: string[];
}

export const CUSTOM_AGENT_VOICE_CATALOG: readonly CatalogVoice[] = [
  // Warm, friendly woman (judges could not separate these three)
  {
    voiceId: '0a9a5903-0a30-4d2e-b6b6-891f73d4b4e0',
    name: 'Sabrina',
    description: 'Relaxed and easygoing, like a friend catching up',
    gender: 'female',
    age: 'adult',
    accent: 'american',
    tags: ['warm', 'casual', 'friendly'],
  },
  {
    voiceId: '5241b0aa-3c09-479d-b0b8-a6ec68daef5e',
    name: 'Brielle',
    description: 'Warm and encouraging, steady and kind',
    gender: 'female',
    age: 'adult',
    accent: 'american',
    tags: ['warm', 'encouraging'],
  },
  {
    voiceId: 'a7b8d8fa-f6e5-4908-900e-0c11d1d82519',
    name: 'Joanie',
    description: 'Lively, warm and confident, with a little more life experience',
    gender: 'female',
    age: 'older',
    accent: 'american',
    tags: ['warm', 'lively', 'confident'],
  },
  // Upbeat woman (picked by 11 of 12 judges)
  {
    voiceId: '69092565-1c93-4a88-9f2c-ac8cddaf9f65',
    name: 'Janice',
    description: 'Bright and friendly, draws you into the conversation',
    gender: 'female',
    age: 'adult',
    accent: 'american',
    tags: ['upbeat', 'friendly', 'engaging'],
  },
  // Clear, professional woman
  {
    voiceId: 'f0377496-2708-4cc9-b2f8-1b7fdb5e1a2a',
    name: 'Elaine',
    description: 'Calm, assured and clear',
    gender: 'female',
    age: 'adult',
    accent: 'american',
    tags: ['professional', 'calm', 'clear'],
  },
  {
    voiceId: '489b647b-5662-408f-8c95-82e26ef8d29e',
    name: 'Kate',
    description: 'Direct and practical, no fuss',
    gender: 'female',
    age: 'adult',
    accent: 'american',
    tags: ['professional', 'direct', 'clear'],
  },
  // Older woman
  {
    voiceId: '829ccd10-f8b3-43cd-b8a0-4aeaa81f3b30',
    name: 'Linda',
    description: 'Clear, confident and conversational, an older woman',
    gender: 'female',
    age: 'older',
    accent: 'american',
    tags: ['warm', 'mature', 'conversational'],
  },
  // Warm, friendly man (judges could not separate these three)
  {
    voiceId: 'd46abd1d-2d02-43e8-819f-51fb652c1c61',
    name: 'Grant',
    description: 'Clear, reliable and friendly',
    gender: 'male',
    age: 'adult',
    accent: 'american',
    tags: ['warm', 'clear', 'steady'],
  },
  {
    voiceId: '565510e8-6b45-45de-8758-13588fbaec73',
    name: 'Ray',
    description: 'Laid-back and natural, easy to talk to',
    gender: 'male',
    age: 'adult',
    accent: 'american',
    tags: ['warm', 'relaxed', 'casual'],
  },
  {
    voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f',
    name: 'Kyle',
    description: 'Friendly and warm, puts you at ease fast',
    gender: 'male',
    age: 'adult',
    accent: 'american',
    tags: ['warm', 'friendly'],
  },
  // Upbeat man
  {
    voiceId: 'da69d796-4603-4419-8a95-293bfc5679eb',
    name: 'David',
    description: 'Upbeat and engaging, brings energy',
    gender: 'male',
    age: 'adult',
    accent: 'american',
    tags: ['upbeat', 'energetic', 'engaging'],
  },
  // Clear, professional man
  {
    voiceId: '5cad89c9-d88a-4832-89fb-55f2f16d13d3',
    name: 'Brandon',
    description: 'Confident and composed, very clear',
    gender: 'male',
    age: 'adult',
    accent: 'american',
    tags: ['professional', 'confident', 'clear'],
  },
  // Older man
  {
    voiceId: '23112795-d54e-4560-9568-791a87c30201',
    name: 'Darius',
    description: 'Rich, husky and grounded, an older man',
    gender: 'male',
    age: 'older',
    accent: 'american',
    tags: ['mature', 'rich', 'grounded'],
  },
  // British
  {
    voiceId: 'e5d4c33a-d8f6-46e8-a10f-b5afecc35648',
    name: 'Evie',
    description: 'Polished British, formal and articulate',
    gender: 'female',
    age: 'adult',
    accent: 'british',
    tags: ['british', 'professional', 'polished'],
  },
  {
    voiceId: '15070120-82ab-48e5-87e5-c4bf28fa4bf9',
    name: 'Finn',
    description: 'Upbeat and amiable British',
    gender: 'male',
    age: 'young',
    accent: 'british',
    tags: ['british', 'upbeat', 'friendly'],
  },
  // Australian
  {
    voiceId: '41f3c367-e0a8-4a85-89e0-c27bae9c9b6d',
    name: 'Liam',
    description: 'Casual, friendly young Australian',
    gender: 'male',
    age: 'young',
    accent: 'australian',
    tags: ['australian', 'casual', 'friendly'],
  },
  {
    voiceId: '043cfc81-d69f-4bee-ae1e-7862cb358650',
    name: 'Amelia',
    description: 'Strong and composed Australian, clear',
    gender: 'female',
    age: 'adult',
    accent: 'australian',
    tags: ['australian', 'clear', 'composed'],
  },
  // Indian English (a tie)
  {
    voiceId: '3b554273-4299-48b9-9aaf-eefd438e3941',
    name: 'Simi',
    description: 'Firm and clear, a young Indian English voice',
    gender: 'female',
    age: 'young',
    accent: 'indian',
    tags: ['indian', 'clear', 'firm'],
  },
  {
    voiceId: '39d518b7-fd0b-4676-9b8b-29d64ff31e12',
    name: 'Aarav',
    description: 'Warm Indian English storyteller, a little old-fashioned',
    gender: 'male',
    age: 'adult',
    accent: 'indian',
    tags: ['indian', 'warm', 'storyteller'],
  },
];

/** What an agent speaks in when it has no allowed voice: the clearest winner (11 of 12 judges). */
export const DEFAULT_CUSTOM_AGENT_VOICE_ID = '69092565-1c93-4a88-9f2c-ac8cddaf9f65';

/** Agents created before the catalog may already speak in these; they stay allowed but are never offered. */
export const LEGACY_CUSTOM_AGENT_VOICE_IDS: readonly string[] = [
  'a0e99841-438c-4a64-b679-ae501e7d6091', // Greg - Supporter (was mislabelled "Rose")
  'f114a467-c40a-4db8-964d-aaba89cd08fa', // Miles - Yogi (was "Walter")
  '694f9389-aac1-45b6-b726-9d9369183238', // Sarah - Mindful Woman
];
