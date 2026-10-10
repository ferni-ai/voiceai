/**
 * The server's copy of the cosmetics catalog: what each item costs in seeds.
 *
 * The server charges these prices, never one sent by the browser. The web keeps the
 * display data (names, colors, rarity) in apps/web/src/services/cosmetics.service.ts;
 * cosmetics-catalog.test.ts reads that file and fails if an id or price here drifts
 * from it. (The web build can't import from the root src, so this is a copy.)
 *
 * Plan: docs/plans/2026-10-10-one-seed-ledger.md
 *
 * @module services/seeds/cosmetics-catalog
 */

export type CosmeticType = 'avatar-skin' | 'ui-theme' | 'voice-pack' | 'sound-pack' | 'emote';

export interface CosmeticForSale {
  id: string;
  type: CosmeticType;
  /** Seeds charged; always a positive whole number (nothing for sale is free). */
  price: number;
}

/** Everyone owns these from the start; they're never sold. */
export const DEFAULT_COSMETICS: readonly string[] = [
  'skin-default',
  'theme-default',
  'voice-default',
];

export const COSMETICS_FOR_SALE: readonly CosmeticForSale[] = [
  { id: 'skin-cosmic', type: 'avatar-skin', price: 500 },
  { id: 'skin-sunset', type: 'avatar-skin', price: 300 },
  { id: 'skin-ocean', type: 'avatar-skin', price: 300 },
  { id: 'skin-aurora', type: 'avatar-skin', price: 1000 },
  { id: 'theme-forest', type: 'ui-theme', price: 200 },
  { id: 'theme-midnight', type: 'ui-theme', price: 300 },
  { id: 'theme-cozy', type: 'ui-theme', price: 500 },
  { id: 'sounds-rain', type: 'sound-pack', price: 150 },
  { id: 'sounds-fireplace', type: 'sound-pack', price: 150 },
  { id: 'sounds-nature', type: 'sound-pack', price: 250 },
  { id: 'voice-warm', type: 'voice-pack', price: 200 },
  { id: 'voice-calm', type: 'voice-pack', price: 300 },
  { id: 'voice-energetic', type: 'voice-pack', price: 300 },
];

const BY_ID = new Map(COSMETICS_FOR_SALE.map((item) => [item.id, item]));

/** The item for sale with this id, or undefined (unknown, or a default item). */
export function cosmeticForSale(id: unknown): CosmeticForSale | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

export function isDefaultCosmetic(id: unknown): boolean {
  return typeof id === 'string' && DEFAULT_COSMETICS.includes(id);
}

/** What an account owns: the defaults plus what it bought, each once. */
export function ownedCosmetics(stored: unknown): string[] {
  const bought = Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  return [...new Set([...DEFAULT_COSMETICS, ...bought])];
}
