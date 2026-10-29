/**
 * Which tools a caller may run through the chat API: one grant, read by both
 * what the model is offered and what may run.
 *
 * POST /api/chat/tool runs a tool the client names, and POST /api/chat/message
 * runs whatever the model picks from a client-written message and history.
 * Neither goes through the voice agent's flow, so a tool that sends, calls,
 * books, buys or writes to a third party (reachOut, callOnBehalf, sendEmail,
 * the messaging tools) would let any signed-in user, anonymous ones included,
 * text or ring any number directly. Those tools are offered to admins only.
 *
 * Members are offered a short list: reads, plus writes that only touch their
 * own data. Both routes run only a tool in the caller's offered list (the list
 * GET /api/chat/tools returns), so nothing runs that was never offered,
 * including the `executeTool` meta-tool, which unwraps to any tool.
 *
 * The one way past the offered list is an admin's explicit `grant: 'admin'` on
 * POST /api/chat/tool (the tool validator's path). Every admin call is logged
 * with the grant that let it run and the user it acted for.
 *
 * The list is derived from the verified caller on every request, not stored
 * per session, so there is no session id a client could swap or replay.
 *
 * @module api/chat-tool-access
 */
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ChatToolAccess' });

const SELF_SERVICE_TOOLS: ReadonlySet<string> = new Set([
  'recallFromMemory',
  'rememberAboutUser',
  'getUnreadEmails',
  'getCalendarEvents',
  'searchContacts',
  'getWeather',
  'getHabitStreak',
  'trackHabit',
  'playMusic',
  'stopMusic',
]);

/** The verified caller, plus the user a route acts for when an admin names one. */
export interface ChatCaller {
  userId: string;
  isAdmin: boolean;
  actingUserId?: string;
}

/** The tools the model may be offered for this caller: the grant. */
export function offeredChatTools<T extends { name: string }>(tools: T[], isAdmin: boolean): T[] {
  return tools.filter((t) => isAdmin || SELF_SERVICE_TOOLS.has(t.name));
}

/**
 * True, after logging, when this tool may not run: it wasn't offered to this
 * caller and no explicit admin grant covers it. Logs every admin call it allows,
 * at warn when it passes the offered list or acts for someone else.
 */
export function refuseChatTool(
  fn: unknown,
  caller: ChatCaller,
  offered: ReadonlyArray<{ name: string }>,
  requestedGrant?: unknown
): boolean {
  // The executeTool meta-tool hides which tool runs, so no grant covers it.
  const named = typeof fn === 'string' && fn !== 'executeTool';
  const isOffered = named && offered.some((t) => t.name === fn);
  const adminGrant = named && caller.isAdmin && requestedGrant === 'admin';
  const who = { callerId: caller.userId, actingUserId: caller.actingUserId, tool: fn };
  if (!isOffered && !adminGrant) {
    log.warn({ ...who, isAdmin: caller.isAdmin }, 'Refused a chat tool call: not offered');
    return true;
  }
  if (!caller.isAdmin) return false;
  const grant = isOffered ? 'offered' : 'admin';
  const forSomeoneElse = (caller.actingUserId ?? caller.userId) !== caller.userId;
  if (grant === 'admin' || forSomeoneElse) log.warn({ ...who, grant }, 'Admin chat tool call');
  else log.info({ ...who, grant }, 'Admin chat tool call');
  return false;
}
