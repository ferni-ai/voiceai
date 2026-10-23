/**
 * When a tool call starts and ends, per call, straight from the SDK
 * (@livekit/agents 1.5.1). Shared by the tool hum (tool-hum.ts) and the
 * activity signal to the apps (tool-activity-signal.ts), so the fragile part
 * lives in one place.
 *
 * Every reply's SpeechHandle is announced by SpeechCreated, and the SDK hands
 * each FunctionCall to that handle's item callbacks the moment it starts
 * executing it (performToolExecutions → onToolExecutionStarted,
 * dist/voice/generation.js:797 → speechHandle._itemAdded,
 * dist/voice/agent_activity.js:2208), then its FunctionCallOutput when it
 * completes (an error output too). FunctionToolsExecuted and the handle
 * finishing (interrupted or done) are the backstops for "ended", so `ended`
 * can arrive more than once for a call: listeners must ignore repeats.
 *
 * @module agents/integrations/tool-call-events
 */

import { voice, type llm } from '@livekit/agents';

export interface ToolCallListener {
  /** The SDK started running a tool. `name` is the tool's name. */
  started: (callId: string, name: string) => void;
  /** The call finished, failed, or its reply ended. May repeat. */
  ended: (callId: string) => void;
}

/** Listen for tool calls on a session. Returns the cleanup. */
export function watchToolCalls(
  session: voice.AgentSession,
  listener: ToolCallListener
): () => void {
  const onSpeech = (ev: voice.SpeechCreatedEvent): void => {
    const handle = ev.speechHandle;
    const mine = new Set<string>();
    const onItem = (item: llm.ChatItem): void => {
      if (item.type === 'function_call') {
        mine.add(item.callId);
        listener.started(item.callId, item.name);
      } else if (item.type === 'function_call_output') {
        mine.delete(item.callId);
        listener.ended(item.callId);
      }
    };
    handle._addItemAddedCallback(onItem);
    handle.addDoneCallback(() => {
      handle._removeItemAddedCallback(onItem);
      mine.forEach((id) => listener.ended(id));
    });
  };
  const onToolsDone = (ev: voice.FunctionToolsExecutedEvent): void =>
    ev.functionCalls.forEach((c) => listener.ended(c.callId));

  session.on(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, onToolsDone);
  return () => {
    session.off(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
    session.off(voice.AgentSessionEventTypes.FunctionToolsExecuted, onToolsDone);
  };
}
