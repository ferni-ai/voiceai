/**
 * Talking with a custom agent in text (roleplay, coaching, task mode, or just chatting).
 *
 * A Digital Twin is the person's past self and keeps its journal-based chat. Every other
 * agent talks as itself through POST /api/custom-agents/:id/chat, with the conversation so
 * far and the scene as context, so a fictional captain stays a captain and remembers the
 * scene past the first line.
 */
import { t } from '../i18n/index.js';
import { apiPost } from '../utils/api.js';
import type { CustomAgent } from './custom-agent.service.js';

export interface ChatTurn {
  from: 'person' | 'agent';
  text: string;
}

/** Only a Digital Twin is "your past self" */
export function talksAsPastSelf(agent: Pick<CustomAgent, 'type'>): boolean {
  return agent.type === 'twin';
}

/** What the chat's header and input say for this agent */
export function chatFraming(agent: CustomAgent): { title: string; subtitle: string; placeholder: string; hint: string } {
  if (talksAsPastSelf(agent)) {
    return {
      title: t('talkToTwin.title'),
      subtitle: t('talkToTwin.subtitle'),
      placeholder: t('talkToTwin.placeholder'),
      hint: t('talkToTwin.hint'),
    };
  }
  return {
    title: agent.displayName || agent.name,
    subtitle: agent.description ?? '',
    placeholder: t('forms.messagePlaceholder'),
    hint: '',
  };
}

/**
 * The agent's reply to `message` (or its opening line, when there's only a scene), or
 * null when it couldn't answer.
 */
export async function askAgent(
  agentId: string,
  message: string,
  history: ChatTurn[],
  scene: string
): Promise<string | null> {
  const response = await apiPost<{ reply?: string }>(
    `/api/custom-agents/${encodeURIComponent(agentId)}/chat`,
    { message, history, scene }
  );
  return response.ok && response.data?.reply ? response.data.reply : null;
}

/** Put the framing on the chat dialog's header and input */
export function applyChatFraming(dialog: HTMLElement, agent: CustomAgent): void {
  const framing = chatFraming(agent);
  const set = (selector: string, value: string) => {
    const el = dialog.querySelector<HTMLElement>(selector);
    if (el) el.textContent = value;
  };
  set('#twin-title', framing.title);
  set('.twin-subtitle', framing.subtitle);
  set('.twin-hint', framing.hint);
  dialog.querySelector<HTMLTextAreaElement>('#twin-input')?.setAttribute('placeholder', framing.placeholder);
}

/**
 * The agent's reply after the chat's messages so far (the person's are 'user'); throws
 * when it couldn't answer, so the chat shows its error line.
 */
export async function replyFromAgent(
  agentId: string,
  earlier: Array<{ role: 'user' | 'twin'; content: string }>,
  message: string,
  scene: string
): Promise<string> {
  const history = earlier.map((m) => ({ from: m.role === 'user' ? 'person' : 'agent', text: m.content }) as ChatTurn);
  const reply = await askAgent(agentId, message, history, scene);
  if (!reply) throw new Error('The agent did not answer');
  return reply;
}
