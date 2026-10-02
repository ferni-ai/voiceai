/**
 * Digital twin profile - data model types and empty-profile factory. Extracted from digital-twin-profile.ui.ts.
 */

export type ProfileSection =
  | 'intro'
  | 'background'
  | 'mannerisms'
  | 'communication'
  | 'values'
  | 'interests'
  | 'review';

export interface LifeChapter {
  id: string;
  title: string;
  years: string;
  description: string;
  keyMoments: string[];
}

export interface Mannerism {
  id: string;
  phrase: string;
  context: string; // When do you say this?
  emotion?: string; // What emotion does it express?
}

export interface TwinProfile {
  // Background
  lifeChapters: LifeChapter[];
  keyRelationships: Array<{
    name: string;
    relationship: string;
    importance: string;
  }>;
  formativeExperiences: string[];

  // Mannerisms
  signaturePhrases: Mannerism[];
  greetingStyle: string;
  farewellStyle: string;
  expressionsWhenHappy: string[];
  expressionsWhenSad: string[];
  expressionsWhenExcited: string[];
  expressionsWhenFrustrated: string[];

  // Communication Style
  communicationStyle: {
    formality: 'very_casual' | 'casual' | 'balanced' | 'formal' | 'very_formal';
    pace: 'very_fast' | 'fast' | 'moderate' | 'slow' | 'very_slow';
    verbosity: 'concise' | 'moderate' | 'detailed' | 'verbose';
    storytelling: boolean;
    usesMetaphors: boolean;
    askingQuestions: boolean;
    givingAdvice: boolean;
  };

  // Values & Beliefs
  coreValues: string[];
  lifePhilosophy: string;
  whatMatters: string[];
  beliefs: string[];

  // Interests
  passions: string[];
  hobbies: string[];
  favoriteTopics: string[];
  thingsToAvoid: string[];
}

export function createEmptyProfile(): TwinProfile {
  return {
    lifeChapters: [],
    keyRelationships: [],
    formativeExperiences: [],
    signaturePhrases: [],
    greetingStyle: '',
    farewellStyle: '',
    expressionsWhenHappy: [],
    expressionsWhenSad: [],
    expressionsWhenExcited: [],
    expressionsWhenFrustrated: [],
    communicationStyle: {
      formality: 'balanced',
      pace: 'moderate',
      verbosity: 'moderate',
      storytelling: false,
      usesMetaphors: false,
      askingQuestions: false,
      givingAdvice: false,
    },
    coreValues: [],
    lifePhilosophy: '',
    whatMatters: [],
    beliefs: [],
    passions: [],
    hobbies: [],
    favoriteTopics: [],
    thingsToAvoid: [],
  };
}
