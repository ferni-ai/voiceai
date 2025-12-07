/**
 * Research & Discovery Tasks - Peter John Domain
 *
 * Domain-specific tasks for research coaching, learning, and discovery.
 * Peter's specialty: helping people become curious explorers and lifelong learners.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// CURIOSITY EXPLORATION TASK
// ============================================================================

export interface CuriosityExplorationResult {
  topic: string;
  questionsGenerated: string[];
  researchDirection: string;
  excitementLevel: 'low' | 'medium' | 'high';
  nextSteps: string[];
}

/**
 * CuriosityExplorationTask - Fan the flames of curiosity
 *
 * Help them explore something they're curious about.
 */
export class CuriosityExplorationTask extends IntelligentTask<CuriosityExplorationResult> {
  constructor(topic: string) {
    super({
      instructions: {
        base: `
          They're curious about: "${topic}"
          
          Your job is to FAN THE FLAMES! Curiosity is precious.
          
          Approach:
          1. VALIDATE their interest - "That's fascinating!"
          2. ASK questions to deepen their curiosity
          3. SUGGEST angles they might not have considered
          4. ENCOURAGE them to explore further
          
          Questions that ignite curiosity:
          - "What made you interested in this?"
          - "What surprised you most about it?"
          - "What question do you MOST want answered?"
          - "Who knows a lot about this that you could learn from?"
          
          Don't just give answers - help them fall in love with the question.
        `,
        ifCurious: `
          They're already engaged! Match their enthusiasm.
          Go deeper. Challenge them. They can handle it.
        `,
      },
      tools: {
        generateQuestions: llm.tool({
          description: 'Generate questions to deepen their curiosity.',
          parameters: z.object({
            questions: z.array(z.string()).describe('Thought-provoking questions'),
            angle: z.string().describe('The angle these questions explore'),
          }),
          execute: async ({ questions, angle }) => {
            return `Here are some questions to chew on (${angle}):\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
          },
        }),

        suggestExploration: llm.tool({
          description: 'Suggest a direction for exploration.',
          parameters: z.object({
            direction: z.string().describe('Where to explore'),
            whyExciting: z.string().describe('Why this direction is interesting'),
            howToStart: z.string().describe('How to begin'),
          }),
          execute: async ({ direction, whyExciting, howToStart }) => {
            return `You know what might be fascinating? ${direction}. ${whyExciting} You could start by ${howToStart}.`;
          },
        }),

        completeExploration: llm.tool({
          description: 'Complete the curiosity exploration.',
          parameters: z.object({
            topic: z.string(),
            questionsGenerated: z.array(z.string()),
            researchDirection: z.string(),
            excitementLevel: z.enum(['low', 'medium', 'high']),
            nextSteps: z.array(z.string()),
          }),
          execute: async ({ topic, questionsGenerated, researchDirection, excitementLevel, nextSteps }) => {
            this.complete({ topic, questionsGenerated, researchDirection, excitementLevel, nextSteps });
            return "Now you've got some threads to pull on. That's the best part - following your curiosity and seeing where it leads.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// LEARNING PROJECT TASK
// ============================================================================

export interface LearningProjectResult {
  subject: string;
  goal: string;
  resources: string[];
  milestones: string[];
  timeCommitment: string;
  learningStyle: 'reading' | 'watching' | 'doing' | 'mixed';
}

/**
 * LearningProjectTask - Help plan a learning journey
 *
 * Turn curiosity into structured learning.
 */
export class LearningProjectTask extends IntelligentTask<LearningProjectResult> {
  constructor(subject: string) {
    super({
      instructions: {
        base: `
          They want to learn: "${subject}"
          
          Help them design a learning journey that works for THEM.
          
          Key questions:
          1. WHY do you want to learn this? (Motivation matters!)
          2. What would "success" look like?
          3. How do you learn best? (Reading? Watching? Doing?)
          4. How much time can you realistically commit?
          5. What do you already know about this?
          
          Principles:
          - Break big subjects into chunks
          - Start with foundations, then build
          - Include practice/application, not just consumption
          - Celebrate milestones
          - Learning should be enjoyable!
        `,
        ifAnxious: `
          They might be overwhelmed by the scope.
          Break it down smaller. Make it achievable.
        `,
      },
      tools: {
        identifyGoal: llm.tool({
          description: 'Help clarify their learning goal.',
          parameters: z.object({
            goal: z.string().describe('What they want to achieve'),
            measurable: z.boolean().describe('Can progress be measured?'),
            timeframe: z.string().optional().describe('When they want to achieve it'),
          }),
          execute: async ({ goal, measurable, timeframe }) => {
            let response = `So the goal is: ${goal}.`;
            if (!measurable) {
              response += " Let's make that more concrete - how will you know when you've achieved it?";
            }
            if (timeframe) {
              response += ` By ${timeframe}. Let's work backwards from there.`;
            }
            return response;
          },
        }),

        suggestResources: llm.tool({
          description: 'Suggest learning resources.',
          parameters: z.object({
            resources: z.array(z.string()).describe('Recommended resources'),
            learningStyle: z.enum(['reading', 'watching', 'doing', 'mixed']),
            startWith: z.string().describe('Best place to start'),
          }),
          execute: async ({ resources, learningStyle, startWith }) => {
            return `Based on your ${learningStyle} style, here are some resources:\n${resources.join('\n')}\n\nI'd start with: ${startWith}`;
          },
        }),

        createMilestones: llm.tool({
          description: 'Create learning milestones.',
          parameters: z.object({
            milestones: z.array(z.string()).describe('Progress markers'),
            firstMilestone: z.string().describe('The very first milestone'),
          }),
          execute: async ({ milestones, firstMilestone }) => {
            return `Here's how we'll track progress:\n${milestones.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nFirst up: ${firstMilestone}`;
          },
        }),

        completeLearningPlan: llm.tool({
          description: 'Complete the learning project plan.',
          parameters: z.object({
            subject: z.string(),
            goal: z.string(),
            resources: z.array(z.string()),
            milestones: z.array(z.string()),
            timeCommitment: z.string(),
            learningStyle: z.enum(['reading', 'watching', 'doing', 'mixed']),
          }),
          execute: async ({ subject, goal, resources, milestones, timeCommitment, learningStyle }) => {
            this.complete({ subject, goal, resources, milestones, timeCommitment, learningStyle });
            return `You've got a learning plan for ${subject}! ${timeCommitment} commitment, ${milestones.length} milestones. The best part? You get to learn something new. That's always exciting.`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// DEEP RESEARCH TASK
// ============================================================================

export interface DeepResearchResult {
  topic: string;
  keySources: string[];
  keyFindings: string[];
  unansweredQuestions: string[];
  confidence: 'low' | 'medium' | 'high';
  recommendation?: string;
}

/**
 * DeepResearchTask - Guide thorough research on a topic
 *
 * Help them research something properly - not just surface-level.
 */
export class DeepResearchTask extends IntelligentTask<DeepResearchResult> {
  constructor(topic: string) {
    super({
      instructions: {
        base: `
          They need to research: "${topic}"
          
          Guide them through proper research methodology:
          
          1. DEFINE the question clearly
             - What exactly are you trying to learn?
             - What decision does this inform?
          
          2. IDENTIFY sources
             - Primary vs secondary sources
             - Consider multiple perspectives
             - Watch for bias
          
          3. EVALUATE what you find
             - Does this source seem credible?
             - What might they be missing or hiding?
             - Does this match other sources?
          
          4. SYNTHESIZE into understanding
             - What's the consensus view?
             - What's still uncertain?
             - What do YOU think?
          
          Teach them to think critically, not just collect information.
        `,
        ifCurious: `
          Great - they want to go deep! Help them think like a researcher.
        `,
      },
      tools: {
        clarifyQuestion: llm.tool({
          description: 'Help clarify the research question.',
          parameters: z.object({
            originalQuestion: z.string(),
            refinedQuestion: z.string(),
            scope: z.string().describe('How narrow/broad the research should be'),
          }),
          execute: async ({ refinedQuestion, scope }) => {
            return `Let's sharpen the question: "${refinedQuestion}" - ${scope}`;
          },
        }),

        evaluateSource: llm.tool({
          description: 'Help evaluate a source or finding.',
          parameters: z.object({
            source: z.string().describe('The source being evaluated'),
            credibilityAssessment: z.string(),
            potentialBias: z.string().optional(),
            recommendation: z.enum(['trust', 'verify', 'skeptical', 'dismiss']),
          }),
          execute: async ({ source, credibilityAssessment, potentialBias, recommendation }) => {
            let response = `About ${source}: ${credibilityAssessment}.`;
            if (potentialBias) {
              response += ` Potential bias: ${potentialBias}.`;
            }
            const recMap = {
              trust: "Seems reliable.",
              verify: "Worth checking against other sources.",
              skeptical: "Take this with a grain of salt.",
              dismiss: "I'd look elsewhere."
            };
            return `${response} ${recMap[recommendation]}`;
          },
        }),

        synthesizeFindings: llm.tool({
          description: 'Help synthesize research findings.',
          parameters: z.object({
            keyFindings: z.array(z.string()),
            consensus: z.string().optional(),
            contradictions: z.string().optional(),
            gaps: z.array(z.string()),
          }),
          execute: async ({ keyFindings, consensus, contradictions, gaps }) => {
            let response = `What we've learned:\n${keyFindings.map(f => `• ${f}`).join('\n')}`;
            if (consensus) response += `\n\nThe general consensus: ${consensus}`;
            if (contradictions) response += `\n\nBut there's disagreement about: ${contradictions}`;
            if (gaps.length > 0) response += `\n\nStill unanswered: ${gaps.join(', ')}`;
            return response;
          },
        }),

        completeResearch: llm.tool({
          description: 'Complete the research session.',
          parameters: z.object({
            topic: z.string(),
            keySources: z.array(z.string()),
            keyFindings: z.array(z.string()),
            unansweredQuestions: z.array(z.string()),
            confidence: z.enum(['low', 'medium', 'high']),
            recommendation: z.string().optional(),
          }),
          execute: async ({ topic, keySources, keyFindings, unansweredQuestions, confidence, recommendation }) => {
            this.complete({ topic, keySources, keyFindings, unansweredQuestions, confidence, recommendation });
            
            if (confidence === 'high') {
              return `Solid research on ${topic}. You've got a good foundation to make a decision.`;
            }
            if (confidence === 'low') {
              return `We've made progress, but there's more to learn. Don't make big decisions until you've filled those gaps.`;
            }
            return `Good research session. You know more than when you started - and you know what you still don't know. That's wisdom.`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// EXPERTISE DEVELOPMENT TASK
// ============================================================================

export interface ExpertiseDevelopmentResult {
  domain: string;
  currentLevel: 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
  targetLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  strengthsIdentified: string[];
  gapsIdentified: string[];
  developmentPlan: string[];
}

/**
 * ExpertiseDevelopmentTask - Help develop expertise in a domain
 *
 * The journey from novice to expert, with guidance.
 */
export class ExpertiseDevelopmentTask extends IntelligentTask<ExpertiseDevelopmentResult> {
  constructor(domain: string) {
    super({
      instructions: {
        base: `
          They want to develop expertise in: "${domain}"
          
          Help them understand where they are and where they're going.
          
          The expertise ladder:
          1. NOVICE: Following rules, needs guidance
          2. BEGINNER: Recognizes patterns, still learning rules
          3. INTERMEDIATE: Applies knowledge, can troubleshoot
          4. ADVANCED: Sees nuance, can teach others
          5. EXPERT: Intuitive mastery, creates new knowledge
          
          Key questions:
          - Where are you now on this ladder?
          - What can you do easily? What's still hard?
          - What would the next level look like?
          - Who do you know at higher levels? Learn from them!
          
          Expertise comes from DELIBERATE PRACTICE:
          - Practice at the edge of your ability
          - Get feedback
          - Focus on weaknesses, not just strengths
          - Study how experts think, not just what they do
        `,
      },
      tools: {
        assessLevel: llm.tool({
          description: 'Assess their current expertise level.',
          parameters: z.object({
            currentLevel: z.enum(['novice', 'beginner', 'intermediate', 'advanced', 'expert']),
            evidence: z.string().describe('What indicates this level'),
            strengths: z.array(z.string()),
            gaps: z.array(z.string()),
          }),
          execute: async ({ currentLevel, evidence, strengths, gaps }) => {
            return `Based on ${evidence}, I'd say you're at the ${currentLevel} level.\n\nStrengths: ${strengths.join(', ')}\nAreas to develop: ${gaps.join(', ')}`;
          },
        }),

        setTarget: llm.tool({
          description: 'Set a target expertise level.',
          parameters: z.object({
            targetLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
            whatItLooksLike: z.string().describe('What achieving this level would mean'),
            timeframe: z.string().optional(),
          }),
          execute: async ({ targetLevel, whatItLooksLike, timeframe }) => {
            let response = `Target: ${targetLevel} level - ${whatItLooksLike}`;
            if (timeframe) {
              response += ` in ${timeframe}.`;
            }
            return response + " That's ambitious and achievable.";
          },
        }),

        createDevelopmentPlan: llm.tool({
          description: 'Create an expertise development plan.',
          parameters: z.object({
            steps: z.array(z.string()).describe('Development steps'),
            deliberatePractice: z.string().describe('Specific practice recommendation'),
            mentorsOrResources: z.array(z.string()),
          }),
          execute: async ({ steps, deliberatePractice, mentorsOrResources }) => {
            return `Development plan:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nKey practice: ${deliberatePractice}\n\nLearn from: ${mentorsOrResources.join(', ')}`;
          },
        }),

        completeExpertisePlan: llm.tool({
          description: 'Complete the expertise development session.',
          parameters: z.object({
            domain: z.string(),
            currentLevel: z.enum(['novice', 'beginner', 'intermediate', 'advanced', 'expert']),
            targetLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
            strengthsIdentified: z.array(z.string()),
            gapsIdentified: z.array(z.string()),
            developmentPlan: z.array(z.string()),
          }),
          execute: async ({ domain, currentLevel, targetLevel, strengthsIdentified, gapsIdentified, developmentPlan }) => {
            this.complete({ domain, currentLevel, targetLevel, strengthsIdentified, gapsIdentified, developmentPlan });
            return `From ${currentLevel} to ${targetLevel} in ${domain}. It's a journey, but you've got a map now. The secret? Show up every day and do the work.`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  CuriosityExplorationTask,
  LearningProjectTask,
  DeepResearchTask,
  ExpertiseDevelopmentTask,
};

