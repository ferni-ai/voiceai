/**
 * Life Transitions Domain Tools
 *
 * Tools for navigating the emotional journey through major life changes.
 * This domain focuses on the inner work of transitions - not tracking milestones,
 * but processing the identity shifts, losses, and growth that come with change.
 *
 * PHILOSOPHY:
 *   Every transition is both an ending and a beginning.
 *   Even "happy" transitions involve grief for what was.
 *   The space between what was and what will be is sacred.
 *   Identity transforms - who you were is not who you're becoming.
 *
 * DOMAIN: life-transitions
 * SUB-DOMAINS:
 *   Recognition - Acknowledging the magnitude of what's changing
 *   Processing - Working through the emotions of transition
 *   Identity - Exploring who you're becoming
 *   Meaning - Finding purpose in the change
 *   Integration - Carrying forward what matters
 *
 * TOOLS:
 *   Recognition: acknowledgeTransition, namingTheChange, transitionStage
 *   Processing: grieveWhatWas, holdDualEmotions, navigateAmbiguousLoss
 *   Identity: exploreIdentityShift, whoAmIBecoming, honorWhoYouWere
 *   Meaning: findMeaningInTransition, whatIsThisTeaching
 *   Integration: createTransitionRitual, preserveWhatMatters, embraceUncertainty
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  persistTrackedItem,
  persistKeyMoment,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';
import { z } from 'zod';

// ============================================================================
// LIFE TRANSITIONS WISDOM DATABASE
// ============================================================================

/**
 * Types of life transitions with emotional support guidance
 */
const TRANSITION_TYPES = {
  identity_shift: {
    name: 'Identity Transition',
    description: 'Becoming something new - parent, retiree, widow, divorcee, entrepreneur',
    examples: ['New parent', 'Career change', 'Retirement', 'Becoming a caregiver'],
    core_question: 'Who am I now, if not who I was?',
    common_feelings: [
      'Disorientation',
      'Loss of self',
      'Excitement mixed with fear',
      'Grief for old identity',
    ],
    wisdom: [
      "You don't lose yourself - you expand",
      "The caterpillar doesn't know it will become a butterfly",
      'Your old identity served you. Thank it and let it evolve.',
      "Identity is not fixed. You've always been becoming.",
    ],
  },
  loss_transition: {
    name: 'Loss Transition',
    description: 'Adjusting to life after significant loss',
    examples: [
      'Death of loved one',
      'Divorce',
      'Job loss',
      'Health diagnosis',
      'Friendship ending',
    ],
    core_question: 'How do I live in a world where this is true?',
    common_feelings: ['Grief', 'Anger', 'Disbelief', 'Fear', 'Relief (with guilt about relief)'],
    wisdom: [
      'Grief is love with nowhere to go',
      'The size of your grief reflects the size of your love',
      "There's no timeline for processing loss",
      "You don't get over it - you learn to carry it differently",
    ],
  },
  beginning_transition: {
    name: 'Beginning Transition',
    description: 'Starting something new that changes everything',
    examples: ['Marriage', 'New baby', 'New city', 'Starting a business', 'Going back to school'],
    core_question: "Am I ready for who I'll need to become?",
    common_feelings: ['Excitement', 'Imposter syndrome', 'Grief for freedom lost', 'Hope'],
    wisdom: [
      "You don't have to be ready to begin",
      'Every expert started as a beginner',
      'New beginnings are dressed up as painful endings',
      'The first step is always the hardest to take but the most important to have taken',
    ],
  },
  unwanted_transition: {
    name: 'Unwanted Transition',
    description: "Changes you didn't choose and wouldn't have",
    examples: ['Illness diagnosis', 'Layoff', 'Betrayal', 'Aging parents', 'Financial crisis'],
    core_question: "How do I find agency in something I didn't choose?",
    common_feelings: ['Anger', 'Victimization', 'Powerlessness', 'Eventually - possibility'],
    wisdom: [
      "You didn't choose this. You DO choose what happens next.",
      'What happens TO you is not as powerful as what happens IN you',
      'Even in powerlessness, you have the power of your response',
      'Sometimes the only way out is through',
    ],
  },
  growth_transition: {
    name: 'Growth Transition',
    description: 'Natural life stage transitions',
    examples: [
      'Empty nest',
      'Milestone birthday',
      'Kids growing up',
      'Midlife',
      'Entering elderhood',
    ],
    core_question: 'What is this season of life asking of me?',
    common_feelings: [
      'Bittersweet',
      'Pride mixed with loss',
      'Awareness of mortality',
      'Desire for meaning',
    ],
    wisdom: [
      'Each season has its own gifts',
      'What you lose in one thing, you gain in another',
      'Growing older is a privilege denied to many',
      "This isn't the end - it's the next chapter",
    ],
  },
};

/**
 * Stages of transition (based on William Bridges' transition model)
 */
