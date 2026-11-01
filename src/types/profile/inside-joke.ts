/**
 * A shared bit and the line it came from. Ferni brings a bit back only with
 * its line on file, so a bit can't be a history he never had.
 */
export interface InsideJokeRef {
  bit: string;
  quote: string;
  speaker: 'user' | 'assistant';
  /** ISO time the bit expires, a year after the call (utils/shared-moment-retention.ts); none before */
  expireAt?: string;
}
