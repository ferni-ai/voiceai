/**
 * Who may see a vector document: the one owner rule every vector store and
 * reader applies (firestore-vector-store/helpers.ts matchesFilter, the
 * in-memory VectorStore, semanticSearch).
 *
 * @module memory/retrieval/vector-ownership
 */

/** A real owner id: not missing, empty, or the shared placeholder "anonymous". */
export function ownerId(userId: unknown): string | undefined {
  return typeof userId === 'string' && userId.trim() !== '' && userId !== 'anonymous'
    ? userId
    : undefined;
}

/**
 * Whether a document belongs to the caller a filter names. Fail safe: a
 * filter without a real userId sees only documents with no owner (shared
 * persona knowledge), never anyone's memories. A document owned by
 * "anonymous" is nobody's to share.
 */
export function ownedBy(
  doc: { metadata: { userId?: unknown } },
  filter?: { userId?: unknown }
): boolean {
  const caller = ownerId(filter?.userId);
  const owner = doc.metadata.userId;
  const hasOwner = owner !== undefined && owner !== null && owner !== '';
  return caller ? owner === caller : !hasOwner;
}
