/**
 * Agent Handoff Tools
 * 
 * Allows Jack Bogle to hand off to Peter Lynch (and vice versa)
 * for topics outside their expertise or philosophy.
 * 
 * This creates a fun dynamic between the two legendary investors!
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import { 
  JACK_TO_PETER_HANDOFF, 
  PETER_TO_JACK_HANDOFF,
  PETER_LYNCH_GREETING,
  PETER_LYNCH_TAKEOVER_LINES,
  PETER_LYNCH_VOICE_ID,
  JACK_BOGLE_VOICE_ID,
} from '../agents/peter-lynch.js';
import { EventEmitter } from 'events';

// Global event emitter for agent handoff events
export const handoffEvents = new EventEmitter();

const getLogger = () => log();

// Track current active agent
let currentAgent: 'jack' | 'peter' = 'jack';

/**
 * Get a random handoff phrase
 */
function getRandomPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get the current active agent
 */
export function getCurrentAgent(): 'jack' | 'peter' {
  return currentAgent;
}

/**
 * Set the current active agent
 */
export function setCurrentAgent(agent: 'jack' | 'peter'): void {
  currentAgent = agent;
  getLogger().info({ agent }, 'Active agent changed');
}

// ============================================================================
// HANDOFF DETECTION
// ============================================================================

/**
 * Detect if user input suggests they want to talk to Peter Lynch
 */
export function shouldHandoffToPeter(userInput: string): boolean {
  const lowerInput = userInput.toLowerCase();
  
  const peterTriggers = [
    'pick stocks',
    'stock picking',
    'individual stocks',
    'which stock',
    'what stock should',
    'ten bagger',
    'tenbagger',
    '10 bagger',
    'find stocks',
    'growth stocks',
    'undervalued',
    'beat the market',
    'outperform',
    'active investing',
    'stock tips',
    'hot stock',
    'next amazon',
    'next apple',
    'next google',
    'peter lynch',
    'talk to peter',
    'get peter',
  ];
  
  return peterTriggers.some(trigger => lowerInput.includes(trigger));
}

/**
 * Detect if user input suggests they want to talk to Jack Bogle
 */
export function shouldHandoffToJack(userInput: string): boolean {
  const lowerInput = userInput.toLowerCase();
  
  const jackTriggers = [
    'index fund',
    'passive invest',
    'low cost',
    'expense ratio',
    'stay the course',
    'long term',
    'buy and hold',
    'diversif',
    'vanguard',
    'total market',
    'jack bogle',
    'talk to jack',
    'get jack',
    'boring invest',
  ];
  
  return jackTriggers.some(trigger => lowerInput.includes(trigger));
}

// ============================================================================
// HANDOFF RESPONSES
// ============================================================================

/**
 * Generate Jack's handoff message to Peter
 */
export function getJackToPeterHandoff(): string {
  return getRandomPhrase(JACK_TO_PETER_HANDOFF);
}

/**
 * Generate Peter's handoff message to Jack
 */
export function getPeterToJackHandoff(): string {
  return getRandomPhrase(PETER_TO_JACK_HANDOFF);
}

/**
 * Generate Peter's dramatic takeover line
 */
export function getPeterTakeover(): string {
  return getRandomPhrase(PETER_LYNCH_TAKEOVER_LINES);
}

/**
 * Generate Peter's greeting after handoff
 */
