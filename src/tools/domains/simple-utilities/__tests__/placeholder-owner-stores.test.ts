/**
 * #2651: no tool store is keyed by a shared placeholder id. With a missing,
 * stringified-missing, guest or unknown caller id, the reminder tools save and
 * list under this session's own anon: id, the device lookup, capability
 * analytics and language preference refuse the shared bucket, and the legacy
 * tool path builds both tool sets for one caller id. Only Firestore is faked:
 * it records every bogle_users doc id that is read or written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const docIds = vi.hoisted(() => [] as string[]);
const fakeDb = vi.hoisted(() => {
  const leaf = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {};
    node.collection = () => node;
    node.doc = () => node;
    node.where = () => node;
    node.get = async () => ({ docs: [], exists: false, data: () => undefined });
    node.set = async () => undefined;
    return node;
  };
  return {
    collection: (name: string) => ({
      doc: (id: string) => {
        if (name === 'bogle_users') docIds.push(id);
        return leaf();
      },
    }),
  };
});
vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ getDatabase: async () => fakeDb }),
}));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeDb,
}));
const scheduled = vi.hoisted(() => [] as Array<{ userId: string; deliveryAddress: string }>);
vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createReminder: vi.fn(async (params: { userId: string; deliveryAddress: string }) => {
    scheduled.push(params);
    return { id: 'rem-1', ...params };
  }),
}));
const built = vi.hoisted(() => [] as Array<{ set: string; userId: unknown }>);
vi.mock('../../../builder.js', () => ({
  buildAgentTools: vi.fn(async (_persona: string, o: { userId: unknown }) => {
    built.push({ set: 'persona', userId: o.userId });
    return {};
  }),
  buildEssentialTools: vi.fn(async (o: { userId: unknown }) => {
    built.push({ set: 'essential', userId: o.userId });
    return {};
  }),
}));

const { advancedReminderDefinitions } = await import('../advanced-reminders.js');
const { deviceToolDefinitions } = await import('../device-tools.js');
const { shortcutsToolDefinitions } = await import('../shortcuts-tools.js');
const { languageService } = await import('../../../../services/language/index.js');
const { getToolsForAgent } = await import('../../../orchestrator/voice-agent-integration.js');

const PLACEHOLDERS = [undefined, null, '', 'anon', 'guest', 'unknown', 'undefined', 'null'];
type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

/** The tool as one call's session sees it: the shared build ctx, the call's own session object. */
function tool(
  defs: Array<{ id: string; create: (ctx: never) => unknown }>,
  id: string,
  userId: unknown
) {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const created = def.create({
    userId,
    sessionId: undefined,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  } as never);
  const session = {};
  return (args: Record<string, unknown>) =>
    (created as Exec).execute(args, { ctx: { session, userData: { userId } } });
}

/** Written out here, not read from PLACEHOLDER_IDS, so narrowing that set can't pass this test. */
const SHARED = new Set([
  '',
  'anon',
  'anon:',
  'anonymous',
  'guest',
  'unknown',
  'undefined',
  'null',
  'default',
]);
const sharedIds = (): string[] => docIds.filter((id) => SHARED.has(id.trim().toLowerCase()));

describe.each(PLACEHOLDERS.map((id) => [JSON.stringify(id) ?? 'undefined', id] as const))(
  'caller id %s',
  (_name, id) => {
    beforeEach(() => {
      docIds.length = 0;
      scheduled.length = 0;
      built.length = 0;
    });

    it('location reminders: saved under this session only, never read back by another', async () => {
      await tool(
        advancedReminderDefinitions,
        'locationReminder',
        id
      )({
        message: 'water the ferns',
        locationName: 'home',
        triggerOn: 'arrive',
      });
      const other = await tool(advancedReminderDefinitions, 'listLocationReminders', id)({});

      expect(sharedIds()).toEqual([]);
      expect(docIds.length).toBeGreaterThan(0);
      expect(docIds.every((d) => d.startsWith('anon:'))).toBe(true);
      expect(other).not.toContain('water the ferns');
    });

    it('recurring reminder: the scheduled reminder is not for the shared bucket', async () => {
      await tool(
        advancedReminderDefinitions,
        'recurringReminder',
        id
      )({
        message: 'stretch',
        pattern: 'daily',
        time: '8am',
      });
      expect(sharedIds()).toEqual([]);
      expect(scheduled[0]?.userId).toMatch(/^anon:./);
      expect(scheduled[0]?.deliveryAddress).toBe(`voice:${scheduled[0]?.userId}`);
    });

    it('device lookup, analytics and language refuse the shared doc', async () => {
      await tool(deviceToolDefinitions, 'listDevices', id)({});
      await tool(shortcutsToolDefinitions, 'quickTimer', id)({ duration: '1 second' });
      await new Promise((resolve) => setTimeout(resolve, 20)); // persistAnalytics is fire-and-forget
      await languageService().setLanguage(String(id), 'spanish');
      await languageService().getCurrentLanguage(String(id));
      expect(sharedIds()).toEqual([]);
    });

    it('legacy tool path: both tool sets are built for one non-placeholder caller', async () => {
      await getToolsForAgent({
        persona: { id: 'ferni' },
        userId: id,
        sessionId: `session-AJ_legacy${Math.random().toString(36).slice(2, 6)}-${Date.now()}`,
        useLegacy: true,
      } as never);
      expect(built.map((b) => b.set).sort()).toEqual(['essential', 'persona']);
      expect(built[0]?.userId).toBe(built[1]?.userId);
      expect(String(built[0]?.userId)).toMatch(/^anon:./);
    });
  }
);

describe('a member id is used as given', () => {
  it('saves reminders under the member', async () => {
    docIds.length = 0;
    await tool(
      advancedReminderDefinitions,
      'locationReminder',
      'uid-member-1'
    )({
      message: 'buy bulbs',
      locationName: 'garden shop',
      triggerOn: 'arrive',
    });
    expect(docIds).toContain('uid-member-1');
  });
});
