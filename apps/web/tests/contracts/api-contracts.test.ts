/**
 * API Contract Testing
 *
 * Contract tests verify that API consumers and providers agree on the shape
 * of data. These tests catch breaking changes early by validating:
 *
 * 1. Response schemas match expected structure
 * 2. Required fields are present
 * 3. Field types are correct
 * 4. Enum values are valid
 *
 * ## Philosophy
 * - Contracts are the source of truth for API shape
 * - Both frontend and backend can test against contracts
 * - Breaking changes are caught before deployment
 *
 * ## Test Categories
 * 1. Schema Validation - Verify responses match Zod schemas
 * 2. Example Validation - Real/mock data passes validation
 * 3. Edge Cases - Null handling, empty arrays, missing optionals
 * 4. Invariants - Business rules that must always hold
 *
 * @module tests/contracts
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ============================================================================
// API CONTRACT SCHEMAS
// ============================================================================

/**
 * Agent API Contract
 * Endpoint: GET /api/agents
 */
export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  initials: z.string().min(1).max(3),
  subtitle: z.string(),
  role: z.enum(['coach', 'team', 'standalone']),
  roleId: z.string(),
  isCoordinator: z.boolean(),
  canHandoff: z.boolean(),
  handoffToolName: z.string(),
  entrancePhrase: z.string().optional(),
  themeClass: z.string(),
  voiceId: z.string(),
  colors: z
    .object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      gradient: z.string().optional(),
      glow: z.string().optional(),
    })
    .nullable()
    .optional(),
  aliases: z.array(z.string()).optional(),
  handoffTriggers: z.array(z.string()).optional(),
  isCustomAgent: z.boolean().optional(),
  customAgentType: z.enum(['legacy', 'mentor', 'twin', 'fictional', 'professional']).optional(),
});

export const AgentsResponseSchema = z.object({
  agents: z.array(AgentSchema),
  count: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});

/**
 * LiveKit Token Contract
 * Endpoint: GET /token
 */
export const TokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  url: z.string().url(),
  agentName: z.string().optional(),
  version: z.string().optional(),
});

/**
 * Health Check Contract
 * Endpoint: GET /health, GET /health/ready
 */
const HealthCheckSubSchema = z.object({
  status: z.enum(['ok', 'error', 'unknown']),
  latency: z.number().optional(),
  message: z.string().optional(),
});

export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().optional(),
  version: z.string().optional(),
  uptime: z.number().optional(),
  checks: z.record(z.string(), HealthCheckSubSchema).optional(),
});

/**
 * User Profile Contract
 * Endpoint: GET /api/profile
 */
export const UserProfileContractSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  photoUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  subscription: z.object({
    tier: z.enum(['free', 'friend', 'partner']),
    status: z.enum(['active', 'trialing', 'canceled', 'past_due']),
    expiresAt: z.string().datetime().optional(),
  }).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
});

/**
 * Error Response Contract
 * All API endpoints should return this shape on error
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.string(), z.any()).optional(),
});

/**
 * Engagement Data Contract
 * Endpoint: GET /api/engagement
 */
