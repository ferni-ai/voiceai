/**
 * Stop Ferni as soon as the caller is clearly interrupting.
 *
 * LiveKit's adaptive barge-in model tells a real interruption from a
 * backchannel well (dev, 2026-09-30: "mm-hmm"/"yeah" scored 0.22-0.64 and
 * were let through; "Wait, sorry, hold on..." scored 0.66-0.81) but slowly:
 * it took 1.5-2.9 s to decide on the real interruptions, so Ferni talked over
 * the caller for 2-3 s. A person stops within about half a second.
 *
 * This is the fast path people use: once the caller has said three words
 * that aren't backchannel words while Ferni is talking, it's an interruption.
 * Ink-2's live transcript gets there in well under a second. The model still
 * handles everything shorter. Echo guard: on a speakerphone the caller's mic
 * can pick up Ferni's own voice, so words that are mostly Ferni's current
 * words don't count.
 *
 * @module agents/multi-agent/barge-in-fastpath
 */

/** Words that on their own signal "go on", not "stop". */
const BACKCHANNEL_WORDS = new Set([
  'mm',
  'mmm',
  'mhm',
  'mmhm',
  'mmhmm',
  'hmm',
  'hm',
  'uh',
  'huh',
  'uhhuh',
  'um',
  'yeah',
  'yep',
  'yup',
  'yes',
  'ya',
  'ok',
  'okay',
  'right',
  'sure',
  'totally',
  'exactly',
  'wow',
  'oh',
  'ah',
  'aha',
  'cool',
  'nice',
  'true',
  'alright',
  'really',
  'ha',
  'haha',
  'lol',
  'gotcha',
  'got',
  'it',
  'i',
  'see',
  'agreed',
]);

export const MIN_INTERRUPT_WORDS = 3;

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/-/g, '')
    .split(/[^a-z']+/)
    .map((w) => w.replace(/'/g, ''))
    .filter(Boolean);
}

export function isBackchannel(ws: string[]): boolean {
  return ws.length > 0 && ws.every((w) => BACKCHANNEL_WORDS.has(w));
}

/** Mostly Ferni's own current words: the caller's mic hearing Ferni. */
export function looksLikeEcho(ws: string[], spokenText: string): boolean {
  if (ws.length === 0 || !spokenText) return false;
  const spoken = new Set(words(spokenText));
  const shared = ws.filter((w) => spoken.has(w)).length;
  return shared / ws.length >= 0.8;
}

export function shouldInterrupt(p: {
  transcript: string;
  agentSpeaking: boolean;
  spokenText: string;
  minWords?: number;
}): boolean {
  if (!p.agentSpeaking) return false;
  const ws = words(p.transcript);
  if (ws.length < (p.minWords ?? MIN_INTERRUPT_WORDS)) return false;
  if (isBackchannel(ws)) return false;
  return !looksLikeEcho(ws, p.spokenText);
}

export interface BargeInFastPath {
  onTranscript(event: unknown): void;
  onAgentState(event: unknown): void;
  /** Text as it is spoken (captions), for the echo guard. */
  onSpokenText(chunk: string): void;
}

export function createBargeInFastPath(deps: {
  interrupt: () => void;
  log?: (fields: Record<string, unknown>) => void;
}): BargeInFastPath {
  let agentSpeaking = false;
  let spokenText = '';
  let firedThisReply = false;
  return {
    onAgentState(event) {
      const state = (event as { newState?: string })?.newState;
      if (state === 'speaking' && !agentSpeaking) {
        spokenText = '';
        firedThisReply = false;
      }
      agentSpeaking = state === 'speaking';
    },
    onSpokenText(chunk) {
      // Keep the recent tail: enough to recognize an echo, bounded in size.
      spokenText = (spokenText + ' ' + chunk).slice(-600);
    },
    onTranscript(event) {
      if (firedThisReply) return;
      const transcript = (event as { transcript?: string })?.transcript ?? '';
      if (!shouldInterrupt({ transcript, agentSpeaking, spokenText })) return;
      firedThisReply = true;
      deps.log?.({ transcript, words: words(transcript).length });
      deps.interrupt();
    },
  };
}

const registry = new WeakMap<object, BargeInFastPath>();

export function setBargeInFastPath(session: object, fastPath: BargeInFastPath): void {
  registry.set(session, fastPath);
}

export function getBargeInFastPath(session: object | undefined): BargeInFastPath | undefined {
  return session ? registry.get(session) : undefined;
}
