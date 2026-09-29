/**
 * Normalise outbound-call job metadata into the single shape the agent handles.
 *
 * Family check-in calls (services/family/family-checkin-caller.ts) dispatch
 * `type: 'family_checkin'`, which the agent never handled, so their prompt and
 * opening line were dropped and the call ran as a generic session. They are
 * outbound calls to a family member on the sponsor's behalf, so they map onto
 * `on_behalf_call` (outbound call context, persona, memory under the sponsor).
 */
export function normalizeOutboundCallMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  if (metadata.type !== 'family_checkin') return metadata;

  const name = (metadata.familyMemberName as string) || 'your family member';
  const opening = (metadata.openingLine as string) || '';
  const prompt = (metadata.systemPrompt as string) || '';

  return {
    ...metadata,
    type: 'on_behalf_call',
    originalType: 'family_checkin',
    userId: (metadata.sponsorUserId as string) || (metadata.userId as string),
    contact: { name, relationship: metadata.relationship },
    purpose: `Warm check-in call with ${name}`,
    objective: 'check_in',
    callType: 'personal',
    script: [opening && `Open with: "${opening}"`, prompt].filter(Boolean).join('\n\n'),
  };
}
