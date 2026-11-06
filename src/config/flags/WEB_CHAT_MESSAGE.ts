import type { FlagSpec } from '../flag-spec.js';

// on: POST /api/chat/message answers the web app's typed chat through the LLM and runs its tools, and POST /api/chat/tool runs a tool the client names with the client's text (api/chat-routes.ts; the CLI's email, memory and tools-e2e commands use it). Off: both return 404 before auth, with no LLM call, no tool run and no write; GET /api/chat/tools is unchanged. Off since 2026-11-06: no requests in 30 days on prod or dev, and the route reads no crisis before the LLM. Turning it on needs a crisis read (services/safety) on the message before the LLM first, with 988 and 911 in the reply on a crisis, as the SMS and voice paths have.
export const WEB_CHAT_MESSAGE = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3549',
  context:
    'Delete the route if the web app still has no typed chat; turning it on first needs a crisis read before the LLM.',
} as const satisfies FlagSpec;