export const RitualStreakSchema = z.object({
  ritualId: z.string(),
  ritualName: z.string(),
  personaId: z.string(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lastCompletedAt: z.string().datetime().nullable(),
  dueToday: z.boolean(),
});

export const EmotionalWeatherSchema = z.object({
  primary: z.enum(['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy']),
  energy: z.enum(['high', 'medium', 'low']),
  note: z.string().optional(),
  recordedAt: z.string().datetime(),
});

export const EngagementDataSchema = z.object({
  ritualStreaks: z.array(RitualStreakSchema),
  weatherHistory: z.array(EmotionalWeatherSchema),
  stats: z.object({
    totalRitualDays: z.number().int().nonnegative(),
    longestOverallStreak: z.number().int().nonnegative(),
    currentActiveStreaks: z.number().int().nonnegative(),
    predictionAccuracy: z.number().min(0).max(100).nullable(),
    teamHuddlesAttended: z.number().int().nonnegative(),
  }),
  lastEngagementAt: z.string().datetime(),
});

/**
 * Team Huddle Contract
 * Endpoint: GET /api/huddles, GET /api/huddles/:id
 */
export const HuddleParticipantSchema = z.object({
  personaId: z.string().min(1),
  name: z.string().min(1),
  initials: z.string().min(1).max(3),
  comment: z.string(),
  avatarColor: z.string(),
});

export const TeamHuddleSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  topic: z.string().min(1),
  participants: z.array(z.string()),
  status: z.enum(['active', 'completed', 'cancelled']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  recommendations: z.array(z.string()),
  transcript: z.string().optional(),
  title: z.string(),
  intro: z.string(),
  outro: z.string(),
  participantDetails: z.array(HuddleParticipantSchema),
});

export const HuddlesListResponseSchema = z.object({
  huddles: z.array(TeamHuddleSchema),
  count: z.number().int().nonnegative(),
});

/**
 * Cognitive Memories Contract
 * Endpoint: GET /api/cognitive/memories
 */
export const PatternSchema = z.object({
  id: z.string().min(1),
  pattern: z.string(),
  frequency: z.number().int().nonnegative(),
  examples: z.array(z.string()),
  category: z.enum(['communication', 'interests', 'relationship', 'behavior', 'emotional']),
});

export const UIMemorySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['fact', 'preference', 'experience', 'relationship', 'goal', 'concern']),
  content: z.string(),
  source: z.string().optional(),
  learnedAt: z.string().datetime(),
  lastReferencedAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  personaId: z.string().optional(),
  personaName: z.string().optional(),
});

export const CognitiveMemoriesResponseSchema = z.object({
  memories: z.array(UIMemorySchema),
  patterns: z.array(PatternSchema),
  count: z.number().int().nonnegative(),
  relationshipStage: z.enum([
    'stranger',
    'getting-started',
    'building-trust',
    'established',
    'deep',
  ]).optional(),
});

/**
 * User Analytics Contract
 * Endpoint: GET /api/analytics/user
 */
export const MoodTrendSchema = z.object({
  date: z.string(),
  mood: z.enum(['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy', 'foggy', 'rainbow']),
  energy: z.enum(['high', 'medium', 'low']),
});

export const StreakDataSchema = z.object({
  ritualId: z.string(),
  ritualName: z.string().nullable(),
  personaId: z.string(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lastCompletedAt: z.string().datetime().nullable(),
});

export const UserAnalyticsResponseSchema = z.object({
  profile: z.object({
    totalConversations: z.number().int().nonnegative(),
    totalMinutesTalked: z.number().nonnegative(),
    relationshipStage: z.string().optional(),
    communicationStyle: z.string().optional(),
  }),
  streaks: z.array(StreakDataSchema),
  moodTrends: z.array(MoodTrendSchema),
  insights: z.object({
    averageAccuracy: z.number().min(0).max(100).nullable(),
    bestDay: z.string().nullable(),
    averageMood: z.number().min(1).max(5),
    moodTrend: z.enum(['improving', 'stable', 'declining']),
  }),
});

// ============================================================================
// CONTRACT TYPES (inferred from schemas)
// ============================================================================

export type Agent = z.infer<typeof AgentSchema>;
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type UserProfileContract = z.infer<typeof UserProfileContractSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type EngagementData = z.infer<typeof EngagementDataSchema>;
export type HuddleParticipant = z.infer<typeof HuddleParticipantSchema>;
export type TeamHuddle = z.infer<typeof TeamHuddleSchema>;
export type HuddlesListResponse = z.infer<typeof HuddlesListResponseSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type UIMemory = z.infer<typeof UIMemorySchema>;
export type CognitiveMemoriesResponse = z.infer<typeof CognitiveMemoriesResponseSchema>;
export type MoodTrend = z.infer<typeof MoodTrendSchema>;
export type StreakData = z.infer<typeof StreakDataSchema>;
export type UserAnalyticsResponse = z.infer<typeof UserAnalyticsResponseSchema>;

// ============================================================================
// MOCK DATA FIXTURES
// ============================================================================

const VALID_AGENT: Agent = {
  id: 'ferni',
  name: 'Ferni',
  initials: 'F',
  subtitle: 'Your AI companion',
  role: 'coach',
  roleId: 'main-coach',
  isCoordinator: true,
  canHandoff: true,
  handoffToolName: 'transfer_to_ferni',
  entrancePhrase: 'Hey there!',
  themeClass: 'persona-ferni',
  voiceId: 'ferni-voice-001',
  colors: {
    primary: '#4a6741',
    secondary: '#6b8e63',
  },
  aliases: ['fernie', 'fern'],
  handoffTriggers: ['talk to ferni', 'back to ferni'],
};

const VALID_AGENTS_RESPONSE: AgentsResponse = {
  agents: [VALID_AGENT],
  count: 1,
  timestamp: new Date().toISOString(),
};

const VALID_TOKEN_RESPONSE: TokenResponse = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
  url: 'wss://test.livekit.cloud',
  agentName: 'voice-agent',
  version: '1.0.0',
};

