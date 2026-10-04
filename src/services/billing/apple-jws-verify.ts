/**
 * Verify a JWS signed by Apple (App Store Server Notifications v2).
 *
 * POST /api/apple/webhook is unauthenticated by design: Apple proves the
 * message is theirs by signing it. The payload used to be base64-decoded and
 * trusted without checking that signature, so anyone could post a made-up
 * notification (e.g. DID_RENEW with a far-future expiry for their own
 * originalTransactionId) and change a subscription.
 *
 * A notification is accepted only when:
 * - the header is ES256 with a three-certificate x5c chain (leaf, intermediate, root);
 * - the root is Apple Root CA - G3, matched by pinned SHA-256 fingerprint;
 * - the intermediate is a CA issued and signed by that root, and the leaf is
 *   issued and signed by the intermediate, all within their validity dates;
 * - the intermediate and leaf carry Apple's App Store receipt-signing OIDs
 *   (1.2.840.113635.100.6.2.1 and 1.2.840.113635.100.6.11.1), so another
 *   certificate under the same Apple root cannot sign notifications;
 * - the JWS signature verifies with the leaf's public key.
 *
 * @module services/billing/apple-jws-verify
 */
import { X509Certificate } from 'node:crypto';
import { compactVerify, decodeProtectedHeader } from 'jose';

/** SHA-256 of Apple Root CA - G3 (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer). */
export const APPLE_ROOT_CA_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';

/** DER encodings (tag, length, value) of the OIDs Apple puts on the signing chain. */
const INTERMEDIATE_OID_DER = Buffer.from('060a2a864886f76364060201', 'hex'); // 1.2.840.113635.100.6.2.1
const LEAF_OID_DER = Buffer.from('060a2a864886f76364060b01', 'hex'); // 1.2.840.113635.100.6.11.1

export interface AppleJwsOptions {
  /** Accepted root fingerprints (colon-separated SHA-256). Tests pass their own root. */
  rootFingerprints?: readonly string[];
  /** Time to check certificate validity against. */
  now?: Date;
}

function withinValidity(cert: X509Certificate, now: Date): boolean {
  return now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);
}

/**
 * Verify an Apple-signed JWS and return its decoded payload.
 * Throws when anything about the signature or chain is wrong.
 */
export async function verifyAppleSignedJws<T = unknown>(
  jws: string,
  options: AppleJwsOptions = {}
): Promise<T> {
  const roots = options.rootFingerprints ?? [APPLE_ROOT_CA_G3_SHA256];
  const now = options.now ?? new Date();

  const header = decodeProtectedHeader(jws);
  if (header.alg !== 'ES256') throw new Error('Apple JWS must be ES256');
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3) {
    throw new Error('Apple JWS must carry a three-certificate x5c chain');
  }
  const [leaf, intermediate, root] = x5c.map(
    (der) => new X509Certificate(Buffer.from(der, 'base64'))
  );

  if (!roots.includes(root.fingerprint256)) throw new Error('Apple JWS root is not trusted');
  if (!intermediate.ca || !intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) {
    throw new Error('Apple JWS intermediate is not signed by the root');
  }
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
    throw new Error('Apple JWS leaf is not signed by the intermediate');
  }
  if (![leaf, intermediate, root].every((cert) => withinValidity(cert, now))) {
    throw new Error('Apple JWS certificate is outside its validity period');
  }
  if (!intermediate.raw.includes(INTERMEDIATE_OID_DER) || !leaf.raw.includes(LEAF_OID_DER)) {
    throw new Error('Apple JWS chain is not an App Store signing chain');
  }

  const { payload } = await compactVerify(jws, leaf.publicKey, { algorithms: ['ES256'] });
  return JSON.parse(new TextDecoder().decode(payload)) as T;
}
