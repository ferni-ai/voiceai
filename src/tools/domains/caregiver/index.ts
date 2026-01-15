/**
 * Caregiver Domain
 *
 * Tools for supporting those caring for aging parents, disabled family members,
 * or chronically ill loved ones. Caregiving is one of the most demanding roles -
 * we see you.
 *
 * DOMAIN: caregiver
 * PERSONA AFFINITY: Ferni (emotional support), Maya (self-care habits), Nayan (wisdom)
 *
 * TOOLS:
 *   Support: caregiverBurnout, caregiverGuilt, respiteNeed
 *   Practical: careCoordination, difficultConversations
 *   Emotional: griefWhileCaringFor, anticipatoryGrief
 *
 * PRINCIPLES:
 * - You cannot pour from an empty cup
 * - Guilt is almost universal among caregivers
 * - Asking for help is strength, not weakness
 * - Grief can begin before loss
 *
 * RESEARCH BASIS:
 * - Caregiver burden research (Zarit)
 * - Anticipatory grief (Rando)
 * - Compassion fatigue (Figley)
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Cross-persona intelligence for team coordination
import { addCrossPersonaInsight } from '../../../services/cross-persona-insights.js';

const log = getLogger();

// ============================================================================
// CAREGIVER TYPES & CHALLENGES
// ============================================================================

const CAREGIVER_CHALLENGES: Record<
  string,
  { description: string; commonFeelings: string[]; support: string[] }
> = {
  burnout: {
    description: 'Physical, emotional, and mental exhaustion from caregiving demands',
    commonFeelings: ['Overwhelm', 'Resentment', 'Numbness', 'Loss of self', 'Hopelessness'],
    support: ['Respite care', 'Support groups', 'Therapy', 'Setting limits'],
  },
  guilt: {
    description:
      'Pervasive guilt about not doing enough, needing breaks, or having negative feelings',
    commonFeelings: [
      'Never enough',
      'Should be doing more',
      'Guilt about rest',
      'Guilt about frustration',
    ],
    support: ['Normalize the feelings', 'Permission to be human', 'Realistic expectations'],
  },
  grief: {
    description: 'Grieving the person they were before illness, or anticipating loss',
    commonFeelings: [
      'Ambiguous loss',
      'Anticipatory grief',
      'Disenfranchised grief',
      'Mourning while caring',
    ],
    support: ['Acknowledge the grief', 'Honor who they were', 'Support groups'],
  },
  isolation: {
    description: 'Social isolation as caregiving consumes time and energy',
    commonFeelings: ['Loneliness', 'Friends drift away', 'No one understands', 'Life passing by'],
    support: ['Online communities', 'Caregiver support groups', 'Brief social connections'],
  },
  roleReversal: {
    description: 'The disorientation of caring for someone who once cared for you',
    commonFeelings: ['Strange', 'Unfair', 'Grieving the relationship', 'Identity confusion'],
    support: ['Process the shift', 'Find new ways to connect', 'Honor both roles'],
  },
};

// ============================================================================
// TOOL: Caregiver Burnout Assessment
// ============================================================================

const caregiverBurnoutDef: ToolDefinition = {
  id: 'caregiverBurnout',
  name: 'Caregiver Burnout',
  description: 'Assess and address caregiver burnout',
  domain: 'caregiver',
  tags: ['caregiver', 'burnout', 'self-care', 'exhaustion'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('caregiverBurnout'),
      parameters: z.object({
        careRole: z.string().optional().describe('Who you care for (parent, spouse, child, etc.)'),
        howLong: z.string().optional().describe("How long you've been caregiving"),
        currentState: z
          .enum(['managing', 'struggling', 'drowning', 'numb'])
          .optional()
          .describe("How you're doing right now"),
      }),
      execute: async ({ careRole, howLong, currentState }) => {
        const userId = ctx.userId;

        log.debug({ userId, careRole, currentState }, '[caregiver] burnout assessment');

        const response = `I see you. Caregiving is one of the hardest things a person can do.

${careRole ? `**You're caring for:** ${careRole}` : ''}
${howLong ? `**Duration:** ${howLong}` : ''}
${currentState ? `**Current state:** ${currentState}` : ''}

**Caregiver Burnout Signs:**

| Physical | Emotional | Behavioral |
|----------|-----------|------------|
| Exhausted even after rest | Feeling hopeless | Withdrawing from others |
| Getting sick more often | Resentment (then guilt about it) | Snapping at loved ones |
| Sleep problems | Feeling empty | Neglecting your own needs |
| Weight changes | Crying easily or numbness | No longer enjoying things |

${
  currentState === 'drowning' || currentState === 'numb'
    ? `
**⚠️ You're in the danger zone.**
This isn't sustainable. Your needs matter too. Getting help isn't optional - it's necessary.`
    : ''
}

**The Caregiver Paradox:**
You can't pour from an empty cup, but the cup keeps getting demanded of you.

**What helps:**

1. **Respite is not selfish** - Taking breaks makes you a better caregiver
2. **Lower the bar** - "Good enough" is good enough
3. **Accept help** - When offered, say YES
4. **Find your people** - Other caregivers understand
5. **Professional support** - Therapy, support groups

**Resources:**
• Caregiver Action Network: 1-855-227-3640
• National Alliance for Caregiving: caregiving.org
• Family Caregiver Alliance: caregiver.org

**One question:**
What's ONE thing you could let go of or accept help with this week?

You're doing something incredibly hard. You don't have to do it perfectly.`;

        // Track for capacity awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'maya', // Maya for self-care habits
          priority: currentState === 'drowning' || currentState === 'numb' ? 'high' : 'normal',
          content: `User is caregiver experiencing ${currentState || 'burnout'} state. Self-care is critical.`,
          category: 'caregiver-burnout',
          proactive: true,
          oneTime: false,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Caregiver Guilt
// ============================================================================

const caregiverGuiltDef: ToolDefinition = {
  id: 'caregiverGuilt',
  name: 'Caregiver Guilt',
  description: 'Process the pervasive guilt that comes with caregiving',
  domain: 'caregiver',
  tags: ['caregiver', 'guilt', 'emotions', 'self-compassion'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('caregiverGuilt'),
      parameters: z.object({
        guiltSource: z.string().optional().describe('What specifically triggers your guilt'),
        guiltType: z
          .enum([
            'not_enough',
            'needing_breaks',
            'negative_feelings',
            'past_choices',
            'considering_placement',
          ])
          .optional()
          .describe('The type of guilt'),
      }),
      execute: async ({ guiltSource, guiltType }) => {
        const userId = ctx.userId;

        log.debug({ userId, guiltType }, '[caregiver] guilt processing');

        const guiltContexts = {
          not_enough: "Feeling like no matter how much you do, it's never enough",
          needing_breaks: 'Feeling guilty for needing rest or time away',
          negative_feelings: 'Guilt about frustration, resentment, or wishing this was over',
          past_choices: 'Regret about past decisions in the relationship',
          considering_placement: 'Guilt about considering care facilities',
        };

        const response = `Caregiver guilt is one of the most universal and least talked about experiences. You are not alone in this.

${guiltSource ? `**What's triggering guilt:** "${guiltSource}"` : ''}
${guiltType ? `**Type:** ${guiltContexts[guiltType]}` : ''}

**The Truth About Caregiver Guilt:**

Almost every caregiver feels guilt. The fact that you feel it means you care deeply.

**Common Guilt Spirals:**

| The Thought | The Truth |
|-------------|-----------|
| "I should be doing more" | You're already doing an extraordinary amount |
| "I shouldn't need a break" | You're human, not a machine |
| "A good person wouldn't feel frustrated" | Frustration is a normal response to hard situations |
| "They would never put me in a facility" | Times and care needs have changed |
| "I'm abandoning them" | Getting help is how you sustain caregiving |

**Why Guilt is Universal:**

1. **The gap** - There's always a gap between what's needed and what's humanly possible
2. **Love** - Guilt often comes from how much you love them
3. **Impossible standards** - Society idealizes selfless caregiving
4. **Unacknowledged grief** - Sometimes guilt is easier than grief

**Reframes:**

"I feel guilty for taking time for myself"
→ "Taking care of myself IS taking care of them. I can't give what I don't have."

"I feel guilty for feeling frustrated"
→ "Frustration means I'm human in an impossibly hard situation."

"I feel guilty considering placement"
→ "The most loving choice might be ensuring they have the best care available."

${
  guiltType === 'considering_placement'
    ? `
**About Care Facilities:**
Choosing a care facility is often an act of love, not abandonment. It means:
- Acknowledging needs exceed what one person can provide
- Ensuring 24/7 professional care
- Preserving your relationship (visitor vs. exhausted caregiver)
- Protecting your own health

You can still be their advocate, their visitor, their person.`
    : ''
}

**A truth to sit with:**
The fact that you feel guilt means you care. But guilt doesn't make you a better caregiver - it just depletes you faster.

What would you say to a friend who was feeling this way?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Anticipatory Grief
// ============================================================================

const anticipatoryGriefDef: ToolDefinition = {
  id: 'anticipatoryGrief',
  name: 'Anticipatory Grief',
  description:
    "Process grief that begins before death - grieving what's already lost and what's coming",
  domain: 'caregiver',
  tags: ['caregiver', 'grief', 'anticipatory', 'loss'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('anticipatoryGrief'),
      parameters: z.object({
        whatsBeingLost: z
          .string()
          .optional()
          .describe("What you're grieving - the person, the relationship, etc."),
        stage: z
          .enum(['early_changes', 'significant_decline', 'end_stage', 'limbo'])
          .optional()
          .describe('Where they are in their journey'),
      }),
      execute: async ({ whatsBeingLost, stage }) => {
        const userId = ctx.userId;

        log.debug({ userId, stage }, '[caregiver] anticipatory grief');

        const response = `Anticipatory grief is real grief. You're not grieving too soon - you're grieving what's already gone.

${whatsBeingLost ? `**What you're grieving:** "${whatsBeingLost}"` : ''}
${stage ? `**Where you are:** ${stage.replace(/_/g, ' ')}` : ''}

**Understanding Anticipatory Grief:**

Anticipatory grief is:
- Grieving the person they were before illness
- Grieving the relationship you had
- Grieving the future you planned
- Living in constant loss while they're still here
- Often invisible to others

**The Layers of Loss:**

| What's Gone | What Remains |
|-------------|--------------|
| Who they were | Who they are now |
| The relationship you had | A different kind of connection |
| Shared plans and dreams | Present moments |
| Their independence | Your care |
| Easy communication | Finding new ways to connect |

**What Makes It Complicated:**

1. **Ambiguous loss** - They're here but not fully here
2. **Disenfranchised grief** - Society says you can't grieve someone who's alive
3. **Chronic sorrow** - The grief has no end point (yet)
4. **Exhaustion** - Grieving while caregiving is doubly depleting
5. **Guilt** - "How can I grieve someone who's still here?"

**Honoring This Grief:**

- **Let yourself feel it** - This is real loss
- **Find witnesses** - People who understand (support groups, therapists)
- **Create rituals** - Honor what was, what is, what will be
- **Hold both** - You can grieve AND find moments of connection
- **Don't rush** - There's no right way to do this

${
  stage === 'end_stage'
    ? `
**In This Final Chapter:**
You might feel: relief (and guilt about relief), urgency to say things, profound sadness, unexpected peace, all of it.

Everything you're feeling is valid. There is no right way to love someone at the end.`
    : ''
}

**Remember:**
You're not grieving early. You're grieving the losses that have already happened. That's not weakness - it's love doing what it does.

What aspect of this grief feels most present for you right now?`;

        // Track for cross-persona awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'nayan', // Nayan for wisdom on death/grief
          priority: 'high',
          content: `User processing anticipatory grief as caregiver. Handle with wisdom and care.`,
          category: 'anticipatory-grief',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Respite Need
// ============================================================================

const respiteNeedDef: ToolDefinition = {
  id: 'respiteNeed',
  name: 'Respite Need',
  description: 'Acknowledge and plan for caregiver respite',
  domain: 'caregiver',
  tags: ['caregiver', 'respite', 'self-care', 'breaks'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('respiteNeed'),
      parameters: z.object({
        lastBreak: z.string().optional().describe('When you last had a real break'),
        barriers: z.string().optional().describe('What makes respite feel impossible'),
      }),
      execute: async ({ lastBreak, barriers }) => {
        const userId = ctx.userId;

        log.debug({ userId, lastBreak }, '[caregiver] respite assessment');

        const response = `Respite isn't a luxury - it's how you sustain caregiving without breaking.

${lastBreak ? `**Your last real break:** ${lastBreak}` : ''}
${barriers ? `**What makes it hard:** "${barriers}"` : ''}

**Why Respite Matters:**

Caregiver burnout isn't just exhaustion - it leads to:
- Higher rates of depression (40-70% of caregivers)
- Physical health decline
- Compromised care quality
- Relationship damage
- Your own mortality risk increases

**Respite Permission Slip:**

I hereby give myself permission to:
- Take breaks without guilt
- Accept help when offered
- Ask for help when not offered
- Put my own oxygen mask on first
- Be a good caregiver by being a rested one

**Respite Options:**

| Duration | Options |
|----------|---------|
| **Hours** | Family member relief, adult day programs, drop-in care |
| **Days** | Respite care services, rotating family schedule |
| **Weeks** | Short-term facility stay, professional in-home care |
| **Ongoing** | Regular weekly support person, day program enrollment |

**Resources:**

- ARCH National Respite Network: archrespite.org
- Eldercare Locator: 1-800-677-1116
- Local Area Agency on Aging
- Medicaid waiver programs (state-specific)
- Veteran respite programs (if applicable)

${
  barriers
    ? `
**Addressing your barrier: "${barriers}"**

Common barriers and reframes:
- "No one else can do it right" → "Different isn't wrong. Good enough is good enough."
- "I feel guilty" → "Rested caregivers provide better care."
- "We can't afford it" → "There are free/subsidized options. The cost of your burnout is higher."
- "They only want me" → "They'll adjust. And you'll be better when you're back."
- "I don't have anyone" → "Start small. Even a few hours matters."`
    : ''
}

**Starting Small:**

If respite feels impossible, start with:
1. 15 minutes of quiet time while they nap
2. One friend/family member for 2 hours
3. A virtual support group from home
4. A walk around the block

**The truth:**
Taking care of yourself IS taking care of them. You can't give what you don't have.

What's one small respite step you could take this week?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Caregiver Identity Loss
// ============================================================================

const caregiverIdentityLossDef: ToolDefinition = {
  id: 'caregiverIdentityLoss',
  name: 'Caregiver Identity Loss',
  description: 'Process the loss of self that happens in intensive caregiving',
  domain: 'caregiver',
  tags: ['caregiver', 'identity', 'self', 'loss'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('caregiverIdentityLoss'),
      parameters: z.object({
        whatYouMiss: z.string().optional().describe('What part of yourself you miss'),
        caregivingDuration: z.string().optional().describe("How long you've been caregiving"),
      }),
      execute: async ({ whatYouMiss, caregivingDuration }) => {
        const userId = ctx.userId;

        log.debug({ userId, caregivingDuration }, '[caregiver] identity loss');

        const response = `Caregiving can swallow your identity whole. You're not imagining it.

${whatYouMiss ? `**What you miss about yourself:** "${whatYouMiss}"` : ''}
${caregivingDuration ? `**You've been in this role for:** ${caregivingDuration}` : ''}

**The Identity Erasure:**

Before caregiving, you were:
- A friend who made plans
- Someone with hobbies
- A person with their own schedule
- An individual with space for spontaneity
- Someone who thought about their future

Now, you might feel like:
- Just "the caregiver"
- Someone defined by another's needs
- A person who's forgotten their own likes
- Invisible, except when needed
- Like your life is on hold

**This Is a Real Loss:**

You're not being selfish by grieving who you were. That person mattered. That person still exists somewhere in you.

**Ways to Reclaim Bits of Self:**

| Time Available | What You Can Do |
|----------------|-----------------|
| **5 minutes** | Listen to music you love, text a friend, step outside |
| **30 minutes** | Read, do one small hobby thing, take a real shower |
| **2 hours** | See a friend, exercise, do something just for you |
| **A day** | Respite + something that makes you feel like you |

**Questions to Reconnect:**

1. What did you love doing before this?
2. What's one small thing that makes you feel like yourself?
3. Who in your life makes you feel seen as a person, not just a caregiver?
4. What would you tell yourself from before this started?

**A Hard Truth:**

You might not get back to who you were before. But you can become someone new - someone who carries this experience but isn't defined by it. When caregiving ends, you'll need to rebuild. That's okay.

**Right Now:**

Even in the midst of caregiving, you're still a person. What's one tiny thing that's just for you that you could do today?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const caregiverTools = [
  caregiverBurnoutDef,
  caregiverGuiltDef,
  anticipatoryGriefDef,
  respiteNeedDef,
  caregiverIdentityLossDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'caregiver',
  caregiverTools
);

export default getToolDefinitions;
