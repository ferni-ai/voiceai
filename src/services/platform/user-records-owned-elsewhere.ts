/**
 * The stores kept outside a person's two records (bogle_users/{uid}, users/{uid}) that the
 * export reads, and for the field-keyed ones, which fields leave (an allowlist when the
 * schema is known). Split out of user-records-export.ts to keep that file under the size
 * cap; user-records-export.ts reads it.
 *
 * @module services/platform/user-records-owned-elsewhere
 */

/**
 * Stores outside the two records: a document keyed by the uid, or documents naming it.
 * `linked`: the documents naming a phone profile proven to be the person are theirs too
 * (the proof erasure uses, erasure-keys.ts).
 */
export const OWNED_ELSEWHERE: ReadonlyArray<
  | { collection: string; doc: 'uid' }
  | { collection: string; field: string; fields?: readonly string[]; linked?: true }
> = [
  { collection: 'user_seeds', doc: 'uid' }, // seed balance and history (Seeds card)
  { collection: 'engagement_profiles', doc: 'uid' },
  { collection: 'households', doc: 'uid' },
  // People You've Told Me About: the person's own account of their people, from their calls
  // Its schema is known (ContactRelationship), so its fields are allowlisted too.
  {
    collection: 'contact_relationships',
    field: 'userId',
    fields: [
      'contactId',
      'name',
      'email',
      'phone',
      'relationship',
      'notes',
      'firstInteraction',
      'lastInteraction',
      'interactionCount',
      'strengthScore',
      'avgResponseTimeHours',
      'preferredChannel',
      'bestTimeToReach',
      'topics',
      'recentContext',
      'importantDates',
      'pendingFollowUp',
      'lastFollowUpDate',
      'createdAt',
      'updatedAt',
    ],
  },
  { collection: 'contact_interactions', field: 'userId' },
  // The router's record of the person's turns and corrections: which tool it picked, how
  // sure it was, lengths and phrase hashes, never the words (bandit-persistence.ts,
  // firestore-persistence.ts, feedback-store.ts)
  { collection: 'routing_events', field: 'userId' },
  { collection: 'semantic_router_corrections', field: 'userId' },
  { collection: 'semantic_routing_feedback', field: 'userId' },
  { collection: 'semantic_routing_vocabulary', doc: 'uid' },
  { collection: 'semantic_routing_corrections', doc: 'uid' },
  // What the older agent remembered of the relationship: shared moments, inside jokes
  { collection: 'relationship_memories', field: 'userId' },
  // The semantic index (user-stores.ts): the words and what kind of memory they are, never
  // the embedding (a model's numbers, not the person's data)
  ...(['vectors', 'memory_vectors'] as const).map((collection) => ({
    collection,
    field: 'metadata.userId',
    fields: ['text', 'metadata', 'createdAt', 'updatedAt', 'expireAt'],
  })),
  // Family Phone Access: only what the sponsor entered (CreateSponsoredIdentityData). Not the
  // family member's own activity (calls, minutes, last call), voice enrollment, self-
  // registration, or familyUserId, the key to that person's own record.
  {
    collection: 'sponsored_identities',
    field: 'sponsorUserId',
    fields: [
      'displayName',
      'preferredName',
      'relationship',
      'phoneNumber',
      'accessLevel',
      'allowedPersonas',
      'notes',
      'status',
      'createdAt',
      'updatedAt',
    ],
  },
  // Crisis scripts spoken on their calls (safety recordCrisisEvent): ids, enums, times, no words
  {
    collection: 'crisis_events',
    field: 'userId',
    fields: [
      'userId',
      'sessionId',
      'personaId',
      'crisisType',
      'severity',
      'reader',
      'resourcesProvided',
      'createdAt',
      'expireAt',
    ],
    linked: true,
  },
  // Replies they reported (reply-report-routes.ts): their reason and note, the turn they
  // reported in their own words and Ferni's reply as the transcript has it. Not the uid, the
  // stored ids the server matched by, versions, or the triage status.
  {
    collection: 'reply_reports',
    field: 'uid',
    fields: [
      'reason',
      'note',
      'sessionId',
      'messageAt',
      'userTurnText',
      'replyText',
      'replyAt',
      'personaId',
      'platform',
      'createdAt',
    ],
  },
  // "That felt off" reports from their calls (call-telemetry-store.ts): their note, when they
  // tapped, how far into the call and their second tap, and their own call as measured: the
  // summary (device, route, mute and hold time, interrupts) and the ring of the last 30 s (when
  // they spoke, muted or held; rooms only as an index). Numbers and closed enums, nobody else's
  // data, no secrets. Not the uid, room names, whether the room was proven, the app build (a
  // copy of summarySoFar's), the server version or the triage status.
  {
    collection: 'call_felt_off',
    field: 'uid',
    fields: [
      'note',
      'tapAt',
      'sinceLiveMs',
      'tapAgainMs',
      'summarySoFar',
      'ring',
      'createdAt',
      'expiresAt',
    ],
  },
];
