/**
 * Was Ferni really cut off?
 *
 * After an interruption Ferni's next reply opens softly, sometimes with a
 * quick "Oh—", "Mm?" or "Go ahead." (speech-wrapper.ts). On the dev call of
 * 2026-10-03 replies opened that way when nobody had cut Ferni off:
 * session-state-handler.ts marks an interruption on any voice activity while
 * Ferni speaks. "Mm?" opened the answer to "What more can we do to make you
 * human?" after two overlaps that LiveKit judged false interruptions and
 * resumed from (BARGE_IN_FALSE_INTERRUPTION), with Ferni's reply then played
 * to the end.
 *
 * A real barge-in is the caller starting to talk over Ferni's audio, after
 * Ferni has been audible for a moment, and keeping at it for longer than a
 * backchannel lasts, without Ferni resuming or finishing. Speech that starts
 * as Ferni starts is the caller going on with their own turn (a split
 * sentence, or a reply begun early): Ferni talked over them, not the reverse.
 *
 * Ferni is audible from her first word, not from a Stage 2 breath or sigh
 * opening (reply-audio-stage.ts): agent_state_changed reports "speaking" when
 * the lead starts, so the lead's length is added (onReplyLead), and a caller
 * who starts talking during the breath is not judged to have cut Ferni off.
 *
 * Sessions with a judge registered (the live multi-agent path) only soften
 * after a real barge-in. BARGE_IN_ACK=any (live-call-behaviors.ts) registers
 * none, which softens after any overlap as before.
 *
 * @module speech/graceful-interrupt/barge-in-judge
 */

/**
 * Caller speech over Ferni longer than a backchannel, as the voice detector
 * reports it (with its 350 ms hangover). Same measurement as
 * SUSTAINED_SPEECH_MS in agents/multi-agent/barge-in-fastpath.ts: backchannels
 * were reported at up to 0.87 s.
 */
export const REAL_BARGE_IN_MS = 950;
/** Caller speech starting this soon after Ferni's first word is a collision, not a barge-in. */
export const COLLISION_MS = 500;
/** Longest believable Stage 2 lead; anything longer is ignored rather than trusted. */
export const MAX_REPLY_LEAD_MS = 2000;

export interface BargeInJudge {
  /** agent_state_changed */
  onAgentState: (newState: string | undefined) => void;
  /** user_state_changed: the caller's voice activity */
  onUserState: (newState: string | undefined) => void;
  /** conversation_item_added: Ferni's reply, and whether it was cut off */
  onItemAdded: (item: { role?: string; interrupted?: boolean } | undefined) => void;
  /** agent_false_interruption: LiveKit judged the overlap not a turn */
  onFalseInterruption: () => void;
  /** The reply's non-speech lead (breath/sigh) before its first word, in ms. */
  onReplyLead: (leadMs: number) => void;
  /** Whether the caller took the floor from Ferni's latest reply. */
  wasTakenOver: () => boolean;
}

export function createBargeInJudge(now: () => number = Date.now): BargeInJudge {
  let agentSpeakingSince: number | undefined; // when Ferni's first word is (or was) audible
  let pendingLeadMs = 0; // a lead reported before the reply started playing
  let leadApplied = false; // this reply's lead is already in agentSpeakingSince
  let overlapSince: number | undefined; // caller speech that began over Ferni's audio
  let takenOver = false;
  const overlapLongEnough = (): boolean =>
    overlapSince !== undefined && now() - overlapSince >= REAL_BARGE_IN_MS;

  return {
    onAgentState(newState) {
      if (newState === 'speaking') {
        if (agentSpeakingSince === undefined) {
          agentSpeakingSince = now() + pendingLeadMs;
          leadApplied = pendingLeadMs > 0;
          pendingLeadMs = 0;
          takenOver = false; // a new reply (or a resumed one) is under way
        }
      } else {
        agentSpeakingSince = undefined;
      }
    },
    onUserState(newState) {
      if (newState === 'speaking') {
        const audibleFor = agentSpeakingSince === undefined ? -1 : now() - agentSpeakingSince;
        if (audibleFor >= COLLISION_MS) overlapSince = now();
        return;
      }
      if (overlapLongEnough()) takenOver = true;
      overlapSince = undefined;
    },
    onItemAdded(item) {
      if (item?.role !== 'assistant') return;
      pendingLeadMs = 0; // a lead reported for this reply must not carry to the next
      if (item.interrupted) return;
      takenOver = false; // Ferni's reply played to the end
      overlapSince = undefined;
    },
    onFalseInterruption() {
      takenOver = false;
      overlapSince = undefined;
    },
    onReplyLead(leadMs) {
      if (!(leadMs > 0) || leadMs > MAX_REPLY_LEAD_MS) return;
      if (agentSpeakingSince === undefined) {
        pendingLeadMs = leadMs; // reported before playback began
      } else if (!leadApplied) {
        agentSpeakingSince += leadMs;
        leadApplied = true;
      }
    },
    wasTakenOver() {
      return takenOver || overlapLongEnough();
    },
  };
}

const judges = new Map<string, BargeInJudge>();

/** Judge interruptions for this session. Returns the unregister function. */
export function registerBargeInJudge(sessionId: string, judge: BargeInJudge): () => void {
  judges.set(sessionId, judge);
  return () => {
    if (judges.get(sessionId) === judge) judges.delete(sessionId);
  };
}

/** A reply's opening lead (breath/sigh) for this session's judge, if any. */
export function noteReplyLead(sessionId: string, leadMs: number): void {
  judges.get(sessionId)?.onReplyLead(leadMs);
}

/**
 * Whether the next reply should open as after an interruption. Without a
 * judge for the session, `wasInterrupted` (any overlap) decides, as before.
 */
export function softenAfterInterrupt(
  sessionId: string,
  wasInterrupted: boolean | undefined
): boolean {
  if (!wasInterrupted) return false;
  const judge = judges.get(sessionId);
  return judge ? judge.wasTakenOver() : true;
}
