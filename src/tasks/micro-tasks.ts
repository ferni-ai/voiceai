/**
 * Micro-Tasks - Quick, Natural Conversational Moments
 *
 * These are NOT procedural tasks - they're human responses.
 * They complete in seconds, feel natural, and don't announce themselves.
 *
 * Use when:
 * - Quick acknowledgment needed
 * - Brief celebration moment
 * - Validating feelings before moving on
 * - Following curiosity with ONE question
 * - Showing active listening
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// QUICK ACKNOWLEDGE TASK
// ============================================================================

export interface AcknowledgeResult {
  acknowledged: boolean;
  whatWasAcknowledged: string;
}

/**
 * QuickAcknowledgeTask - Just say "I hear you"
 *
 * Sometimes people don't need advice. They need to be heard.
 * This task acknowledges without fixing, advising, or moving on too fast.
 */
export class QuickAcknowledgeTask extends IntelligentTask<AcknowledgeResult> {
  constructor(whatToAcknowledge?: string) {
    super({
      instructions: {
        base: `
          Simply ACKNOWLEDGE what they said. Nothing more.
          
          ${whatToAcknowledge ? `They shared: "${whatToAcknowledge}"` : ''}
          
          Good acknowledgments:
          - "I hear you."
          - "That's a lot to carry."
          - "Thank you for sharing that with me."
          - "That makes sense."
          - "I understand."
          
          DO NOT:
          - Offer advice
          - Try to fix it
          - Change the subject
          - Add "but..."
          - Minimize their experience
          
          Just be present. Let silence be okay.
        `,
        ifDistressed: `
          Extra gentle. Extra brief.
          "I'm here." is enough.
        `,
      },
      tools: {
        acknowledge: llm.tool({
          description: 'Acknowledge what they shared.',
          parameters: z.object({
            acknowledgment: z.string().describe('Your brief acknowledgment'),
            whatWasAcknowledged: z.string().describe('What you acknowledged'),
          }),
          execute: async ({ acknowledgment, whatWasAcknowledged }) => {
            this.complete({ acknowledged: true, whatWasAcknowledged });
            return acknowledgment;
          },
        }),
      },
    });
  }
}

// ============================================================================
// QUICK CELEBRATE TASK
// ============================================================================

export interface QuickCelebrateResult {
  celebrated: boolean;
  achievement: string;
  energyMatched: boolean;
}

/**
 * QuickCelebrateTask - Brief moment of joy
 *
 * When they share good news, CELEBRATE with them!
 * Don't downplay it. Don't immediately move to "but what about..."
 */
export class QuickCelebrateTask extends IntelligentTask<QuickCelebrateResult> {
  constructor(achievement?: string) {
    super({
      instructions: {
        base: `
          They shared good news! CELEBRATE IT.
          
          ${achievement ? `Achievement: "${achievement}"` : ''}
          
          Jack's celebration style:
          - Genuine enthusiasm (not fake cheerleader)
          - Brief - don't overdo it
          - Connect to their effort, not just luck
          - Let them enjoy the moment
          
          Examples:
          - "Oh! That's wonderful!"
          - "Well done. You should be proud."
          - "That's the kind of progress that compounds!"
          - "I love hearing that."
          
          Then let them bask for a beat before continuing.
        `,
      },
      tools: {
        celebrate: llm.tool({
          description: 'Celebrate their achievement briefly.',
          parameters: z.object({
            celebration: z.string().describe('Your brief celebration'),
            achievement: z.string().describe("What you're celebrating"),
          }),
          execute: async ({ celebration, achievement }) => {
            this.complete({ celebrated: true, achievement, energyMatched: true });
            return celebration;
          },
        }),
      },
    });
  }
}

// ============================================================================
// QUICK VALIDATE TASK
// ============================================================================

export interface ValidateResult {
  validated: boolean;
  feeling: string;
  feltHeard: boolean;
}

/**
 * QuickValidateTask - "That makes sense"
 *
 * Validation before advice. Always.
 * People need to feel their feelings are reasonable before they can hear solutions.
 */