const TRANSITION_STAGES = {
  ending: {
    name: 'The Ending',
    description: 'Letting go of the old way, the old identity',
    signs: ['Denial or shock', 'Anger or bargaining', 'Grief and loss', 'Disorientation'],
    needs: ['Acknowledgment', 'Permission to grieve', 'Time', 'Compassion'],
    guidance:
      "Before something new can begin, something old must end. This isn't failure - it's transition.",
  },
  neutral_zone: {
    name: 'The Neutral Zone',
    description: 'The in-between time - no longer old, not yet new',
    signs: [
      'Feeling stuck',
      'Confusion',
      'Anxiety',
      'Creativity emerging',
      'Questioning everything',
    ],
    needs: ['Patience', 'Self-compassion', 'Structure without rigidity', 'Space to explore'],
    guidance: "This foggy place is where transformation happens. Don't rush through it.",
  },
  new_beginning: {
    name: 'The New Beginning',
    description: 'Emerging into a new identity, new way of being',
    signs: ['Energy returning', 'New sense of purpose', 'Identity clarifying', 'Hope'],
    needs: [
      'Courage to step forward',
      'Celebration of progress',
      'Integration of learning',
      'Community',
    ],
    guidance: 'Beginnings are fragile. Protect your new growth while it takes root.',
  },
};

/**
 * Wisdom for holding dual emotions during transitions
 */
const DUAL_EMOTIONS_WISDOM = [
  {
    pair: 'Happy AND sad',
    example: 'Wedding day - joy for marriage, grief for leaving family home',
    wisdom: 'Both are true. Neither cancels the other.',
  },
  {
    pair: 'Relieved AND guilty',
    example: 'After a difficult caretaking period ends',
    wisdom: "Relief doesn't mean you didn't love them. It means you're human.",
  },
  {
    pair: 'Excited AND terrified',
    example: 'New job, new baby, new city',
    wisdom: "If you weren't scared, you wouldn't care. The fear means it matters.",
  },
  {
    pair: 'Grateful AND grieving',
    example: 'Grateful for time with someone AND grieving their loss',
    wisdom: "Gratitude and grief are not opposites - they're companions.",
  },
  {
    pair: 'Free AND lost',
    example: 'After divorce or job loss',
    wisdom: "Freedom can feel disorienting. You'll find your footing.",
  },
  {
    pair: 'Proud AND sad',
    example: 'Child graduating, leaving home',
    wisdom: 'Your success as a parent includes letting go. Both feelings honor them.',
  },
];

/**
 * Ritual ideas for marking transitions
 */
const TRANSITION_RITUALS = {
  endings: [
    {
      name: 'Letter to Your Past Self',
      description: 'Write to who you were, thanking them for getting you here',
    },
    {
      name: 'Release Ceremony',
      description: "Burn, bury, or release a symbol of what you're leaving behind",
    },
    {
      name: 'Gathering of Witnesses',
      description: 'Share your story with people who knew you when',
    },
    {
      name: 'Memorial Walk',
      description: "Visit places that mattered in the chapter that's ending",
    },
    {
      name: 'Gratitude Inventory',
      description: 'List what this chapter taught you, gave you, helped you become',
    },
  ],
  beginnings: [
    {
      name: 'Letter to Your Future Self',
      description: "Write to who you're becoming with hopes and intentions",
    },
    {
      name: 'Threshold Crossing',
      description: 'Create a physical threshold to step through into your new chapter',
    },
    {
      name: 'Blessing Circle',
      description: 'Gather loved ones to speak blessings over your new beginning',
    },
    {
      name: 'First Acts',
      description: 'Deliberately choose your first actions in this new chapter',
    },
    {
      name: 'Symbol Selection',
      description: "Choose an object or image that represents who you're becoming",
    },
  ],
  neutral_zone: [
    {
      name: 'Daily Check-In',
      description: 'Brief daily practice of naming where you are and what you need',
    },
    { name: 'Wandering Practice', description: 'Intentional time for exploration without agenda' },
    {
      name: 'Dream Journaling',
      description: 'Record and reflect on dreams during this liminal time',
    },
    {
      name: 'Council of Selves',
      description: 'Dialogue between your past self, present self, and future self',
    },
    {
      name: 'Uncertainty Altar',
      description: "Create a space holding symbols of what you don't yet know",
    },
  ],
};

/**
 * Questions for identity exploration during transition
 */
const IDENTITY_QUESTIONS = {
  honoring_past: [
    'What did your old identity do well? How did it serve you?',
    'What parts of who you were do you want to carry forward?',
    'What was the gift of that chapter of your life?',
    'How did that version of yourself help you survive or thrive?',
    'What would you say to that version of yourself if you could?',
  ],
  exploring_present: [
    'What feels most uncertain about who you are right now?',
    'What parts of yourself feel familiar? What feels new?',
    'What roles do you no longer identify with? How does that feel?',
    "What do you find yourself reaching for that's no longer there?",
    'Who do you become when no one is watching?',
  ],
  discovering_future: [
    'Who are you becoming? What glimpses have you caught?',
    'What values do you want to guide this next version of yourself?',
    'What would the wisest version of you do in this transition?',
    'What does your future self want you to know right now?',
    'What would become possible if this new identity took root?',
  ],
};

// Logger available via getLogger() when needed

// ============================================================================
// RECOGNITION TOOLS
// ============================================================================

