/**
 * Payload for the `proactive_outreach` data message ("thinking of you").
 *
 * The web handler reads the outreach under `data`
 * (apps/web/src/app/data-message-handlers.ts isProactiveOutreachMessage). The
 * turn handler used to send it flat, so the web dropped every outreach.
 *
 * @module agents/voice-agent/proactive-outreach-message
 */

export interface ProactiveOutreachSummary {
  type: string;
  message: string;
  context?: string;
}

export function buildProactiveOutreachPayload(
  outreach: ProactiveOutreachSummary,
  persona: { id: string; name: string },
  now: number = Date.now()
): Record<string, unknown> {
  return {
    data: {
      id: `outreach-${now}`,
      type: outreach.type,
      message: outreach.message,
      context: outreach.context,
      personaId: persona.id,
      personaName: persona.name,
      priority: 'medium',
    },
  };
}
