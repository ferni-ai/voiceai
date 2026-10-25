/**
 * What a sponsor may change on a sponsored identity, checked at runtime.
 *
 * PUT /api/sponsored-identities/:id used to spread its JSON body over the stored
 * record, so a sponsor could write any field on their own identities:
 * phoneVerifiedAt (the proof the holder owns the number, which the consent rule
 * trusts), sponsorUserId (handing the identity to another account), id, createdAt,
 * voice enrollment. Now only the fields below are editable, each one is
 * type-checked, and anything else is refused (not silently dropped), so a client
 * finds out at once that a field won't save.
 *
 * @module services/identity/sponsored-identity-update
 */

export const RELATIONSHIP_TYPES = [
  'mother',
  'father',
  'parent',
  'grandmother',
  'grandfather',
  'grandparent',
  'sibling',
  'child',
  'spouse',
  'partner',
  'friend',
  'other',
] as const;

/** Relationship to the sponsor */
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/**
 * Access level: 'full' (all personas and features), 'limited' (specific personas
 * only), 'supervised' (legacy, no longer offered: it is treated like 'full', and
 * nothing is sent to the sponsor).
 */
export const ACCESS_LEVELS = ['full', 'limited', 'supervised'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * 'active' (normal), 'pending' (self-registered, awaiting approval),
 * 'suspended' (temporarily off), 'revoked' (permanently off).
 */
export const SPONSORED_IDENTITY_STATUSES = ['active', 'pending', 'suspended', 'revoked'] as const;
export type SponsoredIdentityStatus = (typeof SPONSORED_IDENTITY_STATUSES)[number];

/** The fields a sponsor may edit, and nothing else. */
export interface UpdateSponsoredIdentityData {
  displayName?: string;
  preferredName?: string;
  relationship?: RelationshipType;
  phoneNumber?: string;
  accessLevel?: AccessLevel;
  allowedPersonas?: string[];
  notes?: string;
  status?: SponsoredIdentityStatus;
}

/** No caps existed anywhere before this; these are generous for a name and a note. */
export const NAME_MAX_LENGTH = 80;
export const NOTES_MAX_LENGTH = 2000;
const PHONE_MAX_LENGTH = 32;
const PERSONA_ID_MAX_LENGTH = 64;
const MAX_ALLOWED_PERSONAS = 50;

/**
 * The status moves a sponsor may make with an edit: pause and resume. Revoking has
 * its own endpoint (it also frees the number), a revoked identity stays revoked,
 * and only an admin approves a pending self-registration (POST .../approve).
 */
const SPONSOR_STATUS_MOVES: Partial<Record<SponsoredIdentityStatus, SponsoredIdentityStatus>> = {
  active: 'suspended',
  suspended: 'active',
};

/** An edit the sponsor isn't allowed to make; the route answers 400. */
export class InvalidSponsoredIdentityUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSponsoredIdentityUpdateError';
  }
}

function fail(message: string): never {
  throw new InvalidSponsoredIdentityUpdateError(message);
}

function text(key: string, value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') fail(`${key} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail(`${key} must be ${min}-${max} characters`);
  }
  return trimmed;
}

function oneOf<T extends string>(key: string, value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) fail(`${key} must be one of: ${allowed.join(', ')}`);
  return value as T;
}

function personaIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ALLOWED_PERSONAS) {
    fail(`allowedPersonas must be a list of 1-${MAX_ALLOWED_PERSONAS} persona ids`);
  }
  return value.map((id) => text('allowedPersonas', id, 1, PERSONA_ID_MAX_LENGTH));
}

const EDITABLE: {
  [K in keyof Required<UpdateSponsoredIdentityData>]: (value: unknown) => unknown;
} = {
  displayName: (v) => text('displayName', v, 1, NAME_MAX_LENGTH),
  preferredName: (v) => text('preferredName', v, 1, NAME_MAX_LENGTH),
  relationship: (v) => oneOf('relationship', v, RELATIONSHIP_TYPES),
  phoneNumber: (v) => text('phoneNumber', v, 1, PHONE_MAX_LENGTH),
  accessLevel: (v) => oneOf('accessLevel', v, ACCESS_LEVELS),
  allowedPersonas: personaIds,
  notes: (v) => text('notes', v, 0, NOTES_MAX_LENGTH),
  status: (v) => oneOf('status', v, SPONSORED_IDENTITY_STATUSES),
};

/**
 * Turn an untrusted edit (a parsed JSON body) into the editable fields only.
 * Throws InvalidSponsoredIdentityUpdateError for a field that isn't editable or a
 * value of the wrong type, length or enum. Undefined values are skipped.
 */
export function parseSponsoredIdentityUpdate(body: unknown): UpdateSponsoredIdentityData {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    fail('update must be a JSON object');
  }
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!Object.hasOwn(EDITABLE, key)) fail(`${key.slice(0, 64)} is not editable`);
    if (value === undefined) continue;
    updates[key] = EDITABLE[key as keyof UpdateSponsoredIdentityData](value);
  }
  return updates as UpdateSponsoredIdentityData;
}

/** Throws unless a sponsor may move an identity from one status to another by an edit. */
export function assertSponsorStatusMove(
  from: SponsoredIdentityStatus,
  to: SponsoredIdentityStatus
): void {
  if (from !== to && SPONSOR_STATUS_MOVES[from] !== to) {
    fail(`status can't change from ${from} to ${to} here`);
  }
}
