/**
 * Blended Family Domain
 *
 * Tools for navigating step-parenting, blended families, and the complex
 * dynamics of merging family systems.
 *
 * DOMAIN: blended-family
 * PERSONA AFFINITY: Ferni (emotional), Nayan (wisdom)
 *
 * TOOLS:
 *   Step-parenting: stepParentStruggle, bondsWithStepkids
 *   Dynamics: blendedFamilyConflict, exCoParenting
 *   Integration: familyIntegration, holidaysBlended
 *
 * PRINCIPLES:
 * - Blending takes years, not months
 * - You can't force love
 * - Different doesn't mean bad
 * - The kids didn't choose this
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = getLogger();
// ============================================================================
// TOOL: Step-Parent Struggle
// ============================================================================
const stepParentStruggleDef = {
    id: 'stepParentStruggle',
    name: 'Step-Parent Struggle',
    description: 'Navigate the challenges of being a step-parent',
    domain: 'blended-family',
    tags: ['blended-family', 'step-parent', 'challenges', 'support'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('stepParentStruggle'),
            parameters: z.object({
                situation: z.string().optional().describe('Your specific situation'),
                relationshipWithStepkids: z
                    .string()
                    .optional()
                    .describe('How things are going with stepkids'),
                timeBlended: z.string().optional().describe("How long you've been a blended family"),
            }),
            execute: async ({ situation, relationshipWithStepkids, timeBlended }) => {
                const userId = ctx.userId;
                log.debug({ userId, timeBlended }, '[blended-family] step-parent struggle');
                const response = `Step-parenting is one of the hardest roles in family life. You're not alone in struggling.

${situation ? `**Your situation:** "${situation}"` : ''}
${relationshipWithStepkids ? `**With stepkids:** "${relationshipWithStepkids}"` : ''}
${timeBlended ? `**Time as blended family:** ${timeBlended}` : ''}

**The Impossible Role:**

Step-parenting is hard because:
- You're parenting kids who didn't choose you
- You have responsibility without authority
- The bio-parent bond can feel exclusive
- You're competing with a ghost (or real ex)
- Your love isn't automatic (and shouldn't be forced)
- Kids may actively resist

**Common Step-Parent Experiences:**

| Experience | Frequency |
|------------|-----------|
| Feeling like an outsider | Very common |
| Resentment from stepkids | Common |
| Conflict with partner over parenting | Very common |
| Feeling unappreciated | Universal |
| Questioning the relationship | Common |
| Guilt about your own feelings | Common |

**The Timeline Truth:**

Blending typically takes 4-7 years. Not months. Years.

- Year 1-2: Getting to know each other
- Year 2-4: Testing, conflict, adjustment
- Year 4-7: True integration (maybe)

**What's Realistic:**

You may never:
- Be called mom/dad
- Be loved like a bio-parent
- Have the same authority
- Have the relationship you imagined

You can:
- Be a caring adult in their lives
- Build trust over time
- Have a meaningful relationship
- Be a stable presence

**What Helps:**

1. **Lower expectations** - Of yourself and the kids
2. **Bio-parent leads discipline** - Especially early on
3. **One-on-one time** - Build individual relationships
4. **Support your partner** - United front
5. **Therapy/support** - Step-parenting support groups
6. **Patience** - Measured in years

**The Kids' Perspective:**

They didn't choose this. They may feel:
- Loyalty to bio-parent feels threatened
- Resentment at change
- Grief for old family
- Confusion about who you are to them

Their feelings aren't about you (even when aimed at you).

What's the hardest part right now?`;
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Blended Family Conflict
// ============================================================================
const blendedFamilyConflictDef = {
    id: 'blendedFamilyConflict',
    name: 'Blended Family Conflict',
    description: 'Navigate conflicts specific to blended families',
    domain: 'blended-family',
    tags: ['blended-family', 'conflict', 'dynamics', 'resolution'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('blendedFamilyConflict'),
            parameters: z.object({
                conflictType: z
                    .enum([
                    'kid-stepparent',
                    'between-kids',
                    'parenting-styles',
                    'ex-involvement',
                    'loyalty-binds',
                    'other',
                ])
                    .optional(),
                specificConflict: z.string().optional().describe("What's happening"),
            }),
            execute: async ({ conflictType, specificConflict }) => {
                const userId = ctx.userId;
                log.debug({ userId, conflictType }, '[blended-family] conflict');
                const conflictGuidance = {
                    'kid-stepparent': `
**Kid-Stepparent Conflict:**

The child is likely feeling:
- Loyalty bind (loving you = betraying bio-parent)
- Loss of exclusive relationship with their parent
- Resentment at change they didn't choose

What helps:
- Bio-parent does discipline (not you)
- Give them space to have feelings
- Don't take it personally (so hard)
- Build relationship slowly
- Let them set the pace`,
                    'between-kids': `
**Conflict Between Kids:**

Stepsiblings didn't choose each other. Normal issues:
- Territory (rooms, stuff, parent's attention)
- Different rules from different homes
- Competition for parents
- Personality clashes

What helps:
- Don't force "one big happy family"
- Fair doesn't mean same
- Private space for each kid
- One-on-one time with bio-parent
- Family meetings for issues`,
                    'parenting-styles': `
**Different Parenting Styles:**

You and partner were raised differently, parented differently.

Common conflicts:
- Discipline approaches
- Rules and structure
- Indulgence vs strictness
- Handling the ex

What helps:
- Private discussions (not in front of kids)
- Agree on big things, flexible on small
- Bio-parent leads with their kids
- Unified front once decided
- Couples therapy for big gaps`,
                    'ex-involvement': `
**Ex's Involvement:**

The ex is part of your life forever (if there are kids).

Challenges:
- Different rules at different houses
- Ex undermining you
- Schedule conflicts
- New partner jealousy

What helps:
- Business-like communication
- Parallel parenting if co-parenting fails
- Don't badmouth (kids hear)
- Focus on what you CAN control
- Accept you can't control their house`,
                    'loyalty-binds': `
**Loyalty Binds:**

Kids feel loving one adult betrays another.

Signs:
- Pulling away from stepparent
- Acting out after visits with other parent
- Refusing to participate in blended activities
- Saying "you're not my real [parent]"

What helps:
- Don't compete with bio-parent
- Give explicit permission to love everyone
- Never badmouth the other parent
- Acknowledge their feelings
- Time and consistency`,
                };
                const response = `Blended family conflicts are normal. You're merging two family systems with different histories and rules.

${specificConflict ? `**The conflict:** "${specificConflict}"` : ''}

${conflictType && conflictType !== 'other' && conflictGuidance[conflictType] ? conflictGuidance[conflictType] : ''}

**Universal Blended Family Principles:**

1. **Bio-parent leads** - With their kids, especially discipline
2. **United front** - Disagree in private
3. **Time heals** - Blending takes years
4. **Don't force it** - Love can't be rushed
5. **Professional help** - Family therapy designed for blending

**The Goal:**

Not: One big happy family that acts like a first family
But: A new family system that respects everyone's history and builds new traditions

What specific aspect of this conflict needs attention?`;
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Holiday Blended
// ============================================================================
const holidaysBlendedDef = {
    id: 'holidaysBlended',
    name: 'Blended Family Holidays',
    description: 'Navigate holidays in blended families',
    domain: 'blended-family',
    tags: ['blended-family', 'holidays', 'traditions', 'scheduling'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('holidaysBlended'),
            parameters: z.object({
                upcomingHoliday: z.string().optional().describe('Which holiday is coming'),
                challenge: z.string().optional().describe("What's hard about it"),
            }),
            execute: async ({ upcomingHoliday, challenge }) => {
                const userId = ctx.userId;
                log.debug({ userId, upcomingHoliday }, '[blended-family] holidays');
                const response = `Holidays in blended families are logistics + emotions + traditions colliding. It's a lot.

${upcomingHoliday ? `**Upcoming:** ${upcomingHoliday}` : ''}
${challenge ? `**Your challenge:** "${challenge}"` : ''}

**Why Holidays Are Hard:**

- Multiple households to coordinate
- Competing traditions
- Kids missing the other parent
- Memories of old family holidays
- Grandparents and extended family
- Financial pressures
- Expectations vs reality

**Scheduling Strategies:**

| Approach | How It Works |
|----------|--------------|
| **Alternating** | Each parent gets different holidays each year |
| **Split day** | Morning here, evening there |
| **Duplicate** | Celebrate twice (works for some holidays) |
| **Create new** | Your own blended family traditions |

**Traditions:**

Don't force old traditions into new family. Instead:
- Ask what everyone values most
- Create NEW traditions together
- Let some old ones go
- Allow different households to be different

**Managing Kids' Emotions:**

They might:
- Miss the other parent
- Compare to "how it used to be"
- Feel guilty for having fun
- Act out under stress

What helps:
- Acknowledge their feelings
- Let them connect with other parent
- Don't compete for "best holiday"
- Keep expectations reasonable

**Keeping Your Sanity:**

- Lower the bar on "perfect"
- Schedule buffer time
- Take care of YOUR needs
- It's okay if it's not magical
- Every year gets easier

**Permission:**

The holidays don't have to look like they used to - yours or your partner's. You get to create something new. Different isn't worse.

What would make this holiday feel manageable?`;
                return response;
            },
        });
    },
};
// ============================================================================
// EXPORT
// ============================================================================
const blendedFamilyTools = [stepParentStruggleDef, blendedFamilyConflictDef, holidaysBlendedDef];
export const { getToolDefinitions, domain, definitions } = createDomainExport('blended-family', blendedFamilyTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map