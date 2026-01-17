/**
 * Digital Twin Profile API Routes
 *
 * CRUD operations for user's Digital Twin profile - capturing their
 * authentic self: background, mannerisms, values, and communication style.
 *
 * Endpoints:
 * - GET /api/twin/profile - Get user's twin profile
 * - POST /api/twin/profile - Create/update entire profile
 * - PATCH /api/twin/profile/:section - Update specific section
 * - DELETE /api/twin/profile - Delete profile
 * - POST /api/twin/analyze - AI analysis of profile completeness
 *
 * @module servers/api/routes/twin-profile
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'TwinProfileRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface LifeChapter {
  id: string;
  title: string;
  years: string;
  description: string;
  keyMoments: string[];
}

interface Mannerism {
  id: string;
  phrase: string;
  context: string;
  emotion?: string;
}

interface CommunicationStyle {
  formality: 'very_casual' | 'casual' | 'balanced' | 'formal' | 'very_formal';
  pace: 'very_fast' | 'fast' | 'moderate' | 'slow' | 'very_slow';
  verbosity: 'concise' | 'moderate' | 'detailed' | 'verbose';
  storytelling: boolean;
  usesMetaphors: boolean;
  askingQuestions: boolean;
  givingAdvice: boolean;
}

interface TwinProfile {
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

type ProfileSection = 'background' | 'mannerisms' | 'communication' | 'values' | 'interests';

// ============================================================================
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  return null;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function createEmptyProfile(): TwinProfile {
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

function calculateCompletionPercentage(profile: TwinProfile): number {
  const weights = {
    lifeChapters: 15,
    keyRelationships: 10,
    formativeExperiences: 10,
    signaturePhrases: 15,
    greetingStyle: 5,
    farewellStyle: 5,
    expressionsWhenHappy: 5,
    expressionsWhenSad: 5,
    expressionsWhenExcited: 5,
    expressionsWhenFrustrated: 5,
    coreValues: 10,
    lifePhilosophy: 5,
    whatMatters: 5,
  };

  let score = 0;

  if (profile.lifeChapters.length > 0) score += weights.lifeChapters;
  if (profile.keyRelationships.length > 0) score += weights.keyRelationships;
  if (profile.formativeExperiences.length > 0) score += weights.formativeExperiences;
  if (profile.signaturePhrases.length > 0) score += weights.signaturePhrases;
  if (profile.greetingStyle) score += weights.greetingStyle;
  if (profile.farewellStyle) score += weights.farewellStyle;
  if (profile.expressionsWhenHappy.length > 0) score += weights.expressionsWhenHappy;
  if (profile.expressionsWhenSad.length > 0) score += weights.expressionsWhenSad;
  if (profile.expressionsWhenExcited.length > 0) score += weights.expressionsWhenExcited;
  if (profile.expressionsWhenFrustrated.length > 0) score += weights.expressionsWhenFrustrated;
  if (profile.coreValues.length > 0) score += weights.coreValues;
  if (profile.lifePhilosophy) score += weights.lifePhilosophy;
  if (profile.whatMatters.length > 0) score += weights.whatMatters;

  return Math.min(100, score);
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

function getProfileCollection() {
  const db = getFirestore();
  return db.collection('twin_profiles');
}

async function getProfile(userId: string): Promise<TwinProfile | null> {
  const doc = await getProfileCollection().doc(userId).get();
  if (!doc.exists) return null;
  return doc.data() as TwinProfile;
}

async function saveProfile(userId: string, profile: TwinProfile): Promise<void> {
  const now = new Date().toISOString();
  const updatedProfile = {
    ...profile,
    updatedAt: now,
    createdAt: profile.createdAt || now,
    completionPercentage: calculateCompletionPercentage(profile),
  };

  await getProfileCollection().doc(userId).set(updatedProfile, { merge: true });
}

async function deleteProfile(userId: string): Promise<void> {
  await getProfileCollection().doc(userId).delete();
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleTwinProfileRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // =========================================================================
  // GET /api/twin/profile - Get user's profile
  // =========================================================================
  if (method === 'GET' && pathname === '/api/twin/profile') {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    try {
      const profile = await getProfile(userId);
      if (!profile) {
        sendJson(res, 200, { profile: createEmptyProfile(), exists: false });
        return true;
      }
      sendJson(res, 200, { profile, exists: true });
    } catch (error) {
      log.error({ error }, 'Failed to get profile');
      sendError(res, 500, 'Failed to get profile');
    }
    return true;
  }

  // =========================================================================
  // POST /api/twin/profile - Create/update entire profile
  // =========================================================================
  if (method === 'POST' && pathname === '/api/twin/profile') {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    const body = await parseBody<{ profile: TwinProfile }>(req);
    if (!body?.profile) {
      sendError(res, 400, 'Invalid profile data');
      return true;
    }

    try {
      await saveProfile(userId, body.profile);
      const savedProfile = await getProfile(userId);
      log.info({ userId, completion: savedProfile?.completionPercentage }, 'Profile saved');
      sendJson(res, 200, { success: true, profile: savedProfile });
    } catch (error) {
      log.error({ error }, 'Failed to save profile');
      sendError(res, 500, 'Failed to save profile');
    }
    return true;
  }

  // =========================================================================
  // PATCH /api/twin/profile/:section - Update specific section
  // =========================================================================
  const patchMatch = pathname.match(/^\/api\/twin\/profile\/(\w+)$/);
  if (method === 'PATCH' && patchMatch) {
    const section = patchMatch[1] as ProfileSection;
    const validSections: ProfileSection[] = [
      'background',
      'mannerisms',
      'communication',
      'values',
      'interests',
    ];

    if (!validSections.includes(section)) {
      sendError(res, 400, `Invalid section: ${section}`);
      return true;
    }

    const userId = getUserId(req);
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    const body = await parseBody<Record<string, unknown>>(req);
    if (!body) {
      sendError(res, 400, 'Invalid section data');
      return true;
    }

    try {
      let profile = await getProfile(userId);
      if (!profile) {
        profile = createEmptyProfile();
      }

      // Merge section data based on section type
      switch (section) {
        case 'background':
          if (body.lifeChapters) profile.lifeChapters = body.lifeChapters as LifeChapter[];
          if (body.keyRelationships)
            profile.keyRelationships = body.keyRelationships as TwinProfile['keyRelationships'];
          if (body.formativeExperiences)
            profile.formativeExperiences = body.formativeExperiences as string[];
          break;
        case 'mannerisms':
          if (body.signaturePhrases)
            profile.signaturePhrases = body.signaturePhrases as Mannerism[];
          if (body.greetingStyle !== undefined)
            profile.greetingStyle = body.greetingStyle as string;
          if (body.farewellStyle !== undefined)
            profile.farewellStyle = body.farewellStyle as string;
          if (body.expressionsWhenHappy)
            profile.expressionsWhenHappy = body.expressionsWhenHappy as string[];
          if (body.expressionsWhenSad)
            profile.expressionsWhenSad = body.expressionsWhenSad as string[];
          if (body.expressionsWhenExcited)
            profile.expressionsWhenExcited = body.expressionsWhenExcited as string[];
          if (body.expressionsWhenFrustrated)
            profile.expressionsWhenFrustrated = body.expressionsWhenFrustrated as string[];
          break;
        case 'communication':
          if (body.communicationStyle)
            profile.communicationStyle = body.communicationStyle as CommunicationStyle;
          break;
        case 'values':
          if (body.coreValues) profile.coreValues = body.coreValues as string[];
          if (body.lifePhilosophy !== undefined)
            profile.lifePhilosophy = body.lifePhilosophy as string;
          if (body.whatMatters) profile.whatMatters = body.whatMatters as string[];
          if (body.beliefs) profile.beliefs = body.beliefs as string[];
          break;
        case 'interests':
          if (body.passions) profile.passions = body.passions as string[];
          if (body.hobbies) profile.hobbies = body.hobbies as string[];
          if (body.favoriteTopics) profile.favoriteTopics = body.favoriteTopics as string[];
          if (body.thingsToAvoid) profile.thingsToAvoid = body.thingsToAvoid as string[];
          break;
      }

      await saveProfile(userId, profile);
      log.info({ userId, section }, 'Section updated');
      sendJson(res, 200, { success: true, profile });
    } catch (error) {
      log.error({ error }, 'Failed to update section');
      sendError(res, 500, 'Failed to update section');
    }
    return true;
  }

  // =========================================================================
  // DELETE /api/twin/profile - Delete profile
  // =========================================================================
  if (method === 'DELETE' && pathname === '/api/twin/profile') {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    try {
      await deleteProfile(userId);
      log.info({ userId }, 'Profile deleted');
      sendJson(res, 200, { success: true });
    } catch (error) {
      log.error({ error }, 'Failed to delete profile');
      sendError(res, 500, 'Failed to delete profile');
    }
    return true;
  }

  // =========================================================================
  // POST /api/twin/analyze - Analyze profile completeness
  // =========================================================================
  if (method === 'POST' && pathname === '/api/twin/analyze') {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    try {
      const profile = await getProfile(userId);
      if (!profile) {
        sendJson(res, 200, {
          completionPercentage: 0,
          suggestions: [
            'Start by sharing your life story - what chapters have defined you?',
            'Add some of your signature phrases and how you express yourself',
            'Tell me about your core values and what matters most to you',
          ],
          strengths: [],
        });
        return true;
      }

      const completion = calculateCompletionPercentage(profile);
      const suggestions: string[] = [];
      const strengths: string[] = [];

      // Generate suggestions based on what's missing
      if (profile.lifeChapters.length === 0) {
        suggestions.push('Add your life chapters to help me understand your journey');
      } else {
        strengths.push(`${profile.lifeChapters.length} life chapters shared`);
      }

      if (profile.signaturePhrases.length === 0) {
        suggestions.push('Share some phrases you always say');
      } else {
        strengths.push(`${profile.signaturePhrases.length} signature phrases captured`);
      }

      if (profile.coreValues.length === 0) {
        suggestions.push('Tell me about your core values');
      } else {
        strengths.push(`${profile.coreValues.length} core values identified`);
      }

      if (!profile.lifePhilosophy) {
        suggestions.push('Share your life philosophy in a sentence or two');
      } else {
        strengths.push('Life philosophy defined');
      }

      if (profile.passions.length === 0) {
        suggestions.push('What are you passionate about? What lights you up?');
      } else {
        strengths.push(`${profile.passions.length} passions shared`);
      }

      sendJson(res, 200, {
        completionPercentage: completion,
        suggestions: suggestions.slice(0, 3),
        strengths: strengths.slice(0, 5),
      });
    } catch (error) {
      log.error({ error }, 'Failed to analyze profile');
      sendError(res, 500, 'Failed to analyze profile');
    }
    return true;
  }

  // Not a twin profile route
  return false;
}

export type { TwinProfile, ProfileSection };
