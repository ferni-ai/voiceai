/**
 * Digital Twin Profile Service
 *
 * Frontend service for managing the user's Digital Twin profile.
 *
 * @module services/twin-profile.service
 */

import { apiGet, apiPost, apiDelete } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TwinProfileService');

// ============================================================================
// TYPES
// ============================================================================

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
  context: string;
  emotion?: string;
}

export interface CommunicationStyle {
  formality: 'very_casual' | 'casual' | 'balanced' | 'formal' | 'very_formal';
  pace: 'very_fast' | 'fast' | 'moderate' | 'slow' | 'very_slow';
  verbosity: 'concise' | 'moderate' | 'detailed' | 'verbose';
  storytelling: boolean;
  usesMetaphors: boolean;
  askingQuestions: boolean;
  givingAdvice: boolean;
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
  communicationStyle: CommunicationStyle;

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

  // Metadata
  createdAt?: string;
  updatedAt?: string;
  completionPercentage?: number;
}

export type ProfileSection =
  | 'background'
  | 'mannerisms'
  | 'communication'
  | 'values'
  | 'interests';

export interface ProfileAnalysis {
  completionPercentage: number;
  suggestions: string[];
  strengths: string[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get the user's Digital Twin profile
 */
export async function getTwinProfile(): Promise<{
  profile: TwinProfile;
  exists: boolean;
}> {
  try {
    const response = await apiGet<{ profile: TwinProfile; exists: boolean }>(
      '/api/twin/profile'
    );
    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to get twin profile');
    }
    return response.data;
  } catch (error) {
    log.error({ error }, 'Failed to get twin profile');
    throw error;
  }
}

/**
 * Save the entire profile
 */
export async function saveTwinProfile(
  profile: TwinProfile
): Promise<{ success: boolean; profile: TwinProfile }> {
  try {
    const response = await apiPost<{ success: boolean; profile: TwinProfile }>(
      '/api/twin/profile',
      { profile }
    );
    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to save twin profile');
    }
    log.info({ completion: response.data.profile.completionPercentage }, 'Profile saved');
    return response.data;
  } catch (error) {
    log.error({ error }, 'Failed to save twin profile');
    throw error;
  }
}

/**
 * Update a specific section of the profile
 */
export async function updateProfileSection(
  section: ProfileSection,
  data: Partial<TwinProfile>
): Promise<{ success: boolean; profile: TwinProfile }> {
  try {
    // Note: Using POST since apiPost doesn't support PATCH method override
    // The API endpoint handles both POST and PATCH for profile updates
    const response = await apiPost<{ success: boolean; profile: TwinProfile }>(
      `/api/twin/profile/${section}`,
      data
    );
    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to update profile section');
    }
    log.info({ section }, 'Profile section updated');
    return response.data;
  } catch (error) {
    log.error({ error, section }, 'Failed to update profile section');
    throw error;
  }
}

/**
 * Delete the user's profile
 */
export async function deleteTwinProfile(): Promise<{ success: boolean }> {
  try {
    const response = await apiDelete<{ success: boolean }>('/api/twin/profile');
    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to delete twin profile');
    }
    log.info('Profile deleted');
    return response.data;
  } catch (error) {
    log.error({ error }, 'Failed to delete twin profile');
    throw error;
  }
}

/**
 * Analyze the profile and get suggestions
 */
export async function analyzeProfile(): Promise<ProfileAnalysis> {
  try {
    const response = await apiPost<ProfileAnalysis>('/api/twin/analyze', {});
    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to analyze profile');
    }
    return response.data;
  } catch (error) {
    log.error({ error }, 'Failed to analyze profile');
    throw error;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create an empty profile with defaults
 */
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
    completionPercentage: 0,
  };
}

/**
 * Check if profile has meaningful content
 */
export function isProfileStarted(profile: TwinProfile): boolean {
  return (
    profile.lifeChapters.length > 0 ||
    profile.signaturePhrases.length > 0 ||
    profile.coreValues.length > 0 ||
    !!profile.lifePhilosophy ||
    profile.passions.length > 0
  );
}

/**
 * Get completion level description
 */
export function getCompletionLevel(percentage: number): {
  level: 'none' | 'started' | 'basic' | 'good' | 'complete';
  label: string;
} {
  if (percentage === 0) return { level: 'none', label: 'Not started' };
  if (percentage < 25) return { level: 'started', label: 'Just started' };
  if (percentage < 50) return { level: 'basic', label: 'Basic info' };
  if (percentage < 80) return { level: 'good', label: 'Good profile' };
  return { level: 'complete', label: 'Complete!' };
}