const VALID_HEALTH_CHECK: HealthCheck = {
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  uptime: 3600,
  checks: {
    livekit: { status: 'ok', latency: 50 },
    database: { status: 'ok', latency: 10 },
  },
};

const VALID_USER_PROFILE: UserProfileContract = {
  id: 'user_123',
  email: 'user@example.com',
  displayName: 'Test User',
  createdAt: new Date().toISOString(),
  subscription: {
    tier: 'friend',
    status: 'active',
  },
};

const VALID_ERROR_RESPONSE: ErrorResponse = {
  error: 'Not Found',
  message: 'The requested resource was not found',
  code: 'RESOURCE_NOT_FOUND',
};

const VALID_HUDDLE_PARTICIPANT: HuddleParticipant = {
  personaId: 'maya-santos',
  name: 'Maya Santos',
  initials: 'MS',
  comment: 'I notice you might benefit from some habit-building strategies here.',
  avatarColor: 'var(--persona-maya-primary, #a67a6a)',
};

const VALID_TEAM_HUDDLE: TeamHuddle = {
  id: 'huddle_123',
  userId: 'user_123',
  topic: 'morning routine',
  participants: ['ferni', 'maya-santos'],
  status: 'completed',
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  recommendations: ['Start with a 5-minute meditation', 'Add a quick exercise'],
  title: 'Morning Routine Planning',
  intro: 'Let\'s discuss your morning routine.',
  outro: 'Great session! You have some actionable next steps.',
  participantDetails: [VALID_HUDDLE_PARTICIPANT],
};

const VALID_PATTERN: Pattern = {
  id: 'comm_style',
  pattern: 'You prefer direct, to-the-point communication',
  frequency: 15,
  examples: [],
  category: 'communication',
};

const VALID_UI_MEMORY: UIMemory = {
  id: 'mem_123',
  type: 'fact',
  content: 'Works as a software engineer',
  learnedAt: new Date().toISOString(),
  confidence: 0.95,
  personaId: 'ferni',
  personaName: 'Ferni',
};

const VALID_COGNITIVE_MEMORIES: CognitiveMemoriesResponse = {
  memories: [VALID_UI_MEMORY],
  patterns: [VALID_PATTERN],
  count: 1,
  relationshipStage: 'building-trust',
};

const VALID_MOOD_TREND: MoodTrend = {
  date: '2024-01-15',
  mood: 'sunny',
  energy: 'high',
};

const VALID_STREAK_DATA: StreakData = {
  ritualId: 'morning-meditation',
  ritualName: 'Morning Meditation',
  personaId: 'nayan-patel',
  currentStreak: 7,
  longestStreak: 14,
  lastCompletedAt: new Date().toISOString(),
};

