/**
 * A software WebAuthn authenticator for tests: a real P-256 key pair and
 * real CBOR/authenticatorData, so @simplewebauthn/server verifies its output
 * exactly as it would a phone's. Attestation is 'none'.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

type Cbor = number | string | Buffer | Map<number | string, Cbor> | Cbor[];

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

export function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string')
    return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  const parts = [...value.entries()].flatMap(([k, v]) => [cbor(k), cbor(v)]);
  return Buffer.concat([head(5, value.size), ...parts]);
}

const b64 = (b: Buffer): string => b.toString('base64url');

export interface SoftAuthenticatorOptions {
  origin?: string;
  rpID?: string;
  userVerified?: boolean;
}

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  private counter = 0;

  constructor() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = pair.privateKey;
    this.publicJwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }

  get id(): string {
    return b64(this.credentialId);
  }

  private authData(rpID: string, flags: number, attested: Buffer = Buffer.alloc(0)): Buffer {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const rpIdHash = createHash('sha256').update(rpID).digest();
    return Buffer.concat([rpIdHash, Buffer.from([flags]), count, attested]);
  }

  /** A navigator.credentials.create() result for these creation options. */
  register(options: { challenge: string; rp: { id?: string } }, o: SoftAuthenticatorOptions = {}) {
    const rpID = o.rpID ?? options.rp.id ?? 'app.ferni.ai';
    const cose = cbor(
      new Map<number, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(this.publicJwk.x, 'base64url')],
        [-3, Buffer.from(this.publicJwk.y, 'base64url')],
      ])
    );
    const idLen = Buffer.from([this.credentialId.length >> 8, this.credentialId.length & 0xff]);
    const attested = Buffer.concat([Buffer.alloc(16), idLen, this.credentialId, cose]);
    const flags = 0x41 | (o.userVerified === false ? 0 : 0x04); // UP + AT (+ UV)
    const clientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: options.challenge,
        origin: o.origin ?? 'https://app.ferni.ai',
        crossOrigin: false,
      })
    );
    const attestationObject = cbor(
      new Map<string, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', this.authData(rpID, flags, attested)],
      ])
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64(clientData),
        attestationObject: b64(attestationObject),
        transports: ['internal' as const],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform' as const,
    };
  }

  /** A navigator.credentials.get() result for these request options. */
  assert(options: { challenge: string; rpId?: string }, o: SoftAuthenticatorOptions = {}) {
    this.counter += 1;
    const rpID = o.rpID ?? options.rpId ?? 'app.ferni.ai';
    const authData = this.authData(rpID, 0x01 | (o.userVerified === false ? 0 : 0x04));
    const clientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: options.challenge,
        origin: o.origin ?? 'https://app.ferni.ai',
        crossOrigin: false,
      })
    );
    const signed = Buffer.concat([authData, createHash('sha256').update(clientData).digest()]);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64(clientData),
        authenticatorData: b64(authData),
        signature: b64(sign('sha256', signed, this.privateKey)),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform' as const,
    };
  }
}