/**
 * Acknowledge Transition - Validate the magnitude of what's changing
 */
const acknowledgeTransitionDef: ToolDefinition = {
  id: 'acknowledgeTransition',
  name: 'Acknowledge Transition',
  description: 'Acknowledge and validate the magnitude of a life transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'validation', 'recognition', 'support'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "For when user shares they're going through a major life transition. Validates the magnitude, identifies the type of transition, and provides initial support.",
      parameters: z.object({
        transitionDescription: z.string().describe("What transition they're going through"),
        howLong: z.string().optional().describe("How long they've been in this transition"),
        howTheyreFeeling: z.string().optional().describe("How they're feeling about it"),
      }),
      execute: async ({ transitionDescription, howLong, howTheyreFeeling }, { ctx: toolCtx }) => {
        // Identify transition type
        const transitionType = identifyTransitionType(transitionDescription);
        const typeInfo = TRANSITION_TYPES[transitionType];

        // Persist this as a significant moment
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'life-transitions',
          type: 'milestone',
          summary: `User acknowledged life transition: ${transitionDescription}`,
          emotionalWeight: 'heavy',
          topics: ['transition', transitionType, 'life-change'],
        });

        let response = `**I hear you. ${transitionDescription}**\n\n`;
        response += `This is significant. ${typeInfo.name} changes touch everything - who you are, how you move through the world, what feels familiar.\n\n`;

        if (howLong) {
          response += `You've been in this for ${howLong}. That's real time spent navigating something hard.\n\n`;
        }

        if (howTheyreFeeling) {
          response += `And you're feeling ${howTheyreFeeling}. That makes complete sense. `;
          const feelings = typeInfo.common_feelings;
          response += `Many people in ${typeInfo.name.toLowerCase()}s feel: ${feelings.join(', ')}. `;
          response += `Whatever you're feeling - it's valid.\n\n`;
        }

        response += `**The core question of this kind of transition is:**\n`;
        response += `*"${typeInfo.core_question}"*\n\n`;

        response += `There's no rush to answer that. But I want you to know - I see the weight of what you're carrying.\n\n`;

        response += `Would you like to explore what stage of this transition you're in, or just talk about how you're doing?`;

        return response;
      },
    });
  },
};

/**
 * Transition Stage - Identify where they are in the transition process
 */
const transitionStageDef: ToolDefinition = {
  id: 'transitionStage',
  name: 'Transition Stage',
  description: 'Help identify where user is in the transition process',
  domain: 'life-transitions',
  additionalDomains: ['second-chances', 'grief', 'meaning'], // Transitions involve endings (grief), fresh starts, and meaning-making
  tags: ['life-transitions', 'stages', 'understanding', 'bridges-model'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user understand where they are in the transition process using the three stages: Ending, Neutral Zone, and New Beginning.',
      parameters: z.object({
        whatTheyreExperiencing: z.string().describe("What they're experiencing in this transition"),
        howLongInTransition: z.string().optional().describe("How long they've been in transition"),
      }),
      execute: async ({ whatTheyreExperiencing, howLongInTransition }) => {
        // Identify likely stage based on what they're experiencing
        const stage = identifyTransitionStage(whatTheyreExperiencing);
        const stageInfo = TRANSITION_STAGES[stage];

        let response = `**It sounds like you might be in "${stageInfo.name}"**\n\n`;
        response += `${stageInfo.description}\n\n`;

        response += `**Signs of this stage:**\n`;
        stageInfo.signs.forEach((sign) => {
          response += `• ${sign}\n`;
        });

        response += `\n**What you might need right now:**\n`;
        stageInfo.needs.forEach((need) => {
          response += `• ${need}\n`;
        });

        response += `\n**Something to know:**\n`;
        response += `*"${stageInfo.guidance}"*\n\n`;

        // Add context about movement through stages
        if (stage === 'ending') {
          response += `The Neutral Zone will come, and then eventually, a New Beginning. But don't rush the ending - it has its own work to do.`;
        } else if (stage === 'neutral_zone') {
          response += `This in-between space can feel endless, but it's where the real transformation happens. Trust the process.`;
        } else {
          response += `New beginnings are tender. Protect this new growth while it establishes roots.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// PROCESSING TOOLS
// ============================================================================

/**
 * Grieve What Was - Honor the losses in transition
 */
const grieveWhatWasDef: ToolDefinition = {
  id: 'grieveWhatWas',
  name: 'Grieve What Was',
  description: 'Honor the grief that comes with transition, even "happy" ones',
  domain: 'life-transitions',
  additionalDomains: ['grief', 'second-chances', 'meaning'], // Grief is central, often precedes fresh starts, and requires meaning-making
  tags: ['life-transitions', 'grief', 'processing', 'loss'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'For processing grief that accompanies life transitions - even positive ones involve loss. Creates space for mourning what was.',
      parameters: z.object({
        whatYoureLosing: z.string().describe("What they're losing or have lost in this transition"),
        theTransition: z.string().optional().describe('What transition is causing this loss'),
        isHappyTransition: z
          .boolean()
          .optional()
          .describe('Is this a "happy" transition like wedding, baby, promotion?'),
      }),
      execute: async ({ whatYoureLosing, theTransition, isHappyTransition }, { ctx: toolCtx }) => {
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'life-transitions',
          type: 'shared_vulnerability',
          summary: `User processing grief about losing: ${whatYoureLosing}`,
          emotionalWeight: 'heavy',
          topics: ['grief', 'transition', 'loss'],
        });

        let response = '';

        if (isHappyTransition) {
          response += `**You're allowed to grieve this, even when the transition is "happy"**\n\n`;
          response += `We don't talk enough about the grief inside good things. A wedding means grieving single life. A baby means grieving freedom. A promotion means grieving a simpler role.\n\n`;
          response += `Acknowledging what you're losing doesn't mean you're not grateful. It means you're human.\n\n`;
        } else {
          response += `**What you're losing matters**\n\n`;
          response += `${whatYoureLosing}. I want to just sit with that for a moment.\n\n`;
        }

        response += `**Let me ask you:**\n`;
        response += `What did ${whatYoureLosing} give you?\n`;
        response += `What will you miss most?\n`;
        response += `What do you wish you could say to it, or about it, before you let it go?\n\n`;

        const relevantWisdom =
          TRANSITION_TYPES.loss_transition.wisdom[Math.floor(Math.random() * 4)];
        response += `*"${relevantWisdom}"*\n\n`;

        response += `Take your time with this. There's no rush to be "okay."`;

        return response;
      },
    });
  },
};