export class QuickValidateTask extends IntelligentTask<ValidateResult> {
  constructor(feeling?: string) {
    super({
      instructions: {
        base: `
          VALIDATE their feeling before anything else.
          
          ${feeling ? `They're feeling: "${feeling}"` : ''}
          
          Validation phrases:
          - "That makes complete sense."
          - "Anyone would feel that way."
          - "Of course you're worried about that."
          - "That's a very human response."
          - "I'd feel the same way."
          
          DO NOT:
          - Say "but..." after validating
          - Jump to solutions
          - Minimize ("it's not that bad")
          - Compare ("others have it worse")
          
          Validation is NOT agreement. It's acknowledgment that their 
          feeling is understandable given their situation.
        `,
        ifDistressed: `
          Extra validation. Repeat it if needed.
          "Of course. Of course you feel that way."
        `,
        ifAnxious: `
          Normalize the anxiety:
          "That's such a common feeling. You're not alone in this."
        `,
      },
      tools: {
        validate: llm.tool({
          description: 'Validate their feeling.',
          parameters: z.object({
            validation: z.string().describe('Your validation statement'),
            feeling: z.string().describe('The feeling you validated'),
          }),
          execute: async ({ validation, feeling }) => {
            this.complete({ validated: true, feeling, feltHeard: true });
            return validation;
          },
        }),
      },
    });
  }
}

// ============================================================================
// QUICK CURIOSITY TASK
// ============================================================================

export interface CuriosityResult {
  questionAsked: string;
  topicExplored: string;
  connectionDeepened: boolean;
}

/**
 * QuickCuriosityTask - Ask ONE follow-up question
 *
 * When they mention something interesting, be curious!
 * Don't interrogate - just show genuine interest.
 */
export class QuickCuriosityTask extends IntelligentTask<CuriosityResult> {
  constructor(topic?: string) {
    super({
      instructions: {
        base: `
          They mentioned something interesting. Be CURIOUS.
          
          ${topic ? `Topic: "${topic}"` : ''}
          
          Good follow-up questions:
          - "Tell me more about that."
          - "How did that come about?"
          - "What made you think of that?"
          - "How do you feel about it?"
          - "What's that like for you?"
          
          Rules:
          - ONE question only
          - Open-ended (not yes/no)
          - Genuine curiosity, not interrogation
          - Let their answer guide the next move
          
          This is how relationships deepen - showing real interest.
        `,
      },
      tools: {
        askFollowUp: llm.tool({
          description: 'Ask one curious follow-up question.',
          parameters: z.object({
            question: z.string().describe('Your follow-up question'),
            topicExplored: z.string().describe('What topic this explores'),
          }),
          execute: async ({ question, topicExplored }) => {
            this.complete({ questionAsked: question, topicExplored, connectionDeepened: true });
            return question;
          },
        }),
      },
    });
  }
}

// ============================================================================
// ACTIVE LISTENING TASK
// ============================================================================

export interface ListeningResult {
  reflectedBack: string;
  userFeltHeard: boolean;
}

/**
 * ActiveListeningTask - Reflect back what you heard
 *
 * Powerful technique: paraphrase what they said to show you listened.
 * "So what you're saying is..." or "It sounds like..."
 */
export class ActiveListeningTask extends IntelligentTask<ListeningResult> {
  constructor() {
    super({
      instructions: {
        base: `
          Reflect back what they just said. Show you LISTENED.
          
          Active listening phrases:
          - "So what I'm hearing is..."
          - "It sounds like..."
          - "Let me make sure I understand..."
          - "If I'm following you..."
          - "So in other words..."
          
          Then WAIT for them to confirm or correct.
          
          This:
          1. Shows you're paying attention
          2. Lets them clarify if needed
          3. Makes them feel truly heard
          4. Slows down the conversation (good!)
        `,
      },
      tools: {
        reflectBack: llm.tool({
          description: 'Reflect back what you heard.',
          parameters: z.object({
            reflection: z.string().describe('Your reflection of what they said'),
          }),
          execute: async ({ reflection }) => {
            return `${reflection} Is that right?`;
          },
        }),

        confirmUnderstanding: llm.tool({
          description: 'Complete the listening task.',
          parameters: z.object({
            reflectedBack: z.string().describe('What you reflected'),
            userConfirmed: z.boolean().describe('Whether they confirmed your understanding'),
          }),
          execute: async ({ reflectedBack, userConfirmed }) => {
            this.complete({ reflectedBack, userFeltHeard: userConfirmed });
            return userConfirmed ? 'Good. Go on.' : 'Ah, help me understand better then.';
          },
        }),
      },
    });
  }
}

// ============================================================================
// PAUSE TASK
// ============================================================================

export interface PauseResult {
  pauseTaken: boolean;
  reason: string;
}

/**
 * PauseTask - Just... pause.
 *
 * Sometimes the most human thing is to NOT fill the silence.
 * Let them think. Let the moment breathe.
 */
export class PauseTask extends IntelligentTask<PauseResult> {
  constructor(reason?: string) {
    super({
      instructions: {
        base: `
          Take a deliberate pause. Don't rush to fill silence.
          
          ${reason ? `Reason: "${reason}"` : ''}
          
          Pause phrases:
          - "Hmm..." [let it hang]
          - "Let me think about that..."
          - "..." [actual silence]
          - "That's a lot to sit with."
          - "Take your time."
          
          Silence is powerful. Use it.
        `,
      },
      tools: {
        pause: llm.tool({
          description: 'Take a meaningful pause.',
          parameters: z.object({
            pausePhrase: z.string().describe('What to say (or "..." for silence)'),
            reason: z.string().describe("Why you're pausing"),
          }),
          execute: async ({ pausePhrase, reason }) => {
            this.complete({ pauseTaken: true, reason });
            return pausePhrase === '...' ? '<break time="1000ms"/>' : pausePhrase;
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
  QuickAcknowledgeTask,
  QuickCelebrateTask,
  QuickValidateTask,
  QuickCuriosityTask,
  ActiveListeningTask,
  PauseTask,
};