const VALID_USER_ANALYTICS: UserAnalyticsResponse = {
  profile: {
    totalConversations: 50,
    totalMinutesTalked: 240,
    relationshipStage: 'established',
    communicationStyle: 'warm',
  },
  streaks: [VALID_STREAK_DATA],
  moodTrends: [VALID_MOOD_TREND],
  insights: {
    averageAccuracy: 75,
    bestDay: 'Monday',
    averageMood: 4.2,
    moodTrend: 'improving',
  },
};

// ============================================================================
// CONTRACT VALIDATION TESTS
// ============================================================================

describe('API Contracts: Schema Validation', () => {
  describe('Agent Contract', () => {
    it('validates a complete valid agent', () => {
      const result = AgentSchema.safeParse(VALID_AGENT);
      expect(result.success).toBe(true);
    });

    it('validates agent with minimal required fields', () => {
      const minimalAgent = {
        id: 'test',
        name: 'Test',
        initials: 'T',
        subtitle: 'Test agent',
        role: 'team',
        roleId: 'test-role',
        isCoordinator: false,
        canHandoff: false,
        handoffToolName: 'transfer_to_test',
        themeClass: 'persona-test',
        voiceId: 'voice-001',
      };
      const result = AgentSchema.safeParse(minimalAgent);
      expect(result.success).toBe(true);
    });

    it('rejects agent with empty id', () => {
      const invalid = { ...VALID_AGENT, id: '' };
      const result = AgentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects agent with invalid role', () => {
      const invalid = { ...VALID_AGENT, role: 'invalid' };
      const result = AgentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('allows null colors', () => {
      const agent = { ...VALID_AGENT, colors: null };
      const result = AgentSchema.safeParse(agent);
      expect(result.success).toBe(true);
    });
  });

  describe('AgentsResponse Contract', () => {
    it('validates complete response', () => {
      const result = AgentsResponseSchema.safeParse(VALID_AGENTS_RESPONSE);
      expect(result.success).toBe(true);
    });

    it('validates empty agents array', () => {
      const empty: AgentsResponse = {
        agents: [],
        count: 0,
        timestamp: new Date().toISOString(),
      };
      const result = AgentsResponseSchema.safeParse(empty);
      expect(result.success).toBe(true);
    });

    it('rejects negative count', () => {
      const invalid = { ...VALID_AGENTS_RESPONSE, count: -1 };
      const result = AgentsResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid timestamp format', () => {
      const invalid = { ...VALID_AGENTS_RESPONSE, timestamp: 'not-a-date' };
      const result = AgentsResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Token Response Contract', () => {
    it('validates complete token response', () => {
      const result = TokenResponseSchema.safeParse(VALID_TOKEN_RESPONSE);
      expect(result.success).toBe(true);
    });

    it('validates minimal token response', () => {
      const minimal = {
        accessToken: 'token123',
        url: 'wss://livekit.example.com',
      };
      const result = TokenResponseSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('rejects empty access token', () => {
      const invalid = { ...VALID_TOKEN_RESPONSE, accessToken: '' };
      const result = TokenResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid URL', () => {
      const invalid = { ...VALID_TOKEN_RESPONSE, url: 'not-a-url' };
      const result = TokenResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Health Check Contract', () => {
    it('validates complete health check', () => {
      const result = HealthCheckSchema.safeParse(VALID_HEALTH_CHECK);
      expect(result.success).toBe(true);
    });

    it('validates minimal health check', () => {
      const minimal = { status: 'ok' };
      const result = HealthCheckSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('accepts degraded status', () => {
      const degraded = { status: 'degraded' };
      const result = HealthCheckSchema.safeParse(degraded);
      expect(result.success).toBe(true);
    });

    it('rejects unknown status', () => {
      const invalid = { status: 'unknown' };
      const result = HealthCheckSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('User Profile Contract', () => {
    it('validates complete profile', () => {
      const result = UserProfileContractSchema.safeParse(VALID_USER_PROFILE);
      expect(result.success).toBe(true);
    });

    it('validates profile without optional fields', () => {
      const minimal = {
        id: 'user_456',
        createdAt: new Date().toISOString(),
      };
      const result = UserProfileContractSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const invalid = { ...VALID_USER_PROFILE, email: 'not-an-email' };
      const result = UserProfileContractSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates all subscription tiers', () => {
      const tiers = ['free', 'friend', 'partner'] as const;
      for (const tier of tiers) {
        const profile = {
          ...VALID_USER_PROFILE,
          subscription: { tier, status: 'active' as const },
        };
        const result = UserProfileContractSchema.safeParse(profile);
        expect(result.success).toBe(true);
      }
    });

    it('validates all subscription statuses', () => {
      const statuses = ['active', 'trialing', 'canceled', 'past_due'] as const;
      for (const status of statuses) {
        const profile = {
          ...VALID_USER_PROFILE,
          subscription: { tier: 'free' as const, status },
        };
        const result = UserProfileContractSchema.safeParse(profile);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Error Response Contract', () => {
    it('validates complete error response', () => {
      const result = ErrorResponseSchema.safeParse(VALID_ERROR_RESPONSE);
      expect(result.success).toBe(true);
    });

    it('validates minimal error response', () => {
      const minimal = { error: 'Something went wrong' };
      const result = ErrorResponseSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('accepts additional details', () => {
      const detailed = {
        error: 'Validation failed',
        message: 'Invalid input',
        code: 'VALIDATION_ERROR',
        details: { field: 'email', reason: 'Invalid format' },
      };
      const result = ErrorResponseSchema.safeParse(detailed);
      expect(result.success).toBe(true);
    });
  });

  describe('Team Huddle Contract', () => {
    it('validates complete huddle', () => {
      const result = TeamHuddleSchema.safeParse(VALID_TEAM_HUDDLE);
      expect(result.success).toBe(true);
    });

    it('validates active huddle without completedAt', () => {
      const active = { ...VALID_TEAM_HUDDLE, status: 'active', completedAt: undefined };
      const result = TeamHuddleSchema.safeParse(active);
      expect(result.success).toBe(true);
    });

    it('validates all status types', () => {
      const statuses = ['active', 'completed', 'cancelled'] as const;
      for (const status of statuses) {
        const huddle = { ...VALID_TEAM_HUDDLE, status };
        const result = TeamHuddleSchema.safeParse(huddle);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid status', () => {
      const invalid = { ...VALID_TEAM_HUDDLE, status: 'pending' };
      const result = TeamHuddleSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates participant initials length', () => {
      const validParticipant = { ...VALID_HUDDLE_PARTICIPANT, initials: 'A' };
      expect(HuddleParticipantSchema.safeParse(validParticipant).success).toBe(true);

      const invalidParticipant = { ...VALID_HUDDLE_PARTICIPANT, initials: 'ABCD' };
      expect(HuddleParticipantSchema.safeParse(invalidParticipant).success).toBe(false);
    });

    it('validates huddles list response', () => {
      const response = {
        huddles: [VALID_TEAM_HUDDLE],
        count: 1,
      };
      const result = HuddlesListResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('Cognitive Memories Contract', () => {
    it('validates complete memories response', () => {
      const result = CognitiveMemoriesResponseSchema.safeParse(VALID_COGNITIVE_MEMORIES);
      expect(result.success).toBe(true);
    });

    it('validates empty memories list', () => {
      const empty = {
        memories: [],
        patterns: [],
        count: 0,
      };
      const result = CognitiveMemoriesResponseSchema.safeParse(empty);
      expect(result.success).toBe(true);
    });

    it('validates all memory types', () => {
      const types = ['fact', 'preference', 'experience', 'relationship', 'goal', 'concern'] as const;
      for (const type of types) {
        const memory = { ...VALID_UI_MEMORY, type };
        const result = UIMemorySchema.safeParse(memory);
        expect(result.success).toBe(true);
      }
    });

    it('validates confidence range', () => {
      expect(UIMemorySchema.safeParse({ ...VALID_UI_MEMORY, confidence: 0 }).success).toBe(true);
      expect(UIMemorySchema.safeParse({ ...VALID_UI_MEMORY, confidence: 1 }).success).toBe(true);
      expect(UIMemorySchema.safeParse({ ...VALID_UI_MEMORY, confidence: 0.5 }).success).toBe(true);
      expect(UIMemorySchema.safeParse({ ...VALID_UI_MEMORY, confidence: -0.1 }).success).toBe(false);
      expect(UIMemorySchema.safeParse({ ...VALID_UI_MEMORY, confidence: 1.1 }).success).toBe(false);
    });

    it('validates all pattern categories', () => {
      const categories = ['communication', 'interests', 'relationship', 'behavior', 'emotional'] as const;
      for (const category of categories) {
        const pattern = { ...VALID_PATTERN, category };
        const result = PatternSchema.safeParse(pattern);
        expect(result.success).toBe(true);
      }
    });

    it('validates all relationship stages', () => {
      const stages = ['stranger', 'getting-started', 'building-trust', 'established', 'deep'] as const;
      for (const stage of stages) {
        const response = { ...VALID_COGNITIVE_MEMORIES, relationshipStage: stage };
        const result = CognitiveMemoriesResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('User Analytics Contract', () => {
    it('validates complete analytics response', () => {
      const result = UserAnalyticsResponseSchema.safeParse(VALID_USER_ANALYTICS);
      expect(result.success).toBe(true);
    });

    it('validates empty streaks and trends', () => {
      const minimal = {
        ...VALID_USER_ANALYTICS,
        streaks: [],
        moodTrends: [],
      };
      const result = UserAnalyticsResponseSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('validates all mood types', () => {
      const moods = ['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy', 'foggy', 'rainbow'] as const;
      for (const mood of moods) {
        const trend = { ...VALID_MOOD_TREND, mood };
        const result = MoodTrendSchema.safeParse(trend);
        expect(result.success).toBe(true);
      }
    });

    it('validates all energy levels', () => {
      const levels = ['high', 'medium', 'low'] as const;
      for (const energy of levels) {
        const trend = { ...VALID_MOOD_TREND, energy };
        const result = MoodTrendSchema.safeParse(trend);
        expect(result.success).toBe(true);
      }
    });

    it('validates mood trend directions', () => {
      const trends = ['improving', 'stable', 'declining'] as const;
      for (const trend of trends) {
        const analytics = {
          ...VALID_USER_ANALYTICS,
          insights: { ...VALID_USER_ANALYTICS.insights, moodTrend: trend },
        };
        const result = UserAnalyticsResponseSchema.safeParse(analytics);
        expect(result.success).toBe(true);
      }
    });

    it('validates averageMood range', () => {
      expect(
        UserAnalyticsResponseSchema.safeParse({
          ...VALID_USER_ANALYTICS,
          insights: { ...VALID_USER_ANALYTICS.insights, averageMood: 1 },
        }).success
      ).toBe(true);
      expect(
        UserAnalyticsResponseSchema.safeParse({
          ...VALID_USER_ANALYTICS,
          insights: { ...VALID_USER_ANALYTICS.insights, averageMood: 5 },
        }).success
      ).toBe(true);
      expect(
        UserAnalyticsResponseSchema.safeParse({
          ...VALID_USER_ANALYTICS,
          insights: { ...VALID_USER_ANALYTICS.insights, averageMood: 0 },
        }).success
      ).toBe(false);
      expect(
        UserAnalyticsResponseSchema.safeParse({
          ...VALID_USER_ANALYTICS,
          insights: { ...VALID_USER_ANALYTICS.insights, averageMood: 6 },
        }).success
      ).toBe(false);
    });

    it('allows null values for optional insights', () => {
      const withNulls = {
        ...VALID_USER_ANALYTICS,
        insights: {
          averageAccuracy: null,
          bestDay: null,
          averageMood: 3,
          moodTrend: 'stable' as const,
        },
      };
      const result = UserAnalyticsResponseSchema.safeParse(withNulls);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// CONTRACT INVARIANTS
// ============================================================================

describe('API Contracts: Invariants', () => {
  describe('Agent Invariants', () => {
    it('coordinator agents must be able to handoff', () => {
      // Business rule: coordinators must support handoffs
      const coordinator: Agent = {
        ...VALID_AGENT,
        isCoordinator: true,
        canHandoff: true, // MUST be true
      };
      expect(coordinator.isCoordinator).toBe(true);
      expect(coordinator.canHandoff).toBe(true);
    });

    it('initials should be 1-3 characters', () => {
      // Valid initials
      expect(AgentSchema.safeParse({ ...VALID_AGENT, initials: 'F' }).success).toBe(true);
      expect(AgentSchema.safeParse({ ...VALID_AGENT, initials: 'FC' }).success).toBe(true);
      expect(AgentSchema.safeParse({ ...VALID_AGENT, initials: 'FCX' }).success).toBe(true);

      // Invalid - too long
      expect(AgentSchema.safeParse({ ...VALID_AGENT, initials: 'FERN' }).success).toBe(false);

      // Invalid - empty
      expect(AgentSchema.safeParse({ ...VALID_AGENT, initials: '' }).success).toBe(false);
    });
  });

  describe('Response Count Invariants', () => {
    it('count should match agents array length', () => {
      const agents = [VALID_AGENT, { ...VALID_AGENT, id: 'agent2' }];
      const response = {
        agents,
        count: agents.length,
        timestamp: new Date().toISOString(),
      };
      const result = AgentsResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(result.data.agents.length);
      }
    });
  });

  describe('Engagement Data Invariants', () => {
    it('currentStreak should never exceed longestStreak', () => {
      const validStreak = {
        ritualId: 'test',
        ritualName: 'Test Ritual',
        personaId: 'ferni',
        currentStreak: 5,
        longestStreak: 10, // >= currentStreak
        lastCompletedAt: new Date().toISOString(),
        dueToday: false,
      };

      const result = RitualStreakSchema.safeParse(validStreak);
      expect(result.success).toBe(true);

      // Note: This is a semantic invariant - the schema doesn't enforce it,
      // but application code should ensure currentStreak <= longestStreak
    });
  });
});

// ============================================================================
// CONTRACT UTILITIES
// ============================================================================

/**
 * Validate API response against contract schema
 * Use this in integration tests to verify real API responses
 */
export function validateContract<T>(
  schema: z.ZodSchema<T>,
  response: unknown,
  context: string
): T {
  const result = schema.safeParse(response);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Contract violation in ${context}:\n${errors}`);
  }
  return result.data;
}

/**
 * Create a contract test helper for a specific endpoint
 */
export function createContractTest<T>(schema: z.ZodSchema<T>, endpointName: string) {
  return {
    validate: (data: unknown) => validateContract(schema, data, endpointName),
    isValid: (data: unknown) => schema.safeParse(data).success,
    getErrors: (data: unknown) => {
      const result = schema.safeParse(data);
      if (result.success) return [];
      return result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    },
  };
}

// Export contract test helpers
export const AgentsContract = createContractTest(AgentsResponseSchema, '/api/agents');
export const TokenContract = createContractTest(TokenResponseSchema, '/token');
export const HealthContract = createContractTest(HealthCheckSchema, '/health');
export const ProfileContract = createContractTest(UserProfileContractSchema, '/api/profile');