/**
 * Hold Dual Emotions - Support for conflicting feelings
 */
const holdDualEmotionsDef: ToolDefinition = {
  id: 'holdDualEmotions',
  name: 'Hold Dual Emotions',
  description: 'Help user hold two seemingly contradictory emotions at once',
  domain: 'life-transitions',
  tags: ['life-transitions', 'emotions', 'complexity', 'both-and'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'For when user is experiencing conflicting emotions - happy AND sad, relieved AND guilty, etc. Normalizes holding multiple truths.',
      parameters: z.object({
        emotion1: z.string().describe("First emotion they're feeling"),
        emotion2: z.string().describe('Second, seemingly conflicting emotion'),
        situation: z.string().optional().describe('What situation is triggering these feelings'),
      }),
      execute: async ({ emotion1, emotion2, situation }) => {
        // Find if we have specific wisdom for this pair
        const matchingPair = DUAL_EMOTIONS_WISDOM.find(
          (w) =>
            w.pair.toLowerCase().includes(emotion1.toLowerCase()) ||
            w.pair.toLowerCase().includes(emotion2.toLowerCase())
        );

        let response = `**You can feel ${emotion1} AND ${emotion2}. Both are true.**\n\n`;

        if (matchingPair) {
          response += `This combination is so common: ${matchingPair.example}\n\n`;
          response += `*"${matchingPair.wisdom}"*\n\n`;
        }

        response += `Our culture tells us emotions should be simple. Pick one. Decide how you feel.\n\n`;
        response += `But life is more complex than that. The heart is big enough to hold contradictions.\n\n`;

        if (situation) {
          response += `In ${situation}, of COURSE you feel both ${emotion1} and ${emotion2}. `;
          response += `That's not confusion - that's depth.\n\n`;
        }

        response += `**What would it be like to:**\n`;
        response += `• Give yourself permission to feel ${emotion1} fully, without guilt\n`;
        response += `• AND give yourself permission to feel ${emotion2} fully, without shame\n`;
        response += `• Let them both be true at the same time?\n\n`;

        response += `You don't have to resolve the contradiction. You just have to hold it with compassion.`;

        return response;
      },
    });
  },
};

/**
 * Navigate Ambiguous Loss - Support for losses without clean endings
 */
const navigateAmbiguousLossDef: ToolDefinition = {
  id: 'navigateAmbiguousLoss',
  name: 'Navigate Ambiguous Loss',
  description: 'Support for losses that lack clear endings or closure',
  domain: 'life-transitions',
  tags: ['life-transitions', 'ambiguous-loss', 'grief', 'no-closure'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "For losses that don't have clean endings - estranged family, dementia, missing persons, relationships that faded, the loss of who someone used to be.",
      parameters: z.object({
        typeOfLoss: z.string().describe("What kind of ambiguous loss they're experiencing"),
        whatMakesItHard: z
          .string()
          .optional()
          .describe('What makes this particular loss so difficult'),
      }),
      execute: async ({ typeOfLoss, whatMakesItHard }, { ctx: toolCtx }) => {
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'life-transitions',
          type: 'concern',
          summary: `User processing ambiguous loss: ${typeOfLoss}`,
          emotionalWeight: 'heavy',
          topics: ['ambiguous-loss', 'grief', 'no-closure'],
        });

        let response = `**Ambiguous loss is one of the hardest kinds of grief**\n\n`;
        response += `${typeOfLoss}. There's no funeral. No clear ending. No closure that society recognizes.\n\n`;

        if (whatMakesItHard) {
          response += `What makes it particularly hard: ${whatMakesItHard}. I hear you.\n\n`;
        }

        response += `**With ambiguous loss:**\n`;
        response += `• The person might be physically present but psychologically absent\n`;
        response += `• Or physically absent but still psychologically present\n`;
        response += `• The loss keeps happening, over and over\n`;
        response += `• People don't know how to support you because "no one died"\n`;
        response += `• You might feel guilty for grieving someone still alive\n\n`;

        response += `**What might help:**\n`;
        response += `• Acknowledge that this IS grief, even without death\n`;
        response += `• Create your own rituals for honoring what you've lost\n`;
        response += `• Find others who understand this specific kind of pain\n`;
        response += `• Let yourself grieve in waves - it's not linear\n`;
        response += `• Hold hope AND accept reality - both can be true\n\n`;

        response += `You're grieving something real, even if others can't see it. Your loss is valid.`;

        return response;
      },
    });
  },
};

