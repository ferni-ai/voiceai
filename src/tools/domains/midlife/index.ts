/**
 * Midlife Domain
 *
 * Tools for navigating the unique challenges and opportunities of midlife.
 * Midlife isn't crisis - it can be awakening.
 *
 * DOMAIN: midlife
 * PERSONA AFFINITY: Nayan (wisdom), Ferni (support)
 *
 * TOOLS:
 *   Reflection: midlifeReckoning, legacyBuilding
 *   Transitions: reinventionMidlife, emptyNest
 *   Meaning: secondHalfPurpose
 *
 * PRINCIPLES:
 * - Midlife is reorientation, not decline
 * - Mortality awareness can catalyze meaning
 * - It's never too late for a new chapter
 * - The second half can be the best half
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
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// TOOL: Midlife Reckoning
// ============================================================================

const midlifeReckoningDef: ToolDefinition = {
  id: 'midlifeReckoning',
  name: 'Midlife Reckoning',
  description: 'Navigate the existential questions of midlife',
  domain: 'midlife',
  tags: ['midlife', 'meaning', 'reflection', 'existential'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('midlifeReckoning'),
      parameters: z.object({
        trigger: z.string().optional().describe("What's prompted this reflection"),
      }),
      execute: async ({ trigger }) => {
        log.info({ agentId: ctx.agentId }, 'Midlife reckoning');

        let response = '';

        response += '**Midlife reckoning:**\n\n';

        if (trigger) {
          response += `What's prompted this: "${trigger}"\n\n`;
        }

        response += 'Midlife often brings a reckoning - a moment when the questions ';
        response += "you've been avoiding show up and demand attention.\n\n";

        response += '**Common midlife questions:**\n';
        response += '• Is this all there is?\n';
        response += '• Did I make the right choices?\n';
        response += '• What do I actually want?\n';
        response += '• How did I get here?\n';
        response += '• Who am I now that [kids are grown/career peaked/etc.]?\n';
        response += '• How do I want to spend my remaining years?\n';
        response += '• What really matters to me?\n\n';

        response += "**What's actually happening:**\n";
        response += '• Time feels finite in a new way\n';
        response += '• The "arrival" didn\'t feel like you expected\n';
        response += '• Old identities are shifting\n';
        response += '• Bodies are changing\n';
        response += '• Parents are aging/dying\n';
        response += '• Children are leaving\n';
        response += '• The future contracts while the past expands\n\n';

        response += "**This isn't crisis - it's awakening:**\n";
        response += '• The restlessness is calling you somewhere\n';
        response += '• The questions are invitations\n';
        response += '• Disillusionment precedes realignment\n';
        response += "• You're not falling apart - you're reorganizing\n\n";

        response += '**The opportunity:**\n';
        response += 'Midlife offers something rare: perspective AND time. ';
        response += 'You know things now. And you have years to live by that wisdom.\n\n';

        response += 'What question is most alive for you right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Second Half Purpose
// ============================================================================

const secondHalfPurposeDef: ToolDefinition = {
  id: 'secondHalfPurpose',
  name: 'Second Half Purpose',
  description: 'Find meaning and purpose for the second half of life',
  domain: 'midlife',
  tags: ['midlife', 'purpose', 'meaning', 'calling'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('secondHalfPurpose'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Second half purpose');

        let response = '';

        response += '**Finding purpose in the second half:**\n\n';

        response += 'The first half of life is often about building - career, family, identity. ';
        response += "The second half is about meaning - what matters, what lasts, what's real.\n\n";

        response += '**First half vs. second half (Richard Rohr):**\n\n';
        response += '| First Half | Second Half |\n';
        response += '|------------|-------------|\n';
        response += '| Building identity | Letting go of ego |\n';
        response += '| Acquiring | Releasing |\n';
        response += '| Success | Significance |\n';
        response += '| What I do | Who I am |\n';
        response += '| Proving | Being |\n\n';

        response += '**Questions for second half purpose:**\n';
        response += "• What have I learned that's worth sharing?\n";
        response += '• What gifts have I neglected?\n';
        response += '• What would I regret not doing?\n';
        response += '• Who needs what only I can offer?\n';
        response += '• What injustice can I no longer ignore?\n';
        response += '• What does my life want to be about now?\n\n';

        response += '**Second half callings often include:**\n';
        response += '• Mentoring/teaching younger people\n';
        response += '• Giving back/service\n';
        response += '• Creative expression\n';
        response += '• Healing/completion work\n';
        response += '• Relationships over achievements\n';
        response += '• Legacy building\n';
        response += '• Inner work deferred from first half\n\n';

        response += '**The shift:**\n';
        response += 'From: "What can I get?" → "What can I give?"\n';
        response += 'From: "How do I look?" → "What have I learned?"\n';
        response += 'From: "Am I successful?" → "Am I meaningful?"\n\n';

        response += "What's calling you in this chapter?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Reinvention at Midlife
// ============================================================================

const reinventionMidlifeDef: ToolDefinition = {
  id: 'reinventionMidlife',
  name: 'Reinvention at Midlife',
  description: 'Support for reinventing yourself in midlife',
  domain: 'midlife',
  tags: ['midlife', 'reinvention', 'change', 'new-chapter'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('reinventionMidlife'),
      parameters: z.object({
        area: z
          .enum(['career', 'relationship', 'lifestyle', 'identity', 'general'])
          .describe('Area of reinvention'),
      }),
      execute: async ({ area }) => {
        log.info({ agentId: ctx.agentId, area }, 'Midlife reinvention');

        let response = '';

        response += `**Midlife reinvention (${area}):**\n\n`;

        response += "It's not too late. You're not stuck. The second chapter can be different.\n\n";

        const areaAdvice: Record<string, string> = {
          career:
            "**Career reinvention:**\n\n• Your experience is transferable (more than you think)\n• Network beats resume at this stage\n• What do you know that younger people don't?\n• Consider: encore careers, consulting, teaching\n• Financial runway is key - plan the bridge\n• Start exploring while still employed\n• It doesn't have to be radical - evolution counts",
          relationship:
            "**Relationship reinvention:**\n\n• Long relationships can be renewed\n• Single at midlife: you know yourself better now\n• What do you want in a partner NOW, not 20 years ago?\n• Patterns can change\n• Intimacy is possible at any age\n• The relationship you want requires being the partner you'd want",
          lifestyle:
            '**Lifestyle reinvention:**\n\n• Where do you want to live?\n• How do you want to spend your days?\n• What routines no longer serve you?\n• What have you always wanted to try?\n• Less stuff, more experience?\n• Health investments pay dividends now\n• You have permission to live differently',
          identity:
            '**Identity reinvention:**\n\n• You are not just your roles (parent, professional, etc.)\n• Who are you apart from what you do?\n• What parts of yourself have you suppressed?\n• What would younger you be surprised by?\n• You can become someone new\n• Identity is a practice, not a fixed point',
          general:
            "**Reinvention principles:**\n\n• Start before you're ready\n• Experiment, don't commit prematurely\n• Leverage what you know\n• Connect with others who've done it\n• Expect the messy middle\n• Small changes compound\n• You have more options than you think",
        };

        response += areaAdvice[area] + '\n\n';

        response += '**Common fears (and truths):**\n';
        response += '• "It\'s too late" → Many do their best work in 50s-70s\n';
        response += '• "I\'m too old to start over" → You have 30+ years ahead\n';
        response += '• "What will people think?" → They\'re not thinking about you\n';
        response += "• \"I'll lose what I've built\" → You might also gain what you've missed\n\n";

        response += '**Starting:**\n';
        response += "You don't have to know the destination. Just take the first step. ";
        response += "What's one small thing you could do this week toward a new chapter?\n\n";

        response += 'What does reinvention look like for you?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Empty Nest
// ============================================================================

const emptyNestDef: ToolDefinition = {
  id: 'emptyNest',
  name: 'Empty Nest',
  description: 'Navigate the transition when children leave home',
  domain: 'midlife',
  tags: ['midlife', 'empty-nest', 'parenting', 'transition'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('emptyNest'),
      parameters: z.object({
        stage: z
          .enum(['approaching', 'just-happened', 'adjusting', 'struggling'])
          .describe('Where are you in the process'),
      }),
      execute: async ({ stage }) => {
        log.info({ agentId: ctx.agentId, stage }, 'Empty nest support');

        let response = '';

        response += `**Empty nest transition (${stage}):**\n\n`;

        const stageResponses: Record<string, string> = {
          approaching:
            '**The empty nest is coming:**\n\n• It\'s normal to grieve in advance\n• Start building your identity beyond "parent"\n• Reconnect with your partner (if applicable)\n• Develop interests that are just yours\n• Prepare practically (finances, space)\n• Treasure these final moments\n• It\'s a transition, not an ending',
          'just-happened':
            "**They just left:**\n\n• The quiet is loud at first\n• Grief is normal and expected\n• Don't fill the void immediately - feel it\n• This is a major life transition\n• It's okay to cry in their empty room\n• Call/text them - but give space too\n• Take it one day at a time",
          adjusting:
            "**Adjusting to the new reality:**\n\n• You're building a new normal\n• The relationship with your child is evolving\n• Rediscover who you are outside parenting\n• Invest in other relationships\n• What have you been putting off?\n• Your life is still meaningful\n• This stage has gifts too",
          struggling:
            '**Struggling with the empty nest:**\n\n• This is harder than many expect\n• Prolonged grief may need support (therapy)\n• Don\'t pressure yourself to "be okay"\n• Your identity was deeply tied to parenting\n• Depression/anxiety are common - seek help\n• You haven\'t lost them - the relationship changed\n• What else gives your life meaning?',
        };

        response += stageResponses[stage] + '\n\n';

        response += '**The grief is real:**\n';
        response += "You're grieving:\n";
        response += '• Daily presence\n';
        response += '• Being needed in that way\n';
        response += '• The identity of active parenting\n';
        response += '• That particular chapter\n';
        response += '• Their childhood\n\n';

        response += '**The opportunity is also real:**\n';
        response += 'You gain:\n';
        response += '• Time for yourself\n';
        response += "• Freedom you haven't had in years\n";
        response += '• Adult relationship with your child\n';
        response += '• Space to rediscover yourself/partner\n';
        response += '• New chapters to write\n\n';

        response += 'Both can be true. What do you most need right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Legacy Building
// ============================================================================

const legacyBuildingDef: ToolDefinition = {
  id: 'legacyBuilding',
  name: 'Legacy Building',
  description: 'Consider what legacy you want to leave',
  domain: 'midlife',
  tags: ['midlife', 'legacy', 'meaning', 'contribution'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('legacyBuilding'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Legacy building');

        let response = '';

        response += '**Building your legacy:**\n\n';

        response += "Legacy isn't just what you leave behind. It's how you live now.\n\n";

        response += '**Types of legacy:**\n\n';

        response += '**1. Values legacy:**\n';
        response += 'What values do you want to model and pass on?\n';
        response += 'These live through how you treat people daily.\n\n';

        response += '**2. Knowledge legacy:**\n';
        response += "What have you learned that's worth sharing?\n";
        response += 'Mentoring, teaching, writing, creating.\n\n';

        response += '**3. Relationship legacy:**\n';
        response += 'The quality of your relationships IS your legacy.\n';
        response += 'How do people feel around you?\n\n';

        response += '**4. Contribution legacy:**\n';
        response += 'What problem can you help solve?\n';
        response += 'Service, giving, building something that helps others.\n\n';

        response += '**5. Creative legacy:**\n';
        response += 'What can you create that outlasts you?\n';
        response += 'Art, writing, businesses, gardens, anything made with intention.\n\n';

        response += '**Legacy questions:**\n';
        response += '• What do you want to be remembered for?\n';
        response += '• What are you doing that will matter in 50 years?\n';
        response += '• What have you always wanted to contribute?\n';
        response += '• Who can you help that no one else is positioned to help?\n';
        response += "• What do you know now that you wish you'd known earlier?\n\n";

        response += '**The daily legacy:**\n';
        response += "Legacy isn't built in grand gestures. It's built in:\n";
        response += '• How you treat the waiter\n';
        response += '• The conversations you have with your kids\n';
        response += '• The integrity of your work\n';
        response += '• The kindness you show strangers\n';
        response += '• How you show up in hard moments\n\n';

        response += 'What do you want your legacy to be?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const midlifeTools: ToolDefinition[] = [
  midlifeReckoningDef,
  secondHalfPurposeDef,
  reinventionMidlifeDef,
  emptyNestDef,
  legacyBuildingDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'midlife',
  midlifeTools
);

export default getToolDefinitions;
