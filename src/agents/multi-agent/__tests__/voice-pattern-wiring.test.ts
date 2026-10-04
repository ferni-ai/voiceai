/**
 * The voice pattern engine on the live (multi-agent) path. Its engine was only
 * created by the legacy session-init path, so on every live turn the
 * naturalness engine logged "No voice pattern engine found for session" and
 * dropped the observation (22 times on the 2026-10-03 call).
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getVoicePatternEngine,
  getVoicePatterns,
  resetVoicePatternEngine,
} from '../../../conversation/humanization/voice-pattern-learning.js';
import {
  getNaturalnessEngine,
  processTurn,
  resetNaturalnessEngine,
} from '../../../speech/naturalness/index.js';
import { createTurnIntelligenceHook, type TurnIntelligenceDeps } from '../turn-intelligence.js';

const persona = { id: 'ferni' } as unknown as TurnIntelligenceDeps['persona'];

/** What the turn handler does with each turn's naturalness input (turn-handler.ts). */
function naturalnessTurn(sessionId: string, userId: string, silenceDurationMs?: number) {
  getNaturalnessEngine(sessionId, userId);
  return processTurn(sessionId, {
    context: {
      sessionId,
      userId,
      turnNumber: 2,
      userWordCount: 6,
      agentWordCount: 0,
      silenceDurationMs,
    },
  });
}

async function liveTurn(sessionId: string, silenceDurationMs?: number): Promise<void> {
  const hook = createTurnIntelligenceHook({
    persona,
    services: { sessionId, userId: 'anon:42' } as unknown as TurnIntelligenceDeps['services'],
    userData: { turnCount: 2 } as unknown as TurnIntelligenceDeps['userData'],
    handle: async (ctx) => {
      naturalnessTurn(ctx.services.sessionId, 'anon:42', silenceDurationMs);
    },
  });
  await hook(
    llm.ChatContext.empty(),
    llm.ChatMessage.create({ role: 'user', content: 'Well, I was thinking about you.' })
  );
}

describe('voice pattern engine on the live path', () => {
  const sessions: string[] = [];
  const session = (name: string) => {
    sessions.push(name);
    return name;
  };
  afterEach(() => {
    for (const id of sessions.splice(0)) resetNaturalnessEngine(id);
    delete process.env.VOICE_PATTERN_ENGINE;
  });

  it('records each live turn, learning the turn gap', async () => {
    const id = session('session-voice-patterns');

    await liveTurn(id, 1400);

    const patterns = getVoicePatterns(id);
    expect(patterns?.totalObservations).toBe(1);
    expect(patterns?.preferredTurnGapMs).toBeGreaterThan(800); // default 800, moved toward 1400
  });

  it('does not learn a zero turn gap that was never measured', async () => {
    const id = session('session-unmeasured-gap');

    await liveTurn(id, 0); // turn-intelligence passes 0 when it has no timing

    expect(getVoicePatterns(id)?.preferredTurnGapMs).toBe(800);
  });

  it('VOICE_PATTERN_ENGINE=off restores the old behavior: no engine, nothing recorded', async () => {
    process.env.VOICE_PATTERN_ENGINE = 'off';
    const id = session('session-voice-patterns-off');

    await liveTurn(id, 1400);

    expect(getVoicePatterns(id)).toBeNull();
  });

  it('never sets speech speed: pace matching and the Speech Director own speed', () => {
    const id = session('session-slow-talker');
    // A returning user whose learned pace is well below the 150 WPM default.
    const learned = getVoicePatterns(getVoicePatternEngine(id, 'user-1').sessionId)!;
    resetVoicePatternEngine(id);
    getVoicePatternEngine(id, 'user-1', { ...learned, preferredAgentWpm: 120, confidence: 0.9 });

    const result = naturalnessTurn(id, 'user-1');

    expect(result.recommendedWpm).toBe(120);
    expect(result.activeSystems).not.toContain('patterns');
    expect(result.ttsAdjustments.reasons.join(' ')).not.toContain('WPM');
  });
});