// ============================================================================
// IDENTITY TOOLS
// ============================================================================

/**
 * Explore Identity Shift - Questions for identity exploration
 */
const exploreIdentityShiftDef: ToolDefinition = {
  id: 'exploreIdentityShift',
  name: 'Explore Identity Shift',
  description: 'Explore how identity is changing through transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'identity', 'exploration', 'who-am-i'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Guide exploration of how their identity is shifting through this transition. Helps connect past, present, and future selves.',
      parameters: z.object({
        focus: z
          .enum(['past', 'present', 'future'])
          .describe('Which aspect of identity to explore'),
        specificQuestion: z
          .string()
          .optional()
          .describe("Any specific identity question they're wrestling with"),
      }),
      execute: async ({ focus, specificQuestion }) => {
        const questions =
          IDENTITY_QUESTIONS[
            focus === 'past'
              ? 'honoring_past'
              : focus === 'present'
                ? 'exploring_present'
                : 'discovering_future'
          ];

        let response = '';

        if (focus === 'past') {
          response += `**Honoring Who You Were**\n\n`;
          response += `Your past self got you here. Before letting go, let's appreciate them.\n\n`;
        } else if (focus === 'present') {
          response += `**Exploring Who You Are Now**\n\n`;
          response += `The in-between can feel disorienting. Let's ground in what's true right now.\n\n`;
        } else {
          response += `**Discovering Who You're Becoming**\n\n`;
          response += `Your future self is emerging. Let's catch glimpses of them.\n\n`;
        }

        if (specificQuestion) {
          response += `You asked: "${specificQuestion}"\n\n`;
          response += `That's such an important question. Let me offer some related ones to sit with:\n\n`;
        } else {
          response += `**Questions to sit with:**\n\n`;
        }

        // Pick 3 questions from the relevant set
        const selectedQuestions = questions.sort(() => 0.5 - Math.random()).slice(0, 3);
        selectedQuestions.forEach((q, i) => {
          response += `${i + 1}. ${q}\n\n`;
        });

        response += `---\n\n`;
        response += `There's no right answer. Just notice what comes up. What's stirring in you?`;

        return response;
      },
    });
  },
};

/**
 * Who Am I Becoming - Future self exploration
 */
const whoAmIBecomingDef: ToolDefinition = {
  id: 'whoAmIBecoming',
  name: 'Who Am I Becoming',
  description: 'Explore the emerging new identity through transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'identity', 'future-self', 'becoming'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "For when user is curious about or catching glimpses of who they're becoming through this transition.",
      parameters: z.object({
        glimpsesTheyveNoticed: z
          .string()
          .optional()
          .describe("Any glimpses they've noticed of their new self"),
        whatTheyHope: z.string().optional().describe("What they hope about who they're becoming"),
        whatTheyFear: z.string().optional().describe("What they fear about who they're becoming"),
      }),
      execute: async ({ glimpsesTheyveNoticed, whatTheyHope, whatTheyFear }, { ctx: toolCtx }) => {
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'life-transitions',
          type: 'breakthrough',
          summary: `User exploring who they\'re becoming in transition`,
          emotionalWeight: 'medium',
          topics: ['identity', 'future-self', 'becoming'],
        });

        let response = `**The You That's Emerging**\n\n`;

        if (glimpsesTheyveNoticed) {
          response += `You've noticed: ${glimpsesTheyveNoticed}\n\n`;
          response += `Those glimpses matter. They're breadcrumbs showing you who you're becoming.\n\n`;
        }

        if (whatTheyHope && whatTheyFear) {
          response += `You hope: ${whatTheyHope}\n`;
          response += `You fear: ${whatTheyFear}\n\n`;
          response += `Both the hope and the fear point to what matters to you. They're both information.\n\n`;
        } else if (whatTheyHope) {
          response += `Your hope - ${whatTheyHope} - is a compass. Follow it.\n\n`;
        } else if (whatTheyFear) {
          response += `Your fear - ${whatTheyFear} - is also telling you something important about what you care about.\n\n`;
        }

        response += `**Something I believe about becoming:**\n\n`;
        const wisdom = TRANSITION_TYPES.identity_shift.wisdom;
        response += `*"${wisdom[Math.floor(Math.random() * wisdom.length)]}"*\n\n`;

        response += `**Questions for your emerging self:**\n`;
        response += `• What does this new version of you need to thrive?\n`;
        response += `• What would they do differently than the old you?\n`;
        response += `• What message do they have for you right now?\n\n`;

        response += `The person you're becoming already exists inside you. You're not creating them - you're revealing them.`;

        return response;
      },
    });
  },
};

