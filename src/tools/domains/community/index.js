/**
 * Community & Social Impact Domain Tools
 *
 * Tools for supporting community engagement, volunteering, charitable giving,
 * and making a positive impact. This domain supports purpose and connection.
 *
 * DOMAIN: community
 * TOOLS:
 *   Volunteering: findVolunteerOpportunity, trackVolunteerHours
 *   Giving: planCharitableGiving, alignGivingWithValues
 *   Community: findCommunityGroup, engageCivically
 *   Impact: trackImpact, reflectOnContribution
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { persistTrackedItem, } from '../shared/persistence.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// VOLUNTEER & GIVING RESOURCES
// ============================================================================
const VOLUNTEER_CATEGORIES = {
    skills: {
        name: 'Skills-Based Volunteering',
        examples: ['Pro bono consulting', 'Teaching/tutoring', 'Legal aid', 'Tech help for nonprofits'],
        impact: 'High-value contribution using professional skills',
    },
    direct: {
        name: 'Direct Service',
        examples: ['Food bank sorting', 'Habitat builds', 'Hospital visits', 'Animal shelter'],
        impact: 'Hands-on help with immediate visible impact',
    },
    mentoring: {
        name: 'Mentoring',
        examples: ['Youth mentoring', 'Career coaching', 'Big Brothers/Sisters', 'College guidance'],
        impact: 'Long-term relationship that changes lives',
    },
    environmental: {
        name: 'Environmental',
        examples: ['Trail maintenance', 'Beach cleanups', 'Tree planting', 'Wildlife conservation'],
        impact: 'Protecting planet for future generations',
    },
    advocacy: {
        name: 'Advocacy',
        examples: [
            'Voter registration',
            'Policy campaigns',
            'Awareness raising',
            'Community organizing',
        ],
        impact: 'Creating systemic change',
    },
    virtual: {
        name: 'Virtual Volunteering',
        examples: ['Crisis text line', 'Remote tutoring', 'Grant writing', 'Translation'],
        impact: 'Flexible, location-independent help',
    },
};
const GIVING_FRAMEWORKS = {
    'effective-altruism': {
        name: 'Effective Altruism',
        principle: 'Maximize impact per dollar with evidence-based giving',
        resources: ['GiveWell.org', 'Giving What We Can', 'Animal Charity Evaluators'],
    },
    'local-first': {
        name: 'Community-First Giving',
        principle: 'Support organizations in your own community',
        resources: ['Community foundation', 'Local United Way', 'Neighborhood nonprofits'],
    },
    'cause-focused': {
        name: 'Cause-Area Focus',
        principle: 'Deep commitment to a specific cause area',
        resources: ['Disease-specific charities', 'Single-issue organizations'],
    },
};
// ============================================================================
// VOLUNTEERING TOOLS
// ============================================================================
const findVolunteerOpportunityDef = {
    id: 'findVolunteerOpportunity',
    name: 'Find Volunteer Opportunity',
    description: 'Match to volunteer opportunities',
    domain: 'community',
    tags: ['community', 'volunteering', 'service'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('findVolunteerOpportunity'),
            parameters: z.object({
                interests: z.array(z.string()).optional().describe('Areas of interest'),
                skills: z.array(z.string()).optional().describe('Skills to offer'),
                timeAvailable: z.enum(['few-hours', 'regular-weekly', 'occasional', 'full-day']).optional(),
                preference: z.enum(['in-person', 'virtual', 'either']).optional(),
            }),
            execute: async ({ interests, skills, timeAvailable, preference }) => {
                getLogger().info({ agentId: ctx.agentId, interests }, 'Finding volunteer opportunity');
                let response = `**Finding Your Volunteer Fit**\n\n`;
                if (interests?.length)
                    response += `**Interests:** ${interests.join(', ')}\n`;
                if (skills?.length)
                    response += `**Skills:** ${skills.join(', ')}\n`;
                if (timeAvailable)
                    response += `**Time:** ${timeAvailable}\n`;
                if (preference)
                    response += `**Preference:** ${preference}\n`;
                response += `\n---\n\n`;
                response += `**Volunteer Categories:**\n\n`;
                Object.entries(VOLUNTEER_CATEGORIES).forEach(([key, category]) => {
                    response += `**${category.name}**\n`;
                    response += `Examples: ${category.examples.join(', ')}\n`;
                    response += `Impact: ${category.impact}\n\n`;
                });
                response += `---\n\n`;
                response += `**How to Find Opportunities:**\n\n`;
                response += `**Online platforms:**\n`;
                response += `• VolunteerMatch.org - Search by cause and location\n`;
                response += `• Idealist.org - Nonprofit jobs and volunteering\n`;
                response += `• CatchAFire.org - Skills-based volunteering\n`;
                response += `• AllForGood.org - Various opportunities\n\n`;
                response += `**Local sources:**\n`;
                response += `• Local United Way\n`;
                response += `• Community foundation\n`;
                response += `• Religious organizations\n`;
                response += `• Schools and libraries\n`;
                response += `• Directly contact organizations you admire\n\n`;
                response += `**Tips:**\n`;
                response += `• Start with one commitment, not many\n`;
                response += `• Be reliable - consistency matters more than quantity\n`;
                response += `• It's okay to try different things\n`;
                response += `• Your skills may be more valuable than you think\n\n`;
                response += `What type of volunteering appeals to you?`;
                return response;
            },
        });
    },
};
const trackVolunteerHoursDef = {
    id: 'trackVolunteerHours',
    name: 'Track Volunteer Hours',
    description: 'Log volunteer activities',
    domain: 'community',
    tags: ['community', 'volunteering', 'tracking'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('trackVolunteerHours'),
            parameters: z.object({
                organization: z.string().describe('Organization volunteered with'),
                activity: z.string().describe('What you did'),
                hours: z.number().describe('Hours volunteered'),
                impact: z.string().optional().describe('Impact or outcome'),
                reflection: z.string().optional().describe('How it felt'),
            }),
            execute: async ({ organization, activity, hours, impact, reflection }, { ctx: toolCtx }) => {
                getLogger().info({ agentId: ctx.agentId, organization, hours }, 'Tracking volunteer hours');
                // Persist volunteer hours
                persistTrackedItem(toolCtx, {
                    domain: 'community',
                    itemType: 'volunteer_hours',
                    item: { organization, activity, hours, impact, reflection },
                    importance: hours >= 4 ? 'high' : 'medium',
                });
                let response = `**Volunteer Hours Logged ✨**\n\n`;
                response += `**Organization:** ${organization}\n`;
                response += `**Activity:** ${activity}\n`;
                response += `**Hours:** ${hours}\n`;
                if (impact)
                    response += `**Impact:** ${impact}\n`;
                if (reflection)
                    response += `**Reflection:** ${reflection}\n`;
                response += `\n---\n\n`;
                response += `Thank you for giving your time. Every hour matters.\n\n`;
                response += `**Your contribution:**\n`;
                response += `• ${hours} hours of focused help\n`;
                response += `• Skills and energy shared\n`;
                response += `• Real impact on real people/causes\n\n`;
                response += `**The ripple effect:**\n`;
                response += `Your volunteering doesn't just help directly - it inspires others, `;
                response += `builds community, and creates positive change beyond what you can see.\n\n`;
                response += `How did it feel to contribute?`;
                return response;
            },
        });
    },
};
// ============================================================================
// CHARITABLE GIVING TOOLS
// ============================================================================
const planCharitableGivingDef = {
    id: 'planCharitableGiving',
    name: 'Plan Charitable Giving',
    description: 'Strategic approach to charitable giving',
    domain: 'community',
    tags: ['community', 'giving', 'charity', 'planning'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('planCharitableGiving'),
            parameters: z.object({
                currentGiving: z.string().optional().describe('Current giving approach'),
                budget: z.string().optional().describe('Annual giving budget'),
                interests: z.array(z.string()).optional().describe('Cause areas'),
                approach: z
                    .enum(['effective-altruism', 'local-first', 'cause-focused', 'exploring'])
                    .optional(),
            }),
            execute: async ({ currentGiving, budget, interests, approach }) => {
                getLogger().info({ agentId: ctx.agentId, approach }, 'Planning charitable giving');
                let response = `**Charitable Giving Strategy**\n\n`;
                if (budget)
                    response += `**Budget:** ${budget}\n`;
                if (interests?.length)
                    response += `**Interests:** ${interests.join(', ')}\n`;
                if (approach && approach !== 'exploring') {
                    const fw = GIVING_FRAMEWORKS[approach];
                    if (fw)
                        response += `**Approach:** ${fw.name}\n`;
                }
                response += `\n---\n\n`;
                response += `**Giving Frameworks:**\n\n`;
                Object.entries(GIVING_FRAMEWORKS).forEach(([key, framework]) => {
                    response += `**${framework.name}**\n`;
                    response += `_${framework.principle}_\n`;
                    response += `Resources: ${framework.resources.join(', ')}\n\n`;
                });
                response += `---\n\n`;
                response += `**Building Your Giving Plan:**\n\n`;
                response += `**1. Decide on an amount**\n`;
                response += `• Some give a percentage (1%, 5%, 10% of income)\n`;
                response += `• Fixed annual amount\n`;
                response += `• "Give What We Can" pledge: 10% of income\n\n`;
                response += `**2. Choose your causes**\n`;
                response += `• What problems do you most want to solve?\n`;
                response += `• Where can your dollars have the most impact?\n`;
                response += `• Local vs. global?\n\n`;
                response += `**3. Research organizations**\n`;
                response += `• Charity Navigator, GiveWell, GuideStar\n`;
                response += `• Program effectiveness vs. overhead ratio\n`;
                response += `• Transparency and track record\n\n`;
                response += `**4. Decide on timing**\n`;
                response += `• Monthly automatic donations\n`;
                response += `• Annual giving (often year-end)\n`;
                response += `• Donor-advised fund for flexibility\n\n`;
                response += `**5. Track and reflect**\n`;
                response += `• Keep records (for taxes and meaning)\n`;
                response += `• Annually review and adjust\n\n`;
                response += `What's most important to you in your giving?`;
                return response;
            },
        });
    },
};
const alignGivingWithValuesDef = {
    id: 'alignGivingWithValues',
    name: 'Align Giving With Values',
    description: 'Ensure giving reflects personal values',
    domain: 'community',
    tags: ['community', 'giving', 'values'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('alignGivingWithValues'),
            parameters: z.object({
                values: z.array(z.string()).describe('Core values'),
                currentGiving: z.string().optional().describe('Where they currently give'),
            }),
            execute: async ({ values, currentGiving }) => {
                getLogger().info({ agentId: ctx.agentId, values }, 'Aligning giving with values');
                let response = `**Values-Aligned Giving**\n\n`;
                response += `**Your values:** ${values.join(', ')}\n`;
                if (currentGiving)
                    response += `**Current giving:** ${currentGiving}\n`;
                response += `\n---\n\n`;
                response += `**Reflection Questions:**\n\n`;
                response += `For each value you hold, ask:\n\n`;
                values.forEach((value) => {
                    response += `**${value}:**\n`;
                    response += `• Which organizations advance this value?\n`;
                    response += `• How might your giving express this value?\n`;
                    response += `• Is your current giving aligned with this?\n\n`;
                });
                response += `---\n\n`;
                response += `**Common Values → Cause Areas:**\n\n`;
                response += `• **Justice/Equity** → Civil rights, criminal justice reform, housing\n`;
                response += `• **Compassion** → Poverty alleviation, disaster relief, healthcare\n`;
                response += `• **Future generations** → Environment, education, research\n`;
                response += `• **Local community** → Community foundation, local nonprofits\n`;
                response += `• **Animal welfare** → Animal shelters, wildlife conservation\n`;
                response += `• **Health** → Disease research, global health, mental health\n\n`;
                response += `**The key question:**\n`;
                response += `Does your giving reflect what you say matters most to you?\n\n`;
                response += `If not, what would it look like if it did?`;
                return response;
            },
        });
    },
};
// ============================================================================
// COMMUNITY CONNECTION TOOLS
// ============================================================================
const findCommunityGroupDef = {
    id: 'findCommunityGroup',
    name: 'Find Community Group',
    description: 'Find local groups and communities',
    domain: 'community',
    tags: ['community', 'connection', 'groups'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('findCommunityGroup'),
            parameters: z.object({
                interests: z.array(z.string()).optional().describe('Interests'),
                goal: z.enum(['social', 'service', 'learning', 'activism', 'spiritual', 'any']).optional(),
                format: z.enum(['in-person', 'online', 'either']).optional(),
            }),
            execute: async ({ interests, goal, format }) => {
                getLogger().info({ agentId: ctx.agentId, goal, interests }, 'Finding community group');
                let response = `**Finding Your Community**\n\n`;
                if (interests?.length)
                    response += `**Interests:** ${interests.join(', ')}\n`;
                if (goal)
                    response += `**Goal:** ${goal}\n`;
                if (format)
                    response += `**Format:** ${format}\n`;
                response += `\n---\n\n`;
                response += `**Where to Find Groups:**\n\n`;
                response += `**Online platforms:**\n`;
                response += `• Meetup.com - Groups for everything\n`;
                response += `• Facebook Groups - Local and interest-based\n`;
                response += `• Nextdoor - Hyper-local community\n`;
                response += `• Discord/Slack - Topic-specific communities\n`;
                response += `• Reddit - r/[yourcity] and interest subreddits\n\n`;
                response += `**Local institutions:**\n`;
                response += `• Library programs and clubs\n`;
                response += `• Community centers\n`;
                response += `• Religious/spiritual communities\n`;
                response += `• Gyms and recreation centers\n`;
                response += `• Local college continuing education\n\n`;
                response += `**Interest-specific:**\n`;
                response += `• Sports leagues and clubs\n`;
                response += `• Book clubs\n`;
                response += `• Professional associations\n`;
                response += `• Hobby groups (running clubs, knitting circles, etc.)\n`;
                response += `• Alumni networks\n\n`;
                response += `---\n\n`;
                response += `**Tips for Joining:**\n`;
                response += `• Show up regularly at first - familiarity builds connection\n`;
                response += `• Introduce yourself and ask questions\n`;
                response += `• Volunteer for something\n`;
                response += `• Give it time - community takes multiple visits\n`;
                response += `• It's okay to try groups and move on if they're not right\n\n`;
                response += `What kind of community are you looking for?`;
                return response;
            },
        });
    },
};
const engageCivicallyDef = {
    id: 'engageCivically',
    name: 'Engage Civically',
    description: 'Support civic engagement',
    domain: 'community',
    tags: ['community', 'civic', 'engagement', 'citizenship'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('engageCivically'),
            parameters: z.object({
                interest: z
                    .enum(['voting', 'local-government', 'advocacy', 'community-organizing', 'general'])
                    .describe('Area of civic interest'),
                currentEngagement: z.string().optional().describe('Current level of engagement'),
            }),
            execute: async ({ interest, currentEngagement }) => {
                getLogger().info({ agentId: ctx.agentId, interest }, 'Engaging civically');
                let response = `**Civic Engagement: ${interest}**\n\n`;
                if (interest === 'voting') {
                    response += `**Voting & Elections:**\n\n`;
                    response += `**Stay informed:**\n`;
                    response += `• Know when elections happen (not just presidential)\n`;
                    response += `• Research candidates and ballot measures\n`;
                    response += `• Vote.org - Check registration, find polling place\n`;
                    response += `• Ballotpedia - Nonpartisan election information\n\n`;
                    response += `**Beyond voting:**\n`;
                    response += `• Help others register to vote\n`;
                    response += `• Volunteer as poll worker\n`;
                    response += `• Drive people to polls\n`;
                    response += `• Share accurate voting information\n`;
                }
                else if (interest === 'local-government') {
                    response += `**Engaging Local Government:**\n\n`;
                    response += `Local government often has more immediate impact on your daily life than federal.\n\n`;
                    response += `**Ways to engage:**\n`;
                    response += `• Attend city council/school board meetings\n`;
                    response += `• Speak during public comment periods\n`;
                    response += `• Contact your representatives about issues\n`;
                    response += `• Serve on local boards and commissions\n`;
                    response += `• Attend town halls\n\n`;
                    response += `**Find your representatives:**\n`;
                    response += `• USA.gov - Find elected officials at all levels\n`;
                    response += `• Your city/county website\n`;
                }
                else if (interest === 'advocacy') {
                    response += `**Advocacy & Making Your Voice Heard:**\n\n`;
                    response += `**Individual actions:**\n`;
                    response += `• Contact elected officials (calls > emails > form letters)\n`;
                    response += `• Write letters to the editor\n`;
                    response += `• Share information on social media\n`;
                    response += `• Sign and share petitions\n\n`;
                    response += `**Organized advocacy:**\n`;
                    response += `• Join advocacy organizations in your cause area\n`;
                    response += `• Participate in lobby days\n`;
                    response += `• Testify at hearings\n`;
                    response += `• Run for office yourself\n`;
                }
                else if (interest === 'community-organizing') {
                    response += `**Community Organizing:**\n\n`;
                    response += `Organizing is about building power together.\n\n`;
                    response += `**Getting started:**\n`;
                    response += `• Identify an issue that affects your community\n`;
                    response += `• Find others who share your concern\n`;
                    response += `• Build relationships and coalitions\n`;
                    response += `• Develop strategy and take action\n\n`;
                    response += `**Resources:**\n`;
                    response += `• Training organizations (Midwest Academy, etc.)\n`;
                    response += `• Existing community organizations\n`;
                    response += `• Faith-based organizing networks\n`;
                }
                else {
                    response += `**Civic Engagement Overview:**\n\n`;
                    response += `Democracy works better when more people participate.\n\n`;
                    response += `**Levels of engagement:**\n`;
                    response += `• **Stay informed:** Know what's happening\n`;
                    response += `• **Vote:** Every election, every time\n`;
                    response += `• **Advocate:** Contact representatives, speak out\n`;
                    response += `• **Organize:** Build power with others\n`;
                    response += `• **Run for office:** Be the change\n`;
                }
                response += `\n---\n\n`;
                response += `**Remember:** Change is slow but possible. Every voice matters.\n\n`;
                response += `What civic action would you like to take?`;
                return response;
            },
        });
    },
};
// ============================================================================
// IMPACT TRACKING TOOLS
// ============================================================================
const trackImpactDef = {
    id: 'trackImpact',
    name: 'Track Impact',
    description: 'Track social impact and contributions',
    domain: 'community',
    tags: ['community', 'impact', 'tracking'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('trackImpact'),
            parameters: z.object({
                timeframe: z.enum(['this-year', 'all-time', 'recent']).describe('Time period'),
                includeGiving: z.boolean().optional(),
                includeVolunteering: z.boolean().optional(),
            }),
            execute: async ({ timeframe, includeGiving, includeVolunteering }) => {
                getLogger().info({ agentId: ctx.agentId, timeframe }, 'Tracking impact');
                let response = `**Your Impact Summary**\n`;
                response += `_Timeframe: ${timeframe}_\n\n`;
                response += `---\n\n`;
                response += `**Why Track Impact?**\n\n`;
                response += `• See the tangible difference you're making\n`;
                response += `• Stay motivated for continued giving/service\n`;
                response += `• Identify what's most meaningful to you\n`;
                response += `• Inspire others by sharing your impact\n\n`;
                response += `**What to Track:**\n\n`;
                if (includeVolunteering !== false) {
                    response += `**🙋 Volunteering:**\n`;
                    response += `• Total hours volunteered\n`;
                    response += `• Organizations served\n`;
                    response += `• People helped/impacted\n`;
                    response += `• Skills contributed\n\n`;
                }
                if (includeGiving !== false) {
                    response += `**💝 Charitable Giving:**\n`;
                    response += `• Total amount donated\n`;
                    response += `• Organizations supported\n`;
                    response += `• Cause areas covered\n`;
                    response += `• Impact per donation (if organizations report)\n\n`;
                }
                response += `**🌊 Ripple Effects:**\n`;
                response += `Beyond the measurable:\n`;
                response += `• Conversations that changed perspectives\n`;
                response += `• Others inspired to give/serve\n`;
                response += `• Communities strengthened\n`;
                response += `• Hope created\n\n`;
                response += `---\n\n`;
                response += `Would you like to log your impact or reflect on your contributions?`;
                return response;
            },
        });
    },
};
const reflectOnContributionDef = {
    id: 'reflectOnContribution',
    name: 'Reflect On Contribution',
    description: 'Reflect on impact made',
    domain: 'community',
    tags: ['community', 'reflection', 'contribution'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('reflectOnContribution'),
            parameters: z.object({
                contribution: z.string().optional().describe('Specific contribution to reflect on'),
            }),
            execute: async ({ contribution }) => {
                getLogger().info({ agentId: ctx.agentId, contribution }, 'Reflecting on contribution');
                let response = `**Reflecting on Your Contribution**\n\n`;
                if (contribution)
                    response += `_Focusing on: ${contribution}_\n\n`;
                response += `---\n\n`;
                response += `**Reflection Questions:**\n\n`;
                response += `**About the experience:**\n`;
                response += `• What motivated you to contribute in this way?\n`;
                response += `• What did you learn about the cause/community?\n`;
                response += `• What surprised you?\n\n`;
                response += `**About the impact:**\n`;
                response += `• What difference did your contribution make?\n`;
                response += `• Who was affected?\n`;
                response += `• What would have happened without your contribution?\n\n`;
                response += `**About you:**\n`;
                response += `• How did contributing make you feel?\n`;
                response += `• What did you learn about yourself?\n`;
                response += `• How does this connect to what matters most to you?\n\n`;
                response += `**Looking forward:**\n`;
                response += `• What do you want to do more of?\n`;
                response += `• What might you do differently?\n`;
                response += `• How can you deepen your impact?\n\n`;
                response += `---\n\n`;
                response += `**Remember:**\n`;
                response += `• Your contribution matters, even if you can't see all the effects\n`;
                response += `• Perfect is the enemy of good - doing something beats doing nothing\n`;
                response += `• Contribution is a practice, not a destination\n\n`;
                response += `What stands out from your reflection?`;
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const communityTools = [
    // Volunteering
    findVolunteerOpportunityDef,
    trackVolunteerHoursDef,
    // Giving
    planCharitableGivingDef,
    alignGivingWithValuesDef,
    // Community
    findCommunityGroupDef,
    engageCivicallyDef,
    // Impact
    trackImpactDef,
    reflectOnContributionDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('community', communityTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map