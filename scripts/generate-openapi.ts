#!/usr/bin/env npx tsx
/**
 * OpenAPI Documentation Generator
 *
 * Generates OpenAPI 3.0 documentation from Zod schemas.
 * Run: npx tsx scripts/generate-openapi.ts
 *
 * @module scripts/generate-openapi
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { OpenAPIDocumentBuilder, schemaRef } from '../src/types/openapi/index.js';

// ============================================================================
// API SCHEMAS (Import or define your Zod schemas here)
// ============================================================================

// User-related schemas
const UserIdSchema = z.string().describe('Unique user identifier');

const UserProfileSummarySchema = z.object({
  id: UserIdSchema,
  name: z.string().optional().describe("User's display name"),
  preferredName: z.string().optional().describe("User's preferred name"),
  relationshipStage: z
    .enum(['new', 'acquaintance', 'friend', 'close_friend', 'trusted_confidant'])
    .describe('Current relationship stage with Ferni'),
  totalConversations: z.number().int().min(0).describe('Total conversation count'),
  lastContact: z.string().datetime().optional().describe('Last interaction timestamp'),
});

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  preferredName: z.string().min(1).max(50).optional(),
  phoneNumber: z.string().optional().describe('E.164 format phone number'),
  firebaseUid: z.string().optional().describe('Firebase authentication UID'),
});

// Session-related schemas
const SessionIdSchema = z.string().describe('Unique session identifier');

const SessionSchema = z.object({
  id: SessionIdSchema,
  userId: UserIdSchema,
  personaId: z.string().describe('Active persona ID'),
  startedAt: z.string().datetime().describe('Session start timestamp'),
  status: z.enum(['active', 'paused', 'ended']).describe('Current session status'),
  turnCount: z.number().int().min(0).describe('Number of conversation turns'),
  durationSeconds: z.number().min(0).describe('Session duration in seconds'),
});

const StartSessionSchema = z.object({
  userId: UserIdSchema,
  personaId: z.string().default('ferni').describe('Initial persona to use'),
  metadata: z.record(z.unknown()).optional().describe('Additional session metadata'),
});

// Conversation-related schemas
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']).describe('Message sender role'),
  content: z.string().describe('Message content'),
  timestamp: z.string().datetime().describe('Message timestamp'),
  emotionalContext: z
    .object({
      primary: z.string().describe('Primary detected emotion'),
      intensity: z.number().min(0).max(1).describe('Emotion intensity'),
    })
    .optional(),
});

// Health & status schemas
const HealthCheckSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.string().datetime(),
  services: z.record(
    z.object({
      status: z.enum(['up', 'down', 'degraded']),
      latencyMs: z.number().optional(),
    })
  ),
});

// Error schemas
const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe('Error code for programmatic handling'),
    message: z.string().describe('Human-readable error message'),
    details: z.record(z.unknown()).optional().describe('Additional error details'),
  }),
});

// Persona schemas
const PersonaSchema = z.object({
  id: z.string().describe('Persona identifier'),
  name: z.string().describe('Persona display name'),
  role: z.string().describe('Persona role description'),
  specialty: z.string().describe('Persona specialty area'),
  voiceId: z.string().describe('TTS voice identifier'),
  available: z.boolean().describe('Whether persona is currently available'),
});

// Goal schemas
const GoalSchema = z.object({
  id: z.string().describe('Goal identifier'),
  userId: UserIdSchema,
  name: z.string().min(1).max(200).describe('Goal name'),
  description: z.string().optional().describe('Goal description'),
  category: z
    .enum(['health', 'career', 'relationships', 'personal', 'financial', 'learning', 'other'])
    .describe('Goal category'),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']).describe('Goal status'),
  createdAt: z.string().datetime(),
  targetDate: z.string().datetime().optional(),
  progressPercentage: z.number().min(0).max(100).optional(),
});

const CreateGoalSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum([
    'health',
    'career',
    'relationships',
    'personal',
    'financial',
    'learning',
    'other',
  ]),
  targetDate: z.string().datetime().optional(),
});

// Memory schemas
const MemorySchema = z.object({
  id: z.string().describe('Memory identifier'),
  userId: UserIdSchema,
  content: z.string().describe('Memory content'),
  type: z.enum(['fact', 'preference', 'story', 'emotional', 'goal', 'relationship']),
  importance: z.number().min(0).max(1).describe('Memory importance score'),
  createdAt: z.string().datetime(),
  lastAccessed: z.string().datetime().optional(),
  accessCount: z.number().int().min(0),
});

// Speech metrics schemas
const SpeechMetricsGlobalSchema = z.object({
  uptimeSec: z.number().describe('Server uptime in seconds'),
  metrics: z.object({
    usage: z.object({
      totalSessions: z.number().int(),
      activeSessionCount: z.number().int(),
      totalTurns: z.number().int(),
    }),
    performance: z.object({
      avgResponseLatencyMs: z.number(),
      avgEmotionConfidence: z.number(),
      avgBackchannelAccuracy: z.number(),
      avgTurnPredictionAccuracy: z.number(),
    }),
    quality: z.object({
      avgSentimentScore: z.number(),
      avgEngagementScore: z.number(),
    }),
  }),
});

const ActiveSessionSchema = z.object({
  sessionId: z.string(),
  personaId: z.string(),
  startTime: z.number().describe('Unix timestamp'),
  durationSec: z.number(),
  turnCount: z.number().int(),
  emotionSamples: z.number().int(),
  backchannelCount: z.number().int(),
});

const PersonaMetricsSchema = z.object({
  personaId: z.string(),
  sessionCount: z.number().int(),
  avgBackchannelAccuracy: z.number().min(0).max(100).describe('Percentage'),
  avgTurnPredictionAccuracy: z.number().min(0).max(100).describe('Percentage'),
  avgEmotionConfidence: z.number().min(0).max(100).describe('Percentage'),
  avgResponseLatencyMs: z.number(),
  avgSessionDurationSec: z.number(),
});

const SpeechDashboardSchema = z.object({
  timestamp: z.number().describe('Unix timestamp'),
  global: SpeechMetricsGlobalSchema,
  activeSessions: z.array(ActiveSessionSchema),
  personaBreakdown: z.array(PersonaMetricsSchema),
});

// Conversation state schemas
const EmotionalContextSchema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  emotions: z.array(
    z.enum(['happy', 'excited', 'calm', 'anxious', 'frustrated', 'sad', 'confused', 'grateful'])
  ),
  urgency: z.number().min(1).max(5),
  topicFatigue: z.boolean(),
  confidence: z.number().min(0).max(1),
});

const ConversationContextSchema = z.object({
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  emotional: EmotionalContextSchema,
  currentTopic: z.string().nullable(),
  turnCount: z.number().int(),
  startedAt: z.string().datetime(),
});

// ============================================================================
// BUILD OPENAPI DOCUMENT
// ============================================================================

function buildOpenAPIDocument(): string {
  const builder = new OpenAPIDocumentBuilder({
    title: 'Ferni AI API',
    version: '1.0.0',
    description: `
Ferni is a voice-first AI life coach platform featuring six brilliant personas
that provide emotional support, guidance, and genuine connection.

## Authentication
Most endpoints require Firebase authentication. Include the Firebase ID token
in the Authorization header: \`Authorization: Bearer <token>\`

## Rate Limiting
API requests are rate-limited to prevent abuse. Limits vary by endpoint.

## Personas
- **Ferni** - Life coach (default)
- **Peter** - Research & due diligence
- **Alex** - Communication specialist
- **Maya** - Habits & routines
- **Jordan** - Event planning
- **Nayan** - Wisdom & philosophy
    `.trim(),
  });

  // Add servers
  builder
    .addServer('https://app.ferni.ai', 'Production')
    .addServer('https://ferni-prod.web.app', 'Staging')
    .addServer('http://localhost:3000', 'Local Development');

  // Add schemas
  builder.addSchema('UserProfileSummary', UserProfileSummarySchema);
  builder.addSchema('CreateUser', CreateUserSchema);
  builder.addSchema('Session', SessionSchema);
  builder.addSchema('StartSession', StartSessionSchema);
  builder.addSchema('Message', MessageSchema);
  builder.addSchema('HealthCheck', HealthCheckSchema);
  builder.addSchema('ApiError', ApiErrorSchema);
  builder.addSchema('Persona', PersonaSchema);
  builder.addSchema('Goal', GoalSchema);
  builder.addSchema('CreateGoal', CreateGoalSchema);
  builder.addSchema('Memory', MemorySchema);
  // Speech metrics schemas
  builder.addSchema('SpeechMetricsGlobal', SpeechMetricsGlobalSchema);
  builder.addSchema('ActiveSession', ActiveSessionSchema);
  builder.addSchema('PersonaMetrics', PersonaMetricsSchema);
  builder.addSchema('SpeechDashboard', SpeechDashboardSchema);
  builder.addSchema('EmotionalContext', EmotionalContextSchema);
  builder.addSchema('ConversationContext', ConversationContextSchema);

  // Health endpoint
  builder.addPath('/health', 'get', {
    summary: 'Health Check',
    description: 'Check the health status of the API and its dependencies',
    tags: ['System'],
    responses: {
      '200': {
        description: 'Service is healthy',
        content: {
          'application/json': {
            schema: schemaRef('HealthCheck'),
          },
        },
      },
      '503': {
        description: 'Service is unhealthy',
        content: {
          'application/json': {
            schema: schemaRef('HealthCheck'),
          },
        },
      },
    },
  });

  // User endpoints
  builder.addPath('/api/users/me', 'get', {
    summary: 'Get Current User',
    description: "Get the currently authenticated user's profile",
    tags: ['Users'],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'User profile retrieved successfully',
        content: {
          'application/json': {
            schema: schemaRef('UserProfileSummary'),
          },
        },
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: schemaRef('ApiError'),
          },
        },
      },
    },
  });

  // Session endpoints
  builder.addPath('/api/sessions', 'post', {
    summary: 'Start Session',
    description: 'Start a new conversation session',
    tags: ['Sessions'],
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: schemaRef('StartSession'),
        },
      },
    },
    responses: {
      '201': {
        description: 'Session created successfully',
        content: {
          'application/json': {
            schema: schemaRef('Session'),
          },
        },
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: schemaRef('ApiError'),
          },
        },
      },
    },
  });

  builder.addPath('/api/sessions/{sessionId}', 'get', {
    summary: 'Get Session',
    description: 'Get details of a specific session',
    tags: ['Sessions'],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'sessionId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Session identifier',
      },
    ],
    responses: {
      '200': {
        description: 'Session retrieved successfully',
        content: {
          'application/json': {
            schema: schemaRef('Session'),
          },
        },
      },
      '404': {
        description: 'Session not found',
        content: {
          'application/json': {
            schema: schemaRef('ApiError'),
          },
        },
      },
    },
  });

  // Persona endpoints
  builder.addPath('/api/personas', 'get', {
    summary: 'List Personas',
    description: 'Get all available personas',
    tags: ['Personas'],
    responses: {
      '200': {
        description: 'Personas retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                personas: {
                  type: 'array',
                  items: schemaRef('Persona'),
                },
              },
            },
          },
        },
      },
    },
  });

  // Goal endpoints
  builder.addPath('/api/goals', 'get', {
    summary: 'List Goals',
    description: "Get the user's goals",
    tags: ['Goals'],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'status',
        in: 'query',
        schema: { type: 'string', enum: ['active', 'paused', 'completed', 'abandoned'] },
        description: 'Filter by status',
      },
      {
        name: 'category',
        in: 'query',
        schema: { type: 'string' },
        description: 'Filter by category',
      },
    ],
    responses: {
      '200': {
        description: 'Goals retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                goals: {
                  type: 'array',
                  items: schemaRef('Goal'),
                },
                total: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  });

  builder.addPath('/api/goals', 'post', {
    summary: 'Create Goal',
    description: 'Create a new goal',
    tags: ['Goals'],
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: schemaRef('CreateGoal'),
        },
      },
    },
    responses: {
      '201': {
        description: 'Goal created successfully',
        content: {
          'application/json': {
            schema: schemaRef('Goal'),
          },
        },
      },
    },
  });

  // Memory endpoints
  builder.addPath('/api/memories', 'get', {
    summary: 'List Memories',
    description: "Get the user's memories",
    tags: ['Memory'],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'type',
        in: 'query',
        schema: { type: 'string' },
        description: 'Filter by memory type',
      },
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 50 },
        description: 'Maximum number of memories to return',
      },
    ],
    responses: {
      '200': {
        description: 'Memories retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                memories: {
                  type: 'array',
                  items: schemaRef('Memory'),
                },
                total: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  });

  // Speech Metrics endpoints
  builder.addPath('/api/speech-metrics/dashboard', 'get', {
    summary: 'Speech Dashboard',
    description: 'Get comprehensive speech pipeline metrics dashboard',
    tags: ['Speech Metrics'],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'Dashboard data retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: schemaRef('SpeechDashboard'),
              },
            },
          },
        },
      },
    },
  });

  builder.addPath('/api/speech-metrics/global', 'get', {
    summary: 'Global Speech Metrics',
    description: 'Get global speech metrics snapshot',
    tags: ['Speech Metrics'],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'Metrics retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: schemaRef('SpeechMetricsGlobal'),
              },
            },
          },
        },
      },
    },
  });

  builder.addPath('/api/speech-metrics/sessions', 'get', {
    summary: 'Active Speech Sessions',
    description: 'Get list of active speech sessions with metrics',
    tags: ['Speech Metrics'],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'Sessions retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer' },
                    sessions: {
                      type: 'array',
                      items: schemaRef('ActiveSession'),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  builder.addPath('/api/speech-metrics/personas', 'get', {
    summary: 'Persona Speech Metrics',
    description: 'Get speech metrics breakdown by persona',
    tags: ['Speech Metrics'],
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'Persona metrics retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer' },
                    personas: {
                      type: 'array',
                      items: schemaRef('PersonaMetrics'),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  builder.addPath('/api/speech-metrics/persona/{personaId}', 'get', {
    summary: 'Single Persona Metrics',
    description: 'Get speech metrics for a specific persona',
    tags: ['Speech Metrics'],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'personaId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Persona identifier (e.g., ferni, peter, alex)',
      },
    ],
    responses: {
      '200': {
        description: 'Persona metrics retrieved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: schemaRef('PersonaMetrics'),
              },
            },
          },
        },
      },
      '404': {
        description: 'Persona not found',
        content: {
          'application/json': {
            schema: schemaRef('ApiError'),
          },
        },
      },
    },
  });

  builder.addPath('/api/speech-metrics/health', 'get', {
    summary: 'Speech System Health',
    description: 'Quick health check for speech system',
    tags: ['Speech Metrics'],
    responses: {
      '200': {
        description: 'Speech system is healthy',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                uptimeSec: { type: 'number' },
                activeSessions: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  });

  // Add security scheme
  const doc = builder.build();
  doc.components.securitySchemes = {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Firebase ID token',
    },
  };

  return builder.toYAML();
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('🔧 Generating OpenAPI documentation...\n');

  // Ensure output directory exists
  const outputDir = join(process.cwd(), 'docs', 'api');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate YAML
  const yaml = buildOpenAPIDocument();

  // Write to file
  const outputPath = join(outputDir, 'openapi.yaml');
  writeFileSync(outputPath, yaml, 'utf-8');

  console.log(`✅ OpenAPI documentation generated: ${outputPath}`);
  console.log('\nYou can view this in:');
  console.log('  - Swagger Editor: https://editor.swagger.io/');
  console.log('  - Redoc: https://redocly.github.io/redoc/');
  console.log('  - VS Code OpenAPI extension');
}

main();
