/**
 * Education & Learning Domain Tools
 *
 * Tools for supporting lifelong learning, skill development, and educational
 * goals. This domain supports the growth mindset.
 *
 * DOMAIN: learning
 * TOOLS:
 *   Goals: setLearningGoal, trackLearningProgress, reflectOnLearning
 *   Study: planStudySession, scheduleSpacedRepetition, testKnowledge
 *   Resources: recommendResource, trackBooksRead
 *   Blocks: overcomeLearningBlock
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// LEARNING SCIENCE INSIGHTS
// ============================================================================

const LEARNING_PRINCIPLES = {
  'active-recall': {
    principle: 'Active Recall',
    explanation: 'Testing yourself is far more effective than re-reading',
    application: 'Close the book and try to remember. Use flashcards. Take practice tests.',
  },
  'spaced-repetition': {
    principle: 'Spaced Repetition',
    explanation: 'Spacing out practice over time beats cramming',
    application: 'Review at increasing intervals: 1 day, 3 days, 1 week, 2 weeks, 1 month',
  },
  interleaving: {
    principle: 'Interleaving',
    explanation: 'Mixing different topics/skills improves learning more than blocking',
    application: 'Instead of AAA BBB CCC, practice ABC ABC ABC',
  },
  elaboration: {
    principle: 'Elaboration',
    explanation: 'Connecting new information to what you know makes it stick',
    application: 'Ask "why?" and "how does this connect to X?"',
  },
  generation: {
    principle: 'Generation Effect',
    explanation: 'Creating your own examples and explanations beats receiving them',
    application: 'Explain concepts in your own words. Create your own examples.',
  },
  'desirable-difficulty': {
    principle: 'Desirable Difficulty',
    explanation: 'Learning should feel hard - struggle improves retention',
    application: "If it feels too easy, you're probably not learning as much",
  },
};

// ============================================================================
// LEARNING GOAL TOOLS
// ============================================================================

const setLearningGoalDef: ToolDefinition = {
  id: 'setLearningGoal',
  name: 'Set Learning Goal',
  description: 'Define learning objectives clearly',
  domain: 'learning',
  tags: ['learning', 'goals', 'planning'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user set clear, achievable learning goals.',
      parameters: z.object({
        subject: z.string().describe('What they want to learn'),
        motivation: z.string().optional().describe('Why they want to learn this'),
        currentLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        targetOutcome: z.string().optional().describe('What success looks like'),
        timeframe: z.string().optional().describe('Target timeframe'),
      }),
      execute: async ({ subject, motivation, currentLevel, targetOutcome, timeframe }) => {
        getLogger().info({ agentId: ctx.agentId, subject }, 'Setting learning goal');

        let response = `**Learning Goal: ${subject}**\n\n`;
        if (motivation) response += `**Why:** ${motivation}\n`;
        if (currentLevel) response += `**Current level:** ${currentLevel}\n`;
        if (targetOutcome) response += `**Success looks like:** ${targetOutcome}\n`;
        if (timeframe) response += `**Timeframe:** ${timeframe}\n`;
        response += `\n---\n\n`;

        response += `**Making Your Goal SMART:**\n\n`;

        response += `**S - Specific**\n`;
        response += `Not "learn Spanish" but "be able to have a basic conversation in Spanish"\n\n`;

        response += `**M - Measurable**\n`;
        response += `How will you know you've achieved it?\n`;
        response += `- Pass a test?\n`;
        response += `- Complete a project?\n`;
        response += `- Demonstrate a skill?\n\n`;

        response += `**A - Achievable**\n`;
        response += `Is this realistic given your time and resources?\n\n`;

        response += `**R - Relevant**\n`;
        response += `Why does this matter to you right now?\n\n`;

        response += `**T - Time-bound**\n`;
        response += `By when? Deadlines create focus.\n\n`;

        response += `---\n\n`;

        response += `**Refined goal template:**\n`;
        response += `"By [date], I will be able to [specific skill/knowledge] as demonstrated by [measurable outcome]."\n\n`;

        response += `How would you refine your goal?`;

        return response;
      },
    });
  },
};

const trackLearningProgressDef: ToolDefinition = {
  id: 'trackLearningProgress',
  name: 'Track Learning Progress',
  description: 'Monitor skill development over time',
  domain: 'learning',
  tags: ['learning', 'progress', 'tracking'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user track their learning progress.',
      parameters: z.object({
        subject: z.string().describe('What they are learning'),
        update: z.string().optional().describe('Progress update'),
        hoursLogged: z.number().optional().describe('Hours spent'),
        milestoneReached: z.string().optional().describe('Milestone achieved'),
      }),
      execute: async ({ subject, update, hoursLogged, milestoneReached }) => {
        getLogger().info({ agentId: ctx.agentId, subject }, 'Tracking learning progress');

        let response = `**Learning Progress: ${subject}**\n\n`;
        if (update) response += `**Update:** ${update}\n`;
        if (hoursLogged) response += `**Hours logged:** ${hoursLogged}\n`;
        if (milestoneReached) response += `**Milestone reached:** ${milestoneReached} 🎉\n`;
        response += `\n---\n\n`;

        if (milestoneReached) {
          response += `Congratulations on this milestone! Take a moment to acknowledge your progress.\n\n`;
          response += `**Reflection questions:**\n`;
          response += `• What helped you get here?\n`;
          response += `• What was harder than expected?\n`;
          response += `• What would you do differently next time?\n\n`;
        }

        response += `**The Learning Curve Reality:**\n\n`;
        response += `• Progress isn't linear - expect plateaus\n`;
        response += `• The "dip" is where most people quit\n`;
        response += `• Confusion often precedes understanding\n`;
        response += `• Looking back, you've come further than you think\n\n`;

        response += `**Keep going by:**\n`;
        response += `• Reviewing why you started\n`;
        response += `• Celebrating small wins\n`;
        response += `• Finding accountability\n`;
        response += `• Varying your practice methods\n\n`;

        response += `What's your next learning target?`;

        return response;
      },
    });
  },
};

const reflectOnLearningDef: ToolDefinition = {
  id: 'reflectOnLearning',
  name: 'Reflect On Learning',
  description: 'Guided reflection to deepen learning',
  domain: 'learning',
  tags: ['learning', 'reflection', 'metacognition'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide user through reflection to consolidate learning.',
      parameters: z.object({
        topic: z.string().describe('What was learned'),
        timeframe: z.enum(['today', 'this-week', 'this-month', 'project']).describe('Time period'),
      }),
      execute: async ({ topic, timeframe }) => {
        getLogger().info({ agentId: ctx.agentId, topic, timeframe }, 'Reflecting on learning');

        let response = `**Learning Reflection: ${topic}**\n`;
        response += `_Timeframe: ${timeframe}_\n\n`;

        response += `---\n\n`;

        response += `**What did you learn?**\n`;
        response += `Summarize the key concepts in your own words. Teaching yourself cements understanding.\n\n`;

        response += `**What surprised you?**\n`;
        response += `What was different from what you expected? Surprises often mark real learning.\n\n`;

        response += `**What's still fuzzy?**\n`;
        response += `What concepts aren't clear yet? Identifying gaps is valuable.\n\n`;

        response += `**How does this connect?**\n`;
        response += `How does this relate to what you already knew? To other areas of your life?\n\n`;

        response += `**How will you use this?**\n`;
        response += `What will you do with this knowledge? Application deepens learning.\n\n`;

        response += `**What's next?**\n`;
        response += `What do you want to learn next? What questions emerged?\n\n`;

        response += `---\n\n`;

        response += `**Reflection is learning too.** Taking time to process what you've learned makes it stick better than just moving on.\n\n`;

        response += `What stands out most from your learning?`;

        return response;
      },
    });
  },
};

// ============================================================================
// STUDY PLANNING TOOLS
// ============================================================================

const planStudySessionDef: ToolDefinition = {
  id: 'planStudySession',
  name: 'Plan Study Session',
  description: 'Plan effective study sessions',
  domain: 'learning',
  tags: ['learning', 'study', 'planning'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help plan an effective study session.',
      parameters: z.object({
        subject: z.string().describe('What to study'),
        timeAvailable: z.number().describe('Minutes available'),
        goal: z.string().optional().describe('Session goal'),
        energy: z.enum(['low', 'medium', 'high']).optional(),
      }),
      execute: async ({ subject, timeAvailable, goal, energy }) => {
        getLogger().info(
          { agentId: ctx.agentId, subject, timeAvailable },
          'Planning study session'
        );

        let response = `**Study Session Plan**\n\n`;
        response += `**Subject:** ${subject}\n`;
        response += `**Time:** ${timeAvailable} minutes\n`;
        if (goal) response += `**Goal:** ${goal}\n`;
        if (energy) response += `**Energy level:** ${energy}\n`;
        response += `\n---\n\n`;

        // Adjust based on time available
        if (timeAvailable <= 30) {
          response += `**Short Session Structure:**\n\n`;
          response += `• 2 min: Quick review of last session\n`;
          response += `• ${timeAvailable - 7} min: Focused study (one concept)\n`;
          response += `• 5 min: Active recall - close materials and summarize\n`;
        } else if (timeAvailable <= 60) {
          response += `**Medium Session Structure:**\n\n`;
          response += `• 5 min: Review and set intention\n`;
          response += `• 25 min: Study block 1\n`;
          response += `• 5 min: Break (movement!)\n`;
          response += `• 20 min: Study block 2\n`;
          response += `• 5 min: Summary and next steps\n`;
        } else {
          response += `**Long Session Structure (Pomodoro):**\n\n`;
          const pomodoros = Math.floor(timeAvailable / 30);
          response += `${pomodoros} study blocks of 25 min each:\n`;
          for (let i = 1; i <= pomodoros; i++) {
            response += `• Block ${i}: 25 min study + 5 min break\n`;
          }
          response += `• Final 10 min: Review and consolidate\n`;
        }

        response += `\n---\n\n`;

        response += `**Evidence-Based Study Tips:**\n\n`;
        response += `• **Active recall:** Test yourself instead of re-reading\n`;
        response += `• **Eliminate distractions:** Phone in another room\n`;
        response += `• **Single-task:** Focus on one thing at a time\n`;
        response += `• **Teach it:** Explain concepts aloud to yourself\n`;

        if (energy === 'low') {
          response += `\n**For low energy:**\n`;
          response += `• Do easier review tasks\n`;
          response += `• Take more frequent short breaks\n`;
          response += `• Move your body briefly between blocks\n`;
          response += `• Consider if rest would serve you better\n`;
        }

        response += `\n---\n\nReady to begin?`;

        return response;
      },
    });
  },
};

const scheduleSpacedRepetitionDef: ToolDefinition = {
  id: 'scheduleSpacedRepetition',
  name: 'Schedule Spaced Repetition',
  description: 'Optimize retention with spaced practice',
  domain: 'learning',
  tags: ['learning', 'spaced-repetition', 'memory'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help set up spaced repetition schedule for better retention.',
      parameters: z.object({
        material: z.string().describe('What to retain'),
        startDate: z.string().optional().describe('When learning started'),
        examDate: z.string().optional().describe('If there is an exam date'),
      }),
      execute: async ({ material, startDate, examDate }) => {
        getLogger().info({ agentId: ctx.agentId, material }, 'Setting up spaced repetition');

        let response = `**Spaced Repetition Schedule: ${material}**\n\n`;

        response += `**The Science:**\n`;
        response += `We forget ~80% of what we learn within days. But reviewing at optimal intervals can boost retention to 90%+.\n\n`;

        response += `---\n\n`;

        response += `**Standard Spaced Repetition Schedule:**\n\n`;
        response += `After initial learning:\n`;
        response += `• **Review 1:** 1 day later\n`;
        response += `• **Review 2:** 3 days after Review 1\n`;
        response += `• **Review 3:** 7 days after Review 2\n`;
        response += `• **Review 4:** 14 days after Review 3\n`;
        response += `• **Review 5:** 30 days after Review 4\n`;
        response += `• **Review 6:** 60 days after Review 5\n\n`;

        if (examDate) {
          response += `**With exam on ${examDate}:**\n`;
          response += `Work backwards from the exam date to schedule reviews.\n`;
          response += `Final review should be 1-2 days before, not the night before.\n\n`;
        }

        response += `---\n\n`;

        response += `**How to Review:**\n\n`;
        response += `• **Active recall:** Try to remember BEFORE looking at notes\n`;
        response += `• **Self-testing:** Use flashcards, practice questions\n`;
        response += `• **Teach it:** Explain the concept aloud\n`;
        response += `• **Mix it up:** Interleave with other material\n\n`;

        response += `**Tools:**\n`;
        response += `• Anki (flashcard app with built-in spaced repetition)\n`;
        response += `• Quizlet\n`;
        response += `• RemNote\n`;
        response += `• Physical flashcards with a box system\n\n`;

        response += `Would you like help creating your review schedule?`;

        return response;
      },
    });
  },
};

const testKnowledgeDef: ToolDefinition = {
  id: 'testKnowledge',
  name: 'Test Knowledge',
  description: 'Self-testing to strengthen retention',
  domain: 'learning',
  tags: ['learning', 'testing', 'recall'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user test their knowledge through active recall.',
      parameters: z.object({
        topic: z.string().describe('Topic to test'),
        format: z.enum(['explain', 'questions', 'teach', 'apply']).describe('Testing format'),
      }),
      execute: async ({ topic, format }) => {
        getLogger().info({ agentId: ctx.agentId, topic, format }, 'Testing knowledge');

        let response = `**Knowledge Check: ${topic}**\n\n`;

        if (format === 'explain') {
          response += `**The Feynman Technique:**\n\n`;
          response += `Explain ${topic} in simple terms, as if teaching a child.\n\n`;
          response += `Rules:\n`;
          response += `• No jargon\n`;
          response += `• Use analogies\n`;
          response += `• Cover the key concepts\n\n`;
          response += `When you get stuck or vague, that's where your understanding needs work.\n\n`;
          response += `Go ahead - explain it to me simply.`;
        } else if (format === 'questions') {
          response += `**Self-Test Questions:**\n\n`;
          response += `Answer these about ${topic}:\n\n`;
          response += `1. What are the main concepts or components?\n`;
          response += `2. Why does this matter? What problem does it solve?\n`;
          response += `3. How does it connect to what you already know?\n`;
          response += `4. What are common misconceptions?\n`;
          response += `5. Can you give an example or application?\n\n`;
          response += `Try to answer without looking at your notes first.`;
        } else if (format === 'teach') {
          response += `**Teach It Back:**\n\n`;
          response += `Pretend I know nothing about ${topic} and you need to teach me.\n\n`;
          response += `Include:\n`;
          response += `• What it is\n`;
          response += `• Why it matters\n`;
          response += `• The key points\n`;
          response += `• An example\n`;
          response += `• Common mistakes to avoid\n\n`;
          response += `Teaching is the best test of understanding. Go ahead.`;
        } else {
          response += `**Apply Your Knowledge:**\n\n`;
          response += `The real test is application. For ${topic}:\n\n`;
          response += `• What's a real-world problem you could solve with this?\n`;
          response += `• Create an example or scenario using these concepts\n`;
          response += `• How would you explain when/where to use this?\n`;
          response += `• What would you do if [scenario]?\n\n`;
          response += `Application reveals gaps that passive review misses.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// RESOURCE TOOLS
// ============================================================================

const recommendResourceDef: ToolDefinition = {
  id: 'recommendResource',
  name: 'Recommend Resource',
  description: 'Suggest learning resources',
  domain: 'learning',
  tags: ['learning', 'resources', 'recommendations'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help find learning resources based on topic and preferences.',
      parameters: z.object({
        topic: z.string().describe('What to learn'),
        format: z
          .enum(['books', 'courses', 'videos', 'podcasts', 'all'])
          .describe('Preferred format'),
        level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        style: z.enum(['structured', 'self-paced', 'interactive', 'any']).optional(),
      }),
      execute: async ({ topic, format, level, style }) => {
        getLogger().info({ agentId: ctx.agentId, topic, format }, 'Recommending resources');

        let response = `**Learning Resources for: ${topic}**\n\n`;
        if (level) response += `**Level:** ${level}\n`;
        if (style) response += `**Style:** ${style}\n`;
        response += `\n---\n\n`;

        response += `**How to Find Quality Resources:**\n\n`;

        if (format === 'books' || format === 'all') {
          response += `**📚 Books:**\n`;
          response += `• Check Goodreads for ratings and reviews\n`;
          response += `• Look for "best books on [topic]" lists from experts\n`;
          response += `• Academic textbooks for depth\n`;
          response += `• Library apps (Libby) for free access\n\n`;
        }

        if (format === 'courses' || format === 'all') {
          response += `**🎓 Online Courses:**\n`;
          response += `• Coursera, edX (university courses, often free to audit)\n`;
          response += `• Udemy (wait for sales - courses drop to $10-15)\n`;
          response += `• Skillshare (creative skills)\n`;
          response += `• LinkedIn Learning (professional skills)\n`;
          response += `• Khan Academy (free, great for fundamentals)\n\n`;
        }

        if (format === 'videos' || format === 'all') {
          response += `**🎬 Videos:**\n`;
          response += `• YouTube (search "[topic] tutorial" or "explained")\n`;
          response += `• MIT OpenCourseWare (full lectures free)\n`;
          response += `• TED Talks for overview/inspiration\n`;
          response += `• Specific channels by topic experts\n\n`;
        }

        if (format === 'podcasts' || format === 'all') {
          response += `**🎧 Podcasts:**\n`;
          response += `• Search "[topic] podcast" in your podcast app\n`;
          response += `• Good for passive learning (commute, exercise)\n`;
          response += `• Best for overview, not deep learning\n\n`;
        }

        response += `---\n\n`;

        response += `**Evaluating Resources:**\n`;
        response += `• Who created it? What's their expertise?\n`;
        response += `• When was it made? Is it current?\n`;
        response += `• What do reviews/ratings say?\n`;
        response += `• Does it match your learning style?\n`;
        response += `• Try free samples before committing\n\n`;

        response += `**Pro tip:** Often, one great resource beats five mediocre ones. Don't get stuck in "research mode" - start learning.\n\n`;

        response += `Would you like help evaluating specific resources?`;

        return response;
      },
    });
  },
};

const trackBooksReadDef: ToolDefinition = {
  id: 'trackBooksRead',
  name: 'Track Books Read',
  description: 'Log books and key takeaways',
  domain: 'learning',
  tags: ['learning', 'reading', 'books', 'tracking'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help track books read and capture key insights.',
      parameters: z.object({
        action: z.enum(['log', 'list', 'reflect']).describe('What to do'),
        title: z.string().optional().describe('Book title'),
        author: z.string().optional().describe('Author'),
        keyTakeaways: z.array(z.string()).optional().describe('Key learnings'),
        rating: z.number().optional().describe('Rating 1-5'),
      }),
      execute: async ({ action, title, author, keyTakeaways, rating }) => {
        getLogger().info({ agentId: ctx.agentId, action, title }, 'Tracking books');

        let response = '';

        if (action === 'log') {
          response = `**Book Logged 📚**\n\n`;
          response += `**Title:** ${title}\n`;
          if (author) response += `**Author:** ${author}\n`;
          if (rating) response += `**Rating:** ${'⭐'.repeat(rating)}\n`;
          if (keyTakeaways?.length) {
            response += `\n**Key Takeaways:**\n`;
            keyTakeaways.forEach((t, i) => (response += `${i + 1}. ${t}\n`));
          }
          response += `\n---\n\n`;
          response += `Great! Capturing key takeaways is how books become lasting knowledge.\n\n`;
          response += `**To maximize retention:**\n`;
          response += `• Review these takeaways in a week\n`;
          response += `• Share one insight with someone\n`;
          response += `• Apply one concept in your life\n`;
        } else if (action === 'reflect') {
          response = `**Book Reflection: ${title}**\n\n`;
          response += `**Reflection questions:**\n\n`;
          response += `1. What was the main argument or thesis?\n`;
          response += `2. What was most surprising or new?\n`;
          response += `3. What do you disagree with or question?\n`;
          response += `4. How does this connect to other books/ideas?\n`;
          response += `5. What will you do differently because of this book?\n`;
          response += `6. Who should read this book?\n\n`;
          response += `Writing reflections helps you process and remember.`;
        } else {
          response = `**Your Reading Tracker**\n\n`;
          response += `I can help you:\n`;
          response += `• Log a book you've read with key takeaways\n`;
          response += `• Reflect deeply on a book's ideas\n`;
          response += `• Review your reading history\n\n`;
          response += `What would you like to do?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// LEARNING BLOCKS TOOL
// ============================================================================

const overcomeLearningBlockDef: ToolDefinition = {
  id: 'overcomeLearningBlock',
  name: 'Overcome Learning Block',
  description: 'Help with learning obstacles',
  domain: 'learning',
  tags: ['learning', 'blocks', 'obstacles'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help overcome obstacles to learning.',
      parameters: z.object({
        block: z
          .enum([
            'procrastination',
            'overwhelm',
            'confusion',
            'boredom',
            'lack-of-time',
            'imposter-syndrome',
            'plateau',
          ])
          .describe('Type of block'),
        subject: z.string().optional().describe('What they are trying to learn'),
      }),
      execute: async ({ block, subject }) => {
        getLogger().info({ agentId: ctx.agentId, block, subject }, 'Overcoming learning block');

        let response = `**Overcoming: ${block}**\n`;
        if (subject) response += `_While learning: ${subject}_\n`;
        response += `\n---\n\n`;

        const advice: Record<string, string> = {
          procrastination:
            `**Procrastination usually isn't laziness - it's emotion management.**\n\n` +
            `**Strategies:**\n` +
            `• **5-minute rule:** Just start for 5 minutes. That's it.\n` +
            `• **Remove friction:** Everything ready, distractions gone\n` +
            `• **Make it smaller:** What's the tiniest step?\n` +
            `• **Accountability:** Tell someone your plan\n` +
            `• **Reward yourself:** Treat after focused work\n\n` +
            `**Ask yourself:** What emotion am I avoiding? Fear of failure? Boredom? Overwhelm?`,

          overwhelm:
            `**Overwhelm means too much, not too hard.**\n\n` +
            `**Strategies:**\n` +
            `• **Zoom in:** Focus only on the very next step\n` +
            `• **Brain dump:** Get everything out of your head onto paper\n` +
            `• **Ruthless prioritization:** What's the ONE most important thing?\n` +
            `• **Say no:** What can you remove or delay?\n` +
            `• **Chunk it:** Break into much smaller pieces\n\n` +
            `Right now, what's the single next action you need to take?`,

          confusion:
            `**Confusion is part of learning - don't run from it.**\n\n` +
            `**Strategies:**\n` +
            `• **Back up:** You may have missed a prerequisite\n` +
            `• **Different angle:** Try a different explanation/resource\n` +
            `• **Rubber duck:** Explain the confusion aloud\n` +
            `• **Ask for help:** Teachers, forums, study groups\n` +
            `• **Sleep on it:** Seriously, learning happens during sleep\n\n` +
            `Where exactly does your understanding break down?`,

          boredom:
            `**Boredom signals a mismatch - too easy, too hard, or wrong approach.**\n\n` +
            `**Strategies:**\n` +
            `• **Increase challenge:** Make it harder if it's too easy\n` +
            `• **Find relevance:** Connect to something you care about\n` +
            `• **Change format:** Video instead of reading, project instead of exercises\n` +
            `• **Gamify it:** Set challenges, track streaks, compete\n` +
            `• **Remember why:** Reconnect with your motivation\n\n` +
            `Is this too easy, too hard, or just not engaging?`,

          'lack-of-time':
            `**Time is made, not found.**\n\n` +
            `**Strategies:**\n` +
            `• **Time audit:** Where is your time actually going?\n` +
            `• **Small pockets:** 15 minutes is real learning time\n` +
            `• **Habit stack:** Attach learning to existing habit\n` +
            `• **Eliminate:** What can you stop doing?\n` +
            `• **Protect time:** Schedule it like a meeting\n\n` +
            `Even 15 min/day = 91 hours/year. What could you learn in 91 hours?`,

          'imposter-syndrome':
            `**Imposter syndrome often hits the most capable learners.**\n\n` +
            `**Reframes:**\n` +
            `• Everyone started as a beginner\n` +
            `• Feeling like an imposter often means you're growing\n` +
            `• Competent people question themselves; incompetent people don't\n` +
            `• You don't have to know everything to contribute\n` +
            `• Compare yourself to your past self, not experts\n\n` +
            `What evidence contradicts your imposter thoughts?`,

          plateau:
            `**Plateaus are normal - they often precede breakthroughs.**\n\n` +
            `**Strategies:**\n` +
            `• **Deliberate practice:** Focus on weak spots, not comfortable skills\n` +
            `• **Get feedback:** You may not see your own blind spots\n` +
            `• **Change approach:** Try a completely different method\n` +
            `• **Take a break:** Sometimes stepping away helps\n` +
            `• **Increase difficulty:** You may have outgrown your current level\n\n` +
            `Plateaus are part of the journey. What specifically feels stuck?`,
        };

        response += advice[block];

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const learningTools: ToolDefinition[] = [
  // Goals
  setLearningGoalDef,
  trackLearningProgressDef,
  reflectOnLearningDef,
  // Study
  planStudySessionDef,
  scheduleSpacedRepetitionDef,
  testKnowledgeDef,
  // Resources
  recommendResourceDef,
  trackBooksReadDef,
  // Blocks
  overcomeLearningBlockDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'learning',
  learningTools
);

export default getToolDefinitions;
