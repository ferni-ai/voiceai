/**
 * Spotify Device Scoring
 *
 * Pure helpers that rank Spotify Connect devices for automatic playback
 * selection (cars are never auto-selected).
 */

/**
 * Check if a Spotify device is likely a car/vehicle.
 * Cars should never be auto-selected - only play on a car if user explicitly asks.
 */
export function isCarDevice(device: { name: string; type: string }): boolean {
  const name = device.name.toLowerCase();
  const type = device.type.toLowerCase();

  // Spotify device type "Automobile" is the clearest signal
  if (type === 'automobile') return true;

  // Common car/vehicle device name patterns
  const carPatterns = [
    /\br1[st]?\b/, // Rivian R1S, R1T
    /\btesla\b/,
    /\bmodel [3sxy]\b/,
    /\bcarplay\b/,
    /\bandroid auto\b/,
    /\bcar\b/,
    /\bvehicle\b/,
    /\bbmw\b/,
    /\baudi\b/,
    /\bford\b/,
    /\btoyota\b/,
    /\bhonda\b/,
    /\bvolvo\b/,
    /\bsubaru\b/,
    /\bjeep\b/,
    /\brivian\b/,
  ];

  return carPatterns.some((p) => p.test(name));
}

/**
 * Score a device for selection priority.
 * Higher score = better candidate for playback.
 * Cars get a very low score so they're only used as last resort.
 */
export function scoreDevice(device: {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}): number {
  let score = 0;

  // Heavily penalize car devices
  if (isCarDevice(device)) {
    score -= 1000;
    return score;
  }

  // Prefer active devices
  if (device.is_active) score += 100;

  // Prefer computers and speakers over phones (more likely at desk)
  const type = device.type.toLowerCase();
  if (type === 'computer') score += 50;
  if (type === 'speaker') score += 40;
  if (type === 'smartphone') score += 20;
  if (type === 'tv') score += 10;

  return score;
}
