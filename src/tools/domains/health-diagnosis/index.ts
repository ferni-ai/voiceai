/**
 * Health Diagnosis Domain
 *
 * Tools for navigating the emotional and practical impact of receiving
 * a significant health diagnosis - chronic illness, cancer, autoimmune, etc.
 *
 * DOMAIN: health-diagnosis
 * PERSONA AFFINITY: Ferni (emotional), Maya (routines), Nayan (wisdom)
 *
 * TOOLS:
 *   Processing: diagnosisShock, whyMe, adjustingExpectations
 *   Living With: chronicIllnessLife, invisibleIllness
 *   Support: tellingOthers, careTeamNavigation
 *
 * PRINCIPLES:
 * - A diagnosis changes everything and nothing
 * - Grief for your healthy self is real
 * - Your worth is not your productivity
 * - Living with illness takes courage
 *
 * RESEARCH BASIS:
 * - Kübler-Ross grief model adapted for illness
 * - Chronic illness adjustment
 * - Disability justice framework
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
// TOOL: Diagnosis Shock
// ============================================================================

const diagnosisShockDef: ToolDefinition = {
  id: 'diagnosisShock',
  name: 'Diagnosis Shock',
  description: 'Process the initial shock of a significant diagnosis',
  domain: 'health-diagnosis',
  tags: ['health', 'diagnosis', 'shock', 'grief'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('diagnosisShock'),
      parameters: z.object({
        diagnosis: z.string().optional().describe('What you were diagnosed with'),
        howLongAgo: z.string().optional().describe('How long since diagnosis'),
      }),
      execute: async ({ diagnosis, howLongAgo }) => {
        const userId = ctx.userId;
        log.debug({ userId, howLongAgo }, '[health-diagnosis] shock');

        const response = `A diagnosis splits life into before and after. I see you in that "after."

${diagnosis ? `**Diagnosis:** ${diagnosis}` : ''}
${howLongAgo ? `**Time since:** ${howLongAgo}` : ''}

**What You're Experiencing Is Grief:**

You're grieving:
- The body you thought you had
- The health you assumed
- The future you planned
- Your sense of invulnerability
- The life that was "normal"

This grief is real, even if no one died.

**Normal Responses:**

| Response | What It Means |
|----------|---------------|
| Shock/numbness | Brain protecting you |
| "This can't be real" | Denial is a phase |
| Obsessive research | Trying to regain control |
| Rage | At body, doctors, universe |
| Bargaining | "If I just..." |
| Deep sadness | Appropriate response to loss |
| Terror | Facing mortality/uncertainty |

**What You Need Right Now:**

1. **Information** - But from good sources, not 3am Google
2. **Support** - People who can hold this with you
3. **Time** - To process before making decisions
4. **Permission** - To feel whatever you feel
5. **Basic care** - Eat, sleep, move when you can

**What Can Wait:**

- Telling everyone
- Making all the decisions
- Having a positive attitude
- "Fighting" or "being strong"
- Knowing what this means for your whole life

**A Truth:**

You don't have to be brave right now. You don't have to be inspiring. You just have to be human receiving hard news. That's enough.

**Timeline of Adjustment:**

- **Acute phase** (days-weeks): Shock, information gathering
- **Processing** (weeks-months): Grief, anger, fear, questions
- **Adjustment** (months-year+): New normal emerges
- **Integration** (ongoing): This becomes part of your story, not the whole story

What do you most need right now?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'all',
          priority: 'high',
          content: `User processing health diagnosis. Handle with care. Protect their capacity.`,
          category: 'health-diagnosis',
          proactive: true,
          oneTime: false,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Chronic Illness Life
// ============================================================================

const chronicIllnessLifeDef: ToolDefinition = {
  id: 'chronicIllnessLife',
  name: 'Chronic Illness Life',
  description: 'Navigate the ongoing reality of living with chronic illness',
  domain: 'health-diagnosis',
  tags: ['health', 'chronic-illness', 'adjustment', 'living-with'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('chronicIllnessLife'),
      parameters: z.object({
        currentStruggle: z.string().optional().describe("What you're struggling with"),
        illnessDuration: z.string().optional().describe("How long you've been living with this"),
      }),
      execute: async ({ currentStruggle, illnessDuration }) => {
        const userId = ctx.userId;
        log.debug({ userId, illnessDuration }, '[health-diagnosis] chronic life');

        const response = `Living with chronic illness is a daily negotiation that healthy people don't see.

${currentStruggle ? `**Current struggle:** "${currentStruggle}"` : ''}
${illnessDuration ? `**Living with this for:** ${illnessDuration}` : ''}

**The Invisible Reality:**

| What People See | What You Experience |
|-----------------|---------------------|
| "You look fine" | Exhaustion masked |
| "You cancelled again" | Managing limited energy |
| "You're so strong" | Just surviving |
| "Try this cure" | Unsolicited advice fatigue |
| Normal life | Constant calculations |

**The Energy Economy:**

Spoon theory is real. You have limited energy units. Every activity costs.

**Energy Costs:**

| Activity | Cost |
|----------|------|
| Basic hygiene | 1-2 spoons |
| Working | 3-6 spoons |
| Social event | 3-5 spoons |
| Doctor appointment | 2-4 spoons (plus emotional) |
| Bad symptom day | Starts in deficit |

**The Grief That Doesn't End:**

Chronic illness means ongoing grief:
- Grief for bad days
- Grief for missed events
- Grief for the person you were
- Grief when new symptoms appear
- Grief when treatments fail

This grief is allowed to recur. You don't "get over" chronic illness.

**What Helps:**

1. **Pacing** - Do less than you think you can
2. **Rest before crash** - Not just after
3. **Community** - Others who understand
4. **Boundaries** - "I can't" is a complete sentence
5. **Self-compassion** - You're doing hard things daily
6. **Modified goals** - Not lower, just different

**The Comparisons:**

Stop comparing yourself to:
- Your healthy self
- Other people's capacity
- What you "should" do
- Expectations designed for able bodies

**Your value is not your productivity.**

**What You Deserve:**

- Rest without guilt
- Accommodations without shame
- Belief when you describe your experience
- Support without judgment
- Good days celebrated, bad days supported

What's the hardest part of living with your illness right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Invisible Illness
// ============================================================================

const invisibleIllnessDef: ToolDefinition = {
  id: 'invisibleIllness',
  name: 'Invisible Illness',
  description: "Navigate the challenges of illnesses others can't see",
  domain: 'health-diagnosis',
  tags: ['health', 'invisible-illness', 'validation', 'understanding'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('invisibleIllness'),
      parameters: z.object({
        whatPeopleSay: z.string().optional().describe('What people say that hurts'),
        hardestPart: z.string().optional().describe('Hardest part of invisibility'),
      }),
      execute: async ({ whatPeopleSay, hardestPart }) => {
        const userId = ctx.userId;
        log.debug({ userId, hardestPart }, '[health-diagnosis] invisible');

        const response = `When your illness is invisible, you spend energy proving you're sick AND managing the illness.

${whatPeopleSay ? `**What people say:** "${whatPeopleSay}"` : ''}
${hardestPart ? `**Hardest part:** "${hardestPart}"` : ''}

**The Double Burden:**

1. Living with the illness
2. Convincing others it's real

**Things You're Tired of Hearing:**

| They Say | What You Hear |
|----------|---------------|
| "You don't look sick" | "I don't believe you" |
| "But you were fine yesterday" | "Symptoms should be consistent" |
| "Have you tried..." | "I know better than you/your doctors" |
| "You're so lucky you can rest" | "Your inability to work is enviable" |
| "It's probably stress" | "This is in your head" |
| "My cousin cured theirs with..." | "You're not trying hard enough" |

**The Mask:**

On good days, you look "normal." This leads to:
- Doubted on bad days
- Expected to maintain good-day capacity
- Your worst days are invisible
- Rest feels like laziness to others

**The Validation You Deserve:**

- Your symptoms are real
- Your pain is real
- Your exhaustion is real
- Your limitations are real
- You know your body better than observers

**Navigating Others:**

**At work:**
- You're not obligated to share details
- "Medical condition" is enough
- Document accommodations needed
- ADA protections exist

**With family/friends:**
- Choose who gets the full story
- "I'm not feeling well" can suffice
- Set boundaries on advice
- Find people who believe you

**With healthcare:**
- You are not crazy
- Advocate for yourself
- Second opinions are valid
- You're the expert on your body

**A Permission:**

You don't have to prove your illness to everyone. The people who matter will believe you. The ones who don't aren't your responsibility to convince.

What would make you feel more seen?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Telling Others
// ============================================================================

const tellingOthersDef: ToolDefinition = {
  id: 'tellingOthers',
  name: 'Telling Others',
  description: 'Navigate sharing your diagnosis with family, friends, work',
  domain: 'health-diagnosis',
  tags: ['health', 'disclosure', 'communication', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('tellingOthers'),
      parameters: z.object({
        whoToTell: z.enum(['family', 'friends', 'work', 'everyone', 'specific']).optional(),
        concern: z.string().optional().describe("What you're worried about"),
      }),
      execute: async ({ whoToTell, concern }) => {
        const userId = ctx.userId;
        log.debug({ userId, whoToTell }, '[health-diagnosis] telling others');

        const response = `You control your story. You decide who knows, what they know, and when.

${whoToTell ? `**Who you're considering telling:** ${whoToTell}` : ''}
${concern ? `**Your concern:** "${concern}"` : ''}

**Your Rights:**

- You don't owe anyone your diagnosis
- You can share different amounts with different people
- You can change your mind about sharing
- You can set boundaries on questions
- "I'd rather not discuss it" is valid

**Telling Different Groups:**

**Close Family:**
- Often first to know
- Need clear information
- May have strong reactions (their grief)
- Set boundaries on their involvement
- Designate a family communicator if needed

**Friends:**
- Tiered disclosure is okay
- Inner circle vs. wider circle
- Some will step up, some will step back
- Their reactions are about them
- Quality > quantity in support

**Work:**
- Know your legal rights (ADA, FMLA)
- HR is not your friend (but may be necessary)
- Share only what's needed
- Document everything
- "Medical condition requiring accommodation" can suffice

**Social Media/Public:**
- Totally optional
- Can invite support or unwanted advice
- Control the narrative if you share
- "Going private" for a while is okay

**What to Expect:**

| Their Reaction | What It Means |
|----------------|---------------|
| Shock/crying | They're processing |
| Awkwardness | They don't know what to say |
| Advice-giving | They want to help (poorly) |
| Distance | They can't handle it |
| Stepping up | They're your people |
| Making it about them | They need support too (elsewhere) |

**Script Ideas:**

"I wanted to let you know I've been diagnosed with [X]. I'm still processing it. Right now what helps is [specific request]."

"I'm sharing this because [reason]. I'm not looking for advice, just support."

"I'd prefer to keep this private from [others]. Thank you for respecting that."

**After Telling:**

- Let yourself feel whatever you feel
- Some conversations will go badly
- Some people will surprise you
- You're allowed to limit further discussion

Who feels most important to tell, and what's holding you back?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const healthDiagnosisTools = [
  diagnosisShockDef,
  chronicIllnessLifeDef,
  invisibleIllnessDef,
  tellingOthersDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'health-diagnosis',
  healthDiagnosisTools
);

export default getToolDefinitions;
