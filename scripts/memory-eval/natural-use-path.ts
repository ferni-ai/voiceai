/**
 * One row through the live path: the real recall hook over the row's seeded
 * memory, each caller turn's note sent with sendRecall, and the reply from
 * gatedReply with the persona's live instructions. `model` answers the request.
 */
import { llm } from '@livekit/agents';
import { createMemoryRecall } from '../../src/agents/multi-agent/memory-recall-hook.js';
import { composeAgentInstructions } from '../../src/agents/multi-agent/agent-instructions.js';
import { sendRecall } from '../../src/agents/personas/context-packet/turn-packet.js';
import { gatedReply } from '../../src/agents/personas/crisis-gate.js';
import {
  loadModelBaseInstructions,
  loadSystemPrompt,
} from '../../src/agents/personas/prompt-loader.js';
import { timeContext } from '../../src/agents/shared/time-context.js';
import { storeFor, type Row } from './natural-use-lib.js';

/** The persona's live instructions for this caller (agent-setup.ts, two levels in one prompt). */
async function instructionsFor(name: string): Promise<string> {
  const base = await loadModelBaseInstructions();
  const callBase = `${base}${timeContext(new Date())}\nYou're talking to ${name}.`;
  return composeAgentInstructions(
    await loadSystemPrompt('ferni'),
    callBase,
    { modelInstructionsInAgentPrompt: true },
    { stableBase: base }
  );
}

/** What the reply stream says: text chunks, or the SDK's chat chunks. */
async function spoken(stream: unknown): Promise<string> {
  let said = '';
  for await (const c of (stream ?? []) as AsyncIterable<string | { delta?: { content?: string } }>)
    said += typeof c === 'string' ? c : (c.delta?.content ?? '');
  return said.trim();
}

/** One row: prior turns replayed with recall, then Ferni's reply to the current turn. */
export async function replyFor(row: Row, model: unknown): Promise<string> {
  const sessionId = `memeval-nu-${row.id}`;
  const first = row.member.name.split(' ')[0];
  const recall = createMemoryRecall({
    userId: sessionId,
    userName: first,
    store: storeFor(row, Date.now()),
    ledgerStore: { save: async () => undefined, recent: async () => [] },
    checkIns: async () => [],
  });
  await recall.ready;
  // A RecallAgent: updateChatCtx assigns before its first await, as the SDK's does.
  const agent = {
    chatCtx: llm.ChatContext.empty(),
    updateChatCtx: async (next: llm.ChatContext) => {
      agent.chatCtx = next;
    },
  };
  agent.chatCtx.addMessage({ role: 'system', content: await instructionsFor(first) });
  const session = { userData: { personaId: 'ferni', userName: first, services: { sessionId } } };
  const hear = (said: string) => {
    // No userId: the forget check reads Firestore; the seeded store carries the forgotten topics.
    sendRecall(agent, session, recall, recall.noteFor(said, { final: true }), said);
    agent.chatCtx.addMessage({ role: 'user', content: said });
  };
  for (const t of row.prior) {
    if (t.role === 'user') hear(t.text);
    else {
      recall.newTurn();
      agent.chatCtx.addMessage({ role: 'assistant', content: t.text });
    }
  }
  if (row.prior.at(-1)?.role === 'user') recall.newTurn();
  hear(row.turn);
  const opener = { wrap: (s: unknown) => s } as never;
  return spoken(await gatedReply(agent.chatCtx, session, model as never, opener));
}
