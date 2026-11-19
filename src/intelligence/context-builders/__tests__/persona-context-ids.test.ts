/**
 * Context builders key on the canonical persona ids (personas/persona-ids).
 *
 * Persona memory mapped 'nayan-patel' to the
 * Bogle memories (index-fund callbacks for Nayan) while 'john-bogle' got none.
 * Domain fluency mapped 'peter-chen' / 'jordan-rivers' / 'nayan-kumar', so
 * Peter, Jordan and Nayan fell back to Ferni's fluencies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { createLogger: vi.fn(() => logger), getLogger: vi.fn(() => logger) };
});

const getFerniMemories = vi.fn();
const getBogleMemories = vi.fn();
vi.mock('../../../services/memory/persona-memories.js', () => ({
  getFerniMemories: (...a: unknown[]) => getFerniMemories(...a),
  getBogleMemories: (...a: unknown[]) => getBogleMemories(...a),
  getPeterMemories: async () => [],
  getMayaMemories: async () => [],
  getJordanMemories: async () => [],
  getAlexMemories: async () => [],
  getImportantDates: async () => [],
  getWatchlist: async () => [],
}));

import { CANONICAL_IDS } from '../../../personas/persona-ids.js';
import { normalizePersonaId } from '../personas/persona-memory.js';
import type { ContextBuilderInput } from '../index.js';

describe('persona memory by canonical persona id', () => {
  const input = (personaId: string): ContextBuilderInput =>
    ({
      services: { personaId },
      userProfile: { id: 'u1', relationshipStage: 'trusted_advisor' },
      userData: { turnCount: 0, name: 'Sam' },
    }) as unknown as ContextBuilderInput;

  beforeEach(() => {
    vi.clearAllMocks();
    getBogleMemories.mockResolvedValue([
      { id: 'f1', type: 'fund', name: 'Total Stock Market', ticker: 'VTSAX', tags: [] },
    ]);
    getFerniMemories.mockResolvedValue([
      { id: 'w1', type: 'win', name: 'finished the half marathon', tags: [] },
      { id: 't1', type: 'topic', name: 'moving closer to family', tags: [] },
      { id: 'j1', type: 'inside_joke', name: 'the haunted toaster', tags: [] },
    ]);
  });

  it('maps the canonical ids to their own memories', () => {
    expect(normalizePersonaId(CANONICAL_IDS.SAGE)).toBe('nayan');
    expect(normalizePersonaId(CANONICAL_IDS.JOHN_BOGLE)).toBe('bogle');
    expect(normalizePersonaId(CANONICAL_IDS.BUDGETER)).toBe('maya');
    expect(normalizePersonaId(CANONICAL_IDS.COMMUNICATOR)).toBe('alex');
  });
});
