/**
 * Dating Domain
 *
 * Tools for navigating modern dating with intention and self-respect.
 * Dating should be discovery, not audition.
 *
 * DOMAIN: dating
 * PERSONA AFFINITY: Ferni (emotional support), Alex (communication)
 *
 * TOOLS:
 *   Preparation: datingIntentions, datingReadiness
 *   Navigation: healthyDating, redFlags, appFatigue
 *   Growth: datingRejection, afterDateReflection, communicatingNeeds
 *   Values: datingValues, dealbreakers
 *
 * PRINCIPLES:
 * - Date from wholeness, not lack
 * - Know your values and hold to them
 * - Red flags are information, not challenges
 * - Rejection is redirection
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// PhD-level research and persona methodology integration
import {
  getEnhancedToolContext,
  getOpeningPhrase,
  getValidationPhrase,
  buildResearchBackedResponse,
  getAttachmentContext,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// TOOL: Dating Intentions
// ============================================================================

const datingIntentionsDef: ToolDefinition = {
  id: 'datingIntentions',
  name: 'Dating Intentions',
  description: 'Clarify what you want from dating',
  domain: 'dating',
  tags: ['dating', 'intentions', 'clarity', 'goals'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('datingIntentions'),
      parameters: z.object({
        currentGoal: z
          .enum(['casual', 'serious', 'unsure', 'exploring'])
          .describe('What are you looking for'),
        whyDating: z.string().optional().describe('Why are you dating right now'),
      }),
      execute: async ({ currentGoal, whyDating }) => {
        log.info({ agentId: ctx.agentId, currentGoal }, 'Clarifying dating intentions');

        let response = '';

        response += '**Dating intentions:**\n\n';

        // Goal context
        const goalResponses: Record<string, string> = {
          casual:
            'Casual dating is valid. What matters is being honest about it - with yourself and others. No one should be misled about where you stand.',
          serious:
            'Looking for something serious means being ready to invest, be vulnerable, and potentially get hurt. It also means being selective and patient.',
          unsure:
            "It's okay to be unsure. Many people date to figure out what they want. Just be honest about this uncertainty.",
          exploring:
            "Exploration is healthy. You're learning about yourself and what you need. This is valuable data, not wasted time.",
        };

        response += `**About your goal (${currentGoal}):**\n`;
        response += goalResponses[currentGoal] + '\n\n';

        // Why dating
        if (whyDating) {
          response += `**You're dating because:** "${whyDating}"\n\n`;
          response += 'Check this motivation against these questions:\n';
          response += '• Is this about moving TOWARD something or AWAY from something?\n';
          response += '• Am I dating from wholeness or trying to fill a void?\n';
          response += '• Would I be okay if it took longer than expected?\n\n';
        }

        response += '**Key intention questions:**\n';
        response += '• What do I want to GIVE in a relationship (not just get)?\n';
        response += '• What kind of partner do I want to BE?\n';
        response += '• What does a successful relationship look like to me?\n';
        response += '• What are my non-negotiables?\n';
        response += '• What am I flexible on?\n\n';

        response += '**Healthy dating intentions:**\n';
        response += '• Getting to know yourself better through dating\n';
        response += '• Finding someone compatible (not just someone)\n';
        response += '• Enjoying the process, not just chasing the outcome\n';
        response += '• Being authentic rather than auditioning\n\n';

        response += '**Less healthy intentions (check yourself):**\n';
        response += '• Escaping loneliness\n';
        response += '• Proving worth through desirability\n';
        response += '• Distraction from life problems\n';
        response += '• Fear of being "left behind"\n\n';

        response += 'What do you most want from a partnership?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Dating Readiness
// ============================================================================

const datingReadinessDef: ToolDefinition = {
  id: 'datingReadiness',
  name: 'Dating Readiness',
  description: "Assess if you're ready to date",
  domain: 'dating',
  tags: ['dating', 'readiness', 'self-assessment', 'timing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('datingReadiness'),
      parameters: z.object({
        recentBreakup: z.boolean().optional().describe('Have you recently ended a relationship'),
        howLongAgo: z.string().optional().describe('How long since your last relationship'),
      }),
      execute: async ({ recentBreakup, howLongAgo }) => {
        log.info({ agentId: ctx.agentId }, 'Assessing dating readiness');

        let response = '';

        response += '**Are you ready to date?**\n\n';

        if (recentBreakup && howLongAgo) {
          response += `It's been ${howLongAgo} since your last relationship.\n`;
          response +=
            "There's no universal timeline. What matters is where you are emotionally.\n\n";
        }

        response += '**Signs you might be ready:**\n';
        response += "✓ You're content being single (dating from wholeness)\n";
        response += "✓ You've processed your last relationship\n";
        response += '✓ You know what you want (generally)\n';
        response += '✓ You have energy and bandwidth for someone new\n';
        response += "✓ Rejection won't devastate you\n";
        response += "✓ You're not trying to replace someone\n";
        response += "✓ You have a life you enjoy that you'd share\n\n";

        response += '**Signs you might not be ready:**\n';
        response += '✗ You\'re hoping someone will "complete" you\n';
        response += "✗ You're still comparing everyone to your ex\n";
        response += "✗ You're dating to distract from pain\n";
        response += '✗ You need validation to feel okay\n';
        response += "✗ You'd drop everything for any prospect\n";
        response += "✗ You're desperate, not interested\n\n";

        response += '**Post-breakup checklist:**\n';
        response += '• Have you processed the grief?\n';
        response += '• Do you understand what went wrong?\n';
        response += '• Have you done the work on your part?\n';
        response += '• Can you think of them without intense emotion?\n';
        response += '• Are you looking forward, not back?\n\n';

        response += '**Dating before ready:**\n';
        response += "Dating before you're ready often leads to:\n";
        response += '• Choosing poorly (anyone will do)\n';
        response += '• Projecting onto new people\n';
        response += '• Getting hurt more deeply\n';
        response += '• Hurting others who get involved\n\n';

        response += "There's no rush. Being happily single is better than unhappily dating.\n\n";

        response += 'Which of these signs resonates most with where you are?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Red Flags
// ============================================================================

const redFlagsDef: ToolDefinition = {
  id: 'datingRedFlags',
  name: 'Red Flags',
  description: 'Identify and respond to dating red flags',
  domain: 'dating',
  tags: ['dating', 'red-flags', 'warning', 'safety'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('datingRedFlags'),
      parameters: z.object({
        behavior: z.string().describe("The behavior you're concerned about"),
      }),
      execute: async ({ behavior }) => {
        log.info({ agentId: ctx.agentId }, 'Identifying red flags');

        let response = '';

        response += `**Assessing the behavior:** "${behavior}"\n\n`;

        response += 'Red flags are warning signs - not challenges to overcome.\n\n';

        response += '**Common early red flags:**\n';
        response += '• **Love bombing**: Excessive attention, "soulmate" talk early\n';
        response += "• **Moving too fast**: Pushing commitment/intimacy before you're ready\n";
        response += "• **Disrespecting boundaries**: Ignoring your no's\n";
        response += '• **All exes are "crazy"**: No self-awareness about past relationships\n';
        response += '• **Inconsistency**: Hot/cold, unreliable, mixed signals\n';
        response += '• **Jealousy/possessiveness**: Already acting territorial\n';
        response += '• **Pressure**: Making you feel guilty for your choices\n';
        response += '• **Isolation**: Criticizing your friends/family\n';
        response +=
          "• **Mean to service workers**: How they treat others = how they'll treat you\n\n";

        response += '**Deeper red flags:**\n';
        response += '• Never taking responsibility\n';
        response += '• Gaslighting (making you doubt your reality)\n';
        response += '• Contempt (eye-rolling, dismissing, mocking)\n';
        response += '• Unwillingness to communicate\n';
        response += '• Lying (even "small" lies)\n\n';

        response += '**About the specific behavior you mentioned:**\n';
        response += 'Ask yourself:\n';
        response += '• Does this respect my boundaries?\n';
        response += '• Is this how I want to be treated?\n';
        response += '• Would I advise a friend to accept this?\n';
        response += '• Is this a one-time thing or a pattern?\n';
        response += '• Am I making excuses for them?\n\n';

        response += '**When you see a red flag:**\n';
        response += "• Believe it. Don't explain it away.\n";
        response += '• Trust your gut, not their words.\n';
        response += '• Note that behavior rarely improves - it often gets worse.\n';
        response += "• You don't need to give chances to people showing you who they are.\n\n";

        response += '**Remember:**\n';
        response += 'When someone shows you who they are, believe them the first time.\n\n';

        response += 'What does your gut tell you about this behavior?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: App Fatigue
// ============================================================================

const appFatigueDef: ToolDefinition = {
  id: 'datingAppFatigue',
  name: 'App Fatigue',
  description: 'Address burnout from dating apps',
  domain: 'dating',
  tags: ['dating', 'apps', 'fatigue', 'burnout'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('datingAppFatigue'),
      parameters: z.object({
        currentState: z
          .enum(['exhausted', 'frustrated', 'cynical', 'discouraged', 'overwhelmed'])
          .describe('How you feel about dating apps'),
      }),
      execute: async ({ currentState }) => {
        log.info({ agentId: ctx.agentId, currentState }, 'Addressing app fatigue');

        let response = '';

        response += `**Dating app fatigue (${currentState}):**\n\n`;

        response += "You're not alone. App fatigue is nearly universal.\n\n";

        response += '**Why apps feel exhausting:**\n';
        response += '• Endless options create paradox of choice\n';
        response += '• Swiping commodifies people\n';
        response += '• Rejection feels constant\n';
        response += '• Conversations often go nowhere\n';
        response += '• It can feel like a second job\n';
        response += "• Algorithms don't understand compatibility\n\n";

        // State-specific
        const stateResponses: Record<string, string> = {
          exhausted:
            "Exhaustion means you've been giving too much to apps. They should be a small part of your dating life, not all of it. Take a real break.",
          frustrated:
            "Frustration is valid. Apps are not well-designed for finding genuine connection. They're designed to keep you swiping.",
          cynical:
            'Cynicism protects you but can also close you off. There are real people on apps - but the system makes connection hard.',
          discouraged:
            "Discouragement after effort makes sense. But your value isn't determined by app results. The app environment is abnormal, not you.",
          overwhelmed:
            'Overwhelm comes from too many options and too little meaning. Fewer, more intentional interactions help.',
        };

        response += `**About feeling ${currentState}:**\n`;
        response += stateResponses[currentState] + '\n\n';

        response += '**Healthy app boundaries:**\n';
        response += '• Set a time limit (e.g., 15 min/day max)\n';
        response += '• Quality over quantity (fewer matches, more attention)\n';
        response += '• Take breaks - delete when you need to\n';
        response += "• Don't use apps when lonely/bored/tipsy\n";
        response += "• Meet early - don't invest in text relationships\n\n";

        response += '**Alternatives to apps:**\n';
        response += '• Hobbies and classes\n';
        response += '• Friend setups\n';
        response += '• Community involvement\n';
        response += '• Events and gatherings\n';
        response += '• Being open in daily life\n\n';

        response += '**Permission:**\n';
        response += "You're allowed to quit apps entirely. ";
        response += 'People met partners before smartphones existed. They still do.\n\n';

        response += 'What would feel more sustainable for your dating life?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Dating Rejection
// ============================================================================

const datingRejectionDef: ToolDefinition = {
  id: 'datingRejection',
  name: 'Dating Rejection',
  description: 'Process rejection in dating',
  domain: 'dating',
  tags: ['dating', 'rejection', 'resilience', 'processing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('datingRejection'),
      parameters: z.object({
        whatHappened: z.string().describe('What happened'),
        feeling: z.string().describe('How you feel about it'),
      }),
      execute: async ({ whatHappened, feeling }) => {
        log.info({ agentId: ctx.agentId }, 'Processing dating rejection');

        let response = '';

        response += `**About what happened:** "${whatHappened}"\n`;
        response += `**You're feeling:** "${feeling}"\n\n`;

        response += "That's hard. Rejection stings, no matter the context.\n\n";

        response += '**The truth about rejection:**\n';
        response += "• It's not a measure of your worth\n";
        response += "• It's information about compatibility, not desirability\n";
        response += '• Better to know early than invest more\n';
        response += "• The right person won't reject you\n";
        response += "• You've probably also rejected people who didn't deserve it\n\n";

        response += '**Reframes:**\n';
        response += '• "They rejected the connection, not me as a person"\n';
        response += '• "This freed me to find someone who IS excited about me"\n';
        response += '• "Rejection is redirection"\n';
        response += '• "If they can\'t see my value, they\'re not my person"\n\n';

        response += '**What to do with the feeling:**\n';
        response += "• Let yourself feel it (don't suppress)\n";
        response += '• Talk to a friend\n';
        response += "• Don't over-analyze (you can't read their mind)\n";
        response += '• Don\'t reach out for "closure" (rarely helps)\n';
        response += '• Do something that makes you feel good\n\n';

        response += '**What NOT to do:**\n';
        response += '• Beg or try to convince them\n';
        response += '• Make it mean something about your worth\n';
        response += '• Give up on dating entirely\n';
        response += "• Rush into the next thing to prove you're desirable\n\n";

        response += '**Remember:**\n';
        response += "You're looking for ONE person. Not everyone has to want you. ";
        response += 'You just need mutual interest with one compatible person.\n\n';

        response += 'What would help you process this right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Dating Values
// ============================================================================

const datingValuesDef: ToolDefinition = {
  id: 'datingValues',
  name: 'Dating Values',
  description: 'Clarify your values for relationships',
  domain: 'dating',
  tags: ['dating', 'values', 'priorities', 'clarity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('datingValues'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Clarifying dating values');

        let response = '';

        response += '**Clarifying your relationship values:**\n\n';

        response += 'Knowing your values helps you choose wisely.\n\n';

        response += '**Core value categories:**\n\n';

        response += '**Communication style:**\n';
        response += '• Direct vs. gentle\n';
        response += '• Process together vs. alone first\n';
        response += '• Talk about everything vs. need privacy\n\n';

        response += '**Time together:**\n';
        response += '• Lots of together time vs. independent\n';
        response += '• Live together vs. separate spaces\n';
        response += '• Shared activities vs. separate interests\n\n';

        response += '**Life direction:**\n';
        response += '• Ambitious vs. content\n';
        response += '• Adventure vs. stability\n';
        response += '• Career-focused vs. relationship-focused\n';
        response += "• Want kids vs. don't\n\n";

        response += '**Emotional style:**\n';
        response += '• Express freely vs. regulated\n';
        response += '• Need reassurance vs. secure\n';
        response += '• Physical affection level\n\n';

        response += '**Lifestyle:**\n';
        response += '• Urban vs. rural\n';
        response += '• Social vs. homebodies\n';
        response += '• Health/fitness priority\n';
        response += '• Financial approach\n\n';

        response += '**Reflection questions:**\n';
        response += '• What made past relationships work or not?\n';
        response += '• What do you bring to a relationship?\n';
        response += '• What do you need from a partner?\n';
        response += '• What can you be flexible on?\n';
        response += '• What are your non-negotiables?\n\n';

        response += 'Which of these value areas is most important for you to align on?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Dealbreakers
// ============================================================================

const dealbreakersDef: ToolDefinition = {
  id: 'dealbreakers',
  name: 'Dealbreakers',
  description: 'Identify and hold to dealbreakers',
  domain: 'dating',
  tags: ['dating', 'dealbreakers', 'standards', 'boundaries'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('dealbreakers'),
      parameters: z.object({
        potentialDealbreaker: z
          .string()
          .optional()
          .describe("Something you're considering as a dealbreaker"),
      }),
      execute: async ({ potentialDealbreaker }) => {
        log.info({ potentialDealbreaker }, 'Working on dealbreakers');

        let response = '';

        response += '**Dealbreakers:**\n\n';

        response += 'Dealbreakers are non-negotiable. Knowing them protects you.\n\n';

        if (potentialDealbreaker) {
          response += `**You're considering:** "${potentialDealbreaker}"\n\n`;
          response += 'Is this a dealbreaker or a preference?\n';
          response += '• Dealbreaker: Fundamentally incompatible with your values/needs\n';
          response += "• Preference: You'd like it but can live without it\n\n";
        }

        response += '**Common legitimate dealbreakers:**\n';
        response += '• Different stance on kids\n';
        response += '• Incompatible life direction (location, career, lifestyle)\n';
        response += '• Active addiction (untreated)\n';
        response += '• Abuse or disrespect of any kind\n';
        response += '• Core value misalignment\n';
        response += '• Dishonesty\n';
        response += '• Lack of effort/investment\n\n';

        response += '**Questions to identify your dealbreakers:**\n';
        response += "• What did I tolerate before that I won't again?\n";
        response += '• What would make me fundamentally unhappy long-term?\n';
        response += "• What can't be compromised without losing myself?\n";
        response += "• What's non-negotiable for the life I want?\n\n";

        response += '**The challenge:**\n';
        response += "When you meet someone you like, it's tempting to negotiate on dealbreakers.\n";
        response += '"Maybe I could be okay with..." is a warning sign.\n';
        response += 'Dealbreakers exist for a reason. Trust past-you.\n\n';

        response += '**Holding the line:**\n';
        response += "• Know your dealbreakers before you're emotionally invested\n";
        response += '• When a dealbreaker appears, trust it\n';
        response += "• Don't convince yourself they'll change\n";
        response +=
          '• Scarcity thinking makes us negotiate; abundance thinking holds boundaries\n\n';

        response += 'What are your dealbreakers, and have you ever compromised on them?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: After Date Reflection
// ============================================================================

const afterDateReflectionDef: ToolDefinition = {
  id: 'afterDateReflection',
  name: 'After Date Reflection',
  description: 'Reflect on a date to understand what you learned',
  domain: 'dating',
  tags: ['dating', 'reflection', 'learning', 'assessment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('afterDateReflection'),
      parameters: z.object({
        howItWent: z.enum(['good', 'okay', 'bad', 'unsure']).describe('How do you think it went'),
        howYouFelt: z.string().describe('How did you feel during/after'),
      }),
      execute: async ({ howItWent, howYouFelt }) => {
        log.info({ agentId: ctx.agentId, howItWent }, 'Post-date reflection');

        let response = '';

        response += `**Date reflection (${howItWent}):**\n\n`;
        response += `You felt: "${howYouFelt}"\n\n`;

        response += '**Check-in questions:**\n\n';

        response += '**About them:**\n';
        response += '• Were they genuinely curious about you?\n';
        response += '• Did they respect your boundaries?\n';
        response += '• Were they kind (to you, to servers, etc.)?\n';
        response += '• Did you have to perform or could you be yourself?\n';
        response += '• Did they ask questions or only talk about themselves?\n\n';

        response += '**About you:**\n';
        response += '• Did you show up authentically?\n';
        response += '• Were you present or anxious?\n';
        response += '• Did you people-please or stay true to yourself?\n';
        response += '• Were you curious about them or performing?\n\n';

        response += '**About the connection:**\n';
        response += '• Was conversation easy or forced?\n';
        response += '• Did you laugh genuinely?\n';
        response += '• Did you feel seen?\n';
        response += '• Is there genuine curiosity to know more?\n\n';

        // Based on how it went
        const wentResponses: Record<string, string> = {
          good: "If it went well:\n• Enjoy it! But stay curious, not attached\n• One good date doesn't mean soulmate\n• Keep learning about them\n• Don't project a future yet",
          okay: "If it was just okay:\n• 'Okay' often means 'not right'\n• Some people grow on you; many don't\n• Trust lukewarm feelings - they're information",
          bad: "If it went badly:\n• You got data; that's valuable\n• It's one date, not your dating life\n• What specifically felt off? Learn from it\n• Not every date will be good - that's normal",
          unsure:
            "If you're unsure:\n• What's creating the uncertainty?\n• Is it about them or about yourself?\n• Sometimes a second date clarifies\n• Trust your gut more than your analysis",
        };

        response += `**${wentResponses[howItWent]}**\n\n`;

        response += '**Key question:**\n';
        response += "Do you want to see them again because you're genuinely curious about them, ";
        response += 'or because you want to be wanted?\n\n';

        response += "What's your honest assessment?";

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const datingTools: ToolDefinition[] = [
  datingIntentionsDef,
  datingReadinessDef,
  redFlagsDef,
  appFatigueDef,
  datingRejectionDef,
  datingValuesDef,
  dealbreakersDef,
  afterDateReflectionDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'dating',
  datingTools
);

export default getToolDefinitions;
