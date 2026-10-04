/**
 * The long-user-turn breath needs the user's words at the gateway. The live
 * path: transcript-handler.ts sets userData.lastUserMessage on each final
 * transcript and userData.turnCount per turn; ferni-agent's ttsNode builds
 * the session context with extractTtsSessionContext; tts-wrapper passes it to
 * the gateway node as `turnContext`, which the Director reads as
 * turnNumber / userRequest / userEmotion. This pins the mapping.
 */
import { describe, expect, it } from 'vitest';
import type { voice } from '@livekit/agents';

import type { TurnContext } from '../../../speech/tts-gateway/director/types.js';
import { extractTtsSessionContext } from '../tts-wrapper.js';

describe('extractTtsSessionContext → the Director turn context', () => {
  it('carries the turn number, the user’s last words and their emotion', () => {
    const agent = {
      session: {
        userData: {
          services: { sessionId: 'ctx-session' },
          turnCount: 6,
          lastUserMessage:
            'so I have been thinking about everything that happened at work this week',
          voiceEmotion: { primary: 'sad', intensity: 0.7 },
        },
      },
    } as unknown as voice.Agent;
    const turnContext: TurnContext = extractTtsSessionContext(agent, 'ferni');
    expect(turnContext.turnNumber).toBe(6);
    expect(turnContext.userRequest).toBe(
      'so I have been thinking about everything that happened at work this week'
    );
    expect(turnContext.userEmotion?.primary).toBe('sad');
  });
});