/**
 * Honor Who You Were - Appreciating past identity
 */
const honorWhoYouWereDef: ToolDefinition = {
  id: 'honorWhoYouWere',
  name: 'Honor Who You Were',
  description: 'Appreciate and thank the past version of self',
  domain: 'life-transitions',
  tags: ['life-transitions', 'identity', 'past-self', 'gratitude'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Create space to honor and thank the past version of themselves before fully stepping into who they're becoming.",
      parameters: z.object({
        pastIdentity: z.string().describe("The identity or version of self they're leaving behind"),
        whatItGaveThem: z.string().optional().describe('What that identity gave them'),
      }),
      execute: async ({ pastIdentity, whatItGaveThem }) => {
        let response = `**Honoring ${pastIdentity}**\n\n`;

        response += `Before we let something go, it deserves to be honored.\n\n`;

        if (whatItGaveThem) {
          response += `That version of you - they gave you: ${whatItGaveThem}\n\n`;
          response += `That's not nothing. That person got you here. They did their best with what they knew.\n\n`;
        }

        response += `**If you could write a letter to that version of yourself, what would you say?**\n\n`;

        response += `Some things you might include:\n`;
        response += `• "Thank you for..." (what they did for you)\n`;
        response += `• "I forgive you for..." (where they fell short)\n`;
        response += `• "I'm keeping..." (what you'll carry forward)\n`;
        response += `• "I'm releasing..." (what no longer serves)\n`;
        response += `• "You did well because..." (acknowledging their effort)\n\n`;

        response += `---\n\n`;
        response += `*"Your old identity served you. Thank it and let it evolve."*\n\n`;

        response += `What would you want to say to that version of yourself?`;

        return response;
      },
    });
  },
};

// ============================================================================
// MEANING TOOLS
// ============================================================================

/**
 * Find Meaning in Transition - Purpose exploration
 */
const findMeaningInTransitionDef: ToolDefinition = {
  id: 'findMeaningInTransition',
  name: 'Find Meaning in Transition',
  description: 'Explore what meaning or purpose can be found in this transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'meaning', 'purpose', 'wisdom'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user explore what meaning, growth, or purpose might emerge from this transition.',
      parameters: z.object({
        theTransition: z.string().describe("What transition they're going through"),
        whatFeelsMeaningless: z
          .string()
          .optional()
          .describe('What aspects feel meaningless or purposeless'),
      }),
      execute: async ({ theTransition, whatFeelsMeaningless }, { ctx: toolCtx }) => {
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'life-transitions',
          type: 'breakthrough',
          summary: `User seeking meaning in transition: ${theTransition}`,
          emotionalWeight: 'medium',
          topics: ['meaning', 'purpose', 'transition'],
        });

        let response = `**Finding Meaning in ${theTransition}**\n\n`;

        if (whatFeelsMeaningless) {
          response += `You're right to name what feels meaningless: ${whatFeelsMeaningless}\n\n`;
          response += `Sometimes naming the void is the first step to finding light in it.\n\n`;
        }

        response += `Meaning doesn't always arrive fully formed. Sometimes it emerges slowly, in pieces.\n\n`;

        response += `**Questions that might help meaning surface:**\n\n`;
        response += `1. **What is this transition teaching you?**\n`;
        response += `   About yourself, about life, about what matters?\n\n`;
        response += `2. **How might this experience help you help others someday?**\n`;
        response += `   Your struggle could become your gift.\n\n`;
        response += `3. **What values is this transition clarifying?**\n`;
        response += `   Sometimes we don't know what we believe until we're tested.\n\n`;
        response += `4. **If you trusted that this is happening FOR you (not just TO you), what might the purpose be?**\n`;
        response += `   This isn't about toxic positivity - it's about agency.\n\n`;

        response += `---\n\n`;
        response += `*You don't have to find meaning right now. Sometimes meaning finds us when we're ready.*`;

        return response;
      },
    });
  },
};

// ============================================================================
// INTEGRATION TOOLS
// ============================================================================

/**
 * Create Transition Ritual - Design a meaningful ritual
 */
