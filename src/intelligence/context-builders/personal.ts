// Types added - context builder properly typed
/**
 * Personal Context Builder
 *
 * Handles personal connection elements:
 * - Name usage pacing (don't overuse their name)
 * - Personal detail callbacks
 * - Small detail extraction and memory
 *
 * These create intimate, personal conversations.
 *
 * Extracted from jack-bogle.ts lines 709-720, 1261-1270, 1413-1439
 */
import { log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
  type ExtractedDetail,
} from './index.js';
import { extractSmallDetails, getDetailCallback } from '../conversation-quality.js';
import type { UserProfile, FamilyMember } from '../../types/user-profile.js';

// ============================================================================
// PERSONAL HELPERS
// ============================================================================
/**
 * Get personal detail callback based on user profile
 */
function getPersonalDetailCallback(profile: UserProfile): string | null {
  const callbacks: string[] = [];
  // Family references
  if (profile.familyMembers && profile.familyMembers.length > 0) {
    const spouse = profile.familyMembers.find((f: FamilyMember) => f.relationship === 'spouse');
    if (spouse) {
      callbacks.push(`How is ${spouse.name || 'your spouse'} doing?`);
    }
    const child = profile.familyMembers.find(
      (f: FamilyMember) =>
        f.relationship === 'daughter' || f.relationship === 'son' || f.relationship === 'child'
    );
    if (child) {
      callbacks.push(`How are the kids? ${child.name ? `How's ${child.name}?` : ''}`);
    }
  }
  // Goals reference
  if (profile.goals && profile.goals.length > 0) {
    const goal = profile.goals[0];
    callbacks.push(`How's progress on your ${goal.name || goal.type} goal?`);
  }
  // Concerns reference
  if (profile.primaryConcerns && profile.primaryConcerns.length > 0) {
    const concern = profile.primaryConcerns[0];
    if (concern !== 'none' && concern !== 'general') {
      callbacks.push(`How are things with ${concern.replace('_', ' ')}?`);
    }
  }
  // Preferred topics reference
  if (profile.preferredTopics && profile.preferredTopics.length > 0) {
    const topic = profile.preferredTopics[0];
    callbacks.push(`You mentioned being interested in ${topic}—any updates?`);
  }
  if (callbacks.length === 0) return null;
  return callbacks[Math.floor(Math.random() * callbacks.length)];
}
// ============================================================================
// PERSONAL CONTEXT BUILDER
// ============================================================================
/**
 * Build personal connection context injections
 */
function buildPersonalContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, userData, userProfile } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  // -----------------------------------------------
  // NAME USAGE PACING
  // Use their name naturally - not every turn, but every 4-5 turns
  // -----------------------------------------------
  const userName = userData.name || userProfile?.name;
  const lastNameTurn = userData.lastNameUsed || 0;
  if (userName && turnCount - lastNameTurn >= 4 && Math.random() < 0.4) {
    injections.push(
      createHintInjection(
        'name_usage',
        `[NAME: Use their name "${userName}" naturally in this response to build connection.]`
      )
    );
    if (userData) userData.lastNameUsed = turnCount;
  }
  // -----------------------------------------------
  // SMALL DETAIL EXTRACTION & MEMORY
  // Extract specific details (pet names, family names, places)
  // -----------------------------------------------
  const extractedDetails = extractSmallDetails(userText);
  if (extractedDetails.length > 0) {
    // Store extracted details for future use
    if (userData) {
      // Convert to simple format for storage in userData
      const simpleDetails = extractedDetails.map((d) => ({
        type: d.type,
        value: d.value,
      }));
      userData.extractedDetails = [...(userData.extractedDetails || []), ...simpleDetails].slice(
        -20
      ); // Keep last 20 details
    }
    getLogger().debug({ count: extractedDetails.length }, 'Extracted small details');
  }
  // If we have previous details, suggest using them
  if (userData?.extractedDetails && userData.extractedDetails.length > 0 && Math.random() < 0.2) {
    const storedDetail =
      userData.extractedDetails[Math.floor(Math.random() * userData.extractedDetails.length)];
    if (storedDetail) {
      // Convert back to SmallDetail format for callback
      const detailForCallback = {
        type: storedDetail.type,
        value: storedDetail.value,
        context: '',
        extractedAt: new Date(),
      };
      const callback = getDetailCallback(detailForCallback);
      if (callback) {
        injections.push(
          createHintInjection(
            'detail_callback',
            `[REMEMBERED DETAIL: You know about their ${storedDetail.type} "${storedDetail.value}". Consider: "${callback}"]`
          )
        );
      }
    }
  }
  // -----------------------------------------------
  // PERSONAL DETAIL CALLBACKS
  // Every 6-10 turns, reference something specific
  // -----------------------------------------------
  if (turnCount > 5 && turnCount % 7 === 0 && userProfile) {
    const personalCallback = getPersonalDetailCallback(userProfile);
    if (personalCallback) {
      injections.push(
        createHintInjection(
          'personal_callback',
          `[PERSONAL DETAIL: You know specific things about this person. Consider naturally mentioning: "${personalCallback}"]`
        )
      );
    }
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('personal', buildPersonalContext);
export { buildPersonalContext, getPersonalDetailCallback };
