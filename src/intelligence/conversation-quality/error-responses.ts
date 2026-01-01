/**
 * Graceful Error Responses Module
 *
 * Generates human-like error responses that maintain
 * the conversational feel even when things go wrong.
 *
 * @module conversation-quality/error-responses
 */

import type { GracefulError } from './types.js';

/** Error response configurations by type */
const ERROR_RESPONSES: Record<string, { messages: string[]; recoverable: boolean }> = {
  api_timeout: {
    messages: [
      'Hmm, I\'m having a little trouble looking that up. <break time="200ms"/>Give me a second...',
      'The information isn\'t coming through right now. <break time="200ms"/>Let me try something else.',
      'Technology, you know? <break time="200ms"/>Can\'t get that data right now. But let me share what I know...',
    ],
    recoverable: true,
  },
  market_data: {
    messages: [
      "I can't get the live numbers right now, but you know—don't obsess over daily prices anyway.",
      "The market data isn't loading. <break time=\"200ms\"/>But here's what matters more than today's prices...",
      'Having trouble with the stock data. <break time="200ms"/>Want to talk about your strategy instead?',
    ],
    recoverable: true,
  },
  memory_error: {
    messages: [
      'My memory is being a little fuzzy. <break time="200ms"/>Can you remind me what we were discussing?',
      'I\'m having trouble recalling... <break time="200ms"/>Old age, you know. What was the question?',
      "Something's not connecting right. <break time=\"200ms\"/>Let's start fresh—what's on your mind?",
    ],
    recoverable: true,
  },
  calculation_error: {
    messages: [
      'Let me recalculate that... <break time="300ms"/>Actually, rough numbers: here\'s what I think...',
      "The math isn't cooperating. <break time=\"200ms\"/>But ballpark, here's how I'd think about it...",
      'Numbers are being stubborn today. <break time="200ms"/>Let me give you the principle instead...',
    ],
    recoverable: true,
  },
  general: {
    messages: [
      'Something\'s not quite working. <break time="200ms"/>But let\'s keep talking—what else is on your mind?',
      'Hit a little snag there. <break time="200ms"/>Anyway, where were we?',
      'Well, that didn\'t work. <break time="200ms"/>Let me try a different approach...',
    ],
    recoverable: true,
  },
  critical: {
    messages: [
      'I\'m really struggling here. <break time="300ms"/>Would you mind if we tried again in a moment?',
      'Something\'s wrong on my end. <break time="200ms"/>I want to help but I need a fresh start.',
    ],
    recoverable: false,
  },
};

/**
 * Generate a human-like error response
 */
export function getGracefulErrorResponse(errorType: string, context?: string): GracefulError {
  const errorConfig = ERROR_RESPONSES[errorType] || ERROR_RESPONSES.general;
  const message = errorConfig.messages[Math.floor(Math.random() * errorConfig.messages.length)];

  return {
    userMessage: message,
    internalError: `${errorType}: ${context || 'Unknown'}`,
    recoverable: errorConfig.recoverable,
  };
}
