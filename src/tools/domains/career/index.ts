/**
 * Career & Professional Development Domain Tools
 *
 * Tools for supporting career growth, job searching, professional development,
 * and work-life balance. This domain addresses one of the most significant
 * areas of adult life.
 *
 * DOMAIN: career
 * TOOLS:
 *   Assessment: assessCareerSatisfaction, clarifyCareerGoals, identifySkillGaps
 *   Job Search: trackJobApplication, suggestJobSearchStrategy, prepareResume
 *   Interviews: practiceInterview, prepareSTARStories
 *   Negotiation: researchSalary, rolePlayNegotiation
 *   Development: createLearningPath, expandNetwork, prepareNetworkingConversation
 *   Wellbeing: assessBurnout, setWorkBoundary, planCareerTransition
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  persistTrackedItem,
  persistKeyMoment,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';
import { trackToolUsage, isLifeCoachAnalyticsEnabled } from '../shared/index.js';
import { z } from 'zod';

// ============================================================================
// CAREER WISDOM DATABASES
// ============================================================================

const INTERVIEW_QUESTIONS = {
  behavioral: [
    {
      question: 'Tell me about a time you faced a significant challenge at work.',
      hint: 'Use STAR: Situation, Task, Action, Result',
    },
    {
      question: 'Describe a situation where you had to work with a difficult colleague.',
      hint: 'Focus on your approach and resolution',
    },
    {
      question: 'Give me an example of when you showed leadership.',
      hint: 'Leadership can be informal - influence without authority',
    },
    {
      question: 'Tell me about a time you failed and what you learned.',
      hint: 'Show self-awareness and growth',
    },
    {
      question: 'Describe your most significant professional accomplishment.',
      hint: 'Quantify impact if possible',
    },
    {
      question: 'Tell me about a time you had to make a decision with incomplete information.',
      hint: 'Show judgment and decision-making process',
    },
    {
      question: 'Describe a situation where you had to persuade someone.',
      hint: 'Focus on understanding their perspective first',
    },
  ],
  culture_fit: [
    {
      question: 'Why are you interested in this role?',
      hint: 'Connect your goals to what the role offers',
    },
    {
      question: 'What kind of work environment do you thrive in?',
      hint: 'Be honest - fit matters for both sides',
    },
    { question: 'How do you handle feedback?', hint: "Show you're coachable and growth-oriented" },
    {
      question: 'Where do you see yourself in 5 years?',
      hint: 'Show ambition while being realistic',
    },
    { question: 'What motivates you?', hint: 'Be authentic - this reveals values' },
    {
      question: 'Why are you leaving your current role?',
      hint: "Stay positive, focus on what you're moving toward",
    },
  ],
  technical: [
    {
      question: 'Walk me through your experience with [skill].',
      hint: 'Use specific examples and projects',
    },
    { question: 'How do you stay current in your field?', hint: 'Show continuous learning' },
    {
      question: 'Describe a technical problem you solved.',
      hint: 'Walk through your problem-solving process',
    },
  ],
};

const BURNOUT_ASSESSMENT = {
  symptoms: {
    exhaustion: {
      weight: 3,
      description: "Physical and emotional exhaustion that doesn't improve with rest",
    },
    cynicism: {
      weight: 3,
      description: 'Detachment, negativity about work, colleagues, or career',
    },
    inefficacy: { weight: 2, description: "Feeling ineffective or that your work doesn't matter" },
    sleep_issues: { weight: 2, description: 'Trouble sleeping due to work thoughts or stress' },
    physical_symptoms: {
      weight: 2,
      description: 'Headaches, illness, physical tension from work stress',
    },
    dread: { weight: 3, description: 'Persistent dread about going to work' },
    isolation: { weight: 1, description: 'Withdrawing from colleagues and work relationships' },
    concentration: { weight: 1, description: 'Difficulty focusing or completing tasks' },
  },
  levels: {
    mild: {
      threshold: 4,
      description: 'Early burnout signs - time to intervene',
      recommendations: [
        'Set firm end-of-day boundaries starting today',
        'Take your full lunch break away from work',
        'Schedule one restorative activity this week',
        'Delegate or postpone one non-essential task',
      ],
    },
    moderate: {
      threshold: 8,
      description: 'Significant burnout - needs attention',
      recommendations: [
        'Have a conversation with your manager about workload',
        'Take PTO if possible, even just a long weekend',
        "Evaluate what's sustainable long-term",
        'Consider talking to a therapist about stress management',
      ],
    },
    severe: {
      threshold: 12,
      description: 'Severe burnout - your health is at risk',
      recommendations: [
        'This is your body telling you something needs to change',
        'Speak with a therapist or counselor',
        'Consider medical leave if available',
        'Evaluate whether this job is sustainable for you',
      ],
    },
  },
};

const SALARY_NEGOTIATION_TIPS = [
  'Never give the first number if you can avoid it',
  'Research thoroughly - know the market rate for your role, location, and experience',
  'Consider total compensation: base, bonus, equity, benefits, flexibility',
  'Practice saying your number out loud - it should feel comfortable',
  'Silence is powerful - make your ask and wait',
  'Have a walk-away number in mind',
  'Get the offer in writing before accepting',
  "Express enthusiasm while negotiating - it's not adversarial",
];

// ============================================================================
// CAREER ASSESSMENT TOOLS
// ============================================================================

const assessCareerSatisfactionDef: ToolDefinition = {
  id: 'assessCareerSatisfaction',
  name: 'Assess Career Satisfaction',
  description: 'Evaluate satisfaction with current role and career',
  domain: 'career',
  tags: ['career', 'assessment', 'satisfaction'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user assess their satisfaction with their current career situation.',
      parameters: z.object({
        currentRole: z.string().optional().describe('Current job title or role'),
        yearsInRole: z.number().optional().describe('Years in current role'),
        specificConcern: z.string().optional().describe('Specific area of concern'),
      }),
      execute: async ({ currentRole, yearsInRole, specificConcern }) => {
        getLogger().info({ agentId: ctx.agentId, currentRole }, 'Assessing career satisfaction');

        let response = `**Career Satisfaction Assessment**\n\n`;

        if (currentRole) {
          response += `Current role: ${currentRole}`;
          if (yearsInRole) response += ` (${yearsInRole} years)`;
          response += `\n\n`;
        }

        response += `Let's look at different dimensions of career satisfaction:\n\n`;

        response += `**1. Work Itself**\n`;
        response += `- Do you find your day-to-day work interesting?\n`;
        response += `- Does it use your strengths?\n`;
        response += `- Does it challenge you appropriately?\n\n`;

        response += `**2. Growth & Learning**\n`;
        response += `- Are you learning and developing?\n`;
        response += `- Is there a path forward (or do you feel stuck)?\n`;
        response += `- Are you building skills that matter for your future?\n\n`;

        response += `**3. Compensation & Recognition**\n`;
        response += `- Do you feel fairly compensated?\n`;
        response += `- Is your work recognized and valued?\n`;
        response += `- Are there opportunities for advancement?\n\n`;

        response += `**4. Culture & People**\n`;
        response += `- Do you respect your manager and colleagues?\n`;
        response += `- Is the culture aligned with your values?\n`;
        response += `- Do you feel you belong?\n\n`;

        response += `**5. Work-Life Integration**\n`;
        response += `- Is the workload sustainable?\n`;
        response += `- Do you have flexibility when needed?\n`;
        response += `- Does work support or detract from your life outside work?\n\n`;

        response += `**6. Meaning & Purpose**\n`;
        response += `- Does your work feel meaningful?\n`;
        response += `- Are you proud of what you do?\n`;
        response += `- Does it align with your values?\n\n`;

        if (specificConcern) {
          response += `---\n\nYou mentioned: "${specificConcern}"\n`;
          response += `Let's explore that. What specifically feels off about this area?`;
        } else {
          response += `---\n\nWhich of these dimensions feels most important to address? Or would you like to rate your satisfaction in each area?`;
        }

        return response;
      },
    });
  },
};

const clarifyCareerGoalsDef: ToolDefinition = {
  id: 'clarifyCareerGoals',
  name: 'Clarify Career Goals',
  description: 'Define and refine career aspirations',
  domain: 'career',
  tags: ['career', 'goals', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user clarify and articulate their career goals.',
      parameters: z.object({
        timeHorizon: z
          .enum(['1-year', '3-year', '5-year', '10-year', 'unsure'])
          .describe('Time horizon'),
        clarity: z
          .enum(['no-idea', 'vague', 'somewhat-clear', 'clear'])
          .describe('Current clarity level'),
        values: z.array(z.string()).optional().describe('Career values if known'),
      }),
      execute: async ({ timeHorizon, clarity, values }) => {
        getLogger().info({ agentId: ctx.agentId, timeHorizon, clarity }, 'Clarifying career goals');

        let response = `**Clarifying Your Career Goals**\n\n`;

        if (clarity === 'no-idea' || clarity === 'vague') {
          response += `Not having clear career goals is more common than you might think. Let's explore.\n\n`;
          response += `**Start with what you know:**\n\n`;
          response += `1. **What do you enjoy doing?** Not what you think you should enjoy - what actually energizes you?\n\n`;
          response += `2. **What are you naturally good at?** What do people come to you for?\n\n`;
          response += `3. **What matters to you?** Money? Impact? Flexibility? Autonomy? Recognition?\n\n`;
          response += `4. **What would you regret NOT doing?** Career paths you're curious about?\n\n`;
          response += `5. **What do you want your life to look like?** Career is one piece - what life do you want it to support?\n\n`;
        } else {
          response += `You have some sense of direction. Let's sharpen it.\n\n`;
        }

        if (values && values.length > 0) {
          response += `**Your stated values:** ${values.join(', ')}\n\n`;
          response += `These values should guide your goals. A goal that conflicts with your values won't be sustainable.\n\n`;
        }

        response += `**Goal-Setting Framework:**\n\n`;

        if (timeHorizon === '1-year') {
          response += `In 1 year, you can:\n`;
          response += `- Develop a new skill\n`;
          response += `- Build key relationships\n`;
          response += `- Achieve a promotion or role change\n`;
          response += `- Increase compensation\n`;
          response += `- Improve work-life balance\n\n`;
          response += `What would make the biggest difference in the next year?`;
        } else if (timeHorizon === '3-year' || timeHorizon === '5-year') {
          response += `In ${timeHorizon}, you can:\n`;
          response += `- Make a significant career pivot\n`;
          response += `- Achieve a leadership role\n`;
          response += `- Build expertise in a new area\n`;
          response += `- Start something of your own\n`;
          response += `- Create a completely different lifestyle\n\n`;
          response += `Where do you want to be?`;
        } else {
          response += `Long-term vision questions:\n`;
          response += `- What would you want to be known for?\n`;
          response += `- What would make you proud looking back?\n`;
          response += `- What impact do you want to have?\n`;
          response += `- What lifestyle do you want your career to enable?`;
        }

        return response;
      },
    });
  },
};

const identifySkillGapsDef: ToolDefinition = {
  id: 'exploreGrowthAreas',
  name: 'Explore Growth Areas',
  description: 'Explore skills and areas for professional growth',
  domain: 'career',
  tags: ['career', 'skills', 'development', 'growth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user explore areas for growth and development in their career journey.',
      parameters: z.object({
        currentRole: z.string().optional().describe('Current role'),
        targetRole: z.string().optional().describe('Role they aspire to'),
        currentSkills: z.array(z.string()).optional().describe('Skills they already have'),
      }),
      execute: async ({ currentRole, targetRole, currentSkills }) => {
        getLogger().info(
          { agentId: ctx.agentId, currentRole, targetRole },
          'Exploring growth areas'
        );

        let response = `**Growth Exploration**\n\n`;

        if (currentRole && targetRole) {
          response += `Current: ${currentRole} → Target: ${targetRole}\n\n`;
        }

        response += `**Areas to explore for your growth:**\n\n`;

        response += `**1. Technical Skills**\n`;
        response += `- What technical abilities does your target role require?\n`;
        response += `- Which of these do you already have? Which need development?\n`;
        response += `- Are there certifications that would help?\n\n`;

        response += `**2. Leadership & Management Skills**\n`;
        response += `- Does your target involve leading people or projects?\n`;
        response += `- Can you demonstrate experience managing, mentoring, or leading?\n`;
        response += `- Do you have experience with budgets, strategy, cross-functional work?\n\n`;

        response += `**3. Communication Skills**\n`;
        response += `- Written communication (reports, proposals, emails)\n`;
        response += `- Presentation and public speaking\n`;
        response += `- Influencing and persuasion\n`;
        response += `- Executive presence\n\n`;

        response += `**4. Domain Knowledge**\n`;
        response += `- What industry or functional knowledge is required?\n`;
        response += `- Are there gaps in your understanding of the business?\n\n`;

        response += `**5. Network & Relationships**\n`;
        response += `- Do you know people in your target area?\n`;
        response += `- Do you have sponsors and advocates?\n`;
        response += `- Is your network strong enough to support a transition?\n\n`;

        if (currentSkills && currentSkills.length > 0) {
          response += `---\n\n**Your current skills:** ${currentSkills.join(', ')}\n\n`;
          response += `Looking at your target, what skills are you missing?`;
        } else {
          response += `---\n\nWhat skills do you think you need to develop? Or would you like help researching what your target role typically requires?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// JOB SEARCH TOOLS
// ============================================================================

const trackJobApplicationDef: ToolDefinition = {
  id: 'trackJobApplication',
  name: 'Track Job Application',
  description: 'Log and track job applications',
  domain: 'career',
  tags: ['career', 'job-search', 'applications', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user track their job applications and follow-ups.',
      parameters: z.object({
        action: z.enum(['add', 'update', 'review', 'stats']).describe('What to do'),
        company: z.string().optional().describe('Company name'),
        role: z.string().optional().describe('Role title'),
        status: z
          .enum([
            'applied',
            'phone-screen',
            'interview-scheduled',
            'interviewed',
            'offer',
            'rejected',
            'withdrawn',
          ])
          .optional()
          .describe('Application status'),
        notes: z.string().optional().describe('Notes about the application'),
      }),
      execute: async ({ action, company, role, status, notes }, { ctx: toolCtx }) => {
        // Track analytics if enabled
        const tracker = isLifeCoachAnalyticsEnabled()
          ? trackToolUsage('trackJobApplication', 'career', { agentId: ctx.agentId })
          : null;

        try {
          getLogger().info(
            { agentId: ctx.agentId, action, company, status },
            'Tracking job application'
          );

          // Persist job application data
          if (action === 'add' || action === 'update') {
            persistTrackedItem(toolCtx as ToolCtxWithUserData, {
              domain: 'career',
              itemType: 'job_application',
              item: { company, role, status: status || 'applied', notes, action },
              importance:
                status === 'offer' || status === 'interview-scheduled' ? 'high' : 'medium',
            });
          }

          // Persist key moments for significant events
          if (status === 'offer') {
            persistKeyMoment(toolCtx as ToolCtxWithUserData, {
              domain: 'career',
              type: 'milestone',
              summary: `Received job offer from ${company} for ${role}`,
              emotionalWeight: 'heavy',
              topics: ['career', 'job-search', 'milestone'],
            });
          }

          let response = '';

          if (action === 'add') {
            response = `**Application Logged** ✅\n\n`;
            response += `**Company:** ${company || 'Not specified'}\n`;
            response += `**Role:** ${role || 'Not specified'}\n`;
            response += `**Status:** ${status || 'applied'}\n`;
            if (notes) response += `**Notes:** ${notes}\n`;
            response += `\n---\n\n`;
            response += `**Next steps to consider:**\n`;
            response += `- Set a follow-up reminder for 1-2 weeks if no response\n`;
            response += `- Research the company more deeply for interviews\n`;
            response += `- Connect with current employees on LinkedIn\n\n`;
            response += `Good luck! Would you like to prepare for a potential interview?`;
          } else if (action === 'update') {
            response = `**Application Updated**\n\n`;
            if (company) response += `**Company:** ${company}\n`;
            if (status) response += `**New Status:** ${status}\n`;
            if (notes) response += `**Notes:** ${notes}\n`;

            if (status === 'interview-scheduled' || status === 'phone-screen') {
              response += `\n---\n\n`;
              response += `🎉 Great news! Would you like to:\n`;
              response += `- Practice interview questions?\n`;
              response += `- Research the company together?\n`;
              response += `- Prepare your STAR stories?\n`;
            } else if (status === 'offer') {
              response += `\n---\n\n`;
              response += `🎉 Congratulations on the offer! Would you like help:\n`;
              response += `- Evaluating the offer?\n`;
              response += `- Preparing for negotiation?\n`;
            } else if (status === 'rejected') {
              response += `\n---\n\n`;
              response += `Rejection is disappointing, but it's part of the process. Every "no" brings you closer to the right "yes."\n\n`;
              response += `Consider:\n`;
              response += `- Asking for feedback if appropriate\n`;
              response += `- Reflecting on what you could improve\n`;
              response += `- Keeping the door open for future opportunities\n`;
            }
          } else if (action === 'review') {
            response = `**Application Review**\n\n`;
            response += `I'd be happy to review your applications. What would you like to know?\n\n`;
            response += `- Status of a specific application?\n`;
            response += `- Applications needing follow-up?\n`;
            response += `- Overall application statistics?\n`;
          } else {
            response = `**Job Search Statistics**\n\n`;
            response += `Let me help you track your progress.\n\n`;
            response += `**Typical job search metrics:**\n`;
            response += `- Applications to interviews: ~10-20%\n`;
            response += `- Interviews to offers: ~10-25%\n`;
            response += `- This means ~40-100 applications for an offer (varies by field)\n\n`;
            response += `Job searching is a numbers game, but quality matters too. Are you customizing applications or applying broadly?`;
          }

          tracker?.success({ action, status });
          return response;
        } catch (error) {
          tracker?.error(error instanceof Error ? error : String(error));
          throw error;
        }
      },
    });
  },
};

const suggestJobSearchStrategyDef: ToolDefinition = {
  id: 'suggestJobSearchStrategy',
  name: 'Suggest Job Search Strategy',
  description: 'Optimize job search approach',
  domain: 'career',
  tags: ['career', 'job-search', 'strategy'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user develop an effective job search strategy.',
      parameters: z.object({
        currentStatus: z
          .enum(['employed', 'unemployed', 'soon-leaving'])
          .describe('Current employment status'),
        urgency: z.enum(['urgent', 'active', 'passive']).describe('How urgent the search'),
        challenge: z
          .enum([
            'not-getting-interviews',
            'not-getting-offers',
            'dont-know-what-i-want',
            'changing-fields',
            'general-strategy',
          ])
          .optional()
          .describe('Main challenge'),
      }),
      execute: async ({ currentStatus, urgency, challenge }) => {
        getLogger().info(
          { agentId: ctx.agentId, currentStatus, urgency, challenge },
          'Suggesting job search strategy'
        );

        let response = `**Job Search Strategy**\n\n`;
        response += `Status: ${currentStatus} | Urgency: ${urgency}\n\n`;

        if (challenge === 'not-getting-interviews') {
          response += `**Not Getting Interviews? Focus on:**\n\n`;
          response += `1. **Resume optimization**\n`;
          response += `   - Is it ATS-friendly (applicant tracking systems)?\n`;
          response += `   - Does it highlight achievements, not just duties?\n`;
          response += `   - Is it customized for each application?\n\n`;
          response += `2. **Application quality over quantity**\n`;
          response += `   - Tailor cover letters to each role\n`;
          response += `   - Use keywords from the job description\n`;
          response += `   - Follow application instructions exactly\n\n`;
          response += `3. **Network activation**\n`;
          response += `   - Employee referrals dramatically increase interview rates\n`;
          response += `   - Reach out to connections at target companies\n`;
          response += `   - Inform your network you're looking\n\n`;
        } else if (challenge === 'not-getting-offers') {
          response += `**Getting Interviews But Not Offers? Focus on:**\n\n`;
          response += `1. **Interview performance**\n`;
          response += `   - Are you preparing thoroughly for each interview?\n`;
          response += `   - Practice common questions out loud\n`;
          response += `   - Have strong STAR stories ready\n\n`;
          response += `2. **Ask for feedback**\n`;
          response += `   - Request feedback after rejections\n`;
          response += `   - Look for patterns across interviews\n\n`;
          response += `3. **Cultural fit**\n`;
          response += `   - Are you targeting companies aligned with your values?\n`;
          response += `   - Are you being authentic in interviews?\n\n`;
        } else if (challenge === 'changing-fields') {
          response += `**Changing Fields Strategy:**\n\n`;
          response += `1. **Bridge the gap**\n`;
          response += `   - Identify transferable skills\n`;
          response += `   - Consider stepping stone roles\n`;
          response += `   - Get relevant certifications or training\n\n`;
          response += `2. **Build credibility**\n`;
          response += `   - Projects, freelance work, volunteering in new field\n`;
          response += `   - Create a portfolio if applicable\n`;
          response += `   - Write about your new field\n\n`;
          response += `3. **Network intensively**\n`;
          response += `   - Informational interviews with people in target field\n`;
          response += `   - Join relevant communities and associations\n`;
          response += `   - Find mentors who have made similar transitions\n\n`;
        } else {
          response += `**General Job Search Strategy:**\n\n`;
          response += `**1. Prepare Your Foundation**\n`;
          response += `- Updated resume with achievements\n`;
          response += `- LinkedIn profile optimization\n`;
          response += `- Clear elevator pitch\n`;
          response += `- List of target companies\n\n`;
          response += `**2. Multi-Channel Approach**\n`;
          response += `- Job boards (LinkedIn, Indeed, specialized)\n`;
          response += `- Company career pages directly\n`;
          response += `- Recruiters and staffing agencies\n`;
          response += `- Networking (most effective!)\n\n`;
          response += `**3. Stay Organized**\n`;
          response += `- Track every application\n`;
          response += `- Set follow-up reminders\n`;
          response += `- Prepare before every interview\n`;
          response += `- Send thank-you notes\n\n`;
        }

        if (urgency === 'urgent') {
          response += `---\n\n**Given your urgency:**\n`;
          response += `- Apply more broadly initially, then narrow\n`;
          response += `- Consider contract or temp roles as a bridge\n`;
          response += `- Activate your network immediately\n`;
          response += `- Apply for unemployment if eligible`;
        }

        response += `\n\nWhat aspect would you like to dive deeper into?`;

        return response;
      },
    });
  },
};

// ============================================================================
// INTERVIEW TOOLS
// ============================================================================

const practiceInterviewDef: ToolDefinition = {
  id: 'practiceInterview',
  name: 'Practice Interview',
  description: 'Practice interview questions with feedback',
  domain: 'career',
  tags: ['career', 'interview', 'practice', 'preparation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user practice interview questions through role-play.',
      parameters: z.object({
        interviewType: z
          .enum(['behavioral', 'technical', 'culture-fit', 'case', 'executive'])
          .describe('Type of interview'),
        role: z.string().optional().describe('Role interviewing for'),
        mode: z.enum(['single-question', 'full-practice', 'feedback']).default('single-question'),
        previousAnswer: z.string().optional().describe('Their previous answer to get feedback on'),
      }),
      execute: async ({ interviewType, role, mode, previousAnswer }) => {
        getLogger().info({ agentId: ctx.agentId, interviewType, mode }, 'Practicing interview');

        let response = '';

        if (mode === 'feedback' && previousAnswer) {
          response = `**Feedback on Your Answer:**\n\n`;
          response += `Your answer: "${previousAnswer.substring(0, 200)}..."\n\n`;
          response += `**What worked:**\n`;
          response += `- You provided a response (showing up is step one!)\n\n`;
          response += `**To strengthen it, consider:**\n\n`;
          response += `**STAR Format Check:**\n`;
          response += `- **Situation:** Did you set the context clearly?\n`;
          response += `- **Task:** Did you explain your specific responsibility?\n`;
          response += `- **Action:** Did you describe what YOU did (not the team)?\n`;
          response += `- **Result:** Did you quantify the outcome if possible?\n\n`;
          response += `**Other tips:**\n`;
          response += `- Keep it concise (2-3 minutes max)\n`;
          response += `- Focus on the most impressive parts\n`;
          response += `- End with what you learned or would do differently\n\n`;
          response += `Would you like to try again or practice a different question?`;
        } else {
          const questions =
            INTERVIEW_QUESTIONS[
              interviewType === 'behavioral'
                ? 'behavioral'
                : interviewType === 'culture-fit'
                  ? 'culture_fit'
                  : 'technical'
            ];
          const randomQ = questions[Math.floor(Math.random() * questions.length)];

          response = `**Interview Practice: ${interviewType}**\n\n`;
          if (role) response += `Role: ${role}\n\n`;
          response += `---\n\n`;
          response += `**Question:**\n`;
          response += `"${randomQ.question}"\n\n`;
          response += `---\n\n`;
          response += `_Hint: ${randomQ.hint}_\n\n`;
          response += `Take a moment to think, then share your answer. I'll give you feedback.\n\n`;
          response += `Remember the STAR format:\n`;
          response += `- **S**ituation: Set the scene\n`;
          response += `- **T**ask: Your responsibility\n`;
          response += `- **A**ction: What you did\n`;
          response += `- **R**esult: The outcome`;
        }

        return response;
      },
    });
  },
};

const prepareSTARStoriesDef: ToolDefinition = {
  id: 'prepareSTARStories',
  name: 'Prepare STAR Stories',
  description: 'Develop behavioral interview stories',
  domain: 'career',
  tags: ['career', 'interview', 'STAR', 'stories'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user develop strong STAR stories for behavioral interviews.',
      parameters: z.object({
        storyType: z
          .enum([
            'leadership',
            'challenge',
            'conflict',
            'failure',
            'achievement',
            'teamwork',
            'influence',
            'initiative',
          ])
          .describe('Type of story to develop'),
        roughIdea: z.string().optional().describe('Their rough story idea'),
      }),
      execute: async ({ storyType, roughIdea }) => {
        getLogger().info({ agentId: ctx.agentId, storyType }, 'Preparing STAR story');

        let response = `**Developing Your ${storyType.charAt(0).toUpperCase() + storyType.slice(1)} Story**\n\n`;

        const prompts: Record<string, string> = {
          leadership:
            'Think of a time you led others - formally or informally. This could be leading a project, mentoring someone, or rallying a team around a goal.',
          challenge:
            'Recall a significant professional challenge you faced. What obstacle seemed difficult or impossible?',
          conflict:
            'Think of a time you navigated disagreement or conflict with a colleague. How did you handle it?',
          failure:
            'Remember a time you failed or made a significant mistake. What happened and what did you learn?',
          achievement:
            "What's your proudest professional accomplishment? What did you achieve that had real impact?",
          teamwork:
            'Think of a successful team effort where your contribution was important. What was your role?',
          influence:
            "When did you persuade someone or change someone's mind? What was your approach?",
          initiative:
            'When did you go beyond your job description or see something that needed doing and do it?',
        };

        response += `${prompts[storyType]}\n\n`;

        if (roughIdea) {
          response += `Your idea: "${roughIdea}"\n\n`;
          response += `Let's develop this using STAR:\n\n`;
        }

        response += `**S - Situation** (15-20 seconds)\n`;
        response += `Set the scene briefly:\n`;
        response += `- Where were you working?\n`;
        response += `- What was the context?\n`;
        response += `- Why does this matter?\n\n`;

        response += `**T - Task** (10-15 seconds)\n`;
        response += `Your specific responsibility:\n`;
        response += `- What were YOU accountable for?\n`;
        response += `- What was the goal or expectation?\n\n`;

        response += `**A - Action** (60-90 seconds - THE KEY PART)\n`;
        response += `What YOU did (not the team):\n`;
        response += `- Be specific about your actions\n`;
        response += `- Explain your reasoning\n`;
        response += `- Show your skills and judgment\n\n`;

        response += `**R - Result** (15-20 seconds)\n`;
        response += `The outcome:\n`;
        response += `- Quantify if possible (%, $, time saved)\n`;
        response += `- What changed because of your actions?\n`;
        response += `- What did you learn?\n\n`;

        response += `---\n\n`;
        response += `Would you like to walk through your story with me? Share each part and I'll help you strengthen it.`;

        return response;
      },
    });
  },
};

// ============================================================================
// NEGOTIATION TOOLS
// ============================================================================

const researchSalaryDef: ToolDefinition = {
  id: 'researchSalary',
  name: 'Research Salary',
  description: 'Research compensation for negotiation',
  domain: 'career',
  tags: ['career', 'salary', 'negotiation', 'research'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user research and understand compensation for salary negotiation.',
      parameters: z.object({
        role: z.string().optional().describe('Role title'),
        location: z.string().optional().describe('Location'),
        yearsExperience: z.number().optional().describe('Years of experience'),
        currentSalary: z.number().optional().describe('Current salary if comfortable sharing'),
      }),
      execute: async ({ role, location, yearsExperience, currentSalary }) => {
        getLogger().info({ agentId: ctx.agentId, role, location }, 'Researching salary');

        let response = `**Salary Research Guide**\n\n`;

        if (role) response += `Role: ${role}\n`;
        if (location) response += `Location: ${location}\n`;
        if (yearsExperience) response += `Experience: ${yearsExperience} years\n`;
        response += `\n`;

        response += `**Research Resources:**\n\n`;
        response += `📊 **Data Sources:**\n`;
        response += `- Glassdoor (glassdoor.com) - Company-specific data\n`;
        response += `- Levels.fyi - Tech industry compensation\n`;
        response += `- LinkedIn Salary - Based on member data\n`;
        response += `- Payscale - General salary data\n`;
        response += `- Bureau of Labor Statistics - Government data\n\n`;

        response += `📋 **What to research:**\n`;
        response += `- Base salary range for your exact title\n`;
        response += `- Total compensation (base + bonus + equity)\n`;
        response += `- Benefits value (healthcare, retirement match)\n`;
        response += `- Geographic adjustment (cost of living)\n`;
        response += `- Company size and stage (startup vs. established)\n\n`;

        response += `**Building Your Range:**\n\n`;
        response += `1. Find the typical range for your role/location/experience\n`;
        response += `2. Your target should be 75th percentile or higher\n`;
        response += `3. Have three numbers ready:\n`;
        response += `   - **Walk-away number** (minimum acceptable)\n`;
        response += `   - **Target number** (what you'd be happy with)\n`;
        response += `   - **Reach number** (best-case scenario)\n\n`;

        if (currentSalary) {
          response += `---\n\nYour current salary: $${currentSalary.toLocaleString()}\n`;
          response += `A typical increase when changing jobs is 10-20%+.\n`;
          response += `Don't let your current salary anchor the negotiation - focus on market rate for the new role.\n`;
        }

        response += `\n---\n\nWould you like to practice salary negotiation once you have your numbers?`;

        return response;
      },
    });
  },
};

const rolePlayNegotiationDef: ToolDefinition = {
  id: 'rolePlayNegotiation',
  name: 'Role Play Negotiation',
  description: 'Practice salary negotiation',
  domain: 'career',
  tags: ['career', 'salary', 'negotiation', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Practice salary negotiation through role-play.',
      parameters: z.object({
        scenario: z
          .enum(['initial-offer', 'counter-offer', 'multiple-offers', 'promotion', 'tips-only'])
          .describe('Negotiation scenario'),
        theirOffer: z.number().optional().describe('The offer they received'),
        theirTarget: z.number().optional().describe('Their target number'),
      }),
      execute: async ({ scenario, theirOffer, theirTarget }) => {
        getLogger().info({ agentId: ctx.agentId, scenario }, 'Role playing negotiation');

        let response = '';

        if (scenario === 'tips-only') {
          response = `**Salary Negotiation Tips**\n\n`;
          SALARY_NEGOTIATION_TIPS.forEach((tip, i) => {
            response += `${i + 1}. ${tip}\n`;
          });
          response += `\n---\n\nWould you like to practice a specific scenario?`;
        } else if (scenario === 'initial-offer') {
          response = `**Scenario: You've Received an Initial Offer**\n\n`;
          if (theirOffer) {
            response += `The offer: $${theirOffer.toLocaleString()}\n`;
            if (theirTarget) response += `Your target: $${theirTarget.toLocaleString()}\n`;
          }
          response += `\n---\n\n`;
          response += `**Step 1: Express Enthusiasm**\n`;
          response += `"I'm really excited about this opportunity. I've enjoyed learning about the team and I can see myself making a real impact here."\n\n`;
          response += `**Step 2: Ask for Time**\n`;
          response += `"I'd like to take a couple of days to review the full offer. When do you need a decision by?"\n\n`;
          response += `**Step 3: Counter (after reviewing)**\n`;
          response += `"I'm very interested in this role. Based on my research and experience, I was targeting [your number]. Is there flexibility in the base salary?"\n\n`;
          response += `**Key points:**\n`;
          response += `- ALWAYS negotiate. Most offers have room.\n`;
          response += `- Express enthusiasm AND ask for more. Both are true.\n`;
          response += `- Counter 10-20% above the offer (or to your researched target)\n`;
          response += `- If base is firm, negotiate bonus, equity, start date, vacation, etc.\n\n`;
          response += `Would you like to practice what you'd say?`;
        } else if (scenario === 'counter-offer') {
          response = `**Scenario: Responding to Their Counter**\n\n`;
          response += `They've come back with a number. Now what?\n\n`;
          response += `**Options:**\n\n`;
          response += `**1. Accept with enthusiasm** (if it meets your target)\n`;
          response += `"I appreciate you working with me on this. I'm excited to accept and join the team."\n\n`;
          response += `**2. One more push** (if close but not quite)\n`;
          response += `"I appreciate you moving. To make this work, I'd need [specific number]. Can we meet there?"\n\n`;
          response += `**3. Negotiate non-salary** (if base is firm)\n`;
          response += `"If the base is firm, would you be able to [signing bonus / extra vacation / earlier review / work from home]?"\n\n`;
          response += `**4. Walk away** (if below your minimum)\n`;
          response += `"I really appreciate the offer, but I won't be able to make the economics work. I hope we can work together in the future."\n\n`;
          response += `What situation are you facing?`;
        } else {
          response = `**Negotiation Practice**\n\n`;
          response += `Let me play the hiring manager. Share your situation and we'll practice the conversation.\n\n`;
          response += `What would you like to practice?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// PROFESSIONAL DEVELOPMENT TOOLS
// ============================================================================

const createLearningPathDef: ToolDefinition = {
  id: 'createLearningPath',
  name: 'Create Learning Path',
  description: 'Create a skill development plan',
  domain: 'career',
  tags: ['career', 'learning', 'development', 'skills'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user create a learning path to develop career skills.',
      parameters: z.object({
        skill: z.string().describe('Skill to develop'),
        currentLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('Current level'),
        timeAvailable: z
          .enum(['1-hour-week', '5-hours-week', '10-plus-hours'])
          .describe('Time available'),
        learningStyle: z.enum(['reading', 'video', 'hands-on', 'courses', 'mix']).optional(),
      }),
      execute: async ({ skill, currentLevel, timeAvailable, learningStyle }) => {
        getLogger().info({ agentId: ctx.agentId, skill, currentLevel }, 'Creating learning path');

        let response = `**Learning Path: ${skill}**\n\n`;
        response += `Current level: ${currentLevel}\n`;
        response += `Time available: ${timeAvailable}\n`;
        if (learningStyle) response += `Learning style: ${learningStyle}\n`;
        response += `\n---\n\n`;

        response += `**Principles for Skill Development:**\n\n`;
        response += `1. **Deliberate practice** > passive consumption\n`;
        response += `   Don't just watch tutorials - build things, make mistakes\n\n`;
        response += `2. **Consistency** > intensity\n`;
        response += `   30 minutes daily beats 5 hours on weekends\n\n`;
        response += `3. **Projects** > exercises\n`;
        response += `   Real projects create real skills and portfolio pieces\n\n`;
        response += `4. **Community** accelerates learning\n`;
        response += `   Find others learning the same thing\n\n`;

        response += `**Suggested Path:**\n\n`;

        if (currentLevel === 'beginner') {
          response += `**Month 1: Foundations**\n`;
          response += `- Structured course or book on fundamentals\n`;
          response += `- Complete all exercises, don't skip ahead\n`;
          response += `- Take notes on key concepts\n\n`;
          response += `**Month 2: Practice**\n`;
          response += `- Simple projects applying what you learned\n`;
          response += `- Start following experts in this area\n`;
          response += `- Join a community or study group\n\n`;
          response += `**Month 3: Build**\n`;
          response += `- More complex project\n`;
          response += `- Teach someone else the basics (teaching cements learning)\n`;
          response += `- Identify intermediate resources\n`;
        } else if (currentLevel === 'intermediate') {
          response += `**Intermediate → Advanced:**\n\n`;
          response += `- Work on increasingly complex projects\n`;
          response += `- Contribute to open source or professional projects\n`;
          response += `- Learn adjacent skills that complement this one\n`;
          response += `- Find a mentor or expert to learn from\n`;
          response += `- Teach beginners (deepens your understanding)\n`;
          response += `- Follow cutting-edge developments in the field\n`;
        } else {
          response += `**Advanced → Expert:**\n\n`;
          response += `- Create original work in the field\n`;
          response += `- Speak, write, or teach publicly\n`;
          response += `- Mentor others\n`;
          response += `- Stay current with latest developments\n`;
          response += `- Connect with other experts\n`;
          response += `- Specialize in a niche area\n`;
        }

        response += `\n---\n\nWhat specific resources or next steps would be most helpful?`;

        return response;
      },
    });
  },
};

const expandNetworkDef: ToolDefinition = {
  id: 'expandNetwork',
  name: 'Expand Network',
  description: 'Strategic networking guidance',
  domain: 'career',
  tags: ['career', 'networking', 'relationships', 'professional'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user strategically expand their professional network.',
      parameters: z.object({
        goal: z
          .enum(['job-search', 'career-advice', 'industry-knowledge', 'general-expansion'])
          .describe('Networking goal'),
        currentNetworkSize: z.enum(['small', 'medium', 'large']).optional(),
        comfort: z.enum(['comfortable', 'uncomfortable', 'very-uncomfortable']).optional(),
      }),
      execute: async ({ goal, currentNetworkSize, comfort }) => {
        getLogger().info({ agentId: ctx.agentId, goal, comfort }, 'Expanding network');

        let response = `**Strategic Networking**\n\n`;
        response += `Goal: ${goal}\n\n`;

        if (comfort === 'very-uncomfortable') {
          response += `**For Introverts & Networking-Averse:**\n\n`;
          response += `Good news: Effective networking doesn't require being an extrovert.\n\n`;
          response += `- Quality over quantity - a few genuine connections > many shallow ones\n`;
          response += `- One-on-one is fine - you don't have to work the room\n`;
          response += `- Online counts - LinkedIn, Twitter, Slack communities\n`;
          response += `- Focus on helping others - takes pressure off you\n`;
          response += `- Prepare talking points - reduces anxiety\n\n`;
        }

        response += `**Networking Strategies:**\n\n`;

        response += `**1. Leverage Existing Connections**\n`;
        response += `- Reconnect with former colleagues\n`;
        response += `- Ask connections for introductions\n`;
        response += `- Join alumni networks\n\n`;

        response += `**2. Create Value First**\n`;
        response += `- Share useful content\n`;
        response += `- Make introductions for others\n`;
        response += `- Offer your expertise\n`;
        response += `- Congratulate others on wins\n\n`;

        response += `**3. Strategic New Connections**\n`;
        response += `- Informational interviews (ask to learn about their path)\n`;
        response += `- Industry events and conferences\n`;
        response += `- Online communities in your field\n`;
        response += `- Comment thoughtfully on others' content\n\n`;

        response += `**4. Maintain Relationships**\n`;
        response += `- Regular touchpoints (quarterly minimum for key connections)\n`;
        response += `- Remember details about people\n`;
        response += `- Congratulate on milestones\n`;
        response += `- Share relevant articles or opportunities\n\n`;

        if (goal === 'job-search') {
          response += `---\n\n**For Job Searching Specifically:**\n`;
          response += `- Let your network know you're looking\n`;
          response += `- Ask for introductions to specific companies or roles\n`;
          response += `- Employee referrals significantly increase your chances\n`;
          response += `- Don't just ask for jobs - ask for advice and information\n`;
        }

        response += `\n---\n\nWould you like help with outreach messages or preparing for conversations?`;

        return response;
      },
    });
  },
};

// ============================================================================
// WORK-LIFE BALANCE TOOLS
// ============================================================================

const assessBurnoutDef: ToolDefinition = {
  id: 'assessBurnout',
  name: 'Assess Burnout',
  description: 'Check for signs of work burnout',
  domain: 'career',
  tags: ['career', 'burnout', 'wellness', 'assessment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user recognize and address signs of burnout.',
      parameters: z.object({
        symptoms: z
          .array(
            z.enum([
              'exhaustion',
              'cynicism',
              'inefficacy',
              'sleep_issues',
              'physical_symptoms',
              'dread',
              'isolation',
              'concentration',
            ])
          )
          .describe('Symptoms experienced'),
        duration: z.enum(['days', 'weeks', 'months']).describe('How long symptoms have persisted'),
        workHours: z.number().optional().describe('Average hours worked per week'),
      }),
      execute: async ({ symptoms, duration, workHours }) => {
        getLogger().info({ agentId: ctx.agentId, symptoms, duration }, 'Assessing burnout');

        let score = 0;
        symptoms.forEach((s) => {
          const symptomData = BURNOUT_ASSESSMENT.symptoms[s];
          if (symptomData) score += symptomData.weight;
        });

        // Adjust for duration
        if (duration === 'weeks') score *= 1.2;
        if (duration === 'months') score *= 1.5;

        let response = `**Burnout Assessment**\n\n`;
        response += `**Symptoms identified:**\n`;
        symptoms.forEach((s) => {
          const symptomData = BURNOUT_ASSESSMENT.symptoms[s];
          if (symptomData) {
            response += `- ${s}: ${symptomData.description}\n`;
          }
        });
        response += `\nDuration: ${duration}\n`;
        if (workHours) response += `Work hours: ${workHours}/week\n`;

        response += `\n---\n\n`;

        // Determine level
        let level: 'mild' | 'moderate' | 'severe';
        if (score >= BURNOUT_ASSESSMENT.levels.severe.threshold) {
          level = 'severe';
        } else if (score >= BURNOUT_ASSESSMENT.levels.moderate.threshold) {
          level = 'moderate';
        } else {
          level = 'mild';
        }

        const levelData = BURNOUT_ASSESSMENT.levels[level];
        response += `**Assessment: ${level.toUpperCase()} burnout indicators**\n`;
        response += `${levelData.description}\n\n`;

        response += `**Recommendations:**\n`;
        levelData.recommendations.forEach((r) => {
          response += `- ${r}\n`;
        });

        if (level === 'severe') {
          response += `\n⚠️ **Important:** Severe burnout is a serious health concern. Please consider talking to a healthcare provider or mental health professional.`;
        }

        if (workHours && workHours > 50) {
          response += `\n\n**Note on your hours:** Working ${workHours} hours/week is likely unsustainable long-term. What's driving this?`;
        }

        response += `\n\n---\n\nWhat feels most important to address first?`;

        return response;
      },
    });
  },
};

const setWorkBoundaryDef: ToolDefinition = {
  id: 'setWorkBoundary',
  name: 'Set Work Boundary',
  description: 'Establish healthy work-life boundaries',
  domain: 'career',
  tags: ['career', 'boundaries', 'work-life', 'balance'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user establish and maintain healthy work boundaries.',
      parameters: z.object({
        boundaryArea: z
          .enum(['hours', 'availability', 'workload', 'meetings', 'communication', 'emotional'])
          .describe('What area to address'),
        currentSituation: z.string().optional().describe('Current situation'),
        fear: z.string().optional().describe('What they fear about setting this boundary'),
      }),
      execute: async ({ boundaryArea, currentSituation, fear }) => {
        getLogger().info({ agentId: ctx.agentId, boundaryArea }, 'Setting work boundary');

        let response = `**Setting a Work Boundary: ${boundaryArea}**\n\n`;

        if (currentSituation) {
          response += `Current situation: ${currentSituation}\n\n`;
        }

        const boundaryAdvice: Record<string, string> = {
          hours:
            `**Setting Hours Boundaries:**\n\n` +
            `- Define your work hours and communicate them\n` +
            `- Set a firm stop time and create a shutdown ritual\n` +
            `- Remove work apps from personal phone (or use Focus modes)\n` +
            `- Don't check email before bed or first thing in morning\n` +
            `- Take your full lunch break\n\n` +
            `**Script:** "I'm generally available [hours]. For anything outside those hours, I'll respond the next business day unless it's truly urgent."`,

          availability:
            `**Setting Availability Boundaries:**\n\n` +
            `- You don't need to be always-on\n` +
            `- Set response time expectations (e.g., 24 hours for email)\n` +
            `- Use calendar blocks for focus time\n` +
            `- It's okay to not respond immediately\n\n` +
            `**Script:** "I batch my email twice a day so I can focus on deep work. I'll get back to you within 24 hours, or call if it's urgent."`,

          workload:
            `**Setting Workload Boundaries:**\n\n` +
            `- You can say no, or "not now"\n` +
            `- Ask for priorities when everything is "urgent"\n` +
            `- Negotiate deadlines\n` +
            `- Push back on scope creep\n\n` +
            `**Scripts:**\n` +
            `- "I can take this on. What should I deprioritize to make room?"\n` +
            `- "Given my current workload, I can do this by [realistic date]. Does that work?"\n` +
            `- "I don't have capacity for this right now. Let's discuss priorities."`,

          meetings:
            `**Setting Meeting Boundaries:**\n\n` +
            `- Not every meeting needs you\n` +
            `- Block focus time on your calendar\n` +
            `- Ask for agendas before accepting\n` +
            `- Decline meetings without guilt\n\n` +
            `**Scripts:**\n` +
            `- "What's the goal of this meeting? Do you need me specifically?"\n` +
            `- "I have a conflict but happy to be looped in via notes."\n` +
            `- "I block [day/time] for focus work. Can we find another slot?"`,

          communication:
            `**Setting Communication Boundaries:**\n\n` +
            `- Different channels for different urgencies\n` +
            `- Set expectations for response times\n` +
            `- Protect off-hours from work communication\n\n` +
            `**Framework:**\n` +
            `- Urgent & time-sensitive: Call/text\n` +
            `- Same-day: Slack/Teams\n` +
            `- Not urgent: Email`,

          emotional:
            `**Setting Emotional Boundaries:**\n\n` +
            `- Not everyone's emotions are your responsibility\n` +
            `- It's okay to not absorb others' stress\n` +
            `- Your manager's mood isn't your job to manage\n` +
            `- Venting has limits - you don't have to be everyone's therapist\n\n` +
            `- Take mental health seriously\n` +
            `- It's okay to say "I'm not in a place to help with this right now"`,
        };

        response += boundaryAdvice[boundaryArea] || '';

        if (fear) {
          response += `\n\n---\n\n**About your fear:** "${fear}"\n\n`;
          response += `This fear is valid. And here's what's also true:\n`;
          response += `- Boundaries often improve relationships and respect\n`;
          response += `- Sustainable performance requires boundaries\n`;
          response += `- The best employees have boundaries\n`;
          response += `- If a workplace punishes reasonable boundaries, that's information\n`;
        }

        response += `\n\n---\n\nWhat boundary feels most urgent to set?`;

        return response;
      },
    });
  },
};

const planCareerTransitionDef: ToolDefinition = {
  id: 'planCareerTransition',
  name: 'Plan Career Transition',
  description: 'Navigate career changes and pivots',
  domain: 'career',
  tags: ['career', 'transition', 'pivot', 'change'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user plan and navigate a career transition.',
      parameters: z.object({
        transitionType: z
          .enum([
            'new-industry',
            'new-function',
            'entrepreneurship',
            'return-to-workforce',
            'downshift',
            'upshift',
          ])
          .describe('Type of transition'),
        currentState: z.string().optional().describe('Current situation'),
        targetState: z.string().optional().describe('Where they want to go'),
        timeline: z.enum(['asap', '6-months', '1-year', '2-plus-years']).optional(),
      }),
      execute: async ({ transitionType, currentState, targetState, timeline }) => {
        getLogger().info(
          { agentId: ctx.agentId, transitionType, timeline },
          'Planning career transition'
        );

        let response = `**Career Transition Planning**\n\n`;
        response += `Transition type: ${transitionType}\n`;
        if (currentState) response += `From: ${currentState}\n`;
        if (targetState) response += `To: ${targetState}\n`;
        if (timeline) response += `Timeline: ${timeline}\n`;
        response += `\n---\n\n`;

        response += `**Career transitions are possible.** Many successful people have reinvented themselves. It takes planning, patience, and action.\n\n`;

        if (transitionType === 'new-industry' || transitionType === 'new-function') {
          response += `**Transition Framework:**\n\n`;
          response += `**1. Research Phase**\n`;
          response += `- Informational interviews with people in target field\n`;
          response += `- Understand day-to-day reality, not just the idea\n`;
          response += `- Identify what skills transfer and what gaps exist\n\n`;
          response += `**2. Bridge Building**\n`;
          response += `- Get relevant certifications or training\n`;
          response += `- Take on projects that build new skills\n`;
          response += `- Volunteer or freelance in the new area\n`;
          response += `- Create a portfolio of relevant work\n\n`;
          response += `**3. Story Crafting**\n`;
          response += `- Develop a compelling narrative for why you're transitioning\n`;
          response += `- Frame your background as an asset, not a detour\n`;
          response += `- Practice your transition story\n\n`;
          response += `**4. Strategic Job Search**\n`;
          response += `- Target "bridge" roles that value your background\n`;
          response += `- Network heavily in the new field\n`;
          response += `- Consider stepping stones vs. direct moves\n`;
        } else if (transitionType === 'entrepreneurship') {
          response += `**Transition to Entrepreneurship:**\n\n`;
          response += `**Before you leap:**\n`;
          response += `- Validate your idea with potential customers\n`;
          response += `- Build runway (6-12 months expenses ideally)\n`;
          response += `- Start building on the side if possible\n`;
          response += `- Understand your risk tolerance\n\n`;
          response += `**Key questions:**\n`;
          response += `- What problem are you solving?\n`;
          response += `- Who will pay for this solution?\n`;
          response += `- Can you start small to test?\n`;
          response += `- What's your minimum viable approach?\n`;
        } else if (transitionType === 'return-to-workforce') {
          response += `**Returning to the Workforce:**\n\n`;
          response += `**Address the gap proactively:**\n`;
          response += `- Be confident, not apologetic about your time away\n`;
          response += `- Highlight skills maintained or developed\n`;
          response += `- Consider returnship programs designed for career re-entry\n\n`;
          response += `**Refresh your skills:**\n`;
          response += `- Update certifications if relevant\n`;
          response += `- Take courses to get current\n`;
          response += `- Volunteer or freelance to rebuild recent experience\n\n`;
          response += `**Leverage your network:**\n`;
          response += `- Former colleagues may be your best path back\n`;
          response += `- Be clear about what you're looking for\n`;
        } else if (transitionType === 'downshift') {
          response += `**Downshifting Your Career:**\n\n`;
          response += `Choosing less intensity is valid. It's not failure.\n\n`;
          response += `**Consider:**\n`;
          response += `- What are you optimizing for now?\n`;
          response += `- Financial implications and planning\n`;
          response += `- How to position this to employers\n`;
          response += `- Part-time, consulting, or flexible options\n\n`;
          response += `**Reframe:**\n`;
          response += `- "Stepping back" → "Optimizing for [priority]"\n`;
          response += `- Career success isn't one direction\n`;
        }

        response += `\n---\n\nWhat aspect of your transition would you like to explore more deeply?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const careerTools: ToolDefinition[] = [
  // Assessment
  assessCareerSatisfactionDef,
  clarifyCareerGoalsDef,
  identifySkillGapsDef,
  // Job Search
  trackJobApplicationDef,
  suggestJobSearchStrategyDef,
  // Interviews
  practiceInterviewDef,
  prepareSTARStoriesDef,
  // Negotiation
  researchSalaryDef,
  rolePlayNegotiationDef,
  // Development
  createLearningPathDef,
  expandNetworkDef,
  // Work-Life Balance
  assessBurnoutDef,
  setWorkBoundaryDef,
  planCareerTransitionDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'career',
  careerTools
);

export default getToolDefinitions;
