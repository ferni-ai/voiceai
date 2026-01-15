/**
 * Divorce Domain
 *
 * Tools for navigating the unique challenges of divorce - legal, financial,
 * emotional, and co-parenting aspects. Different from breakup-recovery
 * because divorce involves untangling lives at a deeper level.
 *
 * DOMAIN: divorce
 * PERSONA AFFINITY: Ferni (emotional), Peter (financial), Jordan (planning)
 *
 * TOOLS:
 *   Emotional: divorceGrief, divorceIdentityShift, divorceStigma
 *   Practical: coParentingAfterDivorce, divorceFAQ
 *   Healing: lifeAfterDivorce, secondChanceNarrative
 *
 * PRINCIPLES:
 * - Divorce is death of a dream, grieve accordingly
 * - Children's needs come first, but your needs also matter
 * - Financial and emotional recovery both take time
 * - "Failed marriage" is a myth - relationships end, that's not failure
 *
 * RESEARCH BASIS:
 * - Divorce adjustment research (Hetherington)
 * - Co-parenting frameworks (Ahrons)
 * - Reconstructing self after divorce (Riessman)
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
// DIVORCE STAGES & GUIDANCE
// ============================================================================

const DIVORCE_STAGES: Record<
  string,
  { description: string; challenges: string[]; priorities: string[] }
> = {
  decision: {
    description: 'Wrestling with the decision to divorce',
    challenges: ['Uncertainty', 'Guilt', 'Fear of the unknown', 'Hope vs reality'],
    priorities: ['Individual therapy', 'Values clarification', 'Understanding your options'],
  },
  early: {
    description: 'Recently separated or just beginning divorce process',
    challenges: ['Shock', 'Logistics overwhelm', 'Telling people', "Children's adjustment"],
    priorities: ['Legal guidance', 'Emotional support', 'Stabilize routines'],
  },
  middle: {
    description: 'In the thick of divorce process',
    challenges: [
      'Negotiation stress',
      'Financial concerns',
      'Co-parenting conflicts',
      'Identity questions',
    ],
    priorities: ['Focus on long-term', 'Self-care', "Children's wellbeing"],
  },
  rebuilding: {
    description: 'Divorce finalized, rebuilding life',
    challenges: ['Loneliness', 'Identity reconstruction', 'New normal', 'Dating questions'],
    priorities: ['Self-discovery', 'New routines', 'Healing before dating'],
  },
};

// ============================================================================
// TOOL: Divorce Grief
// ============================================================================

const divorceGriefDef: ToolDefinition = {
  id: 'divorceGrief',
  name: 'Divorce Grief',
  description: 'Process the unique grief of divorce',
  domain: 'divorce',
  tags: ['divorce', 'grief', 'loss', 'endings'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('divorceGrief'),
      parameters: z.object({
        divorceStage: z
          .enum(['decision', 'early', 'middle', 'rebuilding'])
          .optional()
          .describe('Where you are in the divorce process'),
        whatHurts: z.string().optional().describe('What aspect is hardest right now'),
        wantedDivorce: z
          .enum(['i_initiated', 'they_initiated', 'mutual', 'complicated'])
          .optional()
          .describe('Who initiated'),
      }),
      execute: async ({ divorceStage, whatHurts, wantedDivorce }) => {
        const userId = ctx.userId;

        log.debug({ userId, divorceStage, wantedDivorce }, '[divorce] grief processing');

        const stageInfo = divorceStage ? DIVORCE_STAGES[divorceStage] : null;

        const response = `Divorce is the death of a dream. It deserves to be grieved.

${divorceStage ? `**Where you are:** ${stageInfo?.description}` : ''}
${whatHurts ? `**What hurts most:** "${whatHurts}"` : ''}

**What You're Actually Grieving:**

Divorce isn't just losing a spouse. You're grieving:
- The future you planned together
- The family you imagined
- Your identity as a married person
- Holidays and traditions
- Shared friends and in-laws
- The story you told yourself about your life
- Financial stability
- Your children's intact family

**The Grief Looks Different Based on Who Initiated:**

${
  wantedDivorce === 'i_initiated'
    ? `
**If you initiated:**
You might feel guilt on top of grief. Relief mixed with sadness. "I'm supposed to want this, why am I sad?" Choosing divorce doesn't mean you don't grieve - you're grieving what you hoped for but couldn't have.`
    : ''
}

${
  wantedDivorce === 'they_initiated'
    ? `
**If they initiated:**
The grief often mixes with rejection, betrayal, and loss of control. You're grieving what you wanted AND being forced to let go. It's grief plus trauma plus powerlessness.`
    : ''
}

${
  wantedDivorce === 'mutual'
    ? `
**If it was mutual:**
"Mutual" rarely means equal. One person usually had to come to terms first. Mutual doesn't mean painless - it just means you both see the same truth.`
    : ''
}

**Grief Waves Are Normal:**

You might feel:
- Fine one day, devastated the next
- Relief followed by panic
- Anger, then sadness, then nothing
- Good for weeks, then triggered by a song

All of this is normal. Grief isn't linear.

${
  stageInfo
    ? `
**In the ${divorceStage} stage:**
Common challenges: ${stageInfo.challenges.join(', ')}
Focus on: ${stageInfo.priorities.join(', ')}`
    : ''
}

**A Reframe:**

"Failed marriage" is a myth. Relationships end. That doesn't mean they failed - they just finished. What you built together was real. What you're building now is also real.

What part of this grief feels most present for you today?`;

        // Track for cross-persona awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'jordan', // Jordan for rebuilding and planning
          priority: 'normal',
          content: `User processing divorce grief in ${divorceStage || 'some'} stage.`,
          category: 'divorce-grief',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Co-Parenting After Divorce
// ============================================================================

const coParentingAfterDivorceDef: ToolDefinition = {
  id: 'coParentingAfterDivorce',
  name: 'Co-Parenting After Divorce',
  description: 'Navigate co-parenting challenges with an ex',
  domain: 'divorce',
  tags: ['divorce', 'coparenting', 'children', 'family'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('coParentingAfterDivorce'),
      parameters: z.object({
        challenge: z
          .enum([
            'communication',
            'schedule_conflicts',
            'different_rules',
            'new_partners',
            'badmouthing',
            'kids_in_middle',
            'general',
          ])
          .optional()
          .describe('The specific co-parenting challenge'),
        exRelationship: z
          .enum(['cooperative', 'parallel', 'conflictual', 'volatile'])
          .optional()
          .describe('Current relationship with ex'),
      }),
      execute: async ({ challenge, exRelationship }) => {
        const userId = ctx.userId;

        log.debug({ userId, challenge, exRelationship }, '[divorce] co-parenting');

        const challengeGuidance = {
          communication: `
**Communication Strategies:**
- Business-like, not personal
- BIFF: Brief, Informative, Friendly, Firm
- In writing when possible (text/email)
- Focus on facts, not feelings
- "Our Son Needs" vs "You Should"
- Use apps: OurFamilyWizard, TalkingParents`,

          schedule_conflicts: `
**Schedule Conflicts:**
- Get it in writing (court order or agreement)
- Build flexibility into the plan
- Kids' needs > parents' convenience
- Trade, don't fight
- Pick battles wisely`,

          different_rules: `
**Different Houses, Different Rules:**
Kids are resilient - they learn different settings have different norms.
What matters:
- Consistency within each home
- Major values alignment (education, safety)
- Not undermining the other's rules
- Kids knowing what to expect where`,

          new_partners: `
**New Partners:**
This is hard. Really hard.
- Your feelings are valid (jealousy, threat, sadness)
- Kids' adjustment comes first
- Gradual introductions
- New partner isn't replacement parent
- You don't control what happens at their house`,

          badmouthing: `
**When They Badmouth You:**
This hurts - your kids and you.
- Don't retaliate in kind
- Be the safe parent to talk to
- "That's between me and your dad/mom"
- Kids eventually see truth
- Document for court if severe`,

          kids_in_middle: `
**Kids In The Middle:**
Signs: kids as messengers, interrogating them, subtle loyalty tests
Solution:
- Communicate directly (not through kids)
- Don't ask kids to spy or report
- Let kids have their own relationship with each parent
- Say: "That's between me and your mom/dad"`,

          general: '',
        };

        type ChallengeKey = keyof typeof challengeGuidance;

        const response = `Co-parenting after divorce is one of the hardest things you'll do. It requires working with someone you couldn't stay married to.

${exRelationship ? `**Your current dynamic:** ${exRelationship}` : ''}

**The Goal:**

Not to be friends. Not even to like each other. Just to be:
- Two people who love the same kids
- Willing to put kids first
- Able to communicate about children
- Committed to not making kids choose

**Co-Parenting Spectrum:**

| Type | What It Looks Like | Kids' Experience |
|------|-------------------|------------------|
| **Cooperative** | Regular communication, flexibility, unified | Best outcomes |
| **Parallel** | Minimal contact, separate but consistent | Can work well |
| **Conflictual** | Regular fights, kids witness tension | Harmful |
| **Volatile** | Unpredictable, high conflict | Most harmful |

${challenge && challenge !== 'general' && challengeGuidance[challenge as ChallengeKey] ? challengeGuidance[challenge as ChallengeKey] : ''}

**The Mantra:**

"What is best for my children?"
Not: "What's fair to me?" or "What will hurt them?"

**Things Your Kids Need:**

1. To love both parents without guilt
2. To not be messengers or spies
3. To not hear bad things about either parent
4. Consistency and predictability
5. Permission to adjust and be sad sometimes
6. To know divorce wasn't their fault

${
  exRelationship === 'conflictual' || exRelationship === 'volatile'
    ? `
**If Your Co-Parent is High Conflict:**
- Document everything
- Minimize direct contact
- Use apps for communication
- Parallel parenting, not co-parenting
- Consider a parenting coordinator
- Protect yourself AND kids`
    : ''
}

**Remember:**

Your kids are 50% the person you divorced. They need to know that half of them is okay. 

What specific co-parenting challenge would you like to work through?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Divorce Identity Shift
// ============================================================================

const divorceIdentityShiftDef: ToolDefinition = {
  id: 'divorceIdentityShift',
  name: 'Divorce Identity Shift',
  description: 'Navigate the identity transformation that comes with divorce',
  domain: 'divorce',
  tags: ['divorce', 'identity', 'self-discovery', 'transformation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('divorceIdentityShift'),
      parameters: z.object({
        marriageLength: z.string().optional().describe('How long you were married'),
        identityStruggle: z.string().optional().describe('What aspect of identity feels hardest'),
      }),
      execute: async ({ marriageLength, identityStruggle }) => {
        const userId = ctx.userId;

        log.debug({ userId, marriageLength }, '[divorce] identity shift');

        const response = `After being "we" for so long, becoming "I" again is disorienting.

${marriageLength ? `**You were married for:** ${marriageLength}` : ''}
${identityStruggle ? `**What feels hardest:** "${identityStruggle}"` : ''}

**The Identity Questions:**

Who am I now that I'm not:
- Someone's wife/husband?
- Part of "the [name] family"?
- The person who celebrates holidays that way?
- Living in that house, that neighborhood?
- Part of those friend couples?
- Planning that shared future?

**What You Lost:**

| External | Internal |
|----------|----------|
| The ring, the title | The role |
| Shared friends | Part of your story |
| Family events | Sense of belonging |
| Financial partnership | Shared decision-making |
| Home | Feeling of home |

**The Opportunity (Eventually):**

Divorce, as terrible as it is, offers something:
- Chance to rediscover yourself
- Freedom to make choices just for you
- Space to grow in new ways
- Permission to build what YOU want

**Identity Exploration:**

**Before marriage, who were you?**
What did you like? What were your dreams? What did you do for fun?

**During marriage, what did you lose?**
What did you give up? What did you compromise? What got buried?

**Now, what do you want?**
Not what you should want. What do YOU want?

**Stages of Identity Reconstruction:**

1. **Disorientation** - Who am I without them?
2. **Exploration** - Trying on new versions of self
3. **Discovery** - Finding what fits
4. **Integration** - Becoming someone new who carries the past

${
  marriageLength?.includes('year') && parseInt(marriageLength) >= 10
    ? `
**After a Long Marriage:**
If you were married for many years, identity reconstruction takes longer. More of your adult life was "we." Be patient with yourself. You're not just recovering from a breakup - you're discovering who you are now.`
    : ''
}

**A Truth:**

You're not going back to who you were before. You're becoming someone new - someone shaped by the marriage, the divorce, and everything you're learning now.

What part of yourself would you most like to rediscover or develop?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Life After Divorce
// ============================================================================

const lifeAfterDivorceDef: ToolDefinition = {
  id: 'lifeAfterDivorce',
  name: 'Life After Divorce',
  description: 'Guidance for rebuilding life after divorce is finalized',
  domain: 'divorce',
  tags: ['divorce', 'rebuilding', 'healing', 'new-chapter'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('lifeAfterDivorce'),
      parameters: z.object({
        timeSinceFinalized: z.string().optional().describe('How long since divorce was finalized'),
        biggestChallenge: z.string().optional().describe('Biggest challenge in rebuilding'),
        readyForDating: z
          .enum(['not_ready', 'curious', 'trying', 'overwhelmed'])
          .optional()
          .describe('Where you are with dating'),
      }),
      execute: async ({ timeSinceFinalized, biggestChallenge, readyForDating }) => {
        const userId = ctx.userId;

        log.debug({ userId, timeSinceFinalized }, '[divorce] life after');

        const response = `The papers are signed. Now what?

${timeSinceFinalized ? `**Time since finalized:** ${timeSinceFinalized}` : ''}
${biggestChallenge ? `**Your biggest challenge:** "${biggestChallenge}"` : ''}

**The "After" No One Prepares You For:**

Divorce ends the legal marriage. It doesn't end:
- The grief
- The adjustment
- The financial impact
- The co-parenting (if applicable)
- The emotional processing

**Rebuilding Priorities:**

| First | Then | Eventually |
|-------|------|------------|
| Stabilize routines | Heal emotionally | New dreams |
| Get support | Rediscover yourself | Healthy relationships |
| Protect finances | Process the past | Date if wanted |
| Kids' adjustment | Set new boundaries | Build new traditions |

**The New Normal:**

Things that get better:
- Control over your own life
- Peace in your home
- Freedom to make choices
- Space to grow

Things that stay hard for a while:
- Holidays and milestones
- Shared friends navigating sides
- Moments of doubt or regret
- Loneliness (especially at first)

${
  readyForDating
    ? `
**About Dating:**

${readyForDating === 'not_ready' ? "Not ready is okay. There's no timeline. Heal first." : ''}
${readyForDating === 'curious' ? "Curiosity is natural. Take your time. You don't have to rush." : ''}
${readyForDating === 'trying' ? "Go slow. You're still learning who you are now. Watch for patterns." : ''}
${readyForDating === 'overwhelmed' ? "Modern dating after marriage is A LOT. You're not alone in feeling overwhelmed." : ''}

**Dating After Divorce:**
- Heal before you deal
- You're not the same person who dated before
- Watch for rebound relationships
- It's okay to go slow
- You've learned what you don't want`
    : ''
}

**Milestones to Celebrate:**

- First [holiday] alone or different
- First time you don't check their social media
- First time the house feels like YOUR home
- First decision you made just for you
- First time you feel genuinely happy

**Remember:**

This chapter of your life isn't "after the good part." This IS the next good part. Different, but good.

What would make your life feel more yours right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Divorce FAQ
// ============================================================================

const divorceFAQDef: ToolDefinition = {
  id: 'divorceFAQ',
  name: 'Divorce FAQ',
  description: 'Common questions and guidance for divorce process',
  domain: 'divorce',
  tags: ['divorce', 'faq', 'guidance', 'practical'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('divorceFAQ'),
      parameters: z.object({
        question: z
          .enum([
            'how_long',
            'tell_kids',
            'custody',
            'finances',
            'dating',
            'friends',
            'regret',
            'general',
          ])
          .optional()
          .describe('What question you have'),
      }),
      execute: async ({ question }) => {
        const userId = ctx.userId;

        log.debug({ userId, question }, '[divorce] FAQ');

        const faqResponses: Record<string, string> = {
          how_long: `
**How long until I feel better?**

Honest answer: It varies. General guideline:
- Emotional processing: 1-2 years minimum
- New normal: 2-3 years
- Full adjustment: 3-5 years

Factors that affect healing:
- Marriage length
- Who initiated
- Children involved
- Conflict level
- Support system
- Personal work you do

It's not linear. You'll have good days and bad days.`,

          tell_kids: `
**How do I tell the kids?**

- Tell them together if possible
- Age-appropriate but honest
- "We both love you. This will never change."
- "This is not your fault."
- Don't badmouth the other parent
- Let them have feelings
- Answer questions as they come
- Expect regression, acting out, grief
- Consider a family therapist`,

          custody: `
**What about custody?**

Common arrangements:
- 50/50 (various schedules)
- Primary residence with visits
- Custom arrangements

What courts consider:
- Children's best interests
- Each parent's involvement
- Work schedules
- Children's ages/needs
- Geographic proximity
- Parent cooperation

💡 Mediation is often better than court for custody.`,

          finances: `
**How do I handle finances?**

Immediate steps:
- Open individual accounts
- Know all assets and debts
- Gather financial documents
- Understand household budget
- Get credit in your own name

Consider:
- Divorce financial analyst
- Tax implications
- Retirement account divisions
- Health insurance changes
- Budget for single life`,

          dating: `
**When can I date?**

There's no rule. But consider:
- Healing first usually works better
- Rebound relationships are real
- Dating while divorcing can complicate things
- If you have kids, go slow
- You're different now than before marriage

Signs you might be ready:
- You're curious, not desperate
- You've processed the divorce
- You know what you want
- You can be alone without being lonely`,

          friends: `
**What about friends?**

Expect:
- Some friends to take sides
- Couple friends to be awkward
- Some friendships to fade
- Some friendships to deepen
- Need to build new social connections

What helps:
- Be honest about what you need
- Don't force friends to choose
- Find divorced/single friends
- Join groups around interests`,

          regret: `
**What if I regret it?**

Regret is normal, especially for:
- Hard moments alone
- Holidays
- Kids' milestones
- Financial struggles

Ask yourself:
- Is this grief or genuine regret?
- What specifically do you miss?
- Would reconciliation actually work?
- Are you romanticizing the past?

Missing parts of your marriage doesn't mean divorce was wrong.`,
        };

        const response = `**Divorce Questions - You're Not Alone**

${
  question && faqResponses[question]
    ? faqResponses[question]
    : `
**Common Divorce Questions:**

1. **How long until I feel better?** - 1-2 years for acute grief, longer for full adjustment
2. **How do I tell the kids?** - Together, age-appropriate, reassure them of love
3. **What about custody?** - Mediation often better than court
4. **How do I handle finances?** - Get organized, get advice, protect yourself
5. **When can I date?** - Heal first, there's no rush
6. **What about friends?** - Some stay, some go, build new connections
7. **What if I regret it?** - Regret is normal, doesn't mean wrong decision

What question is most pressing for you?`
}

**Remember:**

Millions have walked this path. You're not alone, and you will get through this.

Is there another aspect of divorce you'd like to explore?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const divorceTools = [
  divorceGriefDef,
  coParentingAfterDivorceDef,
  divorceIdentityShiftDef,
  lifeAfterDivorceDef,
  divorceFAQDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'divorce',
  divorceTools
);

export default getToolDefinitions;
