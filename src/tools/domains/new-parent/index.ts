/**
 * New Parent Domain
 *
 * Tools for navigating the profound identity shift of becoming a parent.
 * The biggest life change that no one truly prepares you for.
 *
 * DOMAIN: new-parent
 * PERSONA AFFINITY: Ferni (emotional), Maya (routines), Jordan (planning)
 *
 * TOOLS:
 *   Identity: parentIdentityShift, momsenseOfSelf, dadsenseOfSelf
 *   Survival: newParentSurvival, sleepDeprivation
 *   Relationship: relationshipAfterBaby, parentingConflicts
 *
 * PRINCIPLES:
 * - Becoming a parent is both joy and grief
 * - Sleep deprivation is a form of torture - be gentle
 * - Your relationship will change - that's normal
 * - "Good enough" parenting IS good parenting
 *
 * RESEARCH BASIS:
 * - Maternal mental health (Winnicott's "good enough mother")
 * - Perinatal mood disorders
 * - Transition to parenthood research (Gottman)
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { addCrossPersonaInsight } from '../../../services/cross-persona-insights.js';

const log = getLogger();

// ============================================================================
// TOOL: Parent Identity Shift
// ============================================================================

const parentIdentityShiftDef: ToolDefinition = {
  id: 'parentIdentityShift',
  name: 'Parent Identity Shift',
  description: 'Navigate the profound identity transformation of becoming a parent',
  domain: 'new-parent',
  tags: ['new-parent', 'identity', 'transition', 'matrescence'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('parentIdentityShift'),
      parameters: z.object({
        babyAge: z.string().optional().describe("Baby's age (newborn, 3 months, etc.)"),
        whatFeelsLost: z.string().optional().describe('What part of yourself feels lost'),
        parentType: z.enum(['mom', 'dad', 'non-binary-parent', 'adoptive-parent']).optional(),
      }),
      execute: async ({ babyAge, whatFeelsLost, parentType }) => {
        const userId = ctx.userId;
        log.debug({ userId, babyAge, parentType }, '[new-parent] identity shift');

        const response = `Becoming a parent isn't just adding a role - it's a complete identity transformation.

${babyAge ? `**Baby's age:** ${babyAge}` : ''}
${whatFeelsLost ? `**What feels lost:** "${whatFeelsLost}"` : ''}

**What's Actually Happening:**

There's a word for this transformation: **Matrescence** (for mothers) - as profound as adolescence. Dads go through it too. It's neurological, hormonal, psychological, and existential.

**The Grief Hidden in Joy:**

Even if you wanted this baby desperately, you're still grieving:
- Your old identity
- Your freedom and spontaneity
- Your relationship as it was
- Your body (for birthing parents)
- Your sleep
- Your sense of competence
- Time that was your own

**This grief is normal. It doesn't mean you don't love your baby.**

**Common Feelings (All Normal):**

| Feeling | What It Means |
|---------|---------------|
| "I don't recognize myself" | Identity is reconstructing |
| "I miss my old life" | Grief for what was |
| "Am I doing this right?" | Your brain is learning |
| "I love them but sometimes resent them" | You're human |
| "My partner feels like a stranger" | You're both transforming |

${
  parentType === 'mom'
    ? `
**For Mothers:**
You're not "mom-brained" - your brain literally restructured. This is one of the biggest neurological changes a human can undergo. You're not broken. You're becoming.

If you're experiencing more than "baby blues" - persistent sadness, anxiety, intrusive thoughts - please reach out. Postpartum mood disorders are common and treatable.`
    : ''
}

${
  parentType === 'dad'
    ? `
**For Fathers:**
Your identity shift is real too, even if society doesn't name it. You're not "just helping" - you're becoming a father. That's huge. Paternal postpartum depression is real and underdiagnosed.`
    : ''
}

**What Helps:**

1. **Name the grief** - It's real, even amid joy
2. **Lower the bar** - "Good enough" is the goal
3. **Find your people** - Other new parents understand
4. **Micro-moments of self** - Even 5 minutes of "you"
5. **Let your partner have their journey** - You're both transforming

**A Truth:**

You won't "get yourself back." You'll become a new self - one who is also a parent. And that person can be wonderful too, just different.

What part of this feels most true for you right now?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'maya',
          priority: 'normal',
          content: `New parent processing identity shift. Support with gentle routines.`,
          category: 'new-parent-identity',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: New Parent Survival
// ============================================================================

const newParentSurvivalDef: ToolDefinition = {
  id: 'newParentSurvival',
  name: 'New Parent Survival',
  description: 'Survival strategies for the hardest early weeks/months',
  domain: 'new-parent',
  tags: ['new-parent', 'survival', 'exhaustion', 'practical'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('newParentSurvival'),
      parameters: z.object({
        biggestStruggle: z.string().optional().describe("What's hardest right now"),
        supportLevel: z.enum(['alone', 'some-help', 'good-support']).optional(),
      }),
      execute: async ({ biggestStruggle, supportLevel }) => {
        const userId = ctx.userId;
        log.debug({ userId, biggestStruggle }, '[new-parent] survival');

        const response = `The early weeks are survival mode. You're not failing - you're in the trenches.

${biggestStruggle ? `**Biggest struggle:** "${biggestStruggle}"` : ''}

**Survival Priorities (In Order):**

1. **Keep baby alive** ✓ (You're doing this)
2. **Keep yourself fed and hydrated**
3. **Sleep when you can**
4. Everything else can wait

**Survival Mantras:**

- "This is temporary"
- "I'm doing enough"
- "My baby doesn't need perfect, they need present"
- "This too shall pass" (cliché because it's true)

**Practical Survival Tips:**

| Area | Strategy |
|------|----------|
| **Sleep** | Sleep when baby sleeps (seriously). Lower standards everywhere else. |
| **Food** | One-handed foods. Accept ALL meal offers. |
| **Hygiene** | Baby wipes count as a shower in survival mode |
| **House** | Ignore it. No one cares. |
| **Visitors** | Only if they help. Otherwise, no. |

${
  supportLevel === 'alone'
    ? `
**If You're Doing This Alone:**
I see you. This is incredibly hard. Please:
- Accept ANY help offered
- Ask for help even if it's hard
- Call postpartum support lines
- Lower the bar further than you think you should
- You're doing something heroic`
    : ''
}

**Things That Are Normal:**

- Crying for no reason
- Loving and resenting baby simultaneously
- Missing your old life
- Googling everything at 3am
- Wondering "what have I done"
- Snapping at your partner
- Feeling like everyone else is better at this

**When to Get Help:**

- Can't sleep even when baby sleeps
- Scary intrusive thoughts
- Feeling disconnected from baby
- Thinking baby/family better off without you
- Persistent despair beyond 2 weeks

These are treatable. You're not broken.

**The Secret:**

Every parent feels like they're faking it. No one knows what they're doing. You're doing better than you think.

What's the one thing you need most right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Sleep Deprivation
// ============================================================================

const sleepDeprivationDef: ToolDefinition = {
  id: 'sleepDeprivation',
  name: 'Sleep Deprivation',
  description: 'Coping with the torture of newborn sleep deprivation',
  domain: 'new-parent',
  tags: ['new-parent', 'sleep', 'exhaustion', 'survival'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sleepDeprivation'),
      parameters: z.object({
        lastGoodSleep: z.string().optional().describe('When you last slept well'),
        sleepArrangement: z.string().optional().describe('Current sleep setup'),
      }),
      execute: async ({ lastGoodSleep, sleepArrangement }) => {
        const userId = ctx.userId;
        log.debug({ userId, lastGoodSleep }, '[new-parent] sleep deprivation');

        const response = `Sleep deprivation is a form of torture. This is not an exaggeration.

${lastGoodSleep ? `**Last good sleep:** ${lastGoodSleep}` : ''}

**What Sleep Deprivation Does:**

- Makes everything feel worse
- Decreases emotional regulation
- Impairs judgment (worse than being drunk)
- Increases anxiety and depression symptoms
- Makes you feel like you're failing
- Creates conflict with partner

**You're not weak. You're deprived of a basic human need.**

**Survival Strategies:**

| Strategy | How |
|----------|-----|
| **Tag team** | One parent "on" while other sleeps (if partnered) |
| **Sleep when baby sleeps** | Yes, even if you have to force yourself |
| **Lower nighttime standards** | Whatever is safest + easiest |
| **Accept help** | Let someone take a feeding so you can sleep |
| **Nap infrastructure** | Blackout curtains, white noise, sleep mask |

**Dangerous Sleep Deprivation Signs:**

- Falling asleep standing up
- Hallucinations
- Can't function at all
- Thoughts of harming self or baby
- Micro-sleeps while driving

**These require immediate help - call your doctor or support system.**

**A Permission Slip:**

I give myself permission to:
- Let the house be messy
- Skip non-essential tasks
- Ask for help
- Prioritize sleep over everything else
- Not "make the most" of baby's nap time

**The Timeline:**

- Weeks 1-6: Survival mode (brutal)
- 6-12 weeks: Gradually improving
- 3-4 months: Often a sleep regression
- 6+ months: Usually more stable patterns

**This is temporary.** Your brain is telling you this will never end. It will.

What would make tonight even slightly better?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Relationship After Baby
// ============================================================================

const relationshipAfterBabyDef: ToolDefinition = {
  id: 'relationshipAfterBaby',
  name: 'Relationship After Baby',
  description: 'Navigate relationship changes after becoming parents',
  domain: 'new-parent',
  tags: ['new-parent', 'relationship', 'partnership', 'conflict'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('relationshipAfterBaby'),
      parameters: z.object({
        mainIssue: z.string().optional().describe("What's happening in the relationship"),
        feelingTowardPartner: z
          .string()
          .optional()
          .describe('How you feel about your partner right now'),
      }),
      execute: async ({ mainIssue, feelingTowardPartner }) => {
        const userId = ctx.userId;
        log.debug({ userId, mainIssue }, '[new-parent] relationship');

        const response = `Your relationship will change after baby. This is universal. What you do with that change matters.

${mainIssue ? `**What's happening:** "${mainIssue}"` : ''}
${feelingTowardPartner ? `**How you feel:** "${feelingTowardPartner}"` : ''}

**What's Normal After Baby:**

| Experience | Frequency |
|------------|-----------|
| Relationship satisfaction drops | 67% of couples |
| Increased conflict | Very common |
| Feeling like strangers | Common |
| Resentment about workload | Extremely common |
| Less intimacy | Almost universal |
| Wondering "who is this person" | Common |

**Why This Happens:**

- You're both sleep-deprived zombies
- Different parenting instincts/styles
- Unequal labor (physical, mental, emotional)
- No time for connection
- Identity shifts happening to both
- Stress affects how we relate

**The Danger Zone:**

Gottman's research shows new parents in trouble when:
- Criticism replaces complaints
- Contempt enters conversations
- Defensiveness blocks communication
- Stonewalling shuts down repair

**What Actually Helps:**

1. **Assume good intent** - You're both exhausted and trying
2. **20-minute rule** - 20 mins of daily connection (no baby talk)
3. **Address the labor split** - Have the hard conversation
4. **Lower expectations** - Romance looks different now
5. **Schedule check-ins** - "How are we doing?"

**The Labor Conversation:**

Mental load, default parent status, overnight duties - this is where resentment grows.

Script: "I need us to talk about how we're splitting things. I'm feeling [exhausted/alone/resentful]. Can we look at this together?"

**Intimacy After Baby:**

- Different doesn't mean gone
- Physical recovery takes time
- Touched-out is real
- Connection > Sex (for now)
- Be patient with yourselves

**When to Get Help:**

- Constant fighting with no repair
- Contempt or criticism is the norm
- One of you has checked out
- You can't communicate without exploding
- You're considering separation

Couples therapy works. Especially postpartum-specialized.

**The Truth:**

The first year with a baby is often the hardest year on a relationship. But couples who get through it can become stronger. This is temporary.

What feels most urgent to address in your relationship right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Postpartum Check-In
// ============================================================================

const postpartumCheckinDef: ToolDefinition = {
  id: 'postpartumCheckin',
  name: 'Postpartum Check-In',
  description: 'Gentle check-in for postpartum mental health',
  domain: 'new-parent',
  tags: ['new-parent', 'postpartum', 'mental-health', 'check-in'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('postpartumCheckin'),
      parameters: z.object({
        howFeeling: z.string().optional().describe("How you've been feeling"),
        weeksSinceBirth: z.number().optional().describe('Weeks since birth'),
      }),
      execute: async ({ howFeeling, weeksSinceBirth }) => {
        const userId = ctx.userId;
        log.debug({ userId, weeksSinceBirth }, '[new-parent] postpartum checkin');

        const response = `Let me check in with you. The postpartum period is intense, and you deserve support.

${weeksSinceBirth ? `**Weeks postpartum:** ${weeksSinceBirth}` : ''}
${howFeeling ? `**How you're feeling:** "${howFeeling}"` : ''}

**Gentle Questions (No Judgment):**

Over the past two weeks, have you experienced:

**Mood:**
- Feeling sad, hopeless, or empty?
- Crying more than usual?
- Irritability or anger that feels out of character?
- Anxiety that won't quiet down?

**Thoughts:**
- Excessive worry about baby's health?
- Scary thoughts that intrude?
- Feeling like a bad parent?
- Thoughts that baby/family would be better without you?

**Body:**
- Unable to sleep even when baby sleeps?
- No appetite or eating to cope?
- Physical anxiety symptoms (racing heart, can't breathe)?

**Connection:**
- Feeling disconnected from baby?
- Feeling like you're going through motions?
- Avoiding people?

**The Spectrum:**

| What It's Called | What It Feels Like | Timeline |
|-----------------|--------------------| ---------|
| **Baby Blues** | Weepy, mood swings, overwhelmed | 1-2 weeks, resolves |
| **Postpartum Depression** | Persistent sadness, hopelessness, can't enjoy things | Doesn't resolve on its own |
| **Postpartum Anxiety** | Constant worry, racing thoughts, can't relax | Common, treatable |
| **Postpartum OCD** | Intrusive scary thoughts, rituals to cope | The thoughts don't mean you'll act |
| **Postpartum Psychosis** | Confusion, hallucinations, delusions | EMERGENCY - call 911 |

**Important:**

If you're experiencing persistent symptoms beyond 2 weeks, this is NOT:
- Your fault
- Because you're weak
- Something you should "push through"
- A sign you're a bad parent

It IS:
- A medical condition
- Treatable
- Common (1 in 5 mothers)
- Not your identity

**Resources:**

- Postpartum Support International: 1-800-944-4773 (text also)
- Your OB/midwife
- Your primary care doctor
- Emergency: 988 (Suicide & Crisis Lifeline)

**If you're having thoughts of harming yourself or baby, please reach out now. These thoughts are symptoms, not reality. Help exists.**

How are you really doing?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'all',
          priority: 'high',
          content: `User in postpartum period. Monitor for mental health concerns. Handle with extra care.`,
          category: 'postpartum-support',
          proactive: true,
          oneTime: false,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const newParentTools = [
  parentIdentityShiftDef,
  newParentSurvivalDef,
  sleepDeprivationDef,
  relationshipAfterBabyDef,
  postpartumCheckinDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'new-parent',
  newParentTools
);

export default getToolDefinitions;
