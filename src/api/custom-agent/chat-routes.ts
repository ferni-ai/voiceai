/**
 * Talking with a custom agent in text.
 *
 * Roleplay, coaching and task mode opened the Digital Twin chat for every agent, and its
 * endpoint (/api/journal/twin-response) told the model "You are {name}'s past self... you
 * ARE them", sent one message with no history, and showed the scene setup as the
 * person's own message. A fictional captain answered as the person's younger self, and
 * forgot the scene after one line.
 *
 * POST /api/custom-agents/:agentId/chat { message?, history?, scene? } → { reply }
 * The agent is the caller's own, its prompt is built from it on the server, and the
 * scene (roleplay, coaching, a task) is context the person never sees as their message.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn } from '../../config/env-flag.js';
import { callLLM } from '../../services/llm-utils.js';
import { buildLiveCustomAgentPrompt } from '../../services/custom-agent/custom-agent-live-prompt.js';
import { customAgentToPersonaConfig } from '../../services/custom-agent/custom-agent-runtime-service.js';
import { getCustomAgent } from '../../services/custom-agent/custom-agent-persistence-service.js';
import type { CustomAgent } from '../../types/custom-agent-api.js';
import { parseBody } from '../helpers.js';
import { sendJson } from './helpers.js';
import { generateSystemPrompt } from './prompt-routes.js';

export interface ChatTurn {
  from: 'person' | 'agent';
  text: string;
}

const MAX_TURNS = 20;
const MAX_TEXT = 2000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');

/** The request, cleaned: null if there's neither a message nor a scene to open */
export function readChatRequest(
  body: unknown
): { message: string; history: ChatTurn[]; scene: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const input = body as Record<string, unknown>;
  const message = text(input.message);
  const scene = text(input.scene);
  if (!message && !scene) return null;
  const history = (Array.isArray(input.history) ? input.history : [])
    .filter(
      (turn): turn is ChatTurn =>
        typeof turn === 'object' &&
        turn !== null &&
        ((turn as ChatTurn).from === 'person' || (turn as ChatTurn).from === 'agent') &&
        typeof (turn as ChatTurn).text === 'string'
    )
    .slice(-MAX_TURNS)
    .map((turn) => ({ from: turn.from, text: text(turn.text) }));
  return { message, history, scene };
}

/** The agent's own prompt, the scene, the conversation so far, then its turn */
export function buildAgentChatPrompt(
  agent: CustomAgent,
  history: ChatTurn[],
  message: string,
  scene: string,
  env: Record<string, string | undefined> = process.env
): string {
  const name = agent.displayName || agent.name;
  // CUSTOM_AGENT_CHAT_HONESTY: the live call's prompt (owner text kept as data, honest when
  // sincerely asked whether it's an AI) instead of one that pastes the owner's text raw.
  const honest = flagOn('CUSTOM_AGENT_CHAT_HONESTY', env);
  const stories = honest
    ? []
    : [...(agent.memories?.stories ?? []), ...(agent.memories?.wisdom ?? [])]
        .map((memory) => memory.content)
        .filter(Boolean)
        .slice(0, 8);
  return [
    honest
      ? buildLiveCustomAgentPrompt(customAgentToPersonaConfig(agent), 'text')
      : generateSystemPrompt(agent),
    stories.length ? `## What you remember\n${stories.map((s) => `- ${s}`).join('\n')}` : '',
    scene ? `## This conversation\n${scene}` : '',
    `Reply as ${name} only: one or two short paragraphs of what ${name} says, in character, with no stage notes${honest ? '' : ' about being an AI'}.`,
    history.length || message ? '## Conversation so far' : '',
    ...history.map((turn) => `${turn.from === 'person' ? 'Them' : name}: ${turn.text}`),
    message ? `Them: ${message}` : `(${name} opens the conversation.)`,
    `${name}:`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** POST /api/custom-agents/:agentId/chat */
export async function handleAgentChat(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const request = readChatRequest(await parseBody<unknown>(req).catch(() => null));
  if (!request) {
    sendJson(res, 400, { error: 'A message or a scene is needed' });
    return true;
  }
  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }
  const reply = await callLLM(
    buildAgentChatPrompt(agent, request.history, request.message, request.scene),
    { maxTokens: 400, temperature: 0.8 }
  );
  if (!reply?.trim()) {
    sendJson(res, 502, { error: 'No reply' });
    return true;
  }
  sendJson(res, 200, { reply: reply.trim() });
  return true;
}
