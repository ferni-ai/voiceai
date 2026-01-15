/**
 * Empty Nest Domain
 *
 * Tools for navigating the transition when children leave home.
 * A profound identity shift that society often minimizes.
 *
 * DOMAIN: empty-nest
 * PERSONA AFFINITY: Ferni (emotional), Nayan (wisdom), Jordan (planning)
 *
 * TOOLS:
 *   Grief: emptyNestGrief, lastChildLeaving
 *   Identity: rediscoverYourself, couplesRediscovery
 *   Growth: freedomAfterKids, newPurpose
 *
 * PRINCIPLES:
 * - Empty nest grief is real grief
 * - Your purpose was never only your children
 * - Relationships transform, they don't have to end
 * - This is an ending AND a beginning
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { addCrossPersonaInsight } from '../../../services/cross-persona/cross-persona-insights.js';

const log = getLogger();

// ============================================================================
// TOOL: Empty Nest Grief
// ============================================================================

const emptyNestGriefDef: ToolDefinition = {
  id: 'emptyNestGrief',
  name: 'Empty Nest Grief',
  description: 'Process the grief of children leaving home',
  domain: 'empty-nest',
  tags: ['empty-nest', 'grief', 'transition', 'identity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('emptyNestGrief'),
      parameters: z.object({
        situation: z.string().optional().describe('Your specific situation'),
        howLongEmpty: z.string().optional().describe('How long your nest has been empty'),
      }),
      execute: async ({ situation, howLongEmpty }) => {
        const userId = ctx.userId;
        log.debug({ userId, howLongEmpty }, '[empty-nest] grief');

        const response = `Empty nest grief is real grief. Your sadness is not an overreaction.

${situation ? `**Your situation:** "${situation}"` : ''}
${howLongEmpty ? `**Time since:** ${howLongEmpty}` : ''}

**What You're Actually Grieving:**

- The daily presence of your children
- Being needed in that constant, urgent way
- Your identity as a hands-on parent
- The family life you created
- The childhood years that are over
- The noise, chaos, and life in the house
- Your purpose (or a major part of it)
- Your youth (they growing up = you aging)

**Why Society Doesn't Get It:**

"Shouldn't you be happy for them?"
"At least you have freedom now!"
"They're only a phone call away!"

These dismissals hurt because they minimize a profound loss. You can be proud of them AND grieve. Both are true.

**The Ambiguity:**

This grief is complicated because:
- They're not dead - just gone
- You wanted them to launch - and it still hurts
- Society expects you to celebrate
- You might feel guilty for being sad
- The "success" of parenting = they leave you

**What's Normal:**

| Experience | Frequency |
|------------|-----------|
| Crying unexpectedly | Very common |
| Walking past their room and feeling loss | Universal |
| Looking at old photos compulsively | Common |
| Feeling purposeless | Common |
| Relief mixed with grief | Common |
| Relationship strain with partner | Common |

**The Timeline:**

- **Anticipatory grief**: Starts months before they leave
- **Acute phase**: First weeks/months of empty house
- **Adjustment**: 6-18 months
- **New normal**: Eventually, but it takes time

**What Helps:**

1. **Name it as grief** - This is loss, treat it as such
2. **Let yourself feel it** - Crying is appropriate
3. **Don't rush** - "Moving on" has no deadline
4. **Find witnesses** - Others who understand
5. **Rediscover yourself** - But gently, not as a fix

**The Reframe:**

Your job was to raise humans who could leave. If they can leave, you succeeded. The grief is the cost of having done it well.

What part of this grief is most present for you today?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Rediscover Yourself
// ============================================================================

const rediscoverYourselfDef: ToolDefinition = {
  id: 'rediscoverYourself',
  name: 'Rediscover Yourself',
  description: 'Reconnect with who you are beyond being a parent',
  domain: 'empty-nest',
  tags: ['empty-nest', 'identity', 'self-discovery', 'purpose'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('rediscoverYourself'),
      parameters: z.object({
        yearsAsParent: z.string().optional().describe("How long you've been focused on parenting"),
        whatYouMiss: z.string().optional().describe('What you miss about pre-kid you'),
      }),
      execute: async ({ yearsAsParent, whatYouMiss }) => {
        const userId = ctx.userId;
        log.debug({ userId, yearsAsParent }, '[empty-nest] rediscover');

        const response = `After years of being "mom" or "dad," finding yourself again takes time.

${yearsAsParent ? `**Years of parenting focus:** ${yearsAsParent}` : ''}
${whatYouMiss ? `**What you miss:** "${whatYouMiss}"` : ''}

**The Identity Question:**

Who am I now that I'm not needed in the same way?

This question is scary because for years, your identity was woven into:
- School schedules
- Their activities
- Their problems
- Their needs
- Their presence

**Excavation Questions:**

**Before kids, who were you?**
- What did you love doing?
- What were your dreams?
- What made you feel most alive?
- Who were your friends?

**During parenting, what got buried?**
- What hobbies did you give up?
- What dreams did you defer?
- What parts of yourself did you shelve?

**Now, what calls to you?**
- What have you always wanted to try?
- What would you do with a free weekend?
- What makes time disappear?
- What would you regret NOT doing?

**Reintegration Ideas:**

| Area | Exploration |
|------|-------------|
| **Creative** | Art, writing, music you abandoned |
| **Physical** | Activities you couldn't do as carpool parent |
| **Social** | Friendships that were sidelined |
| **Career** | Professional goals you paused |
| **Adventure** | Travel, experiences you couldn't manage |
| **Learning** | Topics you're curious about |

**The Permission:**

You don't have to know who you are now. You get to explore. You get to try things and quit. You get to be a beginner.

**A Caution:**

Don't rush into filling the emptiness with busyness. Sometimes the emptiness needs to be felt before it can be filled meaningfully.

**The Truth:**

You're not starting over. You're continuing - as a fuller version of yourself who now includes "parent of adult children" but isn't limited to it.

What sounds most intriguing to explore?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'jordan',
          priority: 'normal',
          content: `Empty nester exploring identity rediscovery. May want to set new goals.`,
          category: 'empty-nest-rediscovery',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Couples Rediscovery
// ============================================================================

const couplesRediscoveryDef: ToolDefinition = {
  id: 'couplesRediscovery',
  name: 'Couples Rediscovery',
  description: 'Reconnect with partner after kids leave',
  domain: 'empty-nest',
  tags: ['empty-nest', 'relationship', 'partnership', 'reconnection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('couplesRediscovery'),
      parameters: z.object({
        currentState: z.string().optional().describe('How your relationship feels now'),
        concerns: z.string().optional().describe('What worries you about the relationship'),
      }),
      execute: async ({ currentState, concerns }) => {
        const userId = ctx.userId;
        log.debug({ userId, currentState }, '[empty-nest] couples');

        const response = `When kids leave, couples often realize: who ARE we without them?

${currentState ? `**Current state:** "${currentState}"` : ''}
${concerns ? `**Concerns:** "${concerns}"` : ''}

**The Empty Nest Couple Reality:**

For years, you've been:
- Parenting team
- Schedule coordinators
- Chauffeurs and coaches
- Problem solvers for kids
- Roommates managing a household

Now you're: Just two people. Looking at each other.

**Common Experiences:**

| Experience | What It Means |
|------------|---------------|
| "We're strangers" | You focused on kids, not each other |
| "Nothing to talk about" | Kids were the shared topic |
| "Why are we still together?" | An honest question that deserves exploration |
| "We've grown apart" | People change over 20 years |
| "This could be exciting" | Some couples thrive |

**Two Paths:**

**1. The Crisis Path:**
Realizing the marriage was held together by kids leads to gray divorce, affairs, or slow estrangement.

**2. The Renewal Path:**
Using this transition to genuinely reconnect and build a new chapter together.

**Reconnection Strategies:**

1. **Date like it's new** - Actually plan dates, not just coexisting
2. **Share curiosities** - Learn new things together
3. **Travel without kid logistics** - Spontaneous trips
4. **Address the distance** - Talk about what happened
5. **Create new rituals** - Just for the two of you
6. **Physical reconnection** - Intimacy without listening for kids

**The Hard Conversation:**

If you're questioning the marriage, that conversation is important to have - with a therapist if needed.

Questions to explore:
- Do we WANT to be together, or just ARE we together?
- What do we enjoy about each other?
- What kind of relationship do we want now?
- What needs to change?

**If the Answer is Uncertain:**

Gray divorce is increasingly common. Staying for kids is over. But before deciding:
- Get couples therapy
- Explore what's possible
- Make the decision intentionally, not reactively

**If the Answer is Yes:**

This can be a beautiful chapter. The "empty" nest can become full of things you couldn't do before.

What feels most true about your relationship right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Freedom After Kids
// ============================================================================

const freedomAfterKidsDef: ToolDefinition = {
  id: 'freedomAfterKids',
  name: 'Freedom After Kids',
  description: 'Embrace the opportunities of post-parenting life',
  domain: 'empty-nest',
  tags: ['empty-nest', 'freedom', 'opportunity', 'growth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('freedomAfterKids'),
      parameters: z.object({
        excitingAbout: z.string().optional().describe('What excites you about this freedom'),
        guiltyAbout: z.string().optional().describe('What you feel guilty about enjoying'),
      }),
      execute: async ({ excitingAbout, guiltyAbout }) => {
        const userId = ctx.userId;
        log.debug({ userId, excitingAbout }, '[empty-nest] freedom');

        const response = `It's okay to grieve AND feel excited about freedom. Both are real.

${excitingAbout ? `**What excites you:** "${excitingAbout}"` : ''}
${guiltyAbout ? `**Guilt about enjoying:** "${guiltyAbout}"` : ''}

**The Freedoms:**

Things you can do now that you couldn't before:

| Before | After |
|--------|-------|
| Coordinating 4+ schedules | Your schedule is YOURS |
| Kid-friendly vacations | Go anywhere |
| Constant availability | Actual free time |
| Worrying about them constantly | They're adults now |
| House rules for teens | Your house, your rules |
| Every decision considered them | Decisions for YOU |
| Financial kid costs | (Eventually) More money |
| Noise, mess, chaos | Quiet when you want it |

**The Permission:**

You are ALLOWED to enjoy this. Enjoying freedom doesn't mean:
- You don't love your kids
- You don't miss them
- You're a bad parent
- You're selfish

It means you're human, and humans need freedom.

**The Guilt:**

${
  guiltyAbout
    ? `
You mentioned guilt about "${guiltyAbout}."

This guilt makes sense. But consider: Would you want your kids to feel guilty about living their lives? Probably not. The same grace applies to you.`
    : `
If you feel guilty about enjoying the quiet, the freedom, the "you" time - that's parenting conditioning. You were trained to put them first. Now it's okay to put yourself first sometimes.`
}

**What to Do With Freedom:**

**Short-term:**
- Spontaneous plans
- Sleep in on weekends
- Eat what/when you want
- Leave dishes for later
- Loud music, silence, whatever you want

**Long-term:**
- Travel you couldn't do
- Career pivots
- Education/learning
- New hobbies or old ones reclaimed
- Relationships (romantic, friendships)
- Volunteer work
- Adventure and risk

**A Perspective:**

The best thing you can model for your adult children is parents who live full lives. That's not abandonment - it's demonstration.

What freedom do you most want to explore?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const emptyNestTools = [
  emptyNestGriefDef,
  rediscoverYourselfDef,
  couplesRediscoveryDef,
  freedomAfterKidsDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'empty-nest',
  emptyNestTools
);

export default getToolDefinitions;