const createTransitionRitualDef: ToolDefinition = {
  id: 'createTransitionRitual',
  name: 'Create Transition Ritual',
  description: 'Design a ritual to mark the transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'ritual', 'ceremony', 'marking'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help create a meaningful ritual to mark an ending, beginning, or the in-between space of transition.',
      parameters: z.object({
        ritualType: z
          .enum(['ending', 'beginning', 'neutral_zone'])
          .describe('What phase of transition to mark'),
        theTransition: z.string().describe("What transition they're going through"),
        elements: z.string().optional().describe('Any specific elements they want included'),
      }),
      execute: async ({ ritualType, theTransition, elements }) => {
        const rituals =
          TRANSITION_RITUALS[
            ritualType === 'ending'
              ? 'endings'
              : ritualType === 'beginning'
                ? 'beginnings'
                : 'neutral_zone'
          ];

        let response = `**Creating a ${ritualType === 'ending' ? 'Closing' : ritualType === 'beginning' ? 'Beginning' : 'Holding'} Ritual for ${theTransition}**\n\n`;

        response += `Rituals help us mark what matters. They take internal experiences and give them external form.\n\n`;

        response += `**Ritual Ideas:**\n\n`;
        rituals.forEach((r) => {
          response += `**${r.name}**\n`;
          response += `${r.description}\n\n`;
        });

        if (elements) {
          response += `---\n\n`;
          response += `You mentioned wanting to include: ${elements}\n\n`;
          response += `That could be woven into any of these. What feels right?\n\n`;
        }

        response += `**Things that make rituals powerful:**\n`;
        response += `• Involve the body (movement, touch, physical objects)\n`;
        response += `• Include witnesses when possible\n`;
        response += `• Have a clear beginning, middle, and end\n`;
        response += `• Connect to your specific story and meaning\n`;
        response += `• Can be repeated or referenced later\n\n`;

        response += `Which of these resonates? Or would you like to design something custom?`;

        return response;
      },
    });
  },
};

/**
 * Preserve What Matters - Carrying forward intentionally
 */
const preserveWhatMattersDef: ToolDefinition = {
  id: 'preserveWhatMatters',
  name: 'Preserve What Matters',
  description: 'Identify what to carry forward through the transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'values', 'preservation', 'intentional'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user identify what they want to preserve and carry forward through this transition - values, relationships, practices, memories.',
      parameters: z.object({
        theTransition: z.string().describe("What transition they're going through"),
        whatMatters: z.string().optional().describe("What they've identified as mattering"),
      }),
      execute: async ({ theTransition, whatMatters }, { ctx: toolCtx }) => {
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'life-transitions',
          type: 'decision',
          summary: `User identifying what to preserve through: ${theTransition}`,
          emotionalWeight: 'medium',
          topics: ['values', 'preservation', 'intentional-transition'],
        });

        let response = `**What Matters Enough to Carry Forward**\n\n`;

        response += `Transition doesn't mean losing everything. Some things deserve to come with you.\n\n`;

        if (whatMatters) {
          response += `You've named: ${whatMatters}\n\n`;
          response += `That clarity is valuable. Let's deepen it.\n\n`;
        }

        response += `**Areas to consider:**\n\n`;

        response += `**Values** - What principles guide you? Which ones become MORE important in this transition?\n\n`;

        response += `**Relationships** - Who do you want to intentionally maintain through this change? Who needs to know they still matter to you?\n\n`;

        response += `**Practices** - What daily/weekly practices anchor you? Which ones serve who you're becoming?\n\n`;

        response += `**Memories** - What moments from the past chapter do you want to actively remember? How will you honor them?\n\n`;

        response += `**Parts of Yourself** - What qualities about yourself do you want to protect through this change?\n\n`;

        response += `---\n\n`;
        response += `Not everything from the past needs to come forward. But the things that matter deserve intention.`;

        return response;
      },
    });
  },
};

/**
 * Embrace Uncertainty - Tools for sitting with not-knowing
 */
const embraceUncertaintyDef: ToolDefinition = {
  id: 'embraceUncertainty',
  name: 'Embrace Uncertainty',
  description: 'Support for sitting with not-knowing during transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'uncertainty', 'unknown', 'patience'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'For when the uncertainty of transition feels overwhelming. Helps build capacity to sit with not-knowing.',
      parameters: z.object({
        whatFeelsUncertain: z.string().describe('What feels most uncertain'),
        howTheyreCoping: z
          .string()
          .optional()
          .describe("How they're currently coping with uncertainty"),
      }),
      execute: async ({ whatFeelsUncertain, howTheyreCoping }) => {
        let response = `**The Uncertainty of ${whatFeelsUncertain}**\n\n`;

        response += `Uncertainty is hard. Our brains crave closure, prediction, control.\n\n`;

        if (howTheyreCoping) {
          response += `You mentioned you're coping by: ${howTheyreCoping}\n`;
          response += `That's a survival strategy. It makes sense.\n\n`;
        }

        response += `**Things that help with uncertainty:**\n\n`;

        response += `**1. Distinguish what you CAN control from what you can't**\n`;
        response += `Focus energy on the can-control list. Release the rest.\n\n`;

        response += `**2. Shrink your time horizon**\n`;
        response += `Instead of "What will my life be?", try "What do I need today?"\n\n`;

        response += `**3. Name your worst-case scenario**\n`;
        response += `Often the fear of the unknown is worse than the known-fear. Name it.\n\n`;

        response += `**4. Find one fixed point**\n`;
        response += `What's true no matter what happens? One thing you know for sure?\n\n`;

        response += `**5. Practice "And I'll handle it"**\n`;
        response += `"I don't know what will happen... AND I'll handle it."\n\n`;

        response += `---\n\n`;
        const neutralWisdom = TRANSITION_STAGES.neutral_zone.guidance;
        response += `*"${neutralWisdom}"*\n\n`;

        response += `What do you KNOW is true, even in all this uncertainty?`;

        return response;
      },
    });
  },
};

