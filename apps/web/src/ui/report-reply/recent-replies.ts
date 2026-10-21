/**
 * Ferni's replies from the current (or just-ended) call, so a person can
 * report one during the call or from the after-call card.
 *
 * Every spoken reply reaches the page as a final `ferni:transcript` event
 * (services/live-transcription.service.ts), whether or not captions are shown.
 * Each is kept with the time it finished, which is how the server finds the
 * same reply in its own transcript (POST /api/reports). Only this call's
 * replies are kept, in memory: a new room starts the list over.
 *
 * @module ui/report-reply/recent-replies
 */

export interface RecentReply {
  text: string;
  /** When the reply finished on screen, epoch ms. */
  at: number;
  /** The call it belongs to: the LiveKit room name. */
  sessionId: string;
}

const MAX_REPLIES = 30;
let replies: RecentReply[] = [];
let listening = false;
const listeners = new Set<() => void>();

interface TranscriptDetail {
  type?: string;
  text?: string;
  isFinal?: boolean;
}

/** Record one final reply; a reply from a new room starts a new list. */
export function recordReply(text: string, sessionId: string, at: number = Date.now()): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (replies[0] && replies[0].sessionId !== sessionId) replies = [];
  replies.unshift({ text: trimmed, at, sessionId });
  if (replies.length > MAX_REPLIES) replies.length = MAX_REPLIES;
  listeners.forEach((fn) => fn());
}

/** This call's replies, newest first. */
export function getRecentReplies(): readonly RecentReply[] {
  return replies;
}

export function onRepliesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Start listening for replies. `roomName` names the call in progress. */
export function trackRecentReplies(roomName: () => string | null): void {
  if (listening) return;
  listening = true;
  window.addEventListener('ferni:transcript', (event) => {
    const detail = (event as CustomEvent<TranscriptDetail>).detail;
    if (detail?.type !== 'agent' || detail.isFinal !== true || !detail.text) return;
    recordReply(detail.text, roomName() ?? 'unknown-call');
  });
}

/** Test seam. */
export function resetRecentReplies(): void {
  replies = [];
  listeners.clear();
}
