/**
 * Sandwich Generation Domain
 *
 * Tools for those caring for children AND aging parents simultaneously.
 * Squeezed from both sides with endless demands.
 *
 * DOMAIN: sandwich-generation
 * PERSONA AFFINITY: Ferni (emotional), Maya (routines), Jordan (planning)
 *
 * TOOLS:
 *   Support: sandwichGenerationBurnout, impossibleDemands
 *   Practical: balancingCare, settingPriorities
 *   Emotional: sandwichGuilt, advocateForYourself
 *
 * PRINCIPLES:
 * - You cannot be everything to everyone
 * - Your needs are not optional
 * - Guilt is endemic but not required
 * - Something will always be undone
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { addCrossPersonaInsight } from '../../../services/cross-persona-insights.js';
const log = getLogger();
// ============================================================================
// TOOL: Sandwich Generation Burnout
// ============================================================================
const sandwichBurnoutDef = {
    id: 'sandwichBurnout',
    name: 'Sandwich Generation Burnout',
    description: 'Address the unique burnout of caring for kids AND parents',
    domain: 'sandwich-generation',
    tags: ['sandwich-generation', 'burnout', 'caregiving', 'exhaustion'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('sandwichBurnout'),
            parameters: z.object({
                kidsSituation: z.string().optional().describe('Your children situation'),
                parentsSituation: z.string().optional().describe('Your parents situation'),
                workStatus: z.string().optional().describe('Whether you also work'),
            }),
            execute: async ({ kidsSituation, parentsSituation, workStatus }) => {
                const userId = ctx.userId;
                log.debug({ userId, workStatus }, '[sandwich-generation] burnout');
                const response = `You're being pulled in every direction. Of course you're burned out.

${kidsSituation ? `**Kids:** ${kidsSituation}` : ''}
${parentsSituation ? `**Parents:** ${parentsSituation}` : ''}
${workStatus ? `**Work:** ${workStatus}` : ''}

**The Sandwich Reality:**

You're caring for:
- Children who need you
- Parents who increasingly need you
- Possibly a job
- A home
- A relationship
- YOURSELF (last, always last)

**Why It's Impossible:**

| Direction | Demand |
|-----------|--------|
| **Up** | Parents need more as they age |
| **Down** | Kids need you until (and after) they don't |
| **Sideways** | Partner, work, friends |
| **Inward** | Your own needs (ignored) |

**The Math Doesn't Work:**

There are 24 hours in a day. The demands of this season often exceed 24 hours of effort. Something will not get done. That's not failure - that's math.

**What's Normal:**

- Constant exhaustion
- Guilt in every direction
- Feeling like you're failing everyone
- Resentment (even toward people you love)
- Financial strain
- No time for yourself
- Relationship suffering
- Health declining
- Questioning everything

**The Hierarchy of Needs:**

When you can't do everything (you can't), prioritize:

1. **Safety** - Is everyone physically safe?
2. **Basic needs** - Fed, sheltered, medications
3. **Crises** - What's actually urgent?
4. **Important** - What will cause problems if ignored?
5. **Nice to have** - Everything else

**What You Need:**

1. **Permission to not do it all** - You literally cannot
2. **Help** - Family, hired, community, any kind
3. **Boundaries** - You're allowed to have them
4. **Self-care** - Not optional
5. **Someone who sees you** - You're doing an incredible thing

**A Hard Truth:**

You will not be the parent you wanted to be during this season.
You will not be the child you wanted to be.
You will not be the partner, friend, employee you wanted to be.

But you're here. You're trying. That's extraordinary.

What would make the biggest difference right now?`;
                void addCrossPersonaInsight(userId, {
                    source: 'ferni',
                    target: 'maya',
                    priority: 'high',
                    content: `User is sandwich generation caregiver with high burnout risk. Protect capacity.`,
                    category: 'sandwich-burnout',
                    proactive: true,
                    oneTime: false,
                });
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Sandwich Guilt
// ============================================================================
const sandwichGuiltDef = {
    id: 'sandwichGuilt',
    name: 'Sandwich Generation Guilt',
    description: 'Process the multi-directional guilt of sandwich caregiving',
    domain: 'sandwich-generation',
    tags: ['sandwich-generation', 'guilt', 'emotional', 'processing'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('sandwichGuilt'),
            parameters: z.object({
                guiltDirection: z
                    .enum(['toward-kids', 'toward-parents', 'toward-self', 'toward-partner', 'all'])
                    .optional(),
                specificGuilt: z.string().optional().describe('What specifically triggers guilt'),
            }),
            execute: async ({ guiltDirection, specificGuilt }) => {
                const userId = ctx.userId;
                log.debug({ userId, guiltDirection }, '[sandwich-generation] guilt');
                const guiltContexts = {
                    'toward-kids': 'Guilt about kids - time, attention, presence',
                    'toward-parents': 'Guilt about parents - not doing enough, considering placement',
                    'toward-self': 'Guilt about self - taking time, having needs',
                    'toward-partner': 'Guilt about partner - no energy left',
                    all: 'Guilt in every direction',
                };
                const response = `In the sandwich, guilt flows in every direction. That doesn't mean it's accurate.

${guiltDirection ? `**Guilt direction:** ${guiltContexts[guiltDirection]}` : ''}
${specificGuilt ? `**Specific trigger:** "${specificGuilt}"` : ''}

**The Multi-Directional Guilt:**

| Direction | Common Guilt | The Reality |
|-----------|--------------|-------------|
| **Kids** | "I'm not present enough" | You're doing extraordinary things |
| **Parents** | "I should do more" | You're already stretched past breaking |
| **Partner** | "We have no relationship" | You're both in survival mode |
| **Self** | "I can't take time for me" | You MUST take time or you'll break |
| **Work** | "I'm not performing" | You're managing more than most |

**The Impossible Standard:**

Guilt assumes you COULD do more. But could you?
- Where would the time come from?
- Where would the energy come from?
- Which other person would lose attention?

**The Guilt Reframe:**

"I feel guilty about my kids"
→ "I'm doing my best in impossible circumstances. They will understand someday."

"I feel guilty about my parents"
→ "I'm showing up more than most adult children. I'm doing what I can."

"I feel guilty taking time for myself"
→ "Self-care keeps me functioning. It's not selfish - it's sustainable."

**What Guilt Often Is:**

- Unrealistic expectations
- Cultural conditioning (especially for women)
- Perfectionism in crisis
- Love expressing as inadequacy
- Others' judgments internalized

**Permission Slips:**

I give myself permission to:
- Not be present for everything
- Let things be "good enough"
- Ask for help
- Say no to additional demands
- Take time for myself without earning it
- Not enjoy every moment of caregiving
- Feel overwhelmed and still continue

**The Truth:**

You're not guilty of anything except being one person with finite resources in a situation that demands three people's worth of effort.

What guilt feels heaviest right now?`;
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Balancing Care
// ============================================================================
const balancingCareDef = {
    id: 'balancingCare',
    name: 'Balancing Care',
    description: 'Practical strategies for balancing multiple care demands',
    domain: 'sandwich-generation',
    tags: ['sandwich-generation', 'balance', 'practical', 'strategies'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('balancingCare'),
            parameters: z.object({
                biggestConflict: z.string().optional().describe('Where demands conflict most'),
                currentStrategy: z.string().optional().describe("What you're currently doing"),
            }),
            execute: async ({ biggestConflict, currentStrategy }) => {
                const userId = ctx.userId;
                log.debug({ userId, biggestConflict }, '[sandwich-generation] balancing');
                const response = `Balance implies equilibrium. This season is more like triage.

${biggestConflict ? `**Biggest conflict:** "${biggestConflict}"` : ''}
${currentStrategy ? `**Current approach:** "${currentStrategy}"` : ''}

**Reframe: Triage, Not Balance**

Balance = everything gets equal attention (impossible)
Triage = most urgent gets handled first (sustainable)

**Triage Framework:**

| Priority | Type | Example |
|----------|------|---------|
| **1 - Crisis** | Immediate safety/health | ER visit, child emergency |
| **2 - Urgent** | Will escalate if ignored | Parent's medication, kid's school issue |
| **3 - Important** | Matters but can wait | Doctor appointments, activities |
| **4 - Maintenance** | Keeps things running | Groceries, cleaning |
| **5 - Enrichment** | Nice but optional | Perfect birthday party, deep cleaning |

**Practical Strategies:**

**Time:**
- Block calendar for non-negotiables
- Build in buffer time
- Accept that schedules will break
- Have backup plans for everything

**Energy:**
- Know your high-energy times
- Match energy to task importance
- Rest before you crash

**Help:**
- Divide responsibilities with siblings (if possible)
- Hire what you can afford
- Ask friends for specific help
- Use community resources

**Communication:**
- Family meeting to align
- Clear expectations with everyone
- Updates systems (shared calendars, group texts)

**Specific Conflict Types:**

**Kids' needs vs Parents' needs:**
- Kids have a timeline to independence
- Parents' needs typically increase
- Neither is optional
- Can kids be involved in helping grandparents?

**Work vs Caregiving:**
- Know your legal rights (FMLA)
- Talk to HR about flexibility
- Consider if job change is needed
- Your financial stability matters to everyone

**Something Has To Give:**

Pick what you're okay letting slip:
- Perfect housekeeping?
- Elaborate meals?
- Social obligations?
- Volunteer commitments?
- Exercise routine?

Choose what gives, don't let it randomly collapse.

What's the most immediate conflict you need to solve?`;
                return response;
            },
        });
    },
};
// ============================================================================
// EXPORT
// ============================================================================
const sandwichGenerationTools = [sandwichBurnoutDef, sandwichGuiltDef, balancingCareDef];
export const { getToolDefinitions, domain, definitions } = createDomainExport('sandwich-generation', sandwichGenerationTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map