/**
 * Referral Semantic Routing
 *
 * Routes to: domains/referral
 * Tools: inviteFriendByCall, sendSupportCall
 *
 * Voice-based referral tools that use Twilio to make actual phone calls.
 * Ferni personally introduces herself to friends and provides support.
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// INVITE FRIEND BY CALL
// ============================================================================

export const inviteFriendByCallTool: SemanticToolDefinition = {
  id: 'referral_invite_friend',
  name: 'Invite Friend by Call',
  description: 'Have Ferni personally call a friend to introduce herself.',
  shortDescription: 'call friend to introduce Ferni',
  category: 'communication',
  priority: 3,

  triggers: {
    phrases: [
      'call my friend',
      'introduce yourself to my friend',
      'have Ferni call',
      'send Ferni to my friend',
      'call them and introduce yourself',
      'tell my friend about you',
      'refer my friend',
      'invite my friend',
      'can you call my friend',
    ],
    patterns: [
      /\b(call|phone|ring)\s+(my\s+)?friend\b/i,
      /\bintroduce\s+(yourself|Ferni)\s+to\b/i,
      /\bhave\s+Ferni\s+call\b/i,
      /\b(refer|invite)\s+(my\s+)?friend\b/i,
      /\btell\s+(my\s+)?(friend|them)\s+about\s+(you|Ferni)\b/i,
    ],
    keywords: [
      { word: 'call', weight: 0.9 },
      { word: 'friend', weight: 0.85 },
      { word: 'introduce', weight: 0.9 },
      { word: 'refer', weight: 0.95 },
      { word: 'invite', weight: 0.85 },
      { word: 'phone', weight: 0.8 },
    ],
    antiKeywords: ['call me', 'call back', 'missed call'],
  },

  examples: [
    'Can you call my friend Sarah and introduce yourself?',
    'I want to refer my friend to Ferni',
    'Have Ferni call my buddy and say hi',
  ],

  counterExamples: [
    'Call me back later',
    'I missed a call from my friend',
  ],

  arguments: [
    { name: 'friendName', type: 'string', required: true, description: 'Name of the friend' },
    { name: 'phoneNumber', type: 'string', required: true, description: 'Phone number to call' },
    { name: 'context', type: 'string', required: false, description: 'Context about the friend' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/referral',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'inviteFriendByCall',
      args,
      delegateTo: 'domains/referral',
    };
  },
};

// ============================================================================
// SEND SUPPORT CALL
// ============================================================================

export const sendSupportCallTool: SemanticToolDefinition = {
  id: 'referral_support_call',
  name: 'Send Support Call',
  description: 'Send a supportive call to someone going through a difficult time.',
  shortDescription: 'supportive intro call',
  category: 'communication',
  priority: 2,

  triggers: {
    phrases: [
      'call and check on',
      'send a supportive call',
      'reach out to my friend who is struggling',
      'call someone who needs support',
      'have Ferni comfort my friend',
      'send encouragement to',
      'call and offer support',
      'reach out to them',
    ],
    patterns: [
      /\b(call|reach\s+out)\s+(and\s+)?(check\s+on|support)\b/i,
      /\bsend\s+(a\s+)?support(ive)?\s+call\b/i,
      /\b(comfort|encourage|support)\s+(my\s+)?friend\b/i,
      /\bsomeone\s+(who\s+)?(needs?|is)\s+(support|struggling|going\s+through)\b/i,
    ],
    keywords: [
      { word: 'support', weight: 1.0 },
      { word: 'check on', weight: 0.95 },
      { word: 'struggling', weight: 0.9 },
      { word: 'comfort', weight: 0.9 },
      { word: 'encourage', weight: 0.85 },
      { word: 'difficult time', weight: 0.9 },
    ],
    antiKeywords: ['technical support', 'customer support'],
  },

  examples: [
    'Can you call my friend who is going through a tough time?',
    "Send a supportive call to Sarah, she's struggling",
    'Reach out and check on my mom',
  ],

  counterExamples: [
    'I need technical support',
    'Contact customer support',
  ],

  arguments: [
    { name: 'recipientName', type: 'string', required: true, description: 'Name of the person' },
    { name: 'phoneNumber', type: 'string', required: true, description: 'Phone number to call' },
    { name: 'situation', type: 'string', required: false, description: 'What they are going through' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/referral',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'sendSupportCall',
      args,
      delegateTo: 'domains/referral',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const referralTools: SemanticToolDefinition[] = [
  inviteFriendByCallTool,
  sendSupportCallTool,
];
