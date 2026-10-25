/**
 * One item of GET /api/outreach/upcoming, read field by field
 * (src/api/outreach-upcoming-route.ts). Both panels that list upcoming
 * outreach (When I'll Check In, When I'll Reach Out) take only these fields,
 * so nothing else the server adds ends up in their markup. The text still has
 * to be escaped where it is rendered (utils/escape-html.ts).
 */

const PRIORITIES = ['high', 'medium', 'low'] as const;
const CHANNELS = ['sms', 'email', 'call', 'push'] as const;

export type OutreachPriority = (typeof PRIORITIES)[number];
export type OutreachChannel = (typeof CHANNELS)[number];

export interface UpcomingOutreachItem {
  id: string;
  type: string;
  personaId: string;
  personaName: string;
  channel: OutreachChannel;
  scheduledFor: Date;
  preview: { subject?: string; body: string };
  reason: string;
  /** One of PRIORITIES, safe to use in a class name. */
  priority: OutreachPriority;
  canReschedule: boolean;
  canCancel: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** The item's known fields, with unknown priorities and channels set to a safe default. */
export function toUpcomingOutreachItem(raw: unknown): UpcomingOutreachItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const preview = (r.preview ?? {}) as Record<string, unknown>;
  return {
    id: str(r.id),
    type: str(r.type),
    personaId: str(r.personaId) || 'ferni',
    personaName: str(r.personaName) || 'Ferni',
    channel: oneOf(CHANNELS, r.channel, 'sms'),
    scheduledFor: new Date(str(r.scheduledFor)),
    preview: {
      body: str(preview.body),
      ...(str(preview.subject) && { subject: str(preview.subject) }),
    },
    reason: str(r.reason),
    priority: oneOf(PRIORITIES, r.priority, 'medium'),
    canReschedule: r.canReschedule === true,
    canCancel: r.canCancel === true,
  };
}
