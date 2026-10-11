/**
 * Which tools a caller may run through the chat API.
 *
 * POST /api/chat/tool runs a tool the client names, and POST /api/chat/message
 * runs whatever the model picks from a client-written message and history.
 * Neither goes through the voice agent's flow, so a tool that sends, calls,
 * books, buys or writes to a third party (reachOut, callOnBehalf, sendEmail,
 * the messaging tools) would let any signed-in user, anonymous ones included,
 * text or ring any number directly. Those tools are admin-only.
 *
 * Non-admins get a short list: reads, plus writes that only touch their own
 * data. It covers the CLI's memory, email and music commands and the chat
 * catalog's read tools. Anything not listed is refused, including the
 * `executeTool` meta-tool, which unwraps to any tool.
 *
 * @module api/chat-tool-access
 */
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ChatToolAccess' });

const SELF_SERVICE_TOOLS: ReadonlySet<string> = new Set([
  'recallFromMemory',
  'rememberAboutUser',
  'getUnreadEmails',
  'getEmailFollowups',
  'getImportantEmails',
  'searchEmails',
  'getCalendarEvents',
  'searchContacts',
  'getWeather',
  'getHabitStreak',
  'trackHabit',
  'playMusic',
  'stopMusic',
  'musicInfo',
  'suggestMusic',
]);

/** Whether this caller may run the named tool through the chat API. */
export function mayRunChatTool(fn: unknown, isAdmin: boolean): boolean {
  return isAdmin || (typeof fn === 'string' && SELF_SERVICE_TOOLS.has(fn));
}

/** The tools the model may be offered for this caller. */
export function offeredChatTools<T extends { name: string }>(tools: T[], isAdmin: boolean): T[] {
  return tools.filter((t) => mayRunChatTool(t.name, isAdmin));
}

/** True, after logging, when this caller may not run the named tool. */
export function refuseChatTool(fn: unknown, caller: { userId: string; isAdmin: boolean }): boolean {
  if (mayRunChatTool(fn, caller.isAdmin)) return false;
  log.warn({ callerId: caller.userId, tool: fn }, 'Refused a chat tool call');
  return true;
}
