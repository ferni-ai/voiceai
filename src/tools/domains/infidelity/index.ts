/**
 * Infidelity Domain
 *
 * Tools for navigating the aftermath of betrayal - whether you were betrayed
 * or you betrayed. Different from breakup-recovery because trust violation
 * adds unique trauma.
 *
 * DOMAIN: infidelity
 * PERSONA AFFINITY: Ferni (emotional), Nayan (wisdom)
 *
 * TOOLS:
 *   Betrayed: betrayalTrauma, decidingAfterAffair, trustRecovery
 *   Unfaithful: understandingWhyICheated, repairAfterBetray
 *   Both: shouldWeStay, affairRecoveryTimeline
 *
 * PRINCIPLES:
 * - Betrayal is trauma, treat it accordingly
 * - Affairs are symptoms, not the whole story
 * - Recovery is possible but not guaranteed
 * - No decision should be made in the acute phase
 *
 * RESEARCH BASIS:
 * - Gottman affair recovery research
 * - Esther Perel's "State of Affairs"
 * - Attachment trauma (Shirley Glass)
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
// TOOL: Betrayal Trauma
// ============================================================================

const betrayalTraumaDef: ToolDefinition = {
  id: 'betrayalTrauma',
  name: 'Betrayal Trauma',
  description: 'Process the trauma of discovering infidelity',
  domain: 'infidelity',
  tags: ['infidelity', 'betrayal', 'trauma', 'discovery'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('betrayalTrauma'),
      parameters: z.object({
        howLongAgo: z.string().optional().describe('When you discovered'),
        currentState: z.enum(['just-found-out', 'weeks-in', 'months-in', 'years-in']).optional(),
      }),
      execute: async ({ howLongAgo, currentState }) => {
        const userId = ctx.userId;
        log.debug({ userId, currentState }, '[infidelity] betrayal trauma');

        const response = `What you're experiencing is trauma. This is not an overreaction.

${howLongAgo ? `**Discovered:** ${howLongAgo}` : ''}

**Betrayal Trauma Is Real Trauma:**

Discovery of infidelity triggers:
- Fight/flight/freeze response
- Obsessive thoughts
- Hypervigilance
- Intrusive images
- Inability to sleep or eat
- Physical symptoms (shaking, nausea)
- Dissociation

This is your brain responding to a fundamental threat - the person who was supposed to be safe is not safe.

**What's Normal After Discovery:**

| Experience | What It Is |
|------------|------------|
| Obsessive detective work | Trying to make sense of reality |
| Wanting every detail | Trying to understand "real" |
| Mind movies | Intrusive traumatic images |
| Can't sleep | Hypervigilance |
| Physical symptoms | Trauma in the body |
| Rage and despair cycling | Normal grief/trauma |
| Questioning everything | Reality was different than you thought |

${
  currentState === 'just-found-out'
    ? `
**In The First Days/Weeks:**

- Don't make permanent decisions yet
- Get support (therapist, trusted friend)
- Take care of basic needs (eat, sleep, safety)
- You don't have to decide about the relationship now
- Feel what you feel - it's all valid

**What NOT to do:**
- Post on social media
- Tell everyone
- Make permanent decisions
- Hurt yourself
- Confront the other person`
    : ''
}

**The Questions That Won't Stop:**

"Why?" - May never have a satisfying answer
"How could they?" - They compartmentalized
"Was any of it real?" - The good parts were real too
"What's wrong with me?" - NOTHING. This is about them.

**What You Need:**

1. **Safety** - Physical and emotional
2. **Support** - People who won't judge
3. **Time** - Don't rush decisions
4. **Information** - But not obsessively
5. **Professional help** - Trauma-informed therapy

**A Hard Truth:**

The person you loved still exists. So does the person who betrayed you. Both are real. That's part of what makes this so painful.

**You Will Survive This.**

People recover from betrayal. Some relationships survive. Some don't, and that's okay too. But YOU will survive this.

What do you need most right now?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'all',
          priority: 'high',
          content: `User processing betrayal trauma. Handle with extreme care. No judgment.`,
          category: 'betrayal-trauma',
          proactive: true,
          oneTime: false,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Should We Stay
// ============================================================================

const shouldWeStayDef: ToolDefinition = {
  id: 'shouldWeStay',
  name: 'Should We Stay',
  description: 'Navigate the decision of whether to stay after infidelity',
  domain: 'infidelity',
  tags: ['infidelity', 'decision', 'relationship', 'staying'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('shouldWeStay'),
      parameters: z.object({
        partnerResponse: z.string().optional().describe('How your partner has responded'),
        yourLeaning: z.enum(['stay', 'leave', 'unsure']).optional(),
      }),
      execute: async ({ partnerResponse, yourLeaning }) => {
        const userId = ctx.userId;
        log.debug({ userId, yourLeaning }, '[infidelity] should we stay');

        const response = `This is one of the hardest decisions you'll ever make. Take your time.

${partnerResponse ? `**Partner's response:** "${partnerResponse}"` : ''}
${yourLeaning ? `**Your leaning:** ${yourLeaning}` : ''}

**The Truth:**

There is no "right" answer. Some couples recover and become stronger. Some don't, and that's also okay. Both paths are valid.

**When Staying CAN Work:**

- Unfaithful partner takes full responsibility
- Complete transparency going forward
- Willing to do the hard work (therapy, time)
- Affair is completely over
- Both partners want to rebuild
- Underlying issues are addressable
- No ongoing deception

**When Leaving Makes Sense:**

- Pattern of infidelity (not first time)
- No genuine remorse
- Blame-shifting or minimizing
- Unwilling to end affair completely
- Safety concerns
- You don't want to stay (and that's enough)
- Trust feels impossible

**Questions to Sit With:**

1. Is my partner showing genuine remorse or just regret at being caught?
2. Can I eventually be in this relationship without constant fear?
3. Are they willing to do whatever it takes?
4. What does my gut say (not my fear, not my hope - my gut)?
5. If I stay, what do I need to feel safe?
6. If I leave, can I survive that?

**Things That Are True:**

- You don't have to decide today
- Choosing to stay isn't weakness
- Choosing to leave isn't failure
- You can change your mind
- Whatever you choose, there will be grief
- Other people's opinions don't matter

**The Non-Negotiables (If Staying):**

1. Full transparency (phones, accounts, whereabouts)
2. Complete break from affair partner
3. Individual therapy for unfaithful partner
4. Couples therapy
5. Patience with your process (no "get over it")
6. Answers to your questions (not gaslighting)

**What NOT to Base Decision On:**

- Fear of being alone
- Financial dependence
- What people will think
- "For the kids" alone
- Sunk cost ("we've been together so long")
- Hope they'll change without evidence

${
  yourLeaning === 'stay'
    ? `
**If You're Leaning Stay:**
That's valid. Recovery is possible. But go in with eyes open - this is hard, long work. Both of you need to be committed.`
    : ''
}

${
  yourLeaning === 'leave'
    ? `
**If You're Leaning Leave:**
That's valid. You don't owe them another chance. Your healing can happen outside this relationship.`
    : ''
}

**Timeline:**

Don't rush. The decision to stay or leave should ideally wait 6-12 months while you process. Decisions made in trauma are often regretted.

What's the thing you're most afraid of?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Understanding Why I Cheated
// ============================================================================

const understandingWhyICheatedDef: ToolDefinition = {
  id: 'understandingWhyICheated',
  name: 'Understanding Why I Cheated',
  description: 'For the unfaithful partner: understand what happened without excusing',
  domain: 'infidelity',
  tags: ['infidelity', 'unfaithful', 'self-understanding', 'repair'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('understandingWhyICheated'),
      parameters: z.object({
        whatHappened: z.string().optional().describe('Brief description of what happened'),
        whyYouThink: z.string().optional().describe('Why you think it happened'),
      }),
      execute: async ({ whatHappened, whyYouThink }) => {
        const userId = ctx.userId;
        log.debug({ userId }, '[infidelity] why I cheated');

        const response = `Thank you for being honest with yourself. Understanding why is necessary - but it's not the same as excusing.

${whyYouThink ? `**Your understanding:** "${whyYouThink}"` : ''}

**Important Distinction:**

Understanding ≠ Excusing

You need to understand WHY so you can:
- Take responsibility fully
- Ensure it doesn't happen again
- Address root causes
- Support your partner's healing

**Common Reasons (Not Excuses):**

| Reason | What It Means | What It Doesn't Mean |
|--------|---------------|---------------------|
| Feeling disconnected in marriage | You sought connection elsewhere | Your partner's fault |
| Need for validation | Low self-worth issue | You "needed" to cheat |
| Escape from stress | Poor coping mechanism | Justified |
| Felt unappreciated | Communication failure | Partner caused it |
| Opportunity + weakness | Boundaries weren't strong | "It just happened" |
| Unresolved personal issues | Your work to do | Partner's problem |

**The Hard Questions:**

1. What was I getting from the affair that I wasn't getting in my relationship?
2. Did I try to address those needs appropriately first?
3. What's broken in me that allowed me to do this?
4. What story was I telling myself that made this okay?
5. What needs to change in ME (not just the relationship)?

**Taking Responsibility:**

Full responsibility looks like:
- "I chose to do this. No one made me."
- "My partner's behavior didn't cause my choice."
- "I could have talked, gone to therapy, left - I chose this."
- "I hurt them deeply. That's on me."

**It Does NOT Look Like:**
- "But you weren't meeting my needs"
- "It just happened"
- "I wasn't in my right mind"
- "You pushed me to it"
- "It didn't mean anything"

**For Repair (If That's Possible):**

1. End the affair completely - no contact
2. Full transparency going forward
3. Answer questions without defensiveness
4. Accept their timeline for healing
5. Individual therapy to understand yourself
6. Patience - this takes years, not months

**The Deeper Work:**

What void were you trying to fill? What does that say about what you need to work on in yourself - regardless of whether this relationship survives?

What's the hardest truth you're avoiding?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Trust Recovery
// ============================================================================

const trustRecoveryDef: ToolDefinition = {
  id: 'trustRecovery',
  name: 'Trust Recovery',
  description: 'Navigate the long process of rebuilding trust',
  domain: 'infidelity',
  tags: ['infidelity', 'trust', 'recovery', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trustRecovery'),
      parameters: z.object({
        monthsSinceDiscovery: z.number().optional().describe('Months since discovery'),
        currentStruggle: z.string().optional().describe("What trust issue you're facing"),
      }),
      execute: async ({ monthsSinceDiscovery, currentStruggle }) => {
        const userId = ctx.userId;
        log.debug({ userId, monthsSinceDiscovery }, '[infidelity] trust recovery');

        const response = `Trust rebuilding after betrayal is one of the hardest things you can do. It takes years, not months.

${monthsSinceDiscovery ? `**Months since discovery:** ${monthsSinceDiscovery}` : ''}
${currentStruggle ? `**Current struggle:** "${currentStruggle}"` : ''}

**The Reality:**

Trust was destroyed in a moment. It rebuilds in tiny increments over years.

**Timeline Reality:**

| Phase | Time | What It's Like |
|-------|------|----------------|
| Acute crisis | 0-6 months | Trauma response, obsession, volatility |
| Working through | 6-18 months | Processing, lots of conversations, ups and downs |
| Rebuilding | 18-36 months | Testing new trust, still triggered sometimes |
| New normal | 3-5+ years | Trust is different, but possible |

**For the Betrayed:**

Trust rebuilding looks like:
- Checking phones/accounts (early stage)
- Asking questions and getting answers
- Triggers that need processing
- Testing transparency
- Slowly expanding autonomy again
- Setbacks and progress, cycling

**What You Need From Them:**

1. Radical transparency (phones, accounts, whereabouts)
2. Patient answering of questions (even repeated ones)
3. No defensiveness when triggered
4. Consistent follow-through on promises
5. Understanding that healing isn't linear
6. Initiative in repair (not waiting to be asked)

**For Both Partners:**

Trust rebuilding requires:
- Ongoing communication
- Couples therapy (betrayal-specialized)
- Individual work
- Patience (so much patience)
- Acceptance that the old relationship is gone - you're building a new one

**Triggers:**

Triggers will happen - a song, a place, an anniversary, a look at the phone. This is normal trauma response.

How to handle:
- Name it: "I'm triggered"
- Partner responds with patience
- Process together or alone (depending)
- Don't shame the trigger
- It gets less over time (usually)

${
  monthsSinceDiscovery && monthsSinceDiscovery < 12
    ? `
**At ${monthsSinceDiscovery} Months:**
You're still in the acute/early phase. The intense emotions, the checking, the obsession - these are normal. It's not a sign that you can't heal. It's a sign that it's still early.`
    : ''
}

**The Truth:**

Trust after betrayal is never the same as original trust. It's rebuilt trust - aware, tested, earned. That can actually be stronger, but it's different.

What aspect of trust feels hardest right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const infidelityTools = [
  betrayalTraumaDef,
  shouldWeStayDef,
  understandingWhyICheatedDef,
  trustRecoveryDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'infidelity',
  infidelityTools
);

export default getToolDefinitions;
