/**
 * Package Tracking Tool
 *
 * Track shipments and deliveries across carriers.
 *
 * Features:
 * - Multi-carrier support (UPS, FedEx, USPS, Amazon)
 * - Delivery notifications
 * - Expected delivery tracking
 * - Package history
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText } from '../../validation.js';
import { getLogger, generateId } from '../../utils/tool-helpers.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

export type Carrier = 'ups' | 'fedex' | 'usps' | 'amazon' | 'dhl' | 'other';

export type PackageStatus =
  | 'label_created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned';

export interface TrackingEvent {
  timestamp: Date;
  status: PackageStatus;
  location?: string;
  description: string;
}

export interface Package {
  id: string;
  userId: string;
  trackingNumber: string;
  carrier: Carrier;
  description: string; // What's in it
  sender?: string;
  // Only what a live provider returned or the user told us; unset until then.
  status?: PackageStatus;
  expectedDelivery?: Date;
  deliveredAt?: Date;
  events: TrackingEvent[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// STORAGE
// ============================================================================

const packages = new Map<string, Package>();

// ============================================================================
// CARRIER DETECTION
// ============================================================================

function detectCarrier(trackingNumber: string): Carrier {
  const tracking = trackingNumber.replace(/\s/g, '').toUpperCase();

  // UPS: 1Z followed by 16 alphanumeric characters
  if (/^1Z[A-Z0-9]{16}$/i.test(tracking)) return 'ups';

  // FedEx: 12-22 digits
  if (/^\d{12,22}$/.test(tracking)) return 'fedex';

  // USPS: Various formats
  if (/^(94|93|92|91|90)[0-9]{18,22}$/.test(tracking)) return 'usps';
  if (/^[A-Z]{2}[0-9]{9}US$/i.test(tracking)) return 'usps';

  // Amazon: TBA followed by digits
  if (/^TBA\d+$/i.test(tracking)) return 'amazon';

  // DHL: 10 digits or JD followed by 18 digits
  if (/^\d{10}$/.test(tracking) || /^JD\d{18}$/i.test(tracking)) return 'dhl';

  return 'other';
}

function getCarrierName(carrier: Carrier): string {
  const names: Record<Carrier, string> = {
    ups: 'UPS',
    fedex: 'FedEx',
    usps: 'USPS',
    amazon: 'Amazon',
    dhl: 'DHL',
    other: 'Unknown Carrier',
  };
  return names[carrier];
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

// AfterShip - Universal tracking API, the only live tracking source wired up.
// Sign up at: https://www.aftership.com/
const AFTERSHIP_API_KEY = process.env.AFTERSHIP_API_KEY || '';

/**
 * Check if real tracking APIs are configured
 */
export function isTrackingApiConfigured(): boolean {
  return !!AFTERSHIP_API_KEY;
}

/**
 * Outcome of a live tracking lookup. When the provider is not configured or
 * does not answer, the outcome is 'unavailable' and carries no status, ETA or
 * events: nothing is invented to fill the gap.
 */
export type LiveTracking =
  | {
      status: 'live';
      packageStatus?: PackageStatus;
      expectedDelivery?: Date;
      events: TrackingEvent[];
    }
  | { status: 'unavailable'; reason: 'not-configured' | 'provider-error' };

/**
 * Fetch real tracking info from AfterShip API
 */
