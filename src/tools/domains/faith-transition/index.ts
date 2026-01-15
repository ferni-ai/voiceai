/**
 * Faith Transition Domain
 *
 * Tools for navigating religious/spiritual transitions - leaving faith,
 * changing beliefs, deconstruction, or finding new spirituality.
 *
 * DOMAIN: faith-transition
 * PERSONA AFFINITY: Nayan (wisdom), Ferni (emotional support)
 *
 * TOOLS:
 *   Deconstruction: faithDeconstruction, leavingReligion
 *   Processing: spiritualGrief, beliefRebuilding
 *   Relationships: faithAndFamily, mixedFaithRelationship
 *
 * PRINCIPLES:
 * - Questioning is courage, not weakness
 * - Grief for lost certainty is real
 * - You can find meaning without religion
 * - Your spiritual journey is yours
 *
 * NOTE: Neutral support, not evangelism in any direction.
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
// TOOL: Faith Deconstruction
// ============================================================================

const faithDeconstructionDef: ToolDefinition = {
  id: 'faithDeconstruction',
  name: 'Faith Deconstruction',
  description: 'Support through questioning and deconstructing religious beliefs',
  domain: 'faith-transition',
  tags: ['faith', 'deconstruction', 'questioning', 'belief'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('faithDeconstruction'),
      parameters: z.object({
        background: z.string().optional().describe('Your religious background'),
        whatTriggeredThis: z.string().optional().describe('What started your questioning'),
        currentState: z.string().optional().describe('Where you are in the process'),
      }),
      execute: async ({ background, whatTriggeredThis, currentState }) => {
        const userId = ctx.userId;
        log.debug({ userId, background }, '[faith-transition] deconstruction');

        const response = `Questioning the faith you were raised in takes tremendous courage. You're not alone in this.

${background ? `**Your background:** ${background}` : ''}
${whatTriggeredThis ? `**What started this:** "${whatTriggeredThis}"` : ''}
${currentState ? `**Where you are:** "${currentState}"` : ''}

**What Deconstruction Is:**

Deconstruction is the process of:
- Examining beliefs you were taught
- Asking "Why do I believe this?"
- Separating cultural from spiritual
- Deciding what to keep and what to release
- Finding YOUR truth

**What It's NOT:**

- Weakness or giving up
- The devil/sin/temptation
- A phase (for most)
- Something wrong with you
- Easy

**Common Triggers:**

| Trigger | What It Does |
|---------|--------------|
| Suffering/tragedy | "Why would God allow this?" |
| Science/education | New information conflicts |
| LGBTQ+ identity | Religion says you're wrong, you know you're not |
| Hypocrisy in church | "They don't live what they preach" |
| Reading scripture critically | Finding contradictions |
| Other religions/worldviews | "Maybe mine isn't the only way" |
| Harm done by religion | To you or others |

**The Grief Is Real:**

You may be grieving:
- Certainty about life/death/purpose
- Community belonging
- Family approval
- Your identity as a believer
- The comfort of simple answers
- Afterlife beliefs

**This Grief Is Valid** - even if you're relieved to leave.

**Where People End Up:**

| Destination | What It Means |
|-------------|---------------|
| **Leave entirely** | Atheist, agnostic, secular |
| **Different faith** | New religion or denomination |
| **Spiritual but not religious** | Personal spirituality, no institution |
| **Progressive version** | Same tradition, new interpretation |
| **Take a break** | Step back, decide later |

All of these are valid. There's no right answer.

**What Helps:**

1. **Go slow** - This isn't a race
2. **Find community** - Others who understand
3. **Read widely** - Multiple perspectives
4. **Therapy** - Religious trauma is real
5. **Grieve** - Let yourself mourn what's lost
6. **Don't burn bridges yet** - Unless safety requires it

What questions feel most alive for you right now?`;

        void addCrossPersonaInsight(userId, {
          source: 'ferni',
          target: 'nayan',
          priority: 'normal',
          content: `User in faith transition/deconstruction. Approach with wisdom, not proselytizing.`,
          category: 'faith-transition',
          proactive: false,
          oneTime: true,
        });

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Spiritual Grief
// ============================================================================

const spiritualGriefDef: ToolDefinition = {
  id: 'spiritualGrief',
  name: 'Spiritual Grief',
  description: 'Process grief related to faith change',
  domain: 'faith-transition',
  tags: ['faith', 'grief', 'loss', 'processing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('spiritualGrief'),
      parameters: z.object({
        whatYoureLosing: z.string().optional().describe("What you're grieving"),
        conflictedFeelings: z.string().optional().describe('Any conflicting feelings'),
      }),
      execute: async ({ whatYoureLosing, conflictedFeelings }) => {
        const userId = ctx.userId;
        log.debug({ userId, whatYoureLosing }, '[faith-transition] spiritual grief');

        const response = `Leaving or changing faith involves real grief. This loss is valid, even if chosen.

${whatYoureLosing ? `**What you're losing:** "${whatYoureLosing}"` : ''}
${conflictedFeelings ? `**Conflicting feelings:** "${conflictedFeelings}"` : ''}

**What You Might Be Grieving:**

| Loss | Why It Hurts |
|------|--------------|
| **Certainty** | Knowing the "truth" felt secure |
| **Afterlife** | Not seeing loved ones again |
| **God relationship** | Prayer, feeling watched over |
| **Community** | Church family, belonging |
| **Identity** | "Christian/Muslim/etc." was who you were |
| **Family approval** | They may reject your change |
| **Worldview** | The story that explained everything |
| **Rituals** | Holidays, practices, rhythms |

**The Ambiguous Grief:**

This grief is complicated because:
- Society doesn't recognize it as loss
- You might feel you "should" be relieved
- People might celebrate or condemn you
- You might grieve and feel free simultaneously
- There's no funeral for lost faith

**Both/And:**

You can feel:
- Relieved AND sad
- Free AND lost
- Right AND grieving
- Angry at religion AND missing it

All feelings are valid. Humans are complex.

**Processing This Grief:**

1. **Name it as grief** - Give yourself permission to mourn
2. **Find witnesses** - Others who've been through this
3. **Create closure rituals** - Mark the transition
4. **Honor what was good** - Not everything was bad
5. **Build new meaning** - Purpose doesn't require religion
6. **Be patient** - This takes time

**What Remains:**

Leaving religion doesn't mean losing:
- Meaning and purpose
- Morality and ethics
- Wonder and awe
- Connection and community
- Rituals and practices
- Hope

These can exist outside religion. You get to build them.

What part of this grief feels heaviest right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Faith and Family
// ============================================================================

const faithAndFamilyDef: ToolDefinition = {
  id: 'faithAndFamily',
  name: 'Faith and Family',
  description: 'Navigate family relationships during faith transition',
  domain: 'faith-transition',
  tags: ['faith', 'family', 'relationships', 'conflict'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('faithAndFamily'),
      parameters: z.object({
        familyStance: z
          .enum(['very-religious', 'moderately-religious', 'mixed', 'secular'])
          .optional(),
        theirResponse: z.string().optional().describe('How family has responded'),
        yourNeed: z.string().optional().describe('What you need from them'),
      }),
      execute: async ({ familyStance, theirResponse, yourNeed }) => {
        const userId = ctx.userId;
        log.debug({ userId, familyStance }, '[faith-transition] family');

        const response = `Faith transitions often shake family relationships. This is one of the hardest parts.

${familyStance ? `**Family's religiosity:** ${familyStance}` : ''}
${theirResponse ? `**Their response:** "${theirResponse}"` : ''}
${yourNeed ? `**What you need:** "${yourNeed}"` : ''}

**Why Family Takes It Hard:**

From their perspective:
- They believe in hell and fear for your soul
- They feel they failed in raising you
- Their identity was tied to family faith
- Community may pressure them
- They genuinely think they're right

Understanding doesn't mean accepting poor treatment.

**Common Family Responses:**

| Response | What's Happening |
|----------|------------------|
| Anger | Fear expressing as control |
| Tears | Genuine grief and concern |
| Arguments | Trying to "save" you |
| Distance | Can't handle the change |
| Denial | "It's a phase" |
| Conditional love | "We'll accept you if..." |
| Eventual acceptance | Time and relationship |

**Protecting Yourself:**

| Boundary Type | Example |
|---------------|---------|
| **Topic limits** | "I won't discuss my beliefs at dinner" |
| **Contact limits** | Reduced contact if needed |
| **Event limits** | Choosing which religious events to attend |
| **Child limits** | "Don't proselytize to my kids" |

**Scripts:**

"I know this is hard for you. I need you to trust that I've thought carefully about this."

"I love you and want a relationship, but that has to include respect for my choices."

"I'm not available for debates about this. Can we talk about something else?"

**What You Don't Owe:**

- Defending your position
- Reconsidering to please them
- Attending religious events
- Pretending to believe
- Letting them "save" you

**What You Might Choose:**

- Attending some events for relationship
- Avoiding religion as a topic
- Being honest and accepting consequences
- Distance for your mental health

**The Long Game:**

Many families eventually adjust. Some don't. You can't control their journey, only yours.

What would make your family situation more manageable?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Belief Rebuilding
// ============================================================================

const beliefRebuildingDef: ToolDefinition = {
  id: 'beliefRebuilding',
  name: 'Belief Rebuilding',
  description: 'Support in rebuilding meaning and values after deconstruction',
  domain: 'faith-transition',
  tags: ['faith', 'meaning', 'values', 'rebuilding'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('beliefRebuilding'),
      parameters: z.object({
        whatYouMiss: z.string().optional().describe('What you miss from your old faith'),
        whatYoureLookingFor: z.string().optional().describe("What you're seeking"),
      }),
      execute: async ({ whatYouMiss, whatYoureLookingFor }) => {
        const userId = ctx.userId;
        log.debug({ userId, whatYoureLookingFor }, '[faith-transition] rebuilding');

        const response = `After deconstruction comes reconstruction. You get to build what's true for you.

${whatYouMiss ? `**What you miss:** "${whatYouMiss}"` : ''}
${whatYoureLookingFor ? `**What you're seeking:** "${whatYoureLookingFor}"` : ''}

**The Reconstruction Questions:**

After asking "What don't I believe anymore?" comes:
- What DO I believe?
- Where do I find meaning?
- What are my values?
- What practices serve me?
- How do I handle death/suffering/purpose?

**Building Blocks:**

| Element | Secular Versions |
|---------|------------------|
| **Purpose** | Making a difference, connection, growth, creativity |
| **Morality** | Empathy, reason, human flourishing |
| **Community** | Secular groups, interest-based, chosen family |
| **Rituals** | Meditation, journaling, nature, art |
| **Awe/Wonder** | Science, nature, music, human achievement |
| **Death** | Legacy, impact, accepting finitude |

**Where People Find Meaning:**

- **Humanism** - Human flourishing as central value
- **Stoicism** - Philosophy for living well
- **Buddhism** - Without the supernatural elements
- **Nature-based** - Spirituality connected to earth
- **Scientific wonder** - Cosmos, evolution, emergence
- **Progressive faith** - New interpretation of tradition
- **Eclectic** - Taking what works from many sources

**You Don't Need to:**

- Pick a label
- Have all the answers
- Replace everything
- Decide now
- Be consistent

**Practices That Help:**

| Need | Practice Options |
|------|------------------|
| **Stillness** | Meditation, journaling |
| **Connection** | Community, volunteering |
| **Meaning** | Values work, life review |
| **Awe** | Nature, art, science |
| **Ritual** | Create your own |

**The Permission:**

You don't have to have it all figured out. You can hold uncertainty. You can change your mind. You can take from different traditions. You can create your own meaning.

What aspects of meaning or practice feel most important to explore?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const faithTransitionTools = [
  faithDeconstructionDef,
  spiritualGriefDef,
  faithAndFamilyDef,
  beliefRebuildingDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'faith-transition',
  faithTransitionTools
);

export default getToolDefinitions;
