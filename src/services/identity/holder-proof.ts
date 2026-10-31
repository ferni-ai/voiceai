/**
 * The holder's proof on a sponsored identity: phoneVerifiedAt, and the pending
 * code (holderVerification). Only holder-verification.ts writes them, with a
 * merge. saveIdentity rewrites the whole doc, so it carries them over from the
 * STORED doc, never from the in-memory identity (a stale cache, or a field a
 * request slipped in), and only while the number is unchanged: a new number
 * starts unverified.
 *
 * @module services/identity/holder-proof
 */

export interface HolderProof {
  phoneVerifiedAt?: string;
  holderVerification?: Record<string, unknown>;
}

type StoredDoc = Record<string, unknown> | undefined;

/** The proof fields as stored, dropping anything malformed. */
export function holderProofOf(data: StoredDoc): HolderProof {
  const proof: HolderProof = {};
  if (typeof data?.phoneVerifiedAt === 'string') proof.phoneVerifiedAt = data.phoneVerifiedAt;
  const pending = data?.holderVerification;
  if (pending && typeof pending === 'object' && !Array.isArray(pending)) {
    proof.holderVerification = pending as Record<string, unknown>;
  }
  return proof;
}

/**
 * What a full rewrite of the doc at `ref` keeps: the stored proof if the stored
 * number is this one, else none. An unreadable doc keeps none (fails closed: the
 * holder verifies again). A verification landing between this read and the
 * rewrite is lost the same way, never gained.
 */
export async function keptHolderProof(
  ref: { get: () => Promise<{ data: () => StoredDoc }> },
  phoneNumber: string
): Promise<HolderProof> {
  let stored: StoredDoc;
  try {
    stored = (await ref.get()).data();
  } catch {
    return {};
  }
  return stored?.phoneNumber === phoneNumber ? holderProofOf(stored) : {};
}

/** The identity without its proof fields, so a rewrite can't set them from memory. */
export function withoutHolderProof<T extends HolderProof>(identity: T): Omit<T, keyof HolderProof> {
  const { phoneVerifiedAt: _verified, holderVerification: _pending, ...rest } = identity;
  return rest;
}
