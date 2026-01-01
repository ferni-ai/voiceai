/**
 * Coming Out Domain
 *
 * Tools for supporting the LGBTQ+ coming out journey - to self and others.
 * A profound identity process that deserves compassionate support.
 *
 * DOMAIN: coming-out
 * PERSONA AFFINITY: Ferni (emotional support), Nayan (wisdom)
 *
 * TOOLS:
 *   Self: comingOutToSelf, identityExploration
 *   Others: comingOutPlanning, handlingReactions
 *   Living: livingAuthentically, communityConnection
 *
 * PRINCIPLES:
 * - Your identity is valid
 * - Coming out is a personal choice
 * - Safety comes first
 * - You set the pace
 *
 * NOTE: Supportive and affirming only. No conversion rhetoric.
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
// TOOL: Coming Out To Self
// ============================================================================

const comingOutToSelfDef: ToolDefinition = {
  id: 'comingOutToSelf',
  name: 'Coming Out To Self',
  description: 'Support in understanding and accepting your own identity',
  domain: 'coming-out',
  tags: ['coming-out', 'identity', 'self-acceptance', 'lgbtq'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('comingOutToSelf'),
      parameters: z.object({
        whatYoureExploring: z
          .string()
          .optional()
          .describe("What aspect of identity you're exploring"),
        feelings: z.string().optional().describe("How you're feeling about this"),
      }),
      execute: async ({ whatYoureExploring, feelings }) => {
        const userId = ctx.userId;
        log.debug({ userId }, '[coming-out] to self');

        const response = `Coming out to yourself is often the hardest part. You're doing brave work.

${whatYoureExploring ? `**What you're exploring:** "${whatYoureExploring}"` : ''}
${feelings ? `**How you feel:** "${feelings}"` : ''}

**First: You're Valid.**

Whatever you're discovering about yourself is real. You don't need permission. You don't need proof. You know yourself.

**The Internal Journey:**

Coming out to yourself often involves:

| Stage | What It Feels Like |
|-------|---------------------|
| **Awareness** | "Something's different about me" |
| **Questioning** | "What does this mean?" |
| **Exploration** | "Let me understand this" |
| **Acceptance** | "This is who I am" |
| **Integration** | "This is part of my whole self" |

**These don't happen linearly.** You might cycle through them.

**Common Feelings:**

- Relief ("Finally, this makes sense")
- Fear ("What does this mean for my life?")
- Grief ("The life I thought I'd have")
- Excitement ("I can be myself")
- Confusion ("Am I sure?")
- Internalized shame ("What's wrong with me?" - nothing)

**Questions You Might Be Asking:**

"Am I really [identity]?"
→ If you're asking, it's worth exploring. Labels can help or hinder - use what fits.

"How do I know for sure?"
→ You might not for a while. That's okay. Identity can be fluid.

"What will this mean for my life?"
→ Whatever you choose it to mean. Your timeline. Your decisions.

"Why now?"
→ Identity reveals itself when we're ready. There's no "too late."

**What You Don't Need:**

- To have known since childhood
- To fit a stereotype
- To label yourself immediately
- To tell anyone else yet
- To have it all figured out

**Resources:**

- The Trevor Project: thetrevorproject.org (crisis line: 1-866-488-7386)
- PFLAG: pflag.org
- GLAAD: glaad.org
- Local LGBTQ+ centers

**You're Not Alone:**

Millions have walked this path. There's a community waiting to welcome you - when you're ready.

What feels most true about who you are?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'all',
          priority: 'normal',
          content: `User exploring identity. Be affirming and supportive. No judgment.`,
          category: 'identity-exploration',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Coming Out Planning
// ============================================================================

const comingOutPlanningDef: ToolDefinition = {
  id: 'comingOutPlanning',
  name: 'Coming Out Planning',
  description: 'Support in planning how and when to come out to others',
  domain: 'coming-out',
  tags: ['coming-out', 'planning', 'disclosure', 'strategy'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('comingOutPlanning'),
      parameters: z.object({
        whoToTell: z.string().optional().describe("Who you're thinking of telling"),
        concerns: z.string().optional().describe('What worries you'),
      }),
      execute: async ({ whoToTell, concerns }) => {
        const userId = ctx.userId;
        log.debug({ userId, whoToTell }, '[coming-out] planning');

        const response = `Coming out is yours to control. Who, when, how - all your choice.

${whoToTell ? `**Who you're considering:** ${whoToTell}` : ''}
${concerns ? `**Your concerns:** "${concerns}"` : ''}

**First: Safety Check**

Before coming out, honestly assess:
- Physical safety - Is there any risk of harm?
- Housing - Could you be kicked out?
- Financial - Are you dependent on unsupportive people?
- Location - Are you in a safe environment?

If safety is uncertain, waiting is wisdom, not weakness.

**You Don't Owe Anyone:**

- An explanation
- Coming out at all
- Coming out to everyone
- A timeline
- Defending your identity

**Choosing Who First:**

| Approach | Pros | Cons |
|----------|------|------|
| **Supportive person first** | Build confidence, have ally | They might slip |
| **Important person first** | Get it over with | Higher stakes |
| **Friends before family** | Practice, build support | May feel like keeping secret |
| **All at once** | One conversation | Less control |

**Planning Considerations:**

**Timing:**
- Not during crisis or major family event
- When you have time and space
- When you feel relatively grounded
- Private, not forced

**Setting:**
- One-on-one often easier
- Somewhere you can leave if needed
- Comfortable environment
- Minimize interruptions

**What to Say:**

Simple is fine:
- "I need to tell you something important about who I am"
- "I've realized something about myself"
- "I want to share something with you"

You don't need a speech. You don't need to justify.

**Preparing for Reactions:**

People react differently. Prepare for:
- Immediate support (wonderful)
- Shock and silence (give them time)
- Questions (decide what you'll answer)
- Denial ("it's a phase")
- Negative reaction (have support lined up)

**After Coming Out:**

- Have support available (friend, hotline)
- Take care of yourself
- Give them time to process (within reason)
- Set boundaries if needed
- Celebrate your courage

What feels like the right first step for you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Handling Reactions
// ============================================================================

const handlingReactionsDef: ToolDefinition = {
  id: 'handlingReactions',
  name: 'Handling Reactions',
  description: 'Process and respond to reactions when coming out',
  domain: 'coming-out',
  tags: ['coming-out', 'reactions', 'family', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('handlingReactions'),
      parameters: z.object({
        reaction: z.enum(['positive', 'mixed', 'negative', 'silence', 'rejection']).optional(),
        fromWho: z.string().optional().describe('Who reacted this way'),
        whatTheySaid: z.string().optional().describe('What was said'),
      }),
      execute: async ({ reaction, fromWho, whatTheySaid }) => {
        const userId = ctx.userId;
        log.debug({ userId, reaction, fromWho }, '[coming-out] reactions');

        const responses = {
          positive: `
**Positive Reaction:**
Celebrate this! Not everyone gets immediate acceptance.
- Let yourself feel the relief
- Thank them for their support
- This is what you deserve`,

          mixed: `
**Mixed Reaction:**
"I love you but need time" is common.
- Give them time to process
- Don't interpret confusion as rejection
- Keep communication open
- They may come around`,

          negative: `
**Negative Reaction:**
This hurts. I'm sorry.
- Their reaction is about THEM, not your worth
- You don't have to convince them
- Set boundaries on hurtful language
- Seek support from affirming people
- Time can change perspectives (or not - either way, you're valid)`,

          silence: `
**Silence:**
Silence is hard because you don't know what it means.
- They may be processing
- Give them some time (with limits)
- You can follow up
- Their silence isn't your failure`,

          rejection: `
**Rejection:**
Being rejected by family/loved ones is devastating grief.
- This is real loss - grieve it
- Their rejection is wrong, not you
- Chosen family can fill gaps
- Seek community support
- Professional help for processing this trauma`,
        };

        const response = `However they reacted, your identity is still valid. Their response is about them, not about your worth.

${fromWho ? `**From:** ${fromWho}` : ''}
${whatTheySaid ? `**What they said:** "${whatTheySaid}"` : ''}

${reaction && responses[reaction] ? responses[reaction] : ''}

**Remember:**

You did a brave thing. Coming out takes courage regardless of the response.

**If the reaction was hard:**

- You're not alone
- This pain is real and valid
- Millions have survived this
- There's a community that accepts you
- Healing is possible

**Support Resources:**

- The Trevor Project: 1-866-488-7386 (24/7)
- Trans Lifeline: 1-877-565-8860
- LGBT National Help Center: 1-888-843-4564
- PFLAG: pflag.org (support for families too)

**For Family/Friends Who Need Time:**

- PFLAG chapters help families understand
- Books: "This Is a Book for Parents of Gay Kids"
- Time and exposure often help
- They're grieving their expectations (doesn't make it okay, but explains it)

How are you holding up right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Living Authentically
// ============================================================================

const livingAuthenticallyDef: ToolDefinition = {
  id: 'livingAuthentically',
  name: 'Living Authentically',
  description: 'Support in living openly as your true self',
  domain: 'coming-out',
  tags: ['coming-out', 'authenticity', 'identity', 'living'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('livingAuthentically'),
      parameters: z.object({
        currentChallenge: z.string().optional().describe("What's challenging about living openly"),
        whatYoureProudOf: z.string().optional().describe('What authenticity means to you'),
      }),
      execute: async ({ currentChallenge, whatYoureProudOf }) => {
        const userId = ctx.userId;
        log.debug({ userId }, '[coming-out] authenticity');

        const response = `Living as your authentic self is an ongoing journey. You're doing it.

${currentChallenge ? `**Current challenge:** "${currentChallenge}"` : ''}
${whatYoureProudOf ? `**What you're proud of:** "${whatYoureProudOf}"` : ''}

**Authenticity Isn't All-or-Nothing:**

Living authentically doesn't mean:
- Being out to everyone
- Never being private
- Performing identity
- Having it all figured out

It means:
- Being true to yourself in ways that feel right
- Not denying who you are
- Finding spaces where you can be yourself
- Growing into your full self

**The Ongoing Nature:**

Coming out isn't one event. You'll come out:
- To each new person you meet
- In new jobs, new cities
- Throughout your life
- As much or as little as you choose

**Finding Your People:**

| Where | What to Look For |
|-------|------------------|
| **Online** | Forums, social media groups, apps |
| **Local** | LGBTQ+ centers, pride events, meetups |
| **Interest-based** | Queer book clubs, sports leagues, professional groups |
| **Spiritual** | Affirming faith communities |

**The Joy Part:**

Authenticity isn't just surviving - it's thriving:
- Relationships built on truth
- Not wasting energy hiding
- Finding community
- Living fully

**When It's Still Hard:**

Even after coming out:
- Some days are harder
- Some people won't accept you
- You'll encounter ignorance
- Internalized stuff comes up

This is normal. Healing is ongoing.

**Affirmation:**

You are exactly who you're meant to be. Your identity is not a mistake. Your existence is not up for debate. You belong here.

What would living more authentically look like for you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const comingOutTools = [
  comingOutToSelfDef,
  comingOutPlanningDef,
  handlingReactionsDef,
  livingAuthenticallyDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'coming-out',
  comingOutTools
);

export default getToolDefinitions;