export async function fetchTrackingInfo(
  trackingNumber: string,
  carrier: Carrier
): Promise<LiveTracking> {
  if (!AFTERSHIP_API_KEY) return { status: 'unavailable', reason: 'not-configured' };

  try {
    const response = await fetch(
      `https://api.aftership.com/v4/trackings/${carrier}/${trackingNumber}`,
      {
        headers: {
          'aftership-api-key': AFTERSHIP_API_KEY,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      getLogger().warn({ status: response.status, trackingNumber }, 'AfterShip tracking failed');
      return { status: 'unavailable', reason: 'provider-error' };
    }

    const data = (await response.json()) as {
      data: {
        tracking: {
          expected_delivery?: string | null;
          checkpoints: Array<{
            checkpoint_time: string;
            tag: string;
            city?: string;
            message: string;
          }>;
        };
      };
    };

    const statusMap: Record<string, PackageStatus> = {
      InfoReceived: 'label_created',
      InTransit: 'in_transit',
      OutForDelivery: 'out_for_delivery',
      Delivered: 'delivered',
      Exception: 'exception',
      AttemptFail: 'exception',
      FailedAttempt: 'exception',
      Expired: 'exception',
    };

    // Checkpoints whose tag has no status here are skipped rather than guessed.
    const events = data.data.tracking.checkpoints
      .filter((cp) => statusMap[cp.tag])
      .map((cp) => ({
        timestamp: new Date(cp.checkpoint_time),
        status: statusMap[cp.tag],
        location: cp.city,
        description: cp.message,
      }));
    const expected = new Date(data.data.tracking.expected_delivery ?? NaN);

    getLogger().info(
      { trackingNumber, carrier, eventCount: events.length },
      '📦 Fetched real tracking info from AfterShip'
    );

    return {
      status: 'live',
      packageStatus: events[events.length - 1]?.status,
      expectedDelivery: Number.isNaN(expected.getTime()) ? undefined : expected,
      events,
    };
  } catch (error) {
    getLogger().warn({ error, trackingNumber }, 'AfterShip tracking failed');
    return { status: 'unavailable', reason: 'provider-error' };
  }
}

function getCarrierTrackingUrl(carrier: Carrier, trackingNumber: string): string | null {
  const urls: Record<Carrier, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    amazon: `https://www.amazon.com/gp/your-account/order-history`,
    dhl: `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`,
    other: '',
  };
  return urls[carrier] || null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserPackages(userId: string): Package[] {
  return Array.from(packages.values())
    .filter((p) => p.userId === userId && p.isActive)
    .sort((a, b) => {
      // Sort by: delivered last, then by expected delivery
      if (a.status === 'delivered' && b.status !== 'delivered') return 1;
      if (b.status === 'delivered' && a.status !== 'delivered') return -1;
      if (a.expectedDelivery && b.expectedDelivery) {
        return a.expectedDelivery.getTime() - b.expectedDelivery.getTime();
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}

function getActivePackages(userId: string): Package[] {
  return getUserPackages(userId).filter((p) => p.status !== 'delivered');
}

function formatPackageForSpeech(pkg: Package): string {
  const statusEmoji: Record<PackageStatus, string> = {
    label_created: '📦',
    in_transit: '🚚',
    out_for_delivery: '🏃',
    delivered: '✅',
    exception: '⚠️',
    returned: '↩️',
  };

  if (!pkg.status) {
    return `📦 ${pkg.description} - no tracking update yet (${getCarrierName(pkg.carrier)})`;
  }

  const emoji = statusEmoji[pkg.status];
  let result = `${emoji} ${pkg.description}`;

  if (pkg.status === 'delivered') {
    result += ' - Delivered';
    if (pkg.deliveredAt) {
      const date = pkg.deliveredAt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      result += ` on ${date}`;
    }
  } else if (pkg.status === 'out_for_delivery') {
    result += ' - Out for delivery today! 🎉';
  } else if (pkg.expectedDelivery) {
    const now = new Date();
    const daysUntil = Math.ceil(
      (pkg.expectedDelivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntil === 0) {
      result += ' - Expected today';
    } else if (daysUntil === 1) {
      result += ' - Expected tomorrow';
    } else if (daysUntil > 0) {
      result += ` - Expected in ${daysUntil} days`;
    } else {
      result += ' - Delayed';
    }
  }

  result += ` (${getCarrierName(pkg.carrier)})`;

  return result;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

// Apply a live provider answer to a stored package. Unavailable lookups leave
// the package as it was: no status, ETA or events are made up.
function applyTracking(pkg: Package, tracking: LiveTracking): void {
  if (tracking.status !== 'live') return;
  if (tracking.packageStatus) pkg.status = tracking.packageStatus;
  if (tracking.expectedDelivery) pkg.expectedDelivery = tracking.expectedDelivery;
  if (tracking.events.length > 0) pkg.events = tracking.events;
  if (pkg.status === 'delivered' && !pkg.deliveredAt) {
    pkg.deliveredAt = tracking.events[tracking.events.length - 1]?.timestamp;
  }
}

export async function addPackage(params: {
  userId: string;
  trackingNumber: string;
  description: string;
  carrier?: Carrier;
  sender?: string;
}): Promise<{ pkg: Package; tracking: LiveTracking }> {
  const detectedCarrier = params.carrier || detectCarrier(params.trackingNumber);

  const pkg: Package = {
    id: generateId('pkg'),
    userId: params.userId,
    trackingNumber: params.trackingNumber.replace(/\s/g, '').toUpperCase(),
    carrier: detectedCarrier,
    description: sanitizePlainText(params.description, 100),
    sender: params.sender,
    events: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const tracking = await fetchTrackingInfo(pkg.trackingNumber, detectedCarrier);
  applyTracking(pkg, tracking);

  packages.set(pkg.id, pkg);

  getLogger().info(
    { pkgId: pkg.id, tracking: pkg.trackingNumber, carrier: pkg.carrier },
    '📦 Package added'
  );

  return { pkg, tracking };
}

export async function refreshPackage(
  pkgId: string
): Promise<{ pkg: Package; tracking: LiveTracking } | null> {
  const pkg = packages.get(pkgId);
  if (!pkg) return null;

  const tracking = await fetchTrackingInfo(pkg.trackingNumber, pkg.carrier);
  applyTracking(pkg, tracking);
  if (tracking.status === 'live') pkg.updatedAt = new Date();

  packages.set(pkgId, pkg);

  return { pkg, tracking };
}

// What to say when live tracking can't be looked up: no status, no ETA, just
// what we do know and where the user can check.
function trackingUnavailableText(pkg: Package): string {
  const carrier = getCarrierName(pkg.carrier);
  let text = `I can't look up live tracking right now, so I don't know where it is or when it's due.`;
  const trackingUrl = getCarrierTrackingUrl(pkg.carrier, pkg.trackingNumber);
  text += trackingUrl
    ? `\n${carrier}'s site will have the latest: ${trackingUrl}`
    : `\nThe carrier's website will have the latest on tracking number ${pkg.trackingNumber}.`;
  return text;
}

export function markDelivered(pkgId: string): Package | null {
  const pkg = packages.get(pkgId);
  if (!pkg) return null;

  pkg.status = 'delivered';
  pkg.deliveredAt = new Date();
  pkg.updatedAt = new Date();
  pkg.events.push({
    timestamp: new Date(),
    status: 'delivered',
    description: 'Package delivered (marked by user)',
  });

  packages.set(pkgId, pkg);

  return pkg;
}

export function archivePackage(pkgId: string): boolean {
  const pkg = packages.get(pkgId);
  if (!pkg) return false;

  pkg.isActive = false;
  pkg.updatedAt = new Date();
  packages.set(pkgId, pkg);

  return true;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createPackageTools() {
  return {
    trackPackage: llm.tool({
      description: getToolDescription('trackPackage'),
      parameters: z.object({
        trackingNumber: z.string().describe('Tracking number'),
        description: z.string().describe("What's in the package"),
        carrier: z
          .enum(['ups', 'fedex', 'usps', 'amazon', 'dhl', 'other'])
          .optional()
          .describe('Carrier (auto-detected if not provided)'),
        sender: z.string().optional().describe('Who sent it'),
      }),
      execute: async ({ trackingNumber, description, carrier, sender }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const { pkg, tracking } = await addPackage({
          userId,
          trackingNumber,
          description,
          carrier,
          sender,
        });

        if (tracking.status === 'unavailable') {
          const saved = `📦 Saved **${pkg.description}** (${getCarrierName(pkg.carrier)}, tracking ${pkg.trackingNumber}).`;
          return `${saved}\n${trackingUnavailableText(pkg)}`;
        }

        let response = `📦 Now tracking: **${pkg.description}**\n`;
        response += `Carrier: ${getCarrierName(pkg.carrier)}\n`;
        response += pkg.status
          ? `Status: ${pkg.status.replace(/_/g, ' ')}\n`
          : `Status: no updates from the carrier yet\n`;

        if (pkg.expectedDelivery) {
          const date = pkg.expectedDelivery.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });
          response += `Expected: ${date}\n`;
        }

        const trackingUrl = getCarrierTrackingUrl(pkg.carrier, pkg.trackingNumber);
        if (trackingUrl) {
          response += `\n🔗 Track online: ${trackingUrl}`;
        }

        return response;
      },
    }),

    getPackages: llm.tool({
      description: getToolDescription('getPackages'),
      parameters: z.object({
        includeDelivered: z.boolean().optional().default(false),
      }),
      execute: async ({ includeDelivered }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const userPackages = includeDelivered ? getUserPackages(userId) : getActivePackages(userId);

        if (userPackages.length === 0) {
          return `📦 No packages being tracked. Say "track package" followed by your tracking number to add one!`;
        }

        let response = `📦 **Your Packages** (${userPackages.length})\n\n`;

        const active = userPackages.filter((p) => p.status !== 'delivered');
        const delivered = userPackages.filter((p) => p.status === 'delivered');

        if (active.length > 0) {
          response += `**Not Delivered Yet:**\n`;
          active.forEach((pkg) => {
            response += `• ${formatPackageForSpeech(pkg)}\n`;
          });
          response += '\n';
        }

        if (delivered.length > 0 && includeDelivered) {
          response += `**Recently Delivered:**\n`;
          delivered.slice(0, 3).forEach((pkg) => {
            response += `• ${formatPackageForSpeech(pkg)}\n`;
          });
        }

        // Check for today's deliveries
        const todayDeliveries = active.filter((p) => p.status === 'out_for_delivery');
        if (todayDeliveries.length > 0) {
          response += `\n🎉 ${todayDeliveries.length} package${todayDeliveries.length > 1 ? 's' : ''} out for delivery today!`;
        }

        return response;
      },
    }),

    checkPackageStatus: llm.tool({
      description: getToolDescription('checkPackageStatus'),
      parameters: z.object({
        packageDescription: z.string().describe('Description of the package'),
      }),
      execute: async ({ packageDescription }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const userPackages = getUserPackages(userId);
        const pkg = userPackages.find((p) =>
          p.description.toLowerCase().includes(packageDescription.toLowerCase())
        );

        if (!pkg) {
          return `Couldn't find a package matching "${packageDescription}".`;
        }

        // Refresh tracking info
        const result = await refreshPackage(pkg.id);
        if (!result) return `Couldn't check that package right now. Want to try again?`;
        const { pkg: refreshed, tracking } = result;

        if (tracking.status === 'unavailable') {
          let text = `📦 **${refreshed.description}** (${getCarrierName(refreshed.carrier)}, tracking ${refreshed.trackingNumber})\n`;
          if (refreshed.status) {
            text += `The last status I had was ${refreshed.status.replace(/_/g, ' ')}, but I couldn't get a fresh update.\n`;
          }
          return text + trackingUnavailableText(refreshed);
        }

        let response = `📦 **${refreshed.description}**\n\n`;
        response += refreshed.status
          ? `**Status:** ${refreshed.status.replace(/_/g, ' ')}\n`
          : `**Status:** no updates from the carrier yet\n`;
        response += `**Carrier:** ${getCarrierName(refreshed.carrier)}\n`;
        response += `**Tracking:** ${refreshed.trackingNumber}\n`;

        if (refreshed.expectedDelivery && refreshed.status !== 'delivered') {
          const date = refreshed.expectedDelivery.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });
          response += `**Expected:** ${date}\n`;
        }

        if (refreshed.deliveredAt) {
          const date = refreshed.deliveredAt.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          response += `**Delivered:** ${date}\n`;
        }

        // Recent events
        if (refreshed.events.length > 0) {
          response += `\n**Recent Activity:**\n`;
          refreshed.events.slice(-3).forEach((event) => {
            const date = event.timestamp.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            response += `• ${date}: ${event.description}\n`;
          });
        }

        const trackingUrl = getCarrierTrackingUrl(refreshed.carrier, refreshed.trackingNumber);
        if (trackingUrl) {
          response += `\n🔗 ${trackingUrl}`;
        }

        return response;
      },
    }),

    markPackageDelivered: llm.tool({
      description: getToolDescription('markPackageDelivered'),
      parameters: z.object({
        packageDescription: z.string().describe('Which package'),
      }),
      execute: async ({ packageDescription }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const userPackages = getActivePackages(userId);
        const pkg = userPackages.find((p) =>
          p.description.toLowerCase().includes(packageDescription.toLowerCase())
        );

        if (!pkg) {
          return `Couldn't find an active package matching "${packageDescription}".`;
        }

        markDelivered(pkg.id);

        return `✅ Marked "${pkg.description}" as delivered!\n\nEnjoy your package! 📦`;
      },
    }),

    removePackage: llm.tool({
      description: getToolDescription('removePackage'),
      parameters: z.object({
        packageDescription: z.string().describe('Which package'),
      }),
      execute: async ({ packageDescription }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const userPackages = getUserPackages(userId);
        const pkg = userPackages.find((p) =>
          p.description.toLowerCase().includes(packageDescription.toLowerCase())
        );

        if (!pkg) {
          return `Couldn't find "${packageDescription}".`;
        }

        archivePackage(pkg.id);

        return `🗑️ Stopped tracking "${pkg.description}".`;
      },
    }),

    getDeliveryExpectations: llm.tool({
      description: getToolDescription('getDeliveryExpectations'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const active = getActivePackages(userId);

        if (active.length === 0) {
          return `No packages currently being tracked.`;
        }

        const outForDelivery = active.filter((p) => p.status === 'out_for_delivery');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const expectedToday = active.filter((p) => {
          if (!p.expectedDelivery) return false;
          const exp = new Date(p.expectedDelivery);
          exp.setHours(0, 0, 0, 0);
          return exp.getTime() === today.getTime() && p.status !== 'out_for_delivery';
        });

        const expectedTomorrow = active.filter((p) => {
          if (!p.expectedDelivery) return false;
          const exp = new Date(p.expectedDelivery);
          exp.setHours(0, 0, 0, 0);
          return exp.getTime() === tomorrow.getTime();
        });

        let response = `📅 **Delivery Expectations**\n\n`;

        if (outForDelivery.length > 0) {
          response += `🏃 **Out for Delivery Now:**\n`;
          outForDelivery.forEach((p) => {
            response += `• ${p.description}\n`;
          });
          response += '\n';
        }

        if (expectedToday.length > 0) {
          response += `📦 **Expected Today:**\n`;
          expectedToday.forEach((p) => {
            response += `• ${p.description}\n`;
          });
          response += '\n';
        }

        if (expectedTomorrow.length > 0) {
          response += `📦 **Expected Tomorrow:**\n`;
          expectedTomorrow.forEach((p) => {
            response += `• ${p.description}\n`;
          });
          response += '\n';
        }

        const later = active.filter(
          (p) =>
            !outForDelivery.includes(p) &&
            !expectedToday.includes(p) &&
            !expectedTomorrow.includes(p)
        );

        if (later.length > 0) {
          response += `📦 **Later:**\n`;
          later.forEach((p) => {
            const exp = p.expectedDelivery
              ? p.expectedDelivery.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
              : 'no delivery estimate yet';
            response += `• ${p.description} - ${exp}\n`;
          });
        }

        return response;
      },
    }),
  };
}

export default createPackageTools;
