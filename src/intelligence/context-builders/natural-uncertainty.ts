/**
 * Natural Uncertainty Context Builder
 *
 * Humans aren't always certain. They think out loud, admit when they don't know,
 * change their minds, and express genuine doubt. This makes Ferni feel more human
 * by occasionally injecting uncertainty expressions.
 *
 * Key behaviors:
 * - "I'm not sure, but..." - genuine uncertainty
 * - "Hmm, let me think about that..." - processing out loud
 * - "Actually, wait..." - course correction
 * - "I might be wrong, but..." - humble opinions
 * - Comfortable silence / not always having an answer
 *
 * @module NaturalUncertaintyContextBuilder
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from './index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'NaturalUncertainty' });

// ============================================================================
// UNCERTAINTY TRIGGERS
// ============================================================================

/**
 * Topics/situations where uncertainty is especially natural
 */
const UNCERTAINTY_TRIGGERS = {
  // Questions about the future
  future: ['will', 'going to', 'future', 'tomorrow', 'next year', 'predict', 'what if'],
  
  // Complex life decisions
  decisions: ['should I', 'what would you do', 'is it worth', 'better to', 'right choice'],
  
  // Abstract/philosophical
  philosophical: ['meaning', 'purpose', 'why do', 'what is', 'life', 'happiness'],
  
  // Relationship advice
  relationships: ['relationship', 'partner', 'friend', 'family', 'love', 'dating'],
  
  // Career/life path
  career: ['career', 'job', 'quit', 'change', 'path', 'direction'],
};

/**
 * Check if user message triggers natural uncertainty
 */
function detectUncertaintyTrigger(message: string): string | null {
  const lower = message.toLowerCase();
  
  for (const [category, triggers] of Object.entries(UNCERTAINTY_TRIGGERS)) {
    if (triggers.some(trigger => lower.includes(trigger))) {
      return category;
    }
  }
  
  // Also trigger on direct questions seeking definitive answers
  if (lower.includes('?') && (lower.includes('should') || lower.includes('will') || lower.includes('is it'))) {
    return 'direct_question';
  }
  
  return null;
}

// ============================================================================
// UNCERTAINTY EXPRESSIONS
// ============================================================================

/**
 * Natural uncertainty phrases by context
 */
const UNCERTAINTY_PHRASES = {
  // Genuine not knowing
  unsure: [
    "I'm not entirely sure, but...",
    "Honestly? I don't know for certain...",
    "That's a tough one. I'm not sure there's a clear answer...",
    "I wish I had a definitive answer for you...",
  ],
  
  // Thinking out loud
  processing: [
    "Hmm, let me think about that...",
    "That's interesting... I'm trying to figure out...",
    "You know, I'm actually working through this as I say it...",
    "Let me sit with that for a second...",
  ],
  
  // Course correction
  correction: [
    "Actually, wait - I might be thinking about this wrong...",
    "Hmm, actually...",
    "Let me rethink that...",
    "You know what, scratch that...",
  ],
  
  // Humble opinions
  humble: [
    "I might be wrong, but...",
    "This is just my take, and I could be off base...",
    "I'm not the expert here, but...",
    "Take this with a grain of salt, but...",
  ],
  
  // Comfortable with not knowing
  comfortable: [
    "Some things just don't have clear answers, and that's okay.",
    "I don't think anyone really knows that for sure.",
    "Life doesn't always come with instruction manuals.",
    "Sometimes sitting with the uncertainty is part of it.",
  ],
};

/**
 * Get a random phrase from a category
 */
