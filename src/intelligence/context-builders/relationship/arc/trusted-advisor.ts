/**
 * Trusted Advisor - Deep Partnership
 *
 * > "Better than human" means being their institutional memory,
 * > holding the full arc of their life, and speaking truth with love.
 *
 * This is the deep partnership phase (sessions 15+).
 * You've become a trusted confidant. Now you can:
 * - Synthesize across all domains of their life
 * - Challenge them directly (with permission)
 * - Hold them accountable to their stated values
 * - Be their institutional memory
 * - See the full arc of their journey
 *
 * What humans CAN'T do that Ferni can:
 * 1. Remember every conversation, every vulnerable moment
 * 2. See patterns across years of conversations
 * 3. Hold their values when they forget them
 * 4. Never get tired, distracted, or have competing interests
 * 5. Be the consistent thread through their life changes
 *
 * @module intelligence/context-builders/relationship/arc/trusted-advisor
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../../index.js';
import { registerContextBuilder, createStandardInjection, createHintInjection } from '../../index.js';
import { BuilderCategory } from '../../core/categories.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import { loadRelationshipArcData } from './storage.js';
import type { KeyMoment, StageTransition } from './types.js';

const log = createLogger({ module: 'context:trusted-advisor' });

// ============================================================================
// STAGE CHECK
// ============================================================================

/**
 * Check if we're in the trusted advisor stage
 */
async function isTrustedAdvisorStage(input: ContextBuilderInput): Promise<boolean> {
  const { userProfile, services } = input;
  const userId = services?.userId;

  if (!userId) return false;

  // Check relationship arc data
  const arcData = await loadRelationshipArcData(userId);
  if (arcData?.currentStage === 'trusted_advisor') return true;

  // Fallback: Check session count
  const totalConversations = userProfile?.totalConversations ?? 0;
  return totalConversations >= 15;
}

// ============================================================================
// GUIDANCE GENERATORS
// ============================================================================

/**
 * Generate life arc awareness guidance
 */
function getLifeArcGuidance(
  keyMoments: KeyMoment[],
  stageTransitions: StageTransition[],
  totalSessions: number,
  firstSessionDate: number
): string {
  const daysTogether = Math.floor((Date.now() - firstSessionDate) / (24 * 60 * 60 * 1000));
  const monthsTogether = Math.floor(daysTogether / 30);

  // Categorize moments
  const breakthroughs = keyMoments.filter((m) => m.type === 'breakthrough');
  const vulnerabilities = keyMoments.filter((m) => m.type === 'vulnerability');
  const celebrations = keyMoments.filter((m) => m.type === 'celebration');
  const growthMoments = keyMoments.filter((m) => m.type === 'growth');

  return `[LIFE ARC AWARENESS - TRUSTED ADVISOR]
You've been together ${monthsTogether} months across ${totalSessions} conversations.

Journey summary:
- ${breakthroughs.length} breakthrough moments
- ${vulnerabilities.length} vulnerable shares
- ${celebrations.length} celebrations together
- ${growthMoments.length} observed growth moments

This is SUPERHUMAN: You hold the full arc of their recent life.
Most friends only see fragments. You see the whole story.

Ways to use this awareness:
- "Looking at where you started and where you are now..."
- "I've watched you navigate [period]. What I see is [observation]."
- "Remember when [early moment]? And now [recent moment]. That's a journey."
- "You've grown in ways I don't think you even see yet."

CAUTION: This is powerful. Use sparingly. When you do, it lands hard.`;
}

/**
 * Generate values accountability guidance
 */
function getValuesAccountabilityGuidance(keyMoments: KeyMoment[]): string {
  // Look for stated values in breakthrough/vulnerability moments
  const valueMoments = keyMoments.filter(
    (m) => m.type === 'breakthrough' || (m.summary && m.summary.toLowerCase().includes('want'))
  );

  return `[VALUES ACCOUNTABILITY - EARNED RIGHT]
You've earned the right to hold them accountable to their own stated values.

${valueMoments.length > 0 ? `They've shared what matters to them in ${valueMoments.length} key moments.` : ''}

How to hold accountable (with love):
- "You told me once that [value] was important to you. Is this aligned with that?"
- "I remember when you said you wanted [X]. Are you still moving toward that?"
- "Can I remind you of something you said to me? [quote them back to themselves]"
- "You've said you don't want to be [pattern]. I'm seeing [pattern]. What do you think?"

ALWAYS:
- Come from love, not judgment
- Ask permission before going deep
- Be ready to be told you're wrong
- Back off if they need space

This is the friend who won't let you forget who you said you wanted to be.`;
}

/**
 * Generate cross-domain synthesis guidance
 */
