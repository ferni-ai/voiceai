/**
 * Resentment Domain
 *
 * Tools for understanding, processing, and releasing resentment.
 * Resentment is drinking poison and expecting the other person to die.
 *
 * DOMAIN: resentment
 * PERSONA AFFINITY: Ferni (emotional support), Nayan (wisdom)
 *
 * TOOLS:
 *   Understanding: understandResentment, resentmentInventory
 *   Processing: processResentment, resentmentInFamily
 *   Healing: forgivenessJourney, releaseResentment
 *
 * PRINCIPLES:
 * - Resentment hurts the holder more than the target
 * - Forgiveness is for YOU, not them
 * - Understanding doesn't mean condoning
 * - Some resentment points to unset boundaries
 *
 * RESEARCH BASIS:
 * - Forgiveness psychology (Enright, Worthington)
 * - Rumination and mental health
 * - Acceptance and Commitment Therapy (ACT)
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Cross-persona intelligence for team coordination
import { addCrossPersonaInsight } from '../../../services/cross-persona/cross-persona-insights.js';

const log = getLogger();

// ============================================================================
// RESENTMENT TYPES & PATTERNS
// ============================================================================

const RESENTMENT_SOURCES: Record<
  string,
  { description: string; underlyingWound: string; healingPath: string[] }
> = {
  betrayal: {
    description: 'Resentment from being betrayed, lied to, or cheated',
    underlyingWound: 'Broken trust, safety violation',
    healingPath: [
      'Process grief',
      'Rebuild trust (with self first)',
      'Clear boundaries going forward',
    ],
  },
  unfairness: {
    description: 'Resentment from perceived injustice or unequal treatment',
    underlyingWound: 'Invalidation, feeling unseen or unvalued',
    healingPath: ['Validate your experience', 'Advocate for yourself', 'Accept imperfect justice'],
  },
  abandonment: {
    description: 'Resentment from being left, neglected, or not chosen',
    underlyingWound: 'Fear of being unlovable, rejection wound',
    healingPath: ['Attachment healing', 'Self-worth work', 'Building secure connections'],
  },
  parentalWound: {
    description: 'Resentment toward parents for childhood experiences',
    underlyingWound: 'Unmet needs, missed protection, conditional love',
    healingPath: ['Grieve the parent you deserved', 'Reparent yourself', 'Possibly therapy'],
  },
  selfResentment: {
    description: 'Resentment toward yourself for past choices',
    underlyingWound: 'Perfectionism, harsh inner critic, shame',
    healingPath: ['Self-forgiveness', 'Understanding context', 'Making amends'],
  },
  circumstance: {
    description: "Resentment about life circumstances beyond anyone's control",
    underlyingWound: 'Grief, loss of what "should have been"',
    healingPath: ['Radical acceptance', 'Finding meaning', 'Building new dreams'],
  },
};

// ============================================================================
// TOOL: Understand Resentment
// ============================================================================

const understandResentmentDef: ToolDefinition = {
  id: 'understandResentment',
  name: 'Understand Resentment',
  description: 'Explore what resentment is and why we hold onto it',
  domain: 'resentment',
  tags: ['resentment', 'understanding', 'emotional-intelligence'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('understandResentment'),
      parameters: z.object({
        resentmentTarget: z.string().describe('Who or what you resent'),
        howLong: z.string().optional().describe("How long you've held this resentment"),
        resentmentType: z
          .enum([
            'betrayal',
            'unfairness',
            'abandonment',
            'parentalWound',
            'selfResentment',
            'circumstance',
            'other',
          ])
          .optional()
          .describe('The type of resentment'),
      }),
      execute: async ({ resentmentTarget, howLong, resentmentType }) => {
        const userId = ctx.userId;

        log.debug({ userId, resentmentType, howLong }, '[resentment] understanding resentment');

        const typeInfo =
          resentmentType && resentmentType !== 'other' ? RESENTMENT_SOURCES[resentmentType] : null;

        const response = `I want to approach this with the gentleness it deserves.

That makes sense given what you're going through.

Resentment is like carrying a hot coal - you intend to throw it at someone, but you're the one getting burned.

**Your resentment:** Toward "${resentmentTarget}"
${howLong ? `**Duration:** ${howLong}` : ''}

${
  typeInfo
    ? `**Type: ${resentmentType}**
${typeInfo.description}

**The underlying wound:** ${typeInfo.underlyingWound}
`
    : ''
}

**Why We Hold Resentment:**

1. **Protection** - "If I stay angry, they can't hurt me again"
2. **Justice** - "They shouldn't get away with it"
3. **Validation** - "My pain matters, this proves it"
4. **Identity** - Sometimes resentment becomes part of who we are

**What Resentment Costs:**
- Mental energy (rumination consumes bandwidth)
- Physical health (chronic stress, inflammation)
- Present joy (stuck in the past)
- Relationships (bitterness spills over)
- Your own freedom

**Key Questions:**

1. What would it feel like to put this down?
2. What are you afraid would happen if you let it go?
3. What boundary might you need to set instead of holding resentment?
4. Is there grief underneath the anger?

${
  howLong && howLong.includes('year')
    ? `
**Held for years:**
When resentment lasts this long, it often points to a deep wound that hasn't been processed. It's not about the person anymore - it's about what the experience did to you.`
    : ''
}

**Remember:** Understanding resentment is the first step. You don't have to let it go today. Just start to see what you're carrying.

What feels most true for you in what I shared?`;

        // Track for cross-persona awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'nayan', // Nayan for wisdom
          priority: 'normal',
          content: `User exploring resentment toward ${resentmentTarget.slice(0, 30)}. Type: ${resentmentType || 'unspecified'}`,
          category: 'resentment-work',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Resentment Inventory
// ============================================================================

const resentmentInventoryDef: ToolDefinition = {
  id: 'resentmentInventory',
  name: 'Resentment Inventory',
  description: "Take stock of all resentments you're carrying",
  domain: 'resentment',
  tags: ['resentment', 'inventory', 'self-awareness', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('resentmentInventory'),
      parameters: z.object({
        readyToList: z.boolean().optional().describe('Ready to start listing resentments'),
      }),
      execute: async ({ readyToList }) => {
        const userId = ctx.userId;

        log.debug({ userId, readyToList }, '[resentment] inventory exercise');

        const response = `This takes courage. I'm here with you.

Taking a resentment inventory is brave work. It's looking at what you're carrying so you can decide what to put down.

**Resentment Inventory Framework:**

For each resentment, consider:

| Question | Why It Matters |
|----------|----------------|
| **Who/What** | Be specific |
| **What happened** | The facts, not interpretations |
| **How it affected you** | The real impact |
| **What you wanted instead** | The unmet need |
| **Your part (if any)** | Not blame, just awareness |
| **What boundary was crossed** | Often resentment = boundary violation |

**Categories to Check:**

**Family:**
- Parents (what they did, didn't do)
- Siblings (favoritism, conflict, abandonment)
- Extended family

**Relationships:**
- Ex-partners
- Current relationship
- Friends who hurt you

**Work/Authority:**
- Bosses, employers
- Institutions (schools, companies, government)
- Coworkers

**Self:**
- Past versions of yourself
- Choices you regret
- Time "lost"

**Life/Circumstances:**
- What "should have been different"
- Unfair situations
- Losses

${
  readyToList
    ? `
**Ready to start:**
Let's begin. What's the BIGGEST resentment you're carrying right now? 

Don't worry about organizing - just say what comes up first.`
    : `
**When you're ready:**
This exercise can bring up a lot. There's no rush. When you feel ready to start, we can go through it together.`
}

**Remember:** The goal isn't to justify or dismiss your resentments. It's to see them clearly so you can make conscious choices about what to do with them.

Would you like to start, or do you have questions first?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Forgiveness Journey
// ============================================================================

const forgivenessJourneyDef: ToolDefinition = {
  id: 'forgivenessJourney',
  name: 'Forgiveness Journey',
  description: 'Begin the process of forgiveness (for your sake, not theirs)',
  domain: 'resentment',
  tags: ['resentment', 'forgiveness', 'healing', 'freedom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('forgivenessJourney'),
      parameters: z.object({
        personToForgive: z.string().describe("Who you're considering forgiving"),
        whatHappened: z.string().optional().describe('Brief description of what they did'),
        resistanceToForgiving: z.string().optional().describe('What makes forgiveness feel hard'),
      }),
      execute: async ({ personToForgive, whatHappened, resistanceToForgiving }) => {
        const userId = ctx.userId;

        log.debug({ userId, hasPerson: !!personToForgive }, '[resentment] forgiveness journey');

        const response = `Thank you for trusting me with something this significant.

**First, let's be clear about what forgiveness IS and ISN'T:**

**Forgiveness IS:**
- For YOU, not them
- Putting down the burden you've been carrying
- Releasing them from living rent-free in your head
- A process, not a moment
- A gift you give yourself

**Forgiveness is NOT:**
- Saying what they did was okay
- Letting them off the hook
- Forgetting or minimizing the harm
- Reconciling or trusting them again
- Weak or naive

**You're considering forgiving:** "${personToForgive}"
${whatHappened ? `**What happened:** "${whatHappened}"` : ''}

${
  resistanceToForgiving
    ? `**What makes it hard:** "${resistanceToForgiving}"

Your resistance is valid. It's protecting something. What if we honored that resistance while still exploring what forgiveness could mean?`
    : ''
}

**The Forgiveness Process (Robert Enright's model):**

**Phase 1: Uncovering**
- Fully acknowledge the harm done
- Feel the feelings (anger, grief, betrayal)
- Don't skip the pain to get to forgiveness

**Phase 2: Decision**
- Recognize that holding onto this hurts YOU
- Consider: What would freedom feel like?
- Make a commitment to explore forgiveness (not to forgive yet)

**Phase 3: Work**
- Try to understand (not condone) their perspective
- Recognize their humanity (they were once a child too)
- Accept the pain as part of your story

**Phase 4: Deepening**
- Find meaning in your experience
- Recognize your own growth
- Possibly extend compassion (when ready)

You're making real progress by even considering this.

**Important:** You don't have to forgive today, this week, or ever. But carrying resentment forever isn't really an option either - it's slow poison.

What feels like the right next step for you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Resentment in Family
// ============================================================================

const resentmentInFamilyDef: ToolDefinition = {
  id: 'resentmentInFamily',
  name: 'Resentment in Family',
  description: 'Navigate family-specific resentments with complexity and care',
  domain: 'resentment',
  tags: ['resentment', 'family', 'parents', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('resentmentInFamily'),
      parameters: z.object({
        familyMember: z
          .enum(['parent', 'sibling', 'child', 'extended', 'family_system'])
          .describe('Which family relationship'),
        specificResentment: z.string().optional().describe('What you resent them for'),
        relationshipStatus: z
          .enum(['no_contact', 'low_contact', 'strained', 'complex', 'rebuilding'])
          .optional()
          .describe('Current relationship status'),
      }),
      execute: async ({ familyMember, specificResentment, relationshipStatus }) => {
        const userId = ctx.userId;

        log.debug({ userId, familyMember, relationshipStatus }, '[resentment] family resentment');

        const parentalContent =
          familyMember === 'parent'
            ? `
**Parent-Specific Complexity:**

Resentment toward parents is perhaps the most complex resentment there is because:
- They shaped who you are (for better and worse)
- Society says "honor thy parents" (adds guilt to resentment)
- Their limitations often came from their own wounds
- You may still need/want a relationship
- They may never acknowledge what they did

**The paradox to hold:**
Your parents did the best they could with their own wounds AND it wasn't enough AND you deserved better AND they're also human AND you have a right to your pain AND healing is possible.

All of these can be true at once.`
            : '';

        const response = `That makes sense given what you're going through.

Family resentment is uniquely painful because family is where we're supposed to feel safe, loved, and accepted. When that's violated, the wound goes deep.

**Your situation:**
Family member: ${familyMember}
${specificResentment ? `Resentment: "${specificResentment}"` : ''}
${relationshipStatus ? `Current status: ${relationshipStatus}` : ''}

${parentalContent}

**Key Understandings:**

1. **You can love someone and be angry at them**
   Resentment doesn't negate love; they coexist.

2. **Understanding isn't condoning**
   You can understand WHY they did something without saying it was okay.

3. **Boundaries aren't betrayal**
   Protecting yourself isn't abandoning them.

4. **Healing doesn't require their participation**
   You can heal even if they never apologize or change.

5. **Grief is part of this**
   You're grieving the family you deserved but didn't get.

${
  relationshipStatus === 'no_contact' || relationshipStatus === 'low_contact'
    ? `
**About your distance:**
Setting boundaries with family takes enormous courage. It doesn't mean you've failed at forgiveness. Sometimes love is best expressed from a distance.`
    : ''
}

**Paths Forward:**

- **Process the grief** - What did you need that you didn't get?
- **Set clear boundaries** - What's okay and not okay going forward?
- **Work with a therapist** - Family wounds often benefit from professional support
- **Write unsent letters** - Say everything you need to say (without sending)
- **Parent yourself now** - Give yourself what they couldn't

What aspect of this would be most helpful to explore?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Release Resentment
// ============================================================================

const releaseResentmentDef: ToolDefinition = {
  id: 'releaseResentment',
  name: 'Release Resentment',
  description: "Practices for letting go of resentment you're ready to release",
  domain: 'resentment',
  tags: ['resentment', 'release', 'letting-go', 'freedom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('releaseResentment'),
      parameters: z.object({
        resentmentToRelease: z
          .string()
          .describe("The resentment you're ready to work on releasing"),
        readinessLevel: z
          .enum(['exploring', 'considering', 'ready', 'committed'])
          .optional()
          .describe('How ready you feel'),
      }),
      execute: async ({ resentmentToRelease, readinessLevel }) => {
        const userId = ctx.userId;

        log.debug({ userId, readinessLevel }, '[resentment] release practice');

        const response = `**Releasing Resentment:**

Resentment you want to release: "${resentmentToRelease}"
${readinessLevel ? `Readiness: ${readinessLevel}` : ''}

**Releasing isn't forgetting. It's choosing freedom.**

**Practice 1: The Unsent Letter**
Write everything you need to say. All of it. The raw, unfiltered truth. Then:
- Burn it
- Bury it
- Tear it up
- Delete it
The release is in the expression, not the sending.

**Practice 2: The Energy Cord Visualization**
Imagine a cord connecting you to this person/situation.
See where it attaches to your body (often chest, stomach, or throat).
Visualize gently detaching the cord from YOUR end.
Watch it fall away.
Feel the space where it used to be.

**Practice 3: The Buddhist Letting Go Breath**
Breathe in: "I acknowledge this pain."
Breathe out: "I release what doesn't serve me."
Repeat until something shifts.

**Practice 4: The Reframe**
"This happened, and because of it, I now understand..."
"This was painful, and because of it, I now value..."
Not toxic positivity - real meaning-making.

**Practice 5: The Daily Intention**
Each morning: "Today, I choose not to carry this."
Not because it's resolved, but because your freedom matters.

${
  readinessLevel === 'committed'
    ? `
**Since you're committed:**
You're making real progress by exploring this.

Let's try one practice together right now. Which one resonates most?`
    : `
**Take your time:**
Readiness for release comes in waves. You might feel ready one day and not the next. That's normal.

What matters is the direction you're moving in.`
}

**A final truth:**
Releasing resentment isn't about them deserving forgiveness. It's about you deserving peace.

Which practice would you like to try?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const resentmentTools = [
  understandResentmentDef,
  resentmentInventoryDef,
  forgivenessJourneyDef,
  resentmentInFamilyDef,
  releaseResentmentDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'resentment',
  resentmentTools
);

export default getToolDefinitions;
