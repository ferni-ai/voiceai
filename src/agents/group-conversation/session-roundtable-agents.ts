/**
 * Roundtable agents that speak through the call's one session.
 *
 * TeamRoundtable needs a RoundtableAgent per persona. Giving each its own AgentSession is
 * what deadlocks (one session per room holds the agent-session handler), so here each
 * "agent" is a thin view over the session already on the call: it writes its line with its
 * persona's identity, then speaks it through the session with userData.speakingAs set, so
 * the TTS uses that persona's voice (shared/tts-wrapper.ts). Plan:
 * docs/plans/2026-10-10-roundtable-voice.md.
 *
 * @module agents/group-conversation/session-roundtable-agents
 */
import { getPersonaId, PERSONA_REGISTRY } from '../../personas/id-mapping.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  AgentCreationContext,
  ResponseContext,
  RoundtableAgent,
  TeamRoundtableConfig,
} from './team-roundtable.js';

const log = createLogger({ module: 'SessionRoundtable' });

/** What a roundtable needs from the call's session. */
export interface SpeakingSession {
  say(
    text: string,
    options?: { allowInterruptions?: boolean }
  ): { waitForPlayout(): Promise<void> };
  /** Cut off the line playing now (a crisis must not wait for it). */
  interrupt?(): void;
  userData: Record<string, unknown>;
}

/** Writes one line: (system prompt, user prompt) → text. */
export type LineWriter = (system: string, prompt: string) => Promise<string | undefined>;

const ROLE_FOCUS: Record<string, string> = {
  coach: 'the life coach who holds the whole picture and keeps the conversation human',
  team: 'a specialist on the team',
};
const MAX_LINE_CHARS = 420;

const defaultWriter: LineWriter = async (system, prompt) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.ROUNDTABLE_MODEL || 'gemini-3.5-flash',
    systemInstruction: system,
    generationConfig: { temperature: 0.8, maxOutputTokens: 160 },
  });
  if (!model) return undefined;
  return (await model.generateContent(prompt)).response.text();
};

/** Display name for any persona id or alias (maya-habits → Maya). */
export function personaName(id: string): string {
  const meta = PERSONA_REGISTRY[getPersonaId(id)];
  return meta?.shortName ?? id;
}

export function roundtableSystemPrompt(personaId: string, context: ResponseContext): string {
  const meta = PERSONA_REGISTRY[getPersonaId(personaId)];
  const name = meta?.shortName ?? personaId;
  const others = context.otherAgents.map((a) => a.name).join(', ') || 'no one else';
  return [
    `You are ${name}${meta ? ` (${meta.displayName}), ${ROLE_FOCUS[meta.role] ?? ROLE_FOCUS.team}` : ''}.`,
    `You're in a live voice roundtable with the person and ${others}.`,
    context.topic ? `The topic: ${context.topic}.` : '',
    'Speak as yourself, in one to three short spoken sentences. No names before your line,',
    "no lists, no markdown. Build on what others said instead of repeating it, and don't",
    'speak for them. If you have nothing useful to add, say so in a few words.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function roundtablePrompt(context: ResponseContext): string {
  return [
    context.transcript ? `The conversation so far:\n${context.transcript}` : '',
    `${context.lastSpeaker === 'user' ? 'The person' : context.lastSpeaker} just said: "${context.lastUtterance}"`,
    context.wasAddressed ? 'They spoke to you directly.' : '',
    'Your line:',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** A spoken line, clean: no "Maya:" prefix, quotes, markdown or runaway length. */
export function cleanLine(text: string | undefined, name: string): string {
  let line = (text ?? '').trim();
  // "Maya:", "**Maya:**", "**Maya**:"
  line = line.replace(new RegExp(`^\\s*\\**\\s*${name}\\s*\\**\\s*:\\s*\\**\\s*`, 'i'), '');
  line = line
    .replace(/^["“]|["”]$/g, '')
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length > MAX_LINE_CHARS) {
    const cut = line.slice(0, MAX_LINE_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    line = end > 80 ? cut.slice(0, end + 1) : cut;
  }
  return line;
}

/**
 * The createAgent factory TeamRoundtable needs, over the call's session.
 * Each line sets userData.speakingAs for its own playout and clears it after.
 */
export function createSessionRoundtableAgents(deps: {
  session: SpeakingSession;
  write?: LineWriter;
}): TeamRoundtableConfig['createAgent'] {
  const write = deps.write ?? defaultWriter;
  const { session } = deps;

  return async (requestedId: string, _context: AgentCreationContext): Promise<RoundtableAgent> => {
    const personaId = getPersonaId(requestedId);
    const name = personaName(requestedId);
    let muted = false;

    return {
      id: `roundtable_${personaId}`,
      personaId,
      async generateResponse(context) {
        try {
          return cleanLine(
            await write(roundtableSystemPrompt(personaId, context), roundtablePrompt(context)),
            name
          );
        } catch (error) {
          log.warn({ personaId, error: String(error) }, 'Roundtable line could not be written');
          return '';
        }
      },
      say(text, options) {
        if (muted || !text.trim()) return Promise.resolve();
        session.userData.speakingAs = personaId;
        const clear = () => {
          if (session.userData.speakingAs === personaId) delete session.userData.speakingAs;
        };
        try {
          return session.say(text, options).waitForPlayout().finally(clear);
        } catch (error) {
          clear();
          return Promise.reject(error);
        }
      },
      setMuted(value) {
        muted = value;
        // Muting mid-line (a crisis) cuts this persona's line off now
        if (value && session.userData.speakingAs === personaId) session.interrupt?.();
      },
      async cleanup() {
        if (session.userData.speakingAs === personaId) delete session.userData.speakingAs;
      },
    };
  };
}

/**
 * The factory for a call when ROUNDTABLE_VOICE=on (else undefined: a roundtable start then
 * answers "Roundtable not configured"). Lines go through whichever persona's session is
 * on the call at the moment they're spoken.
 */
export function roundtableAgentsForCall(
  activeSession: () => SpeakingSession | undefined,
  env: Record<string, string | undefined> = process.env
): TeamRoundtableConfig['createAgent'] | undefined {
  if (env.ROUNDTABLE_VOICE !== 'on') return undefined;
  const session: SpeakingSession = {
    say(text, options) {
      const live = activeSession();
      if (!live) throw new Error('No agent on the call to speak the roundtable line');
      return live.say(text, options);
    },
    interrupt() {
      activeSession()?.interrupt?.();
    },
    get userData() {
      return activeSession()?.userData ?? {};
    },
  };
  return createSessionRoundtableAgents({ session });
}