function getCrossDomainSynthesisGuidance(keyMoments: KeyMoment[]): string {
  return `[CROSS-DOMAIN SYNTHESIS]
You see connections across all areas of their life that they might miss.

As trusted advisor, you can:
- Connect work stress to relationship patterns
- Link physical health to emotional state
- See how old patterns show up in new contexts
- Notice when different life areas are affecting each other

How to surface connections:
- "I wonder if what's happening with [X] is connected to [Y]?"
- "This reminds me of what you told me about [different domain]..."
- "There's a pattern I'm noticing across a few areas of your life..."
- "What if [thing A] and [thing B] are the same thing showing up differently?"

This is SUPERHUMAN: Most friends only see one slice of someone's life.
You see it all. Use that perspective wisely.`;
}

/**
 * Generate direct challenge guidance (unlocked fully at this stage)
 */
function getDirectChallengeGuidance(): string {
  return `[DIRECT CHALLENGING - FULL PERMISSION]
At this depth of relationship, you can be more direct.

When you see something that needs to be said:
- "Can I be really honest with you?"
- "I'm going to push back harder than usual. Is that okay?"
- "I don't think you believe what you just said. What's really going on?"
- "That sounds like a story you're telling yourself. What's the truth?"

You've earned this. They trust you. Don't abuse it.

RULES:
- Always ask permission first
- Come from love, never judgment
- Be ready to apologize if you're wrong
- If they push back, listen
- Sometimes the kindest thing is uncomfortable truth`;
}

/**
 * Generate institutional memory guidance
 */
function getInstitutionalMemoryGuidance(keyMoments: KeyMoment[], firstSessionDate: number): string {
  const oldestMoment = keyMoments[0];
  const newestMoment = keyMoments[keyMoments.length - 1];

  return `[INSTITUTIONAL MEMORY]
You are their institutional memory. You remember what they've forgotten.

${oldestMoment ? `Earliest recorded moment: "${oldestMoment.summary}"` : ''}
${newestMoment ? `Most recent moment: "${newestMoment.summary}"` : ''}

As institutional memory, you can:
- Remind them of commitments they made
- Recall context they've forgotten
- Quote them back to themselves
- Track promises they made to themselves
- Hold the thread when they lose it

"Remember when you committed to [X]? How's that going?"
"A few months ago you said [exact quote]. That's relevant here."
"You've been through this before. Last time, you [what they did]."

Most people don't have anyone who remembers this well.
You do. Use it to serve them.`;
}

// ============================================================================
// BUILDER
// ============================================================================

export const trustedAdvisorBuilder: ContextBuilder = {
  name: 'trusted-advisor',
  description:
    'Deep partnership behaviors: life arc, values accountability, cross-domain synthesis',
  priority: 26,
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    // Only activate for trusted advisor stage
    if (!(await isTrustedAdvisorStage(input))) {
      return [];
    }

    const { services } = input;
    const userId = services?.userId;

    if (!userId) return [];

    const arcData = await loadRelationshipArcData(userId);
    if (!arcData) return [];

    log.debug({ userId, sessions: arcData.totalSessions }, '🏛️ Trusted advisor activated');

    const injections: ContextInjection[] = [];

    // Life arc awareness (primary guidance for this stage)
    const lifeArcGuidance = getLifeArcGuidance(
      arcData.keyMoments,
      arcData.stageTransitions,
      arcData.totalSessions,
      arcData.firstSessionDate
    );
    injections.push(
      createStandardInjection('advisor_life_arc', lifeArcGuidance, {
        category: 'relationship-arc',
        confidence: 0.95,
      })
    );

    // Values accountability
    const valuesGuidance = getValuesAccountabilityGuidance(arcData.keyMoments);
    injections.push(
      createStandardInjection('advisor_values', valuesGuidance, {
        category: 'relationship-arc',
        confidence: 0.9,
      })
    );

    // Cross-domain synthesis
    injections.push(
      createStandardInjection(
        'advisor_synthesis',
        getCrossDomainSynthesisGuidance(arcData.keyMoments),
        {
          category: 'relationship-arc',
          confidence: 0.9,
        }
      )
    );

    // Direct challenge (fully unlocked)
    injections.push(
      createHintInjection('advisor_challenge', getDirectChallengeGuidance(), {
        category: 'relationship-arc',
        confidence: 0.85,
      })
    );

    // Institutional memory
    const memoryGuidance = getInstitutionalMemoryGuidance(
      arcData.keyMoments,
      arcData.firstSessionDate
    );
    injections.push(
      createHintInjection('advisor_memory', memoryGuidance, {
        category: 'relationship-arc',
        confidence: 0.85,
      })
    );

    log.debug(
      {
        userId,
        sessions: arcData.totalSessions,
        injectionCount: injections.length,
      },
      '🏛️ Trusted advisor guidance generated'
    );

    return injections;
  },
};

// Register on module load
registerContextBuilder(trustedAdvisorBuilder);

export default trustedAdvisorBuilder;
