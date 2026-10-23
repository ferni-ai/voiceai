/**
 * The tool-capabilities section lists only the tools the agent really has.
 * It used to tell every agent it had getWeather, searchWeb and getNews (plus
 * two tools that don't exist), whatever it had been given.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const l: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  l.child = () => l;
  return { getLogger: () => l, createLogger: () => l, safeLog: () => l };
});

import { toolCapabilitiesBuilder } from '../tool-awareness.js';
import type { PromptInput as ContextBuilderInput } from '../../core/types.js';

const input = (personaId: string, availableToolNames?: string[]): ContextBuilderInput =>
  ({
    persona: { identity: { id: personaId } },
    userData: { turnCount: 1, availableToolNames },
  }) as unknown as ContextBuilderInput;

async function section(personaId: string, tools?: string[]): Promise<string> {
  const out = await toolCapabilitiesBuilder.build(input(personaId, tools));
  return out.map((i) => i.content).join('\n');
}

describe('tool-capabilities builder', () => {
  it('a teammate without weather, search or news tools is not told it has them', async () => {
    const text = await section('peter-john', [
      'playMusic',
      'recallFromMemory',
      'getCurrentContext',
    ]);
    expect(text).toContain('MUSIC');
    expect(text).toContain('MEMORY');
    expect(text).not.toMatch(/getWeather|searchWeb|getNews/);
    expect(text).not.toMatch(/rememberAboutMe|whatDoYouKnowAboutMe/);
  });

  it('lists weather when the agent really has getWeather', async () => {
    expect(await section('peter-john', ['getWeather'])).toContain('getWeather');
  });

  it('the coordinator is not given handoffs it does not have', async () => {
    const text = await section('ferni', ['playMusic']);
    expect(text).not.toMatch(/handoffToMaya|inviteCameo/);
  });

  it('says nothing when it is not told the tool set', async () => {
    expect(await toolCapabilitiesBuilder.build(input('ferni'))).toEqual([]);
  });
});
