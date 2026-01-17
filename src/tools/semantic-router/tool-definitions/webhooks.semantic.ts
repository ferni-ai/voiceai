/**
 * Webhooks Semantic Routing
 *
 * Routes to: domains/webhooks
 * Tools: triggerWebhook, listWebhooks, getWebhookStatus
 *
 * Voice-controlled automation triggers for IFTTT, Zapier,
 * Home Assistant, and custom webhooks.
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// TRIGGER WEBHOOK
// ============================================================================

export const triggerWebhookTool: SemanticToolDefinition = {
  id: 'automation_trigger_webhook',
  name: 'Trigger Webhook',
  description: 'Trigger a custom automation via webhook.',
  shortDescription: 'trigger automation',
  category: 'productivity',
  priority: 2,

  triggers: {
    phrases: [
      'run my automation',
      'trigger my webhook',
      'activate my routine',
      'run my ifttt',
      'trigger zapier',
      'run the home assistant scene',
      'execute my workflow',
      'activate the shortcut',
      'turn on goodnight mode',
      'start movie mode',
    ],
    patterns: [
      /\b(run|trigger|activate|execute)\s+(my\s+)?(automation|webhook|routine|workflow)\b/i,
      /\b(run|trigger)\s+(my\s+)?ifttt\b/i,
      /\btrigger\s+zapier\b/i,
      /\b(run|activate)\s+(the\s+)?home\s+assistant\b/i,
      /\b(turn\s+on|start|activate)\s+\w+\s+mode\b/i,
    ],
    keywords: [
      { word: 'automation', weight: 1.0 },
      { word: 'webhook', weight: 1.0 },
      { word: 'trigger', weight: 0.95 },
      { word: 'ifttt', weight: 0.95 },
      { word: 'zapier', weight: 0.95 },
      { word: 'routine', weight: 0.85 },
      { word: 'workflow', weight: 0.85 },
      { word: 'mode', weight: 0.75 },
    ],
    antiKeywords: ['create webhook', 'set up automation'],
  },

  examples: [
    'Run my goodnight automation',
    'Trigger my IFTTT routine',
    'Activate movie mode',
    'Execute my morning workflow',
  ],

  counterExamples: [
    'I want to create a new automation',
    'Help me set up webhooks',
  ],

  arguments: [
    { name: 'phrase', type: 'string', required: true, description: 'Trigger phrase or webhook name' },
    { name: 'data', type: 'object', required: false, description: 'Optional data to send' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.08,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/webhooks',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'triggerWebhook',
      args,
      delegateTo: 'domains/webhooks',
    };
  },
};

// ============================================================================
// LIST WEBHOOKS
// ============================================================================

export const listWebhooksTool: SemanticToolDefinition = {
  id: 'automation_list_webhooks',
  name: 'List Webhooks',
  description: 'List all configured webhooks and automations.',
  shortDescription: 'list automations',
  category: 'productivity',
  priority: 3,

  triggers: {
    phrases: [
      'what automations do I have',
      'list my webhooks',
      'show my automations',
      'what triggers are set up',
      'what routines do I have',
      'list my workflows',
    ],
    patterns: [
      /\b(list|show|what)\s+(my\s+)?(webhooks?|automations?|triggers?|routines?)\b/i,
      /\bwhat\s+(automations?|triggers?|webhooks?)\s+(do\s+)?I\s+have\b/i,
    ],
    keywords: [
      { word: 'list', weight: 0.9 },
      { word: 'show', weight: 0.85 },
      { word: 'webhooks', weight: 1.0 },
      { word: 'automations', weight: 0.95 },
      { word: 'triggers', weight: 0.9 },
    ],
    antiKeywords: ['create', 'set up', 'delete'],
  },

  examples: [
    'What automations do I have set up',
    'List my webhooks',
    'Show me my available triggers',
  ],

  counterExamples: ['Create a new automation'],

  arguments: [],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/webhooks',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'listWebhooks',
      args,
      delegateTo: 'domains/webhooks',
    };
  },
};

// ============================================================================
// GET WEBHOOK STATUS
// ============================================================================

export const getWebhookStatusTool: SemanticToolDefinition = {
  id: 'automation_webhook_status',
  name: 'Get Webhook Status',
  description: 'Check the status of webhook executions.',
  shortDescription: 'webhook status',
  category: 'productivity',
  priority: 4,

  triggers: {
    phrases: [
      'did my automation run',
      'webhook status',
      'did it trigger',
      'check automation status',
      'was the webhook successful',
    ],
    patterns: [
      /\b(did\s+)?(my\s+)?(automation|webhook)\s+(run|work|trigger)\b/i,
      /\b(webhook|automation)\s+status\b/i,
      /\bwas\s+(the\s+)?(webhook|automation)\s+successful\b/i,
    ],
    keywords: [
      { word: 'status', weight: 1.0 },
      { word: 'run', weight: 0.85 },
      { word: 'successful', weight: 0.9 },
      { word: 'work', weight: 0.8 },
    ],
    antiKeywords: ['trigger', 'run my'],
  },

  examples: [
    'Did my goodnight automation run',
    'Check the status of my last webhook',
    'Was the automation successful',
  ],

  counterExamples: ['Run my automation'],

  arguments: [
    { name: 'webhookName', type: 'string', required: false, description: 'Specific webhook to check' },
  ],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/webhooks',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getWebhookStatus',
      args,
      delegateTo: 'domains/webhooks',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const webhooksTools: SemanticToolDefinition[] = [
  triggerWebhookTool,
  listWebhooksTool,
  getWebhookStatusTool,
];
