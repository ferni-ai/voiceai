/**
 * The voice agent isn't offered LinkedIn while LinkedIn is switched off.
 *
 * Goes through the REAL loading path: the registry's marketing domain loader
 * (autoRegisterAllDomains → loadToolDomainsLazy), then buildToolSet the way
 * buildAgentTools does for Alex's manifest (marketing domain + postToLinkedIn
 * listed as optional). The semantic router's capability gate is the real one.
 * Each case loads a fresh registry, so the switch is read at load time.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function setSwitch(on: boolean): void {
  vi.stubEnv('LINKEDIN_ENABLED', on ? 'true' : '');
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'li-id');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'li-secret');
}

/** Tool ids the registry hands the model for Alex's marketing tools. */
async function marketingToolIds(): Promise<{ registered: string[]; built: string[] }> {
  const { autoRegisterAllDomains, loadToolDomainsLazy } =
    await import('../../../registry/loader.js');
  const { toolRegistry } = await import('../../../registry/index.js');
  const { EnvironmentServiceRegistry } = await import('../../../registry/types.js');
  await autoRegisterAllDomains();
  await loadToolDomainsLazy(['marketing']);
  const registered = toolRegistry.getByDomain('marketing').map((d) => d.id);
  const { tools } = toolRegistry.buildToolSet(
    { domains: ['marketing'], optional: ['postToLinkedIn'] },
    {
      userId: 'u1',
      agentId: 'alex-chen',
      agentDisplayName: 'Alex',
      services: new EnvironmentServiceRegistry(),
    }
  );
  return { registered, built: Object.keys(tools) };
}

describe('LinkedIn tools for the voice agent', () => {
  it('switched off: no LinkedIn tool is registered or built', async () => {
    setSwitch(false);
    const { registered, built } = await marketingToolIds();
    expect(registered).toContain('postToTwitter'); // the domain did load
    expect(registered.filter((id) => /linkedin/i.test(id))).toEqual([]);
    expect(built.filter((id) => /linkedin/i.test(id))).toEqual([]);
  });

  it('switched on: postToLinkedIn is offered as today', async () => {
    setSwitch(true);
    const { registered, built } = await marketingToolIds();
    expect(registered).toContain('postToLinkedIn');
    expect(built).toContain('postToLinkedIn');
  });

  it('semantic router: "post to linkedin" is unavailable only while off', async () => {
    setSwitch(false);
    let checker = await import('../../../semantic-router/capability-checker.js');
    expect(checker.isToolAvailable('marketing_post_linkedin')).toBe(false);
    expect(checker.getUnavailabilityReason('marketing_post_linkedin')).toBe(
      "LinkedIn isn't available right now"
    );
    expect(checker.isToolAvailable('marketing_post_twitter')).toBe(true);

    setSwitch(true);
    vi.resetModules();
    checker = await import('../../../semantic-router/capability-checker.js');
    expect(checker.isToolAvailable('marketing_post_linkedin')).toBe(true);
  });
});
