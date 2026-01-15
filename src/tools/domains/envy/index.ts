/**
 * Envy Domain
 *
 * Tools for understanding, transforming, and healing from envy.
 * Envy is information - it tells us what we want for ourselves.
 *
 * DOMAIN: envy
 * PERSONA AFFINITY: Ferni (emotional support), Nayan (wisdom)
 *
 * TOOLS:
 *   Understanding: understandEnvy, envyAsInformation
 *   Transformation: transformEnvy, comparisonDetox
 *   Healing: celebrateOthers, enoughness
 *
 * PRINCIPLES:
 * - Envy points to unmet desires and unexpressed potential
 * - Comparing outsides to insides is always unfair
 * - Someone else's success doesn't diminish your possibilities
 * - Envy can become inspiration with the right mindset
 *
 * RESEARCH BASIS:
 * - Social comparison theory (Festinger)
 * - Benign vs malicious envy (Van de Ven)
 * - Self-compassion and comparison (Neff)
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
// ENVY TYPES & PATTERNS
// ============================================================================

const ENVY_DOMAINS: Record<
  string,
  { description: string; commonTargets: string[]; underlyingDesire: string }
> = {
  career: {
    description: 'Envy of professional success, titles, or achievements',
    commonTargets: ['Colleagues getting promoted', 'Successful friends', 'Industry leaders'],
    underlyingDesire: 'Recognition, impact, financial security, or purpose through work',
  },
  relationships: {
    description: "Envy of others' relationships or social lives",
    commonTargets: ['Happy couples', 'Close friend groups', 'Popular people'],
    underlyingDesire: 'Connection, belonging, love, or being truly known',
  },
  lifestyle: {
    description: 'Envy of material possessions, experiences, or lifestyle',
    commonTargets: ['Travel photos', 'Nice homes', 'Financial freedom'],
    underlyingDesire: 'Freedom, security, experiences, or aesthetic pleasure',
  },
  appearance: {
    description: "Envy of others' looks, body, or physical attributes",
    commonTargets: ['Attractive people', 'Fit bodies', 'Youth'],
    underlyingDesire: 'Acceptance, confidence, or feeling attractive/desirable',
  },
  talent: {
    description: 'Envy of natural abilities, skills, or gifts',
    commonTargets: ['Talented artists', 'Natural athletes', 'Quick learners'],
    underlyingDesire: 'Self-expression, mastery, or being special/gifted',
  },
  family: {
    description: "Envy of others' family situations",
    commonTargets: ['Close families', 'Parents with support', 'Healthy family dynamics'],
    underlyingDesire: 'Belonging, support system, or healing family wounds',
  },
};

// ============================================================================
// TOOL: Understand Envy
// ============================================================================

const understandEnvyDef: ToolDefinition = {
  id: 'understandEnvy',
  name: 'Understand Envy',
  description: 'Explore what envy is telling you about your desires',
  domain: 'envy',
  tags: ['envy', 'understanding', 'emotional-intelligence', 'desires'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('understandEnvy'),
      parameters: z.object({
        envyTarget: z.string().describe('Who or what you envy'),
        envyDomain: z
          .enum(['career', 'relationships', 'lifestyle', 'appearance', 'talent', 'family', 'other'])
          .optional()
          .describe('The domain of envy'),
      }),
      execute: async ({ envyTarget, envyDomain }) => {
        const userId = ctx.userId;

        log.debug({ userId, envyDomain }, '[envy] understanding envy');

        const domainInfo = envyDomain && envyDomain !== 'other' ? ENVY_DOMAINS[envyDomain] : null;

        const response = `I'm curious about what you're noticing. That takes self-awareness.

Envy is one of those emotions we're taught to be ashamed of. But actually? Envy is valuable data.

**What you're noticing:** You envy "${envyTarget}"

${
  domainInfo
    ? `**This is ${envyDomain} envy:**
${domainInfo.description}

**What this often points to:**
${domainInfo.underlyingDesire}
`
    : ''
}

**Envy as Information:**

When we envy someone, we're really seeing a reflection of our own desires - things we want but might be afraid to pursue, admit to, or believe we deserve.

**Key Questions to Ask:**

1. **What specifically am I envying?**
   (Often it's not the whole person, but one aspect)

2. **What does this tell me about what I want?**
   (Envy = unexpressed desire seeking expression)

3. **Is this something I could work toward?**
   (Sometimes yes, sometimes no - both are okay)

4. **Am I comparing my inside to their outside?**
   (We see their highlight reel, not their struggles)

**Two Types of Envy:**

**Benign Envy:** "I want that too, and I can work toward it"
→ This can motivate and inspire action

**Malicious Envy:** "I want them not to have it"
→ This usually points to deeper pain that needs attention

Which type feels more like what you're experiencing?

**A Reframe:**
Envy doesn't mean you're bad. It means you're human, with desires. The question is: what will you do with this information?`;

        // Track insight for cross-persona awareness
        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'jordan', // Jordan for goals
          priority: 'low',
          content: `User exploring envy around ${envyDomain || 'something'}. Possible desire: ${domainInfo?.underlyingDesire || 'unknown'}`,
          category: 'envy-exploration',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Transform Envy
// ============================================================================

const transformEnvyDef: ToolDefinition = {
  id: 'transformEnvy',
  name: 'Transform Envy',
  description: 'Turn envy into motivation and inspiration',
  domain: 'envy',
  tags: ['envy', 'transformation', 'motivation', 'growth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('transformEnvy'),
      parameters: z.object({
        envyTarget: z.string().describe('Who or what triggers your envy'),
        specificAspect: z.string().optional().describe('The specific thing you envy about them'),
        willingToExplore: z.boolean().optional().describe('Open to exploring how to pursue this'),
      }),
      execute: async ({ envyTarget, specificAspect, willingToExplore }) => {
        const userId = ctx.userId;

        log.debug({ userId, willingToExplore }, '[envy] transforming envy');

        const response = `**Transforming Envy Into Fuel:**

**Your envy trigger:** "${envyTarget}"
${specificAspect ? `**What specifically:** "${specificAspect}"` : ''}

**Step 1: Extract the Desire**
Behind every envy is a want. What do you *really* want here?
- Is it their outcome?
- Their journey?
- How they seem to feel?
- How others perceive them?

**Step 2: Reality Check**
- Do you actually want to do what they did to get there?
- Would you trade your whole life for theirs?
- Are you seeing the full picture, or just the highlight reel?

**Step 3: Translate to Your Life**
Instead of wanting *their* success, what would YOUR version look like?
- Same result, different path
- Inspired by them, authentic to you

**Step 4: Take One Small Action**
Envy without action becomes bitterness.
Envy with action becomes motivation.

${
  willingToExplore
    ? `
**Let's get specific:**
If you could have one thing they have, what would it be?
And what's one tiny step you could take this week toward your own version?`
    : ''
}

You're making real progress by exploring this.

**Remember:** Their success doesn't use up the world's supply. There's room for both of you.

What's one small action you could take?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Comparison Detox
// ============================================================================

const comparisonDetoxDef: ToolDefinition = {
  id: 'comparisonDetox',
  name: 'Comparison Detox',
  description: 'Reduce harmful social comparison habits',
  domain: 'envy',
  tags: ['envy', 'comparison', 'social-media', 'wellbeing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('comparisonDetox'),
      parameters: z.object({
        comparisonSource: z
          .enum(['social_media', 'friends', 'coworkers', 'family', 'celebrities', 'strangers'])
          .optional()
          .describe('Where most comparisons happen'),
        frequency: z
          .enum(['sometimes', 'often', 'constantly'])
          .optional()
          .describe('How often you compare'),
      }),
      execute: async ({ comparisonSource, frequency }) => {
        const userId = ctx.userId;

        log.debug({ userId, comparisonSource }, '[envy] comparison detox');

        const response = `That makes sense given what you're going through.

Comparison is natural - our brains evolved to assess our standing. But in the age of curated feeds and highlight reels? It's become toxic.

${
  comparisonSource === 'social_media'
    ? `
**Social Media Reality Check:**
What you see: Perfect vacations, achievements, relationships
What's hidden: Struggles, doubts, curated angles, filters

Studies show: More social media = more depression and anxiety. Not because of social media itself, but because of comparison.`
    : ''
}

**The Comparison Detox Protocol:**

**Week 1: Awareness**
- Notice when you compare (what triggers it?)
- Notice how it makes you feel (body sensations)
- Don't try to stop - just observe

**Week 2: Boundaries**
- Unfollow or mute accounts that trigger envy
- Set time limits on comparison-triggering apps
- Notice: Do you feel better or worse after scrolling?

**Week 3: Redirect**
- When you catch yourself comparing: 
  "What's good in MY life right now?"
- Replace comparison with gratitude practice
- Celebrate others' wins without diminishing yourself

**Week 4: Cultivate Enoughness**
- Daily reminder: "I am enough, right now, as I am"
- Focus on your own path, not others' timelines
- Create more than you consume

${
  frequency === 'constantly'
    ? `
**Since comparison is constant for you:**
This might be pointing to a deeper insecurity. What would it feel like to believe you are enough? We could explore that together.`
    : ''
}

**Key Truth:**
"Comparison is the thief of joy." — Theodore Roosevelt

You're on your own timeline. What they have doesn't diminish what you have or what's possible for you.

Would you like to start with awareness this week?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Celebrate Others (Mudita Practice)
// ============================================================================

const celebrateOthersDef: ToolDefinition = {
  id: 'celebrateOthers',
  name: 'Celebrate Others',
  description: "Practice finding joy in others' happiness (mudita)",
  domain: 'envy',
  tags: ['envy', 'mudita', 'joy', 'growth', 'compassion'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('celebrateOthers'),
      parameters: z.object({
        personToCheerFor: z
          .string()
          .optional()
          .describe('Someone whose success you want to celebrate'),
        whyDifficult: z.string().optional().describe('Why it feels hard to be happy for them'),
      }),
      execute: async ({ personToCheerFor, whyDifficult }) => {
        const userId = ctx.userId;

        log.debug({ userId }, '[envy] mudita practice');

        const response = `This is such valuable work.

There's a beautiful concept called **Mudita** (moo-dee-tah) - it's the opposite of envy. It means finding joy in others' joy.

${personToCheerFor ? `**Person to practice with:** "${personToCheerFor}"` : ''}
${whyDifficult ? `**What makes it hard:** "${whyDifficult}"` : ''}

**Why Practice Mudita?**

1. **Unlimited supply** - Unlike resources, joy isn't zero-sum. Their happiness doesn't use up yours.

2. **Multiplies good feelings** - When you can feel happy for others, you get to feel happy MORE often.

3. **Releases envy's grip** - Envy tightens; mudita opens.

4. **Changes your brain** - Practicing mudita literally rewires neural pathways.

**Mudita Practice:**

**Step 1:** Think of someone who has something you want.

**Step 2:** Imagine their joy - really feel into what it must be like for them.

**Step 3:** Say (or think): "May your happiness continue. May you keep thriving."

**Step 4:** Notice what happens in your body.

${
  whyDifficult
    ? `
**When it's hard:**
"${whyDifficult}"

This is honest and important. Mudita isn't about faking happiness - it's about cultivating it. Start small. Even 1% genuine happiness for them is a start.

Ask: "What would need to heal in me for their success to feel less threatening?"`
    : ''
}

**A Buddhist Teaching:**
"Thousands of candles can be lit from a single candle, and the life of the candle will not be shortened. Happiness never decreases by being shared."

Want to try the practice together right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const envyTools = [understandEnvyDef, transformEnvyDef, comparisonDetoxDef, celebrateOthersDef];

export const { getToolDefinitions, domain, definitions } = createDomainExport('envy', envyTools);

export default getToolDefinitions;
