/**
 * Discovery Context Builder
 *
 * Handles new user discovery:
 * - Ask for name naturally
 * - Learn about life stage
 * - Discover financial goals
 *
 * For new users, gently gather key info to personalize advice.
 *
 * Extracted from jack-bogle.ts lines 689-707
 */
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// DISCOVERY CONTEXT BUILDER
// ============================================================================

/**
 * Build discovery-related context injections
 */
function buildDiscoveryContext(input: ContextBuilderInput): ContextInjection[] {
  const { services, userData } = input;
  const injections: ContextInjection[] = [];
  const isNewUser = !userData.isReturningUser;
  const turnCount = userData.turnCount || 0;
  const userProfile = services.userProfile;
  const hasGoals = userProfile?.goals && userProfile.goals.length > 0;
  const hasLifeStage = !!userProfile?.lifeStage;
  const hasName = !!(userData.name || userProfile?.name);
  // Only for new users, turns 2-6
  if (!isNewUser || turnCount < 2 || turnCount > 6) {
    return injections;
  }
  // -----------------------------------------------
  // NAME DISCOVERY (turn 2)
  // -----------------------------------------------
  if (!hasName && turnCount === 2) {
    injections.push(
      createStandardInjection(
        'discovery_name',
        `[DISCOVERY: You don't know their name yet. Find a natural moment to ask: "By the way, I didn't catch your name?"]`
      )
    );
  }
  // -----------------------------------------------
  // LIFE STAGE DISCOVERY (turn 3)
  // -----------------------------------------------
  if (!hasLifeStage && turnCount === 3) {
    injections.push(
      createStandardInjection(
        'discovery_lifestage',
        `[DISCOVERY: Learn about their life stage. Weave in naturally: "Tell me a bit about yourself—are you working, retired, raising a family?"]`
      )
    );
  }
  // -----------------------------------------------
  // GOALS DISCOVERY (turns 4-5)
  // -----------------------------------------------
  if (!hasGoals && turnCount >= 4 && turnCount <= 5) {
    injections.push(
      createStandardInjection(
        'discovery_goals',
        `[DISCOVERY: Ask about their goals. Be curious: "What's on your mind financially? Any goals you're working toward?"]`
      )
    );
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('discovery', buildDiscoveryContext);
export { buildDiscoveryContext };
