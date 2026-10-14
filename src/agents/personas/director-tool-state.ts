/**
 * What the director knows about Ferni's tools on this call.
 *
 * Dev call 2026-10-12 (session-AJ_FhDLDpE3gTFu): Seth asked Peter for music.
 * Peter said "Sure." and playMusic started; the director, reading only the
 * spoken lines while the tool ran, wrote "He asked for music, but you don't
 * have a player. Tell him what you can actually do instead." The next reply
 * followed it while the music started.
 *
 * Every tool call is recorded the moment the SDK starts it and again when its
 * result is in (the same SpeechHandle item callbacks tool-hum.ts uses), and
 * the director's prompt lists them: "playMusic: running". DIRECTOR_TOOL_STATE
 * =off (default on) leaves the director as it was.
 *
 * @module agents/personas/director-tool-state
 */

import { voice, type llm } from '@livekit/agents';

import { flagOn } from '../../config/env-flag.js';

export function directorSeesTools(env: Record<string, string | undefined> = process.env) {
  return flagOn('DIRECTOR_TOOL_STATE', env);
}

interface ToolEvent {
  name: string;
  state: 'running' | 'done' | 'failed';
  result?: string;
  at: number;
}

/** Tool calls older than this don't describe what's happening now. */
const RECENT_MS = 5 * 60_000;
const MAX_EVENTS = 6;

/** The text of a tool output (outputs reach the model as JSON strings). */
function textOf(output: string): string {
  try {
    const parsed: unknown = JSON.parse(output);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // not JSON: use as is
  }
  return output;
}

export class ToolLog {
  private readonly calls = new Map<string, ToolEvent>();

  constructor(private readonly now: () => number = Date.now) {}

  started(callId: string, name: string): void {
    this.keep(callId, { name, state: 'running', at: this.now() });
  }

  finished(callId: string, name: string, output: string, isError: boolean): void {
    const result = textOf(output).replace(/\s+/g, ' ').trim().slice(0, 100);
    this.keep(callId, { name, state: isError ? 'failed' : 'done', result, at: this.now() });
  }

  /** Re-inserted so the most recent is last; only the last MAX_EVENTS are kept. */
  private keep(callId: string, event: ToolEvent): void {
    this.calls.delete(callId);
    this.calls.set(callId, event);
    for (const oldest of this.calls.keys()) {
      if (this.calls.size <= MAX_EVENTS) break;
      this.calls.delete(oldest);
    }
  }

  /** "playMusic: running", "getWeather: done (72 and sunny)", most recent last. */
  lines(): string[] {
    const since = this.now() - RECENT_MS;
    return [...this.calls.values()]
      .filter((e) => e.at >= since)
      .map((e) => `${e.name}: ${e.state}${e.result ? ` (${e.result})` : ''}`);
  }
}

type Handle = {
  _addItemAddedCallback(cb: (item: llm.ChatItem) => void): void;
  _removeItemAddedCallback(cb: (item: llm.ChatItem) => void): void;
  addDoneCallback(cb: () => void): void;
};
type Session = {
  on(event: string, cb: (ev: never) => void): unknown;
  off(event: string, cb: (ev: never) => void): unknown;
};

/** Records every tool call of the session in `log`; returns the cleanup. */
export function watchToolsForDirector(session: Session, log: ToolLog): () => void {
  const names = new Map<string, string>();
  const onSpeech = (ev: { speechHandle: Handle }) => {
    const handle = ev.speechHandle;
    const onItem = (item: llm.ChatItem) => {
      if (item.type === 'function_call') {
        names.set(item.callId, item.name);
        log.started(item.callId, item.name);
      } else if (item.type === 'function_call_output') {
        const name = item.name || names.get(item.callId) || 'a tool';
        log.finished(item.callId, name, item.output, item.isError);
        names.delete(item.callId);
      }
    };
    handle._addItemAddedCallback(onItem);
    handle.addDoneCallback(() => handle._removeItemAddedCallback(onItem));
  };
  session.on(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
  return () => {
    session.off(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
  };
}
