/**
 * With LANDING_AI off, the landing generators serve their fallback quietly.
 *
 * The Gemini client returns null by design when the flag is off, and the demo
 * and variant generators logged that as "Demo generation failed" / "Failed to
 * generate full variant" (118 warnings in three days of prod logs, 2026-10-18).
 * A real null with the flag on is still a warning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));
const generateJSON = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../gemini-client.js', () => ({ generateJSON }));

import { generateDemoConversation } from '../demo-generator.js';
import {
  generateCTAVariant,
  generateHeadlineVariant,
  generatePersonalizedVariant,
} from '../variant-generator.js';

const VARIANTS = [
  ['headline', generateHeadlineVariant],
  ['cta', generateCTAVariant],
  ['full', generatePersonalizedVariant],
] as const;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('with LANDING_AI off', () => {
  beforeEach(() => vi.stubEnv('LANDING_AI', undefined));

  it.each(VARIANTS)('%s variant returns null without a warning', async (_kind, generate) => {
    expect(await generate({ device: 'mobile' })).toBeNull();
    expect(generateJSON).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('a novel demo serves the fallback without a warning', async () => {
    expect((await generateDemoConversation()).id).toBe('demo_reading_between_lines');
    expect(generateJSON).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('with LANDING_AI on and no result', () => {
  beforeEach(() => vi.stubEnv('LANDING_AI', 'on'));

  it.each(VARIANTS)('%s variant still warns', async (_kind, generate) => {
    expect(await generate({ device: 'mobile' })).toBeNull();
    expect(generateJSON).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('a novel demo still warns', async () => {
    expect((await generateDemoConversation()).id).toBe('demo_reading_between_lines');
    expect(log.warn).toHaveBeenCalledWith('Demo generation failed, using fallback');
  });
});
