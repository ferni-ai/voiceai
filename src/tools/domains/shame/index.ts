/**
 * Shame Domain
 *
 * Tools for understanding, processing, and healing from shame.
 * Shame says "I am bad" while guilt says "I did something bad."
 *
 * DOMAIN: shame
 * PERSONA AFFINITY: Ferni (emotional support), Nayan (wisdom)
 *
 * TOOLS:
 *   Understanding: distinguishShameFromGuilt, identifyShameTriggers
 *   Processing: processShameExperience, healCoreShame
 *
 * PRINCIPLES:
 * - Shame thrives in secrecy, dies in the light
 * - Shame attacks identity; guilt addresses behavior
 * - Healing comes through connection, not isolation
 * - Everyone has shame; it's part of being human
 *
 * RESEARCH BASIS:
 * - Brené Brown's shame resilience theory
 * - Internal Family Systems (IFS) work with shame parts
 * - Attachment theory and shame
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
// SHAME PATTERNS & TRIGGERS
// ============================================================================

const SHAME_CATEGORIES: Record<
  string,
  { description: string; commonTriggers: string[]; healingPath: string[] }
> = {
  appearance: {
    description: 'Shame about body, looks, or physical presentation',
    commonTriggers: ['Comparisons', 'Comments from others', 'Media exposure', 'Photos'],
    healingPath: ['Body neutrality', 'Self-acceptance work', 'Limiting comparisons'],
  },
  competence: {
    description: 'Shame about abilities, intelligence, or achievements',
    commonTriggers: ['Failures', 'Being compared', 'Making mistakes', 'Not knowing things'],
    healingPath: ['Growth mindset', 'Normalizing mistakes', 'Self-compassion'],
  },
  moral: {
    description: 'Shame about past actions or perceived moral failings',
    commonTriggers: ['Past mistakes', 'Broken promises', 'Hurting others', 'Secrets'],
    healingPath: ['Making amends', 'Self-forgiveness', 'Values clarification'],
  },
  relational: {
    description: 'Shame about relationships, belonging, or lovability',
    commonTriggers: ['Rejection', 'Being excluded', 'Conflict', 'Being "too much" or "not enough"'],
    healingPath: ['Connection', 'Vulnerability practice', 'Attachment healing'],
  },
  identity: {
    description: 'Deep core shame about who you fundamentally are',
    commonTriggers: ['Childhood messages', 'Trauma', 'Systemic oppression', 'Family patterns'],
    healingPath: ['Therapy', 'Parts work (IFS)', 'Community', 'Narrative rewriting'],
  },
};

// ============================================================================
// TOOL: Distinguish Shame from Guilt
// ============================================================================

const distinguishShameFromGuiltDef: ToolDefinition = {
  id: 'distinguishShameFromGuilt',
  name: 'Distinguish Shame from Guilt',
  description: 'Help differentiate between shame (I am bad) and guilt (I did bad)',
  domain: 'shame',
  tags: ['shame', 'guilt', 'emotional-intelligence', 'self-awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('distinguishShameFromGuilt'),
      parameters: z.object({
        situation: z.string().describe('What happened that triggered these feelings'),
        feeling: z.string().optional().describe('How they describe their emotional experience'),
      }),
      execute: async ({ situation, feeling }) => {
        const userId = ctx.userId;

        log.debug({ userId, situation }, '[shame] distinguishing shame from guilt');

        const response = `I appreciate you sharing this with me. That takes courage.

**Understanding the Difference:**

**Guilt says:** "I did something that doesn't align with my values."
- Focus: The behavior
- Healthy response: Make amends, change behavior
- Path forward: Clear action steps

**Shame says:** "I am fundamentally flawed, wrong, or bad."
- Focus: Identity/self
- Unhealthy response: Hide, isolate, attack self
- Path forward: Self-compassion, connection

**Reflecting on your situation:**
What happened: "${situation}"
${feeling ? `What you're feeling: "${feeling}"` : ''}

**Key Question to Ask Yourself:**
"Am I feeling bad about something I *did* (guilt), or am I feeling bad about who I *am* (shame)?"

**If it's guilt:** Great news - behavior can change. We can make amends and do better.

**If it's shame:** This is harder but just as healable. Shame tells you a lie about your worth. The truth is: you are inherently worthy, even when you make mistakes.

**Remember:** Brené Brown's research shows that shame thrives in secrecy. By talking about this, you're already starting to heal.`;

        // Track insight for cross-persona awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'nayan', // Nayan for wisdom on shame
          priority: 'normal',
          content: `User exploring shame vs guilt around: ${situation.slice(0, 50)}`,
          category: 'shame-work',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Process Shame Experience
// ============================================================================

const processShameExperienceDef: ToolDefinition = {
  id: 'processShameExperience',
  name: 'Process Shame Experience',
  description: 'Work through a current shame experience with compassion',
  domain: 'shame',
  tags: ['shame', 'processing', 'self-compassion', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('processShameExperience'),
      parameters: z.object({
        experience: z.string().describe('The shame experience to process'),
        shameCategory: z
          .enum(['appearance', 'competence', 'moral', 'relational', 'identity', 'other'])
          .optional()
          .describe('The category of shame'),
        intensity: z
          .enum(['mild', 'moderate', 'intense', 'overwhelming'])
          .optional()
          .describe('How intense the shame feels'),
      }),
      execute: async ({ experience, shameCategory, intensity }) => {
        const userId = ctx.userId;

        log.debug({ userId, shameCategory, intensity }, '[shame] processing shame experience');

        const categoryInfo =
          shameCategory && shameCategory !== 'other' ? SHAME_CATEGORIES[shameCategory] : null;

        const response = `Thank you for trusting me with something so vulnerable. Shame is one of the most painful emotions we can feel.

**Your experience:** "${experience}"

${
  categoryInfo
    ? `**This sounds like ${shameCategory} shame:**
${categoryInfo.description}

Common triggers: ${categoryInfo.commonTriggers.join(', ')}
`
    : ''
}

**Brené Brown's Shame Resilience Steps:**

1. **Recognize shame** - You're already doing this. ✓
   Notice: Where do you feel it in your body?

2. **Reality-check** - Talk to someone you trust (which you're doing now).
   Shame can't survive being spoken and met with empathy.

3. **Reach out** - Connection is the antidote to shame.
   Who in your life makes you feel accepted as you are?

4. **Speak shame** - Name it to tame it.
   "I'm feeling shame about..."

**Self-Compassion Practice:**
- Acknowledge: "This is a moment of suffering"
- Connect: "Everyone feels shame sometimes"
- Kindness: "May I be gentle with myself"

**A truth to sit with:**
The fact that you feel shame means you care - about being a good person, about doing right. That's not a flaw; that's your humanity.

${
  intensity === 'overwhelming' || intensity === 'intense'
    ? `
**Important:** If shame feels overwhelming, it might be touching on deeper wounds. Consider speaking with a therapist who specializes in shame work. This isn't weakness - it's wisdom.`
    : ''
}

**I'm here with you in this.** What part of this feels most alive for you right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Heal Core Shame
// ============================================================================

const healCoreShameDef: ToolDefinition = {
  id: 'healCoreShame',
  name: 'Heal Core Shame',
  description: 'Begin addressing deep-seated childhood or early shame',
  domain: 'shame',
  tags: ['shame', 'healing', 'childhood', 'deep-work'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('healCoreShame'),
      parameters: z.object({
        origin: z.string().optional().describe('Where user thinks their core shame comes from'),
        coreMessage: z.string().optional().describe('The "I am..." statement that shame whispers'),
      }),
      execute: async ({ origin, coreMessage }) => {
        const userId = ctx.userId;

        log.debug({ userId, hasOrigin: !!origin }, '[shame] healing core shame work');

        const response = `I want to approach this with the gentleness it deserves.

Core shame - the kind that lives deep in us and tells us we're fundamentally not okay - is one of the most painful human experiences. And also one of the most healable.

${
  origin
    ? `**You've identified a source:** "${origin}"
This awareness itself is healing. Many people carry shame without ever knowing where it came from.`
    : ''
}

${
  coreMessage
    ? `**The message shame whispers:** "${coreMessage}"

Let me offer a reframe: This message isn't truth - it's a wound. Someone or something made you believe this. But beliefs can be unlearned.`
    : ''
}

**Understanding Core Shame:**
Core shame often comes from:
- Childhood experiences where we were shamed
- Messages about our worthiness
- Trauma that wasn't processed
- Family or cultural patterns

**The Healing Path:**

1. **Name the shame** (you're doing this)
   "I feel shame about... because I believe..."

2. **Trace the origin**
   "Where did I first learn this about myself?"

3. **Separate past from present**
   "That was then. I am grown now. I can protect myself."

4. **Find counter-evidence**
   "What proves this shame-message wrong?"

5. **Build new beliefs through experience**
   Small moments of being accepted, seen, loved.

**An important truth:**
You were born worthy. Nothing you did or had done to you changed that. The shame was a message, not reality.

**Note:** Core shame work is deep work. It often benefits from professional support - a therapist who specializes in shame, trauma, or attachment. This isn't because you're broken, but because you deserve expert support for expert-level healing.

What part of this lands for you?`;

        // Track deep work for cross-persona awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'all', // Alert all personas to handle with care
          priority: 'high',
          content: `User doing core shame healing work. Handle with extra care.`,
          category: 'deep-emotional-work',
          proactive: true,
          oneTime: false,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Identify Shame Triggers
// ============================================================================

const identifyShamesTriggersDef: ToolDefinition = {
  id: 'identifyShameTriggers',
  name: 'Identify Shame Triggers',
  description: 'Map out what situations, people, or contexts trigger shame',
  domain: 'shame',
  tags: ['shame', 'triggers', 'self-awareness', 'patterns'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('identifyShameTriggers'),
      parameters: z.object({
        recentTrigger: z.string().optional().describe('A recent shame trigger'),
        recurringPattern: z.boolean().optional().describe('Is this a recurring trigger'),
      }),
      execute: async ({ recentTrigger, recurringPattern }) => {
        const userId = ctx.userId;

        log.debug({ userId, hasRecentTrigger: !!recentTrigger }, '[shame] identifying triggers');

        const response = `Knowing your shame triggers is powerful - it lets you prepare, protect yourself, and eventually heal.

${recentTrigger ? `**Your recent trigger:** "${recentTrigger}"` : ''}

**Common Shame Trigger Categories:**

**People:**
- Who triggers your shame? (Parents, partners, bosses, strangers?)
- What do they say or do that activates it?

**Situations:**
- Performance situations (being evaluated)
- Social situations (being seen, judged)
- Intimate situations (being truly known)
- Failure or mistake situations

**Contexts:**
- Certain places, times of day, or life phases
- When you're tired, hungry, or stressed
- Anniversary dates of painful events

**Body Signals to Notice:**
When shame hits, you might feel:
- Heat in face/chest
- Wanting to shrink or disappear
- Looking down or away
- Stomach dropping
- Wanting to hide

${
  recurringPattern
    ? `
**Since this is recurring:**
This might be touching a core wound. The good news? Recurring triggers are often doorways to healing - they keep showing up because they're asking to be addressed.`
    : ''
}

**Questions to explore:**
1. What's the first time you remember feeling this shame?
2. Whose voice do you hear when the shame speaks?
3. What would it take to feel safe when this trigger appears?

Would you like to explore any specific trigger more deeply?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const shameTools = [
  distinguishShameFromGuiltDef,
  processShameExperienceDef,
  healCoreShameDef,
  identifyShamesTriggersDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport('shame', shameTools);

export default getToolDefinitions;