export function getPeterGreeting(): string {
  return PETER_LYNCH_GREETING;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createHandoffTools() {
  return {
    handoffToPeter: llm.tool({
      description: `Hand off the conversation to Peter Lynch when the user wants to discuss:
- Picking individual stocks
- Finding "ten-baggers" (stocks that go up 10x)
- Active investing strategies
- Specific stock recommendations
- Growth investing
- Beating the market

Use this when someone asks about stock picking - Jack should graciously (if reluctantly) hand off to Peter.`,
      parameters: z.object({
        reason: z.string().describe('Why Jack is handing off (e.g., "user wants stock tips")'),
      }),
      execute: async ({ reason }, { ctx }) => {
        getLogger().info({ reason, from: 'jack', to: 'peter' }, '=== AGENT HANDOFF ===');
        setCurrentAgent('peter');
        
        const handoffPhrase = getJackToPeterHandoff();
        const peterTakeover = getPeterTakeover(); // Peter's dramatic entrance!
        
        console.log(`\n🔄 [HANDOFF] Jack → Peter: "${reason}"`);
        console.log(`🎭 Peter's entrance: "${peterTakeover.replace(/<[^>]*>/g, '').slice(0, 60)}..."`);
        
        // Capture preference for active investing discussion
        const userData = ctx?.userData as { services?: { captureInsight?: (type: string, key: string, value: unknown, confidence: number) => void } } | undefined;
        if (userData?.services?.captureInsight) {
          userData.services.captureInsight('topic_interest', 'stock_picking', {
            reason,
            askedForPeter: true,
          }, 0.7);
        }
        
        // Emit event for voice switch
        handoffEvents.emit('voiceSwitch', {
          newAgent: 'peter',
          voiceId: PETER_LYNCH_VOICE_ID,
          greeting: peterTakeover,
        });
        
        return {
          handoffMessage: handoffPhrase,
          newAgentGreeting: peterTakeover,
          newAgent: 'peter',
          voiceId: PETER_LYNCH_VOICE_ID,
          instructions: `You are now Peter Lynch. First, interrupt Jack with something like: "${peterTakeover.replace(/<[^>]*>/g, '')}" Then respond with enthusiasm about stock picking!`,
        };
      },
    }),

    handoffToJack: llm.tool({
      description: `Hand off the conversation back to Jack Bogle when the user wants to discuss:
- Index funds and passive investing
- Low-cost investing
- Long-term buy-and-hold strategy
- Expense ratios
- Diversification
- "Stay the course" philosophy

Use this when someone asks about index funds or passive investing while talking to Peter.`,
      parameters: z.object({
        reason: z.string().describe('Why Peter is handing off (e.g., "user wants index fund advice")'),
      }),
      execute: async ({ reason }) => {
        getLogger().info({ reason, from: 'peter', to: 'jack' }, '=== AGENT HANDOFF ===');
        setCurrentAgent('jack');
        
        const handoffPhrase = getPeterToJackHandoff();
        
        console.log(`\n🔄 [HANDOFF] Peter → Jack: "${reason}"`);
        
        // Emit event for voice switch
        handoffEvents.emit('voiceSwitch', {
          newAgent: 'jack',
          voiceId: JACK_BOGLE_VOICE_ID,
        });
        
        return {
          handoffMessage: handoffPhrase,
          newAgent: 'jack',
          voiceId: JACK_BOGLE_VOICE_ID,
          instructions: 'You are now Jack Bogle. Respond with your usual wisdom about staying the course!',
        };
      },
    }),
  };
}

// ============================================================================
// CONTEXT INJECTION FOR HANDOFF
// ============================================================================

/**
 * Get additional context based on current agent
 */
export function getAgentContext(): string {
  if (currentAgent === 'peter') {
    return `
IMPORTANT: You are currently Peter Lynch, not Jack Bogle.
- Be enthusiastic about stock picking
- Use phrases like "ten-bagger" and "invest in what you know"
- Tell stories about finding great stocks in everyday life
- If the user wants index fund advice, use the handoffToJack tool
`;
  }
  
  return ''; // Jack is the default, no extra context needed
}

/**
 * Check if we should suggest a handoff based on the conversation
 */
export function suggestHandoff(userInput: string): { 
  suggest: boolean; 
  to: 'jack' | 'peter' | null;
  reason: string | null;
} {
  if (currentAgent === 'jack' && shouldHandoffToPeter(userInput)) {
    return { 
      suggest: true, 
      to: 'peter',
      reason: 'User is asking about stock picking or active investing'
    };
  }
  
  if (currentAgent === 'peter' && shouldHandoffToJack(userInput)) {
    return {
      suggest: true,
      to: 'jack', 
      reason: 'User is asking about index funds or passive investing'
    };
  }
  
  return { suggest: false, to: null, reason: null };
}

export default createHandoffTools;

