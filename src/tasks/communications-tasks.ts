/**
 * Communications Tasks - Alex Chen Domain
 *
 * Domain-specific tasks for communication coaching, scheduling, and organization.
 * Alex's specialty: helping people communicate clearly and manage their time.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// DIFFICULT CONVERSATION PREP TASK
// ============================================================================

export interface DifficultConversationResult {
  topic: string;
  recipient: string;
  keyPoints: string[];
  anticipatedResponse: string;
  openingLine: string;
  backupApproaches: string[];
  confidence: 'low' | 'medium' | 'high';
}

/**
 * DifficultConversationTask - Prepare for a tough conversation
 *
 * Help them plan what to say when the stakes are high.
 */
export class DifficultConversationTask extends IntelligentTask<DifficultConversationResult> {
  constructor(topic: string, recipient: string) {
    super({
      instructions: {
        base: `
          They need to have a difficult conversation about: "${topic}" with "${recipient}"
          
          Help them prepare thoughtfully:
          
          1. CLARIFY the goal
             - What do you want to achieve?
             - What does success look like?
             - What's the minimum acceptable outcome?
          
          2. UNDERSTAND the other side
             - What might they be feeling?
             - What are their concerns?
             - What do they need to hear?
          
          3. PLAN the approach
             - How will you open?
             - What's the key message?
             - What if they get defensive?
          
          4. PRACTICE
             - Say it out loud
             - Role play if helpful
          
          Key principles:
          - Lead with empathy, not accusation
          - Use "I" statements, not "you" statements
          - Stay curious, not defensive
          - Know your bottom line
        `,
        ifAnxious: `
          They're nervous about this. Validate that difficult conversations are hard.
          Focus on what they can control: their words, their tone, their intent.
        `,
      },
      tools: {
        clarifyGoal: llm.tool({
          description: 'Clarify the conversation goal.',
          parameters: z.object({
            primaryGoal: z.string().describe('What they most want to achieve'),
            secondaryGoal: z.string().optional().describe('Nice-to-have outcome'),
            minimumAcceptable: z.string().describe('The least acceptable outcome'),
          }),
          execute: async ({ primaryGoal, secondaryGoal, minimumAcceptable }) => {
            let response = `Primary goal: ${primaryGoal}.`;
            if (secondaryGoal) response += ` Bonus if: ${secondaryGoal}.`;
            response += ` Bottom line: ${minimumAcceptable}.`;
            return `${response} Good - knowing your goals keeps you focused.`;
          },
        }),

        anticipateResponse: llm.tool({
          description: 'Anticipate how the other person might respond.',
          parameters: z.object({
            likelyResponse: z.string().describe('How they might initially react'),
            theirConcerns: z.array(z.string()).describe('What they might be worried about'),
            theirNeeds: z.string().describe('What they need from this conversation'),
          }),
          execute: async ({ likelyResponse, theirConcerns, theirNeeds }) => {
            return `They might respond by: ${likelyResponse}\n\nTheir concerns are probably: ${theirConcerns.join(', ')}\n\nWhat they need: ${theirNeeds}\n\nIf you address their needs, they'll hear you better.`;
          },
        }),

        craftOpening: llm.tool({
          description: 'Help craft an opening line.',
          parameters: z.object({
            opening: z.string().describe('The opening line'),
            tone: z.string().describe('The intended tone'),
            alternatives: z.array(z.string()).describe('Alternative openings'),
          }),
          execute: async ({ opening, tone, alternatives }) => {
            return `Opening: "${opening}" (${tone} tone)\n\nAlternatives:\n${alternatives.map((a, i) => `${i + 1}. "${a}"`).join('\n')}\n\nPick what feels most natural to you.`;
          },
        }),

        planBackup: llm.tool({
          description: 'Plan backup approaches if it goes sideways.',
          parameters: z.object({
            ifDefensive: z.string().describe('What to say if they get defensive'),
            ifEmotional: z.string().describe('What to say if emotions run high'),
            exitStrategy: z.string().describe('How to pause if needed'),
          }),
          execute: async ({ ifDefensive, ifEmotional, exitStrategy }) => {
            return `If they get defensive: "${ifDefensive}"\n\nIf emotions run high: "${ifEmotional}"\n\nIf you need to pause: "${exitStrategy}"`;
          },
        }),

        completePrep: llm.tool({
          description: 'Complete the conversation prep.',
          parameters: z.object({
            topic: z.string(),
            recipient: z.string(),
            keyPoints: z.array(z.string()),
            anticipatedResponse: z.string(),
            openingLine: z.string(),
            backupApproaches: z.array(z.string()),
            confidence: z.enum(['low', 'medium', 'high']),
          }),
          execute: async ({
            topic,
            recipient,
            keyPoints,
            anticipatedResponse,
            openingLine,
            backupApproaches,
            confidence,
          }) => {
            this.complete({
              topic,
              recipient,
              keyPoints,
              anticipatedResponse,
              openingLine,
              backupApproaches,
              confidence,
            });

            if (confidence === 'low') {
              return "You're as ready as you can be. Remember: the goal is progress, not perfection. You can always pause and continue later.";
            }
            return "You're prepared. Trust yourself. Whatever happens, you're having this conversation for good reasons.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// MESSAGE CRAFTING TASK
// ============================================================================

export interface MessageCraftingResult {
  messageType: 'email' | 'text' | 'chat' | 'letter';
  recipient: string;
  purpose: string;
  draftMessage: string;
  tone: string;
  revised: boolean;
}

/**
 * MessageCraftingTask - Help write an important message
 *
 * For when the words really matter.
 */
export class MessageCraftingTask extends IntelligentTask<MessageCraftingResult> {
  constructor(purpose: string) {
    super({
      instructions: {
        base: `
          They need help writing a message: "${purpose}"
          
          Help them craft it thoughtfully:
          
          1. WHO is this for? What do they need to hear?
          2. WHAT's the one thing you want them to take away?
          3. HOW should it feel when they read it?
          
          Writing principles:
          - Clear > clever
          - Short > long (usually)
          - Specific > vague
          - Human > formal (usually)
          
          Questions to ask:
          - "What's the main point?"
          - "What tone are you going for?"
          - "What do you want them to do after reading?"
          - "How would you say this in person?"
        `,
      },
      tools: {
        gatherContext: llm.tool({
          description: 'Gather context for the message.',
          parameters: z.object({
            messageType: z.enum(['email', 'text', 'chat', 'letter']),
            recipient: z.string(),
            relationship: z.string().describe('Their relationship to the recipient'),
            purpose: z.string(),
            desiredTone: z.string(),
            desiredAction: z.string().optional().describe('What you want them to do'),
          }),
          execute: async ({
            messageType,
            recipient,
            relationship,
            purpose,
            desiredTone,
            desiredAction,
          }) => {
            let response = `${messageType} to ${recipient} (${relationship}). Purpose: ${purpose}. Tone: ${desiredTone}.`;
            if (desiredAction) response += ` You want them to: ${desiredAction}.`;
            return response;
          },
        }),

        draftMessage: llm.tool({
          description: 'Help draft the message.',
          parameters: z.object({
            draft: z.string().describe('The drafted message'),
            keyElements: z.array(z.string()).describe('Key elements included'),
          }),
          execute: async ({ draft, keyElements }) => {
            return `Here's a draft:\n\n---\n${draft}\n---\n\nKey elements: ${keyElements.join(', ')}`;
          },
        }),

        refineMessage: llm.tool({
          description: 'Refine the message based on feedback.',
          parameters: z.object({
            revisedDraft: z.string(),
            changesExplained: z.string(),
          }),
          execute: async ({ revisedDraft, changesExplained }) => {
            return `Revised:\n\n---\n${revisedDraft}\n---\n\nChanges: ${changesExplained}`;
          },
        }),

        completeMessage: llm.tool({
          description: 'Complete the message crafting.',
          parameters: z.object({
            messageType: z.enum(['email', 'text', 'chat', 'letter']),
            recipient: z.string(),
            purpose: z.string(),
            draftMessage: z.string(),
            tone: z.string(),
            revised: z.boolean(),
          }),
          execute: async ({ messageType, recipient, purpose, draftMessage, tone, revised }) => {
            this.complete({ messageType, recipient, purpose, draftMessage, tone, revised });
            return 'Your message is ready. Read it one more time before sending - out loud if you can. That catches a lot.';
          },
        }),
      },
    });
  }
}

// ============================================================================
// BOUNDARY SETTING TASK
// ============================================================================

export interface BoundarySettingResult {
  boundary: string;
  person: string;
  reason: string;
  scriptPrepared: string;
  anticipatedPushback: string;
  response: string;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * BoundarySettingTask - Help set a boundary with someone
 *
 * Boundaries are hard. Help them do it with clarity and kindness.
 */
export class BoundarySettingTask extends IntelligentTask<BoundarySettingResult> {
  constructor(boundary: string) {
    super({
      instructions: {
        base: `
          They need to set a boundary: "${boundary}"
          
          Boundaries are acts of self-respect AND respect for others.
          
          Help them:
          1. CLARIFY the boundary - What specifically needs to change?
          2. UNDERSTAND why - What happens when this boundary is crossed?
          3. SCRIPT it - What exactly will you say?
          4. ANTICIPATE pushback - How might they react?
          5. PREPARE responses - What will you say to pushback?
          
          Boundary-setting principles:
          - Be clear, not mean
          - State the boundary, not an accusation
          - You can explain, but you don't owe justification
          - Their reaction is their responsibility
          
          Scripts that work:
          - "I need..."
          - "I'm not able to..."
          - "Going forward, I..."
          - "When X happens, I feel Y, so I need Z"
        `,
        ifAnxious: `
          Setting boundaries is scary. Validate their fear.
          Remind them: a boundary isn't mean, it's honest.
        `,
      },
      tools: {
        clarifyBoundary: llm.tool({
          description: 'Clarify exactly what the boundary is.',
          parameters: z.object({
            specificBoundary: z.string().describe('The specific behavior/situation'),
            person: z.string().describe('Who this is with'),
            why: z.string().describe('Why this matters'),
            whatHappensWithout: z.string().describe('Impact when boundary is crossed'),
          }),
          execute: async ({ specificBoundary, person, why, whatHappensWithout }) => {
            return `The boundary: ${specificBoundary} with ${person}.\n\nWhy it matters: ${why}\n\nWhen it's crossed: ${whatHappensWithout}\n\nThis is valid. You're allowed to need this.`;
          },
        }),

        createScript: llm.tool({
          description: 'Create a script for setting the boundary.',
          parameters: z.object({
            script: z.string().describe('What to say'),
            tone: z.string().describe('The tone to use'),
            alternatives: z.array(z.string()).describe('Alternative phrasings'),
          }),
          execute: async ({ script, tone, alternatives }) => {
            return `Script (${tone} tone): "${script}"\n\nOther ways to say it:\n${alternatives.map((a, i) => `${i + 1}. "${a}"`).join('\n')}`;
          },
        }),

        handlePushback: llm.tool({
          description: 'Prepare for pushback.',
          parameters: z.object({
            anticipatedPushback: z.string().describe('How they might push back'),
            response: z.string().describe('How to respond'),
            ifEscalates: z.string().describe('What to do if it escalates'),
          }),
          execute: async ({ anticipatedPushback, response, ifEscalates }) => {
            return `They might say: "${anticipatedPushback}"\n\nYou can respond: "${response}"\n\nIf it escalates: ${ifEscalates}`;
          },
        }),

        completeBoundary: llm.tool({
          description: 'Complete the boundary-setting prep.',
          parameters: z.object({
            boundary: z.string(),
            person: z.string(),
            reason: z.string(),
            scriptPrepared: z.string(),
            anticipatedPushback: z.string(),
            response: z.string(),
            confidence: z.enum(['low', 'medium', 'high']),
          }),
          execute: async ({
            boundary,
            person,
            reason,
            scriptPrepared,
            anticipatedPushback,
            response,
            confidence,
          }) => {
            this.complete({
              boundary,
              person,
              reason,
              scriptPrepared,
              anticipatedPushback,
              response,
              confidence,
            });
            return "You're ready. Remember: setting a boundary might feel uncomfortable, but so does not having one. Choose your discomfort.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// SCHEDULING/PLANNING TASK
// ============================================================================

export interface SchedulingResult {
  eventType: string;
  participants: string[];
  constraints: string[];
  proposedTimes: string[];
  communicationSent: boolean;
  confirmed: boolean;
}

/**
 * SchedulingTask - Help coordinate schedules
 *
 * Make the logistics easier.
 */
export class SchedulingTask extends IntelligentTask<SchedulingResult> {
  constructor(eventType: string) {
    super({
      instructions: {
        base: `
          They need to schedule: "${eventType}"
          
          Help with the logistics:
          
          1. WHO needs to be there?
          2. WHEN works for everyone? (or most people)
          3. WHERE? (if applicable)
          4. HOW will you communicate/confirm?
          
          Scheduling tips:
          - Give options, not open-ended questions
          - The fewer back-and-forths, the better
          - Confirm in writing
          - Include all relevant details in one message
          
          Help them write the scheduling message too if needed.
        `,
      },
      tools: {
        gatherConstraints: llm.tool({
          description: 'Gather scheduling constraints.',
          parameters: z.object({
            participants: z.array(z.string()).describe('Who needs to attend'),
            constraints: z.array(z.string()).describe('Known scheduling constraints'),
            duration: z.string().describe('How long it needs to be'),
            format: z.string().describe('In person, virtual, phone, etc.'),
          }),
          execute: async ({ participants, constraints, duration, format }) => {
            return `${format} meeting for ${duration} with ${participants.join(', ')}.\n\nConstraints: ${constraints.join('; ')}`;
          },
        }),

        proposeTimes: llm.tool({
          description: 'Help propose meeting times.',
          parameters: z.object({
            proposedTimes: z.array(z.string()).describe('Time options to propose'),
            rationale: z.string().describe('Why these times'),
          }),
          execute: async ({ proposedTimes, rationale }) => {
            return `Proposed times:\n${proposedTimes.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n${rationale}`;
          },
        }),

        draftInvite: llm.tool({
          description: 'Draft the scheduling message/invite.',
          parameters: z.object({
            message: z.string().describe('The scheduling message'),
            includesAllDetails: z.boolean(),
          }),
          execute: async ({ message, includesAllDetails }) => {
            let response = `Draft invite:\n\n---\n${message}\n---`;
            if (!includesAllDetails) {
              response +=
                '\n\nMake sure to add: time, location/link, duration, and any prep needed.';
            }
            return response;
          },
        }),

        completeScheduling: llm.tool({
          description: 'Complete the scheduling task.',
          parameters: z.object({
            eventType: z.string(),
            participants: z.array(z.string()),
            constraints: z.array(z.string()),
            proposedTimes: z.array(z.string()),
            communicationSent: z.boolean(),
            confirmed: z.boolean(),
          }),
          execute: async ({
            eventType,
            participants,
            constraints,
            proposedTimes,
            communicationSent,
            confirmed,
          }) => {
            this.complete({
              eventType,
              participants,
              constraints,
              proposedTimes,
              communicationSent,
              confirmed,
            });

            if (confirmed) {
              return "It's on the calendar! Don't forget to send a reminder closer to the date.";
            }
            if (communicationSent) {
              return "Invite sent! Now we wait. Follow up if you don't hear back in a day or two.";
            }
            return "You've got a plan. Time to send it out!";
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
  DifficultConversationTask,
  MessageCraftingTask,
  BoundarySettingTask,
  SchedulingTask,
};
