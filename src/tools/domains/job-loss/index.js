/**
 * Job Loss Domain
 *
 * Tools for navigating the emotional (not just practical) impact of
 * losing your job - layoffs, firing, forced resignation.
 *
 * DOMAIN: job-loss
 * PERSONA AFFINITY: Ferni (emotional), Peter (financial), Jordan (planning)
 *
 * TOOLS:
 *   Emotional: jobLossGrief, identityAfterLayoff
 *   Processing: suddenTermination, layoffSurvivorGuilt
 *   Rebuilding: jobSearchMentalHealth, rebuildingConfidence
 *
 * PRINCIPLES:
 * - Job loss is grief, treat it accordingly
 * - Your worth ≠ your employment status
 * - It's okay to mourn before you "move on"
 * - The market failed you, you didn't fail
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { addCrossPersonaInsight } from '../../../services/cross-persona-insights.js';
const log = getLogger();
// ============================================================================
// TOOL: Job Loss Grief
// ============================================================================
const jobLossGriefDef = {
    id: 'jobLossGrief',
    name: 'Job Loss Grief',
    description: 'Process the grief of losing your job',
    domain: 'job-loss',
    tags: ['job-loss', 'grief', 'unemployment', 'identity'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('jobLossGrief'),
            parameters: z.object({
                howItHappened: z
                    .enum(['layoff', 'fired', 'forced-out', 'company-closed', 'other'])
                    .optional(),
                howLongAgo: z.string().optional().describe('When you lost the job'),
            }),
            execute: async ({ howItHappened, howLongAgo }) => {
                const userId = ctx.userId;
                log.debug({ userId, howItHappened }, '[job-loss] grief');
                const response = `Losing your job is a real loss. You're allowed to grieve it.

${howItHappened ? `**How it happened:** ${howItHappened}` : ''}
${howLongAgo ? `**When:** ${howLongAgo}` : ''}

**What You're Actually Grieving:**

- Your daily routine and structure
- Your work identity
- Colleagues and relationships
- Financial security
- Sense of competence
- Future plans and trajectory
- The story you told about your career
- Being "needed" somewhere

**This Is Real Grief:**

| Stage | What It Looks Like |
|-------|---------------------|
| Shock | "This can't be happening" |
| Denial | Expecting they'll call you back |
| Anger | At company, boss, economy, self |
| Bargaining | "If only I had..." |
| Depression | Hopelessness, worthlessness |
| Acceptance | This happened. Now what? |

These don't happen in order. They cycle.

${howItHappened === 'layoff'
                    ? `
**About Layoffs:**
Being laid off is NOT a reflection of your worth or performance. It's a business decision - spreadsheet math. You were a number, not an evaluation of your value as a human.`
                    : ''}

${howItHappened === 'fired'
                    ? `
**About Being Fired:**
This is harder because it feels personal. But even being fired doesn't define you. Companies make mistakes. Fit matters. One chapter ending doesn't determine your whole story.`
                    : ''}

**What's Normal:**

- Crying unexpectedly
- Anger at the unfairness
- Shame (even when it's not your fault)
- Fear about the future
- Relief (if the job was toxic)
- Feeling lost without routine
- Avoiding telling people
- Obsessive job searching
- Paralysis about job searching

**Give Yourself:**

1. **Time** - Don't rush into "moving on"
2. **Permission** - To feel whatever you feel
3. **Compassion** - You're going through something hard
4. **Structure** - Create your own routine
5. **Support** - People who don't judge

**The Reframe:**

You didn't fail. A situation ended. These are not the same things.

What part of this grief feels biggest right now?`;
                void addCrossPersonaInsight(userId, {
                    source: 'ferni',
                    target: 'peter',
                    priority: 'high',
                    content: `User processing job loss. May need financial planning support alongside emotional.`,
                    category: 'job-loss-grief',
                    proactive: false,
                    oneTime: true,
                });
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Identity After Layoff
// ============================================================================
const identityAfterLayoffDef = {
    id: 'identityAfterLayoff',
    name: 'Identity After Layoff',
    description: 'Navigate identity crisis when work defined you',
    domain: 'job-loss',
    tags: ['job-loss', 'identity', 'self-worth', 'transition'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('identityAfterLayoff'),
            parameters: z.object({
                howMuchWorkDefinedYou: z
                    .string()
                    .optional()
                    .describe('How much your job was your identity'),
                whatYouMiss: z.string().optional().describe('What you miss most'),
            }),
            execute: async ({ howMuchWorkDefinedYou, whatYouMiss }) => {
                const userId = ctx.userId;
                log.debug({ userId, whatYouMiss }, '[job-loss] identity');
                const response = `When work was a big part of who you are, losing it is an identity crisis.

${howMuchWorkDefinedYou ? `**Work as identity:** "${howMuchWorkDefinedYou}"` : ''}
${whatYouMiss ? `**What you miss:** "${whatYouMiss}"` : ''}

**The Identity Questions:**

- Who am I without my job title?
- What do I do when people ask "what do you do"?
- Where do I belong now?
- What's my purpose?
- What am I good at if not this?

**Why Work Becomes Identity:**

In our culture, we:
- Meet people through work
- Get validation through performance
- Structure time around jobs
- Derive purpose from productivity
- Answer "who are you" with "what do you do"

**This Is Problematic But Understandable.**

**The Uncomfortable Truth:**

You are not your job. You never were. But unlearning that takes time and intention.

**Who You Are Beyond Work:**

| You're Still | Even Without Job |
|--------------|------------------|
| Your relationships | Partner, parent, friend |
| Your values | What you believe in |
| Your interests | What you love to do |
| Your skills | Transferable abilities |
| Your experiences | Everything you've lived |
| Your humanity | Worthy of love/belonging |

**Rebuilding Identity:**

1. **Pause the job search** (briefly) - You'll search better from wholeness
2. **Reconnect with non-work self** - Hobbies, people, interests
3. **Define yourself differently** - Practice new answers to "what do you do"
4. **Question the premise** - Why does productivity = worth?
5. **Build structure without employment** - Routine matters

**When People Ask "What Do You Do":**

You don't owe anyone your employment status. Options:
- "I'm in transition"
- "I'm taking some time to figure out what's next"
- "I'm exploring new directions"
- Talk about interests instead

**A Perspective:**

This is painful AND an opportunity. How many times do we get to ask "who am I really?" This question is a gift, even if it doesn't feel like one now.

What part of you exists completely outside of work?`;
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Job Search Mental Health
// ============================================================================
const jobSearchMentalHealthDef = {
    id: 'jobSearchMentalHealth',
    name: 'Job Search Mental Health',
    description: 'Protect mental health during job searching',
    domain: 'job-loss',
    tags: ['job-loss', 'job-search', 'mental-health', 'rejection'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('jobSearchMentalHealth'),
            parameters: z.object({
                searchDuration: z.string().optional().describe("How long you've been searching"),
                biggestChallenge: z.string().optional().describe("What's hardest about the search"),
            }),
            execute: async ({ searchDuration, biggestChallenge }) => {
                const userId = ctx.userId;
                log.debug({ userId, searchDuration }, '[job-loss] search mental health');
                const response = `Job searching is one of the most demoralizing experiences. Protecting your mental health IS part of the job search.

${searchDuration ? `**Searching for:** ${searchDuration}` : ''}
${biggestChallenge ? `**Biggest challenge:** "${biggestChallenge}"` : ''}

**Why Job Searching Hurts:**

- Constant rejection (or worse, silence)
- Uncertainty about timeline
- Financial pressure mounting
- Self-worth under attack
- Comparing yourself to others
- The grind of applications
- Interviews that go nowhere

**What's Normal:**

- Depression setting in
- Anxiety about the future
- Self-doubt spiraling
- Isolation and withdrawal
- Relationship strain
- Wanting to give up
- Imposter syndrome flaring

**Protecting Your Mental Health:**

| Strategy | How |
|----------|-----|
| **Cap applications** | Set daily/weekly limits |
| **Schedule non-search time** | Job search is not your whole life |
| **Move your body** | Exercise helps depression |
| **Rejection rituals** | Process each one, then let go |
| **Connect with humans** | Don't isolate |
| **Small wins** | Celebrate any progress |
| **Professional help** | Therapy during this time is wise |

**Reframes:**

"I'm getting rejected constantly"
→ "The hiring process is broken. This isn't about me."

"I should be applying more"
→ "Quality applications > quantity"

"Everyone else is getting hired"
→ "I don't see their full story"

"I'm worthless"
→ "My value isn't determined by hiring managers"

**The Numbers Game:**

- Average job search: 3-6 months
- Applications per interview: 10-20+
- Interviews per offer: 5-10+
- Most applications go into a black hole

This isn't you failing. This is how broken the system is.

**Boundaries:**

- No job searching after X pm
- No checking email compulsively
- One day per week completely off
- Block companies that ghost you (mentally)
- Limit LinkedIn doom scrolling

**When It's Too Much:**

If you're experiencing:
- Suicidal thoughts
- Can't get out of bed
- Complete hopelessness
- Self-harm urges

Please reach out: 988 (Suicide & Crisis Lifeline)

This is temporary. You will work again. It won't feel like this forever.

What's one thing you can do to protect yourself today?`;
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Rebuilding Confidence
// ============================================================================
const rebuildingConfidenceDef = {
    id: 'rebuildingConfidence',
    name: 'Rebuilding Confidence',
    description: 'Rebuild professional confidence after job loss',
    domain: 'job-loss',
    tags: ['job-loss', 'confidence', 'self-worth', 'recovery'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('rebuildingConfidence'),
            parameters: z.object({
                whatShattered: z.string().optional().describe('What confidence was lost'),
                strengthsYouDoubt: z.string().optional().describe('What you used to be confident in'),
            }),
            execute: async ({ whatShattered, strengthsYouDoubt }) => {
                const userId = ctx.userId;
                log.debug({ userId, whatShattered }, '[job-loss] rebuilding confidence');
                const response = `Losing a job can shatter confidence you spent years building. Let's rebuild.

${whatShattered ? `**What was shattered:** "${whatShattered}"` : ''}
${strengthsYouDoubt ? `**Strengths you now doubt:** "${strengthsYouDoubt}"` : ''}

**Confidence After Job Loss:**

Your confidence took a hit because:
- External validation was removed
- You question what went wrong
- Rejection reinforces doubt
- Identity was tied to performance
- Financial stress affects everything

**The Truth:**

Your skills didn't disappear when your job did. Your accomplishments are still real. Your competence isn't determined by one employer's decision.

**Evidence Collection:**

List your genuine accomplishments:
1. Projects you led or contributed to
2. Problems you solved
3. Skills you developed
4. Impact you made
5. Times you rose to challenges

**These didn't go away.**

**Rebuilding Process:**

| Phase | Action |
|-------|--------|
| **Acknowledge** | Yes, confidence was hit. That's real. |
| **Grieve** | The loss of certainty about yourself |
| **Evidence** | Collect proof of your competence |
| **Practice** | Do things that prove you're capable |
| **Reframe** | Separate situation from identity |
| **Grow** | This struggle is building new strength |

**Small Confidence Builders:**

- Complete small projects (anything)
- Help someone with something you're good at
- Update your skills (course, certification)
- Volunteer your expertise
- Practice interviewing (mock interviews)
- Reach out to former colleagues for validation

**The Imposter Syndrome Spiral:**

"Maybe I was never good at this"
→ You were hired. You succeeded. You were good enough for years.

"They saw through me and that's why..."
→ Business decisions aren't personal evaluations.

"I'll never be that confident again"
→ Confidence can be rebuilt. It's a skill, not a fixed trait.

**A Perspective:**

The confidence that comes from surviving this will be deeper than the confidence you had before. Earned confidence > given confidence.

What accomplishment can no one take away from you?`;
                return response;
            },
        });
    },
};
// ============================================================================
// EXPORT
// ============================================================================
const jobLossTools = [
    jobLossGriefDef,
    identityAfterLayoffDef,
    jobSearchMentalHealthDef,
    rebuildingConfidenceDef,
];
export const { getToolDefinitions, domain, definitions } = createDomainExport('job-loss', jobLossTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map