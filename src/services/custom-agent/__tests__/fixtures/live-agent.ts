/**
 * A custom agent as Firestore stores it, for the live-call tests
 * (custom-agent-live-prompt.ts, agents/shared/custom-agent-live.ts).
 */
import type { CustomAgent } from '../../../../types/custom-agent-api.js';

export const OWNER_UID = 'uid-owner';
export const AGENT_ID = 'agent_1700000000_abc';
/** A stock catalog voice (custom-agent-voice-catalog.ts). */
export const STOCK_VOICE_ID = '0a9a5903-0a30-4d2e-b6b6-891f73d4b4e0';
export const AGENT_NAME = 'Grandpa Joe';
export const AGENT_DESCRIPTION = 'Retired carpenter from Duluth who whistles while he thinks.';
export const AGENT_MEMORY = 'Built a canoe with his grandson the summer of 1998.';

export function liveAgent(overrides: Partial<CustomAgent> = {}): CustomAgent {
  return {
    id: AGENT_ID,
    userId: OWNER_UID,
    name: AGENT_NAME,
    displayName: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    type: 'legacy',
    status: 'active',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    voice: {
      type: 'selected',
      voiceId: STOCK_VOICE_ID,
      status: 'ready',
      settings: { speed: 0, stability: 0.5, similarityBoost: 0.5 },
    },
    personality: {
      warmth: 0.9,
      humorLevel: 0.6,
      directness: 0.4,
      energy: 0.3,
      formality: 0.2,
      traits: ['patient', 'wry'],
      values: ['family', 'craft'],
    },
    memories: {
      stories: [
        {
          id: 's1',
          type: 'story',
          content: AGENT_MEMORY,
          themes: [],
          emotions: [],
          keywords: [],
          createdAt: new Date('2026-10-01T00:00:00Z'),
          updatedAt: new Date('2026-10-01T00:00:00Z'),
        },
      ],
      wisdom: [],
      sharedMoments: [],
    },
    behaviors: {
      greetings: ['Well hey there'],
      farewells: ['Take it easy'],
      catchphrases: ['Measure twice'],
      responsePatterns: {},
    },
    privacy: 'private',
    ...overrides,
  } as CustomAgent;
}