function getRandomPhrase(category: keyof typeof UNCERTAINTY_PHRASES): string {
  const phrases = UNCERTAINTY_PHRASES[category];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build natural uncertainty context
 */
async function buildNaturalUncertaintyContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, userData, analysis } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  
  // Don't inject on early turns - let relationship establish first
  if (turnCount < 3) {
    return injections;
  }
  
  // Check if this is a situation where uncertainty is natural
  const trigger = detectUncertaintyTrigger(userText);
  
  // Probability-based injection (don't do it every time)
  // Higher chance for complex questions, lower for simple ones
  let shouldInject = false;
  let uncertaintyType: keyof typeof UNCERTAINTY_PHRASES = 'unsure';
  
  if (trigger) {
    // Complex life questions - 40% chance of uncertainty expression
    if (['decisions', 'philosophical', 'relationships', 'career'].includes(trigger)) {
      shouldInject = Math.random() < 0.4;
      uncertaintyType = Math.random() < 0.5 ? 'unsure' : 'humble';
    }
    // Future predictions - 50% chance (we really don't know the future!)
    else if (trigger === 'future') {
      shouldInject = Math.random() < 0.5;
      uncertaintyType = 'comfortable';
    }
    // Direct questions seeking answers - 25% chance of thinking out loud
    else if (trigger === 'direct_question') {
      shouldInject = Math.random() < 0.25;
      uncertaintyType = 'processing';
    }
  }
  
  // Occasional random uncertainty (5% of turns) - makes it feel spontaneous
  if (!shouldInject && Math.random() < 0.05) {
    shouldInject = true;
    uncertaintyType = Math.random() < 0.5 ? 'processing' : 'humble';
  }
  
  if (shouldInject) {
    const examplePhrase = getRandomPhrase(uncertaintyType);
    
    const guidance = buildUncertaintyGuidance(uncertaintyType, examplePhrase, trigger);
    
    injections.push(
      createHintInjection('natural_uncertainty', guidance, { category: 'humanizing' })
    );
    
    log.debug({
      trigger,
      uncertaintyType,
      turnCount,
    }, '🤔 Injecting natural uncertainty');
  }
  
  return injections;
}

/**
 * Build the uncertainty guidance for the LLM
 */
function buildUncertaintyGuidance(
  type: keyof typeof UNCERTAINTY_PHRASES,
  example: string,
  trigger: string | null
): string {
  const lines: string[] = ['[🤔 BE HUMAN - EXPRESS UNCERTAINTY]'];
  
  switch (type) {
    case 'unsure':
      lines.push(
        "This is a complex question. It's okay to not have a definitive answer.",
        '',
        'You can express genuine uncertainty:',
        `Example: "${example}"`,
        '',
        "Don't pretend to know what you don't know.",
        "Uncertainty is honest, and honesty builds trust."
      );
      break;
      
    case 'processing':
      lines.push(
        "You can think out loud - it's human to process in real-time.",
        '',
        'Consider:',
        `Example: "${example}"`,
        '',
        "Let them see your thought process.",
        "It makes the conversation feel more genuine."
      );
      break;
      
    case 'correction':
      lines.push(
        "If you realize mid-thought you want to rethink something, that's okay!",
        '',
        'You can course-correct naturally:',
        `Example: "${example}"`,
        '',
        "Changing your mind shows you're actually thinking."
      );
      break;
      
    case 'humble':
      lines.push(
        "Offer your perspective, but acknowledge it's just one view.",
        '',
        'Be humble:',
        `Example: "${example}"`,
        '',
        "You're a thought partner, not an oracle.",
        "Humility is attractive."
      );
      break;
      
    case 'comfortable':
      lines.push(
        "Some questions don't have answers, and that's okay to acknowledge.",
        '',
        'You can normalize uncertainty:',
        `Example: "${example}"`,
        '',
        "Sometimes the most helpful thing is to sit with them in the unknown.",
        "Not everything needs to be solved."
      );
      break;
  }
  
  lines.push('');
  lines.push('Remember: Being uncertain sometimes makes you MORE trustworthy, not less.');
  
  return lines.join('\n');
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'natural_uncertainty',
  description: 'Occasionally express genuine uncertainty, think out loud, be human',
  priority: 55, // Medium priority - should blend with other humanizing
  build: buildNaturalUncertaintyContext,
});

export { buildNaturalUncertaintyContext, detectUncertaintyTrigger };

