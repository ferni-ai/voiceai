/**
 * Own-data email reads `ferni email` runs through POST /api/chat/tool. They are
 * in the chat catalog so they are offered, and so may run: the chat API runs
 * only offered tools (chat-tool-access.ts).
 *
 * @module api/chat-email-read-tools
 */
const limit = { type: 'number', description: 'Most emails to return' };

export const CHAT_EMAIL_READ_TOOLS = [
  {
    name: 'getEmailFollowups',
    description: 'List emails that are waiting on a reply',
    parameters: { type: 'object', properties: { limit } },
  },
  {
    name: 'getImportantEmails',
    description: 'List recent emails marked important',
    parameters: { type: 'object', properties: { limit } },
  },
  {
    name: 'searchEmails',
    description: 'Search emails by text or sender',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, from: { type: 'string' }, limit },
    },
  },
];
