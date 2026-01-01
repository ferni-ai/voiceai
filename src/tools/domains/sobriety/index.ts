/**
 * Sobriety Domain
 *
 * Tools for supporting recovery from addiction - alcohol, substances,
 * or behavioral addictions. No judgment, just support.
 *
 * DOMAIN: sobriety
 * PERSONA AFFINITY: Ferni (support), Maya (habits), Nayan (wisdom)
 *
 * TOOLS:
 *   Support: sobrietyCheckin, cravingSupport, urgeUrfing
 *   Processing: whyIStopped, sobrietyGrief, relapseFears
 *   Living: soberSocializing, soberIdentity
 *
 * PRINCIPLES:
 * - Recovery is brave work
 * - Relapse is part of many journeys
 * - You're not broken, you're healing
 * - One day at a time is wisdom, not cliché
 *
 * NOTE: This is support, not treatment. Always encourage
 * professional help for addiction.
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
// TOOL: Sobriety Check-In
// ============================================================================

const sobrietyCheckinDef: ToolDefinition = {
  id: 'sobrietyCheckin',
  name: 'Sobriety Check-In',
  description: 'Gentle check-in on your recovery journey',
  domain: 'sobriety',
  tags: ['sobriety', 'recovery', 'check-in', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sobrietyCheckin'),
      parameters: z.object({
        timeSober: z.string().optional().describe("How long you've been sober"),
        howFeeling: z.string().optional().describe("How you're feeling today"),
        recoveryType: z.string().optional().describe("What you're recovering from"),
      }),
      execute: async ({ timeSober, howFeeling, recoveryType }) => {
        const userId = ctx.userId;
        log.debug({ userId, timeSober }, '[sobriety] check-in');

        const response = `I'm here. Let's check in.

${timeSober ? `**Time in recovery:** ${timeSober}` : ''}
${howFeeling ? `**How you're feeling:** "${howFeeling}"` : ''}
${recoveryType ? `**What you're working on:** ${recoveryType}` : ''}

**The Questions:**

How are you really doing?
- Not the answer for others
- Not the social media version
- The real answer

**Check-In Areas:**

| Area | How's It Going? |
|------|-----------------|
| **Cravings** | Strong? Manageable? Absent? |
| **Triggers** | Encountering them? Managing them? |
| **Support** | Connected to people who help? |
| **Self-care** | Sleep, food, movement? |
| **Emotions** | Processing or stuffing? |
| **Program** | Meetings? Therapy? Sponsor? |

**Milestones Matter:**

${
  timeSober
    ? `
Every day sober is an accomplishment. ${timeSober} represents countless choices to stay on this path. That's yours. No one can take it.`
    : `
Whether it's day 1 or day 1000, you're here. That matters.`
}

**Common Check-In Feelings:**

- **Strong today** - Wonderful. Bank it for hard days.
- **Struggling** - Reach out. Use your tools.
- **Just okay** - Okay is enough. Keep going.
- **Scared** - Fear is normal. You don't have to act on it.
- **Grateful** - Hold onto that.

**The HALT Check:**

Are you:
- **H**ungry?
- **A**ngry?
- **L**onely?
- **T**ired?

These states make everything harder. Address them.

**Resources (Always):**

- SAMHSA National Helpline: 1-800-662-4357 (free, 24/7)
- AA: aa.org | NA: na.org
- SMART Recovery: smartrecovery.org
- Your sponsor/support person

What do you need most right now?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'maya',
          priority: 'high',
          content: `User in recovery. Support with healthy routines. Be mindful of capacity.`,
          category: 'sobriety-support',
          proactive: true,
          oneTime: false,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Craving Support
// ============================================================================

const cravingSupportDef: ToolDefinition = {
  id: 'cravingSupport',
  name: 'Craving Support',
  description: 'Support during active craving or urge',
  domain: 'sobriety',
  tags: ['sobriety', 'craving', 'urge', 'support', 'crisis'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('cravingSupport'),
      parameters: z.object({
        cravingIntensity: z.enum(['mild', 'moderate', 'strong', 'overwhelming']).optional(),
        trigger: z.string().optional().describe('What triggered this craving'),
      }),
      execute: async ({ cravingIntensity, trigger }) => {
        const userId = ctx.userId;
        log.debug({ userId, cravingIntensity }, '[sobriety] craving support');

        const response = `I'm here. You reached out - that's the right move. Let's ride this wave together.

${cravingIntensity ? `**Intensity:** ${cravingIntensity}` : ''}
${trigger ? `**Trigger:** "${trigger}"` : ''}

**First: Breathe.**

4 in... hold 4... out 6... repeat.

**The Truth About Cravings:**

- They peak and pass (usually 15-30 minutes)
- They lie ("just one" is a lie)
- They feel permanent but aren't
- You've survived every craving so far
- This one will pass too

**URGE SURFING:**

Cravings are like waves. You don't have to fight them - you can surf them.

1. **Notice** - "I'm having a craving"
2. **Breathe** - Slow, deep breaths
3. **Observe** - Where do you feel it in your body?
4. **Don't engage** - Don't argue with it, just watch
5. **Wait** - It will crest and fall

**Right Now Options:**

| Action | Why It Helps |
|--------|--------------|
| **Call someone** | Connection breaks craving |
| **Move your body** | Walk, jump, anything |
| **Change location** | Physically leave the trigger |
| **Cold water on face** | Activates dive reflex, calms |
| **Eat something** | Sometimes it's hunger |
| **HALT check** | Address the real need |

${
  cravingIntensity === 'overwhelming'
    ? `
**If It's Overwhelming:**

- Call your sponsor NOW
- Go to a meeting (even online)
- Call SAMHSA: 1-800-662-4357
- Go somewhere safe immediately
- Tell someone what's happening

You don't have to do this alone.`
    : ''
}

**Play the Tape Forward:**

If you use:
- How will you feel in an hour?
- Tomorrow morning?
- What consequences follow?
- Who will you hurt?
- Will the problem that triggered this be solved?

**You Reached Out. That's Strength.**

The fact that you're here, talking instead of using, is the program working. This is recovery. This hard moment is part of it.

The craving will pass. Stay with me. What can you do in the next 5 minutes?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Sobriety Grief
// ============================================================================

const sobrietyGriefDef: ToolDefinition = {
  id: 'sobrietyGrief',
  name: 'Sobriety Grief',
  description: 'Process the grief of giving up your substance/behavior',
  domain: 'sobriety',
  tags: ['sobriety', 'grief', 'loss', 'processing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sobrietyGrief'),
      parameters: z.object({
        whatYouGaveUp: z.string().optional().describe("What you're grieving"),
        whatYouMiss: z.string().optional().describe('What you miss about it'),
      }),
      execute: async ({ whatYouGaveUp, whatYouMiss }) => {
        const userId = ctx.userId;
        log.debug({ userId, whatYouGaveUp }, '[sobriety] grief');

        const response = `It's okay to grieve what you gave up. Even if it was killing you.

${whatYouGaveUp ? `**What you gave up:** "${whatYouGaveUp}"` : ''}
${whatYouMiss ? `**What you miss:** "${whatYouMiss}"` : ''}

**The Uncomfortable Truth:**

You can be glad you stopped AND miss it. Both are true. Recovery isn't about pretending you hated every moment.

**What You Might Grieve:**

- The ritual of it
- The immediate relief
- The social aspects
- The escape it provided
- The person you were when using
- The friends you used with
- The fun parts (there were some)
- The simplicity of numbing

**This Is Normal:**

Grieving doesn't mean you want to go back. It means you're human and this was a significant relationship - even if destructive.

**The Relationship Metaphor:**

Think of addiction like a toxic relationship:
- It gave you something real
- It also hurt you deeply
- Leaving was right
- Missing it is normal
- Going back would still be bad

**What You Actually Lost:**

Not just the substance, but:
- A coping mechanism
- An identity
- Social circles
- A way to handle life
- Immediate solutions (even if false)

**What You Gained:**

| Lost | Gained |
|------|--------|
| Numbing | Feeling (painful AND good) |
| Escape | Presence |
| Quick relief | Sustainable peace |
| Chaos | Stability |
| Isolation | Real connection |
| Shame spirals | Self-respect |

**Processing The Grief:**

1. **Acknowledge it** - Don't shame yourself for missing it
2. **Talk about it** - With sponsor, therapist, meetings
3. **Remember the whole picture** - Not just the good parts
4. **Create new rituals** - Replace what was lost
5. **Be patient** - This grief lessens with time

What do you miss that you're afraid to admit?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Sober Socializing
// ============================================================================

const soberSocializingDef: ToolDefinition = {
  id: 'soberSocializing',
  name: 'Sober Socializing',
  description: 'Navigate social situations while sober',
  domain: 'sobriety',
  tags: ['sobriety', 'social', 'events', 'practical'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('soberSocializing'),
      parameters: z.object({
        upcomingEvent: z.string().optional().describe("What event you're worried about"),
        specificConcern: z.string().optional().describe('Your specific concern'),
      }),
      execute: async ({ upcomingEvent, specificConcern }) => {
        const userId = ctx.userId;
        log.debug({ userId, upcomingEvent }, '[sobriety] social');

        const response = `Socializing sober is hard at first. It gets easier. Let's prepare.

${upcomingEvent ? `**Upcoming event:** "${upcomingEvent}"` : ''}
${specificConcern ? `**Your concern:** "${specificConcern}"` : ''}

**Why It Feels Hard:**

- Substances were social lubricant
- You might feel awkward
- Others are drinking/using
- You don't know what to say
- FOMO is real
- You're relearning how to have fun

**Before The Event:**

| Preparation | Why |
|-------------|-----|
| **Eat well** | Don't go hungry |
| **Have an exit plan** | You can always leave |
| **Tell a sober friend** | Accountability |
| **Know what you'll drink** | Have an answer ready |
| **Decide your limits** | How long you'll stay |
| **Have support on call** | Text check-ins |

**What To Say About Not Drinking:**

You don't owe anyone an explanation. Options:
- "I'm not drinking tonight"
- "I'm driving"
- "I'm on medication"
- "I'm taking a break"
- "No thanks" (no explanation)
- "I stopped drinking"

**At The Event:**

- Always have a drink in hand (non-alcoholic)
- Give yourself permission to leave early
- Find other non-drinkers (they exist)
- Focus on connection, not consumption
- Check in with yourself regularly

**If It Gets Hard:**

- Text your person
- Go to the bathroom for a reset
- Leave. Seriously, just leave.
- You don't have to explain
- Better to leave than to use

**The Revelation:**

Eventually you'll discover: Most parties aren't that fun. Drinking made them seem fun. Sober, you get to choose what's actually worth your time.

**Building Sober Social Life:**

- Sober events and meetups
- Morning activities (hiking, coffee, gym)
- Recovery community connections
- Hobbies that don't center around substances
- Friends who respect your journey

What would make you feel most prepared for this situation?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const sobrietyTools = [
  sobrietyCheckinDef,
  cravingSupportDef,
  sobrietyGriefDef,
  soberSocializingDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'sobriety',
  sobrietyTools
);

export default getToolDefinitions;
