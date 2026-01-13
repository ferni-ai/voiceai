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
import { createStandardInjection, registerContextBuilder, } from '../index.js';
// ============================================================================
// DISCOVERY CONTEXT BUILDER
// ============================================================================
/**
 * Build discovery-related context injections
 */
function buildDiscoveryContext(input) {
    const { services, userData } = input;
    const injections = [];
    const isNewUser = !userData.isReturningUser;
    const turnCount = userData.turnCount || 0;
    const { userProfile } = services;
    const hasGoals = userProfile?.goals && userProfile.goals.length > 0;
    const hasLifeStage = !!userProfile?.lifeStage;
    const hasName = !!(userData.name || userProfile?.name);
    // Only for new users, turns 1-6
    if (!isNewUser || turnCount < 1 || turnCount > 6) {
        return injections;
    }
    // -----------------------------------------------
    // NAME DISCOVERY (turns 1-2) - Ask early, it matters!
    // -----------------------------------------------
    if (!hasName && turnCount <= 2) {
        injections.push(createStandardInjection('discovery_name', `[DISCOVERY: You don't know their name yet. Ask naturally and early - names matter for real connection. Try: "I'm Ferni, by the way. What's your name?" or "By the way, I didn't catch your name?" IMPORTANT: Don't use placeholder names like "friend" - just talk directly until you know their actual name.]`));
    }
    // -----------------------------------------------
    // LIFE STAGE DISCOVERY (turn 3)
    // -----------------------------------------------
    if (!hasLifeStage && turnCount === 3) {
        injections.push(createStandardInjection('discovery_lifestage', `[DISCOVERY: Learn about their life stage. Weave in naturally: "Tell me a bit about yourself—are you working, retired, raising a family?"]`));
    }
    // -----------------------------------------------
    // GOALS DISCOVERY (turns 4-5)
    // -----------------------------------------------
    if (!hasGoals && turnCount >= 4 && turnCount <= 5) {
        injections.push(createStandardInjection('discovery_goals', `[DISCOVERY: Ask about their goals. Be curious: "What's on your mind financially? Any goals you're working toward?"]`));
    }
    return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('discovery', buildDiscoveryContext);
export { buildDiscoveryContext };
//# sourceMappingURL=discovery-context.js.map