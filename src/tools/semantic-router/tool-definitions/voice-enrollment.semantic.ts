/**
 * Voice Enrollment Semantic Routing
 *
 * Routes to: domains/voice-enrollment
 * Tools: phoneEnrollment, selfRegistration
 *
 * Voice enrollment and speaker recognition tools.
 * Allows users to enroll their voice or enroll family members via phone.
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// VOICE ENROLLMENT (SELF)
// ============================================================================

export const voiceEnrollmentSelfTool: SemanticToolDefinition = {
  id: 'voice_enrollment_self',
  name: 'Voice Enrollment',
  description: 'Enroll your voice so Ferni can recognize you.',
  shortDescription: 'enroll my voice',
  category: 'settings',
  priority: 2,

  triggers: {
    phrases: [
      'enroll my voice',
      'register my voice',
      'learn my voice',
      'recognize my voice',
      'set up voice recognition',
      'teach you my voice',
      'voice profile',
      'voice id',
      'know who I am by voice',
    ],
    patterns: [
      /\b(enroll|register|learn|recognize)\s+(my\s+)?voice\b/i,
      /\bset\s+up\s+voice\s+(recognition|id)\b/i,
      /\bteach\s+(you\s+)?(my\s+)?voice\b/i,
      /\bvoice\s+(profile|id|identification)\b/i,
      /\bknow\s+who\s+I\s+am\s+by\s+voice\b/i,
    ],
    keywords: [
      { word: 'voice', weight: 1.0 },
      { word: 'enroll', weight: 0.95 },
      { word: 'register', weight: 0.9 },
      { word: 'recognize', weight: 0.85 },
      { word: 'profile', weight: 0.8 },
      { word: 'learn', weight: 0.75 },
    ],
    antiKeywords: ['change voice', 'voice assistant', 'voice message'],
  },

  examples: [
    'I want to enroll my voice',
    'Set up voice recognition for me',
    'Teach Ferni to recognize my voice',
  ],

  counterExamples: ['Change the voice to something else', 'Send a voice message'],

  arguments: [],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.08,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/voice-enrollment',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'selfRegistration',
      args,
      delegateTo: 'domains/voice-enrollment',
    };
  },
};

// ============================================================================
// PHONE ENROLLMENT (FOR OTHERS)
// ============================================================================

export const phoneEnrollmentTool: SemanticToolDefinition = {
  id: 'voice_enrollment_phone',
  name: 'Phone Voice Enrollment',
  description: 'Enroll a family member or friend by calling their phone.',
  shortDescription: 'enroll someone by phone',
  category: 'settings',
  priority: 3,

  triggers: {
    phrases: [
      'enroll my wife',
      'enroll my husband',
      'add my kid',
      'register my family',
      'enroll my mom',
      'enroll my dad',
      'add family member voice',
      'call and enroll',
      'phone enrollment',
      'enroll someone else',
    ],
    patterns: [
      /\benroll\s+(my\s+)?(wife|husband|kid|child|mom|dad|parent|family)\b/i,
      /\b(add|register)\s+(my\s+)?(family|household)\s*member\b/i,
      /\bcall\s+and\s+enroll\b/i,
      /\bphone\s+enrollment\b/i,
      /\benroll\s+someone\s+else\b/i,
    ],
    keywords: [
      { word: 'enroll', weight: 1.0 },
      { word: 'family', weight: 0.9 },
      { word: 'wife', weight: 0.85 },
      { word: 'husband', weight: 0.85 },
      { word: 'kid', weight: 0.85 },
      { word: 'phone', weight: 0.8 },
      { word: 'call', weight: 0.75 },
    ],
    antiKeywords: ['my voice', 'myself'],
  },

  examples: [
    'Enroll my wife so she can use Ferni too',
    'Add my kids to the household',
    'Can you call my mom and enroll her voice?',
  ],

  counterExamples: ['Enroll my own voice'],

  arguments: [
    { name: 'personName', type: 'string', required: true, description: 'Name of person to enroll' },
    { name: 'relationship', type: 'string', required: false, description: 'Relationship to user' },
    { name: 'phoneNumber', type: 'string', required: false, description: 'Phone number to call' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/voice-enrollment',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'phoneEnrollment',
      args,
      delegateTo: 'domains/voice-enrollment',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceEnrollmentTools: SemanticToolDefinition[] = [
  voiceEnrollmentSelfTool,
  phoneEnrollmentTool,
];