/**
 * Adapt to New Normal - Practical adjustment support
 */
const adaptToNewNormalDef: ToolDefinition = {
  id: 'adaptToNewNormal',
  name: 'Adapt to New Normal',
  description: 'Practical support for adjusting to life after transition',
  domain: 'life-transitions',
  tags: ['life-transitions', 'adaptation', 'new-normal', 'practical'],
  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'For the practical work of adapting to a new reality - new routines, new identity, new normal.',
      parameters: z.object({
        whatChanged: z.string().describe('What major thing changed'),
        whatStruggling: z.string().optional().describe('What specific adjustments are hardest'),
        howLongSince: z.string().optional().describe('How long since the change'),
      }),
      execute: async ({ whatChanged, whatStruggling, howLongSince }) => {
        let response = `**Adapting to Life After ${whatChanged}**\n\n`;

        if (howLongSince) {
          response += `It's been ${howLongSince}. Every adaptation has its own timeline.\n\n`;
        }

        if (whatStruggling) {
          response += `You're finding ${whatStruggling} particularly hard. That's important to know.\n\n`;
        }

        response += `**Adaptation often requires:**\n\n`;

        response += `**New Routines**\n`;
        response += `What daily/weekly rhythms need to change? What new anchors can you create?\n\n`;

        response += `**New Language**\n`;
        response += `How do you introduce yourself now? What story do you tell about your life?\n\n`;

        response += `**New Environments**\n`;
        response += `Do you need different spaces, people, or contexts that fit who you're becoming?\n\n`;

        response += `**New Expectations**\n`;
        response += `What can you reasonably expect from yourself right now? What's too much too soon?\n\n`;

        response += `**Permission Slips**\n`;
        response += `What do you need permission to do (or not do) while you're adapting?\n\n`;

        response += `---\n\n`;
        response += `Adaptation isn't linear. You might feel like you've "got it" one day and lost it the next. That's normal.\n\n`;

        response += `What's one small thing you could change this week that would help you adapt?`;

        return response;
      },
    });
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Identify the type of transition based on description
 */
function identifyTransitionType(description: string): keyof typeof TRANSITION_TYPES {
  const lower = description.toLowerCase();

  // Check for loss indicators
  if (
    lower.includes('death') ||
    lower.includes('died') ||
    lower.includes('divorce') ||
    lower.includes('lost') ||
    lower.includes('laid off') ||
    lower.includes('diagnosis')
  ) {
    return 'loss_transition';
  }

  // Check for unwanted indicators
  if (
    lower.includes("didn't want") ||
    lower.includes('forced') ||
    lower.includes('unexpected') ||
    lower.includes('betrayal') ||
    lower.includes('aging parent')
  ) {
    return 'unwanted_transition';
  }

  // Check for beginning indicators
  if (
    lower.includes('new baby') ||
    lower.includes('married') ||
    lower.includes('getting married') ||
    lower.includes('new job') ||
    lower.includes('moving to') ||
    lower.includes('starting')
  ) {
    return 'beginning_transition';
  }

  // Check for growth indicators
  if (
    lower.includes('empty nest') ||
    lower.includes('turning 40') ||
    lower.includes('turning 50') ||
    lower.includes('birthday') ||
    lower.includes('midlife') ||
    lower.includes('growing up')
  ) {
    return 'growth_transition';
  }

  // Default to identity shift
  return 'identity_shift';
}

/**
 * Identify the stage of transition based on what they're experiencing
 */
function identifyTransitionStage(experiencing: string): keyof typeof TRANSITION_STAGES {
  const lower = experiencing.toLowerCase();

  // Check for ending stage indicators
  if (
    lower.includes('denial') ||
    lower.includes("can't believe") ||
    lower.includes('anger') ||
    lower.includes('grieving') ||
    lower.includes('loss') ||
    lower.includes('letting go')
  ) {
    return 'ending';
  }

  // Check for new beginning indicators
  if (
    lower.includes('energy') ||
    lower.includes('excited') ||
    lower.includes('hope') ||
    lower.includes('new sense') ||
    lower.includes('clarity') ||
    lower.includes('ready')
  ) {
    return 'new_beginning';
  }

  // Default to neutral zone (most common state)
  return 'neutral_zone';
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const lifeTransitionsTools: ToolDefinition[] = [
  // Recognition
  acknowledgeTransitionDef,
  transitionStageDef,
  // Processing
  grieveWhatWasDef,
  holdDualEmotionsDef,
  navigateAmbiguousLossDef,
  // Identity
  exploreIdentityShiftDef,
  whoAmIBecomingDef,
  honorWhoYouWereDef,
  // Meaning
  findMeaningInTransitionDef,
  // Integration
  createTransitionRitualDef,
  preserveWhatMattersDef,
  embraceUncertaintyDef,
  adaptToNewNormalDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'life-transitions',
  lifeTransitionsTools
);

export default getToolDefinitions;
