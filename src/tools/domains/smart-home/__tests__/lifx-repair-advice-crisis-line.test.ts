/**
 * SMART_HOME_LIFX and the repair advice's emergency line.
 *
 * Off, the home domain serves homeRepairAdvice, and for an emergency it tells the caller
 * to call the emergency number for an electrical fire. That number comes from the shared
 * safety source (EMERGENCY_NUMBER), so this test imports it rather than writing it out.
 * On, the domain serves only the two caller-bound light tools and no repair advice at
 * all, as it does on main. Both sides go through the real getToolDefinitions and the real
 * tool, so dropping the line, or writing a different number into it, goes red here, and
 * so does serving repair advice with the flag on before this test says what it must say.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMERGENCY_NUMBER } from '../../../../services/safety/index.js';
import { getToolDefinitions } from '../index.js';

interface AdviceTool {
  execute: (args: unknown, opts: unknown) => Promise<unknown>;
}

const CTX = {
  userId: 'gateway',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as never;

const ELECTRICAL_FIRE_LINE = `- Electrical fire: Call ${EMERGENCY_NUMBER}`;

async function repairAdvice(): Promise<AdviceTool | undefined> {
  const def = (await getToolDefinitions()).find((d) => d.id === 'homeRepairAdvice');
  return def ? (def.create(CTX) as unknown as AdviceTool) : undefined;
}

async function emergencyAdvice(tool: AdviceTool): Promise<string[]> {
  const said = await tool.execute(
    { issue: 'sparks and smoke from the kitchen outlet', urgency: 'emergency' },
    { ctx: { userData: {} } }
  );
  expect(typeof said).toBe('string');
  return String(said).split('\n');
}

afterEach(() => vi.unstubAllEnvs());

describe('SMART_HOME_LIFX off: repair advice keeps its emergency number', () => {
  it('the shared emergency number is a real number, so the line below is not vacuous', () => {
    expect(EMERGENCY_NUMBER).toMatch(/^\d+$/);
  });

  it.each([
    ['empty (the default)', ''],
    ['off', 'off'],
  ])(
    'flag %s: an emergency repair names the shared number for an electrical fire',
    async (_label, value) => {
      vi.stubEnv('SMART_HOME_LIFX', value);

      const tool = await repairAdvice();
      if (!tool) throw new Error('repair advice is not served with SMART_HOME_LIFX off');

      const lines = await emergencyAdvice(tool);
      const fire = lines.filter((l) => /electrical fire/i.test(l));
      expect(fire).toEqual([ELECTRICAL_FIRE_LINE]);
    }
  );
});

describe('SMART_HOME_LIFX on: repair advice is not served', () => {
  it('serves only the light tools, never repair advice without its emergency line', async () => {
    vi.stubEnv('SMART_HOME_LIFX', 'on');

    const ids = (await getToolDefinitions()).map((d) => d.id);
    expect(ids).toEqual(['controlLight', 'listSmartDevices']);
    // Pre-existing on main. A change that serves repair advice with the flag on fails
    // here: add the off-side electrical-fire assertion for the on side before you move it.
    expect(await repairAdvice()).toBeUndefined();
  });
});
