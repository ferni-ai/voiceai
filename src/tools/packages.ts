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
import { sanitizePlainText } from './validation.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

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
  status: PackageStatus;
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
// MOCK TRACKING (Would use real APIs in production)
// ============================================================================

async function fetchTrackingInfo(
  trackingNumber: string,
  carrier: Carrier
): Promise<{ status: PackageStatus; expectedDelivery?: Date; events: TrackingEvent[] }> {
  // In production, this would call actual carrier APIs
  // For now, return mock data based on tracking number

  getLogger().info({ trackingNumber, carrier }, '📦 Fetching tracking info (mock)');

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Generate mock tracking based on carrier
  const now = new Date();
  const events: TrackingEvent[] = [
    {
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      status: 'label_created',
      description: 'Shipping label created',
    },
    {
      timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      status: 'in_transit',
      location: 'Distribution Center',
      description: 'Package picked up',
    },
  ];

  const expectedDelivery = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  return {
    status: 'in_transit',
    expectedDelivery,
    events,
  };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export async function addPackage(params: {
  userId: string;
  trackingNumber: string;
  description: string;
  carrier?: Carrier;
  sender?: string;
}): Promise<Package> {
  const detectedCarrier = params.carrier || detectCarrier(params.trackingNumber);

  // Fetch initial tracking info
  const trackingInfo = await fetchTrackingInfo(params.trackingNumber, detectedCarrier);

  const pkg: Package = {
    id: generateId('pkg'),
    userId: params.userId,
    trackingNumber: params.trackingNumber.replace(/\s/g, '').toUpperCase(),
    carrier: detectedCarrier,
    description: sanitizePlainText(params.description, 100),
    sender: params.sender,
    status: trackingInfo.status,
    expectedDelivery: trackingInfo.expectedDelivery,
    events: trackingInfo.events,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  packages.set(pkg.id, pkg);

  getLogger().info(
    { pkgId: pkg.id, tracking: pkg.trackingNumber, carrier: pkg.carrier },
    '📦 Package added'
  );

  return pkg;
}

export async function refreshPackage(pkgId: string): Promise<Package | null> {
  const pkg = packages.get(pkgId);
  if (!pkg) return null;

  const trackingInfo = await fetchTrackingInfo(pkg.trackingNumber, pkg.carrier);

  pkg.status = trackingInfo.status;
  if (trackingInfo.expectedDelivery) {
    pkg.expectedDelivery = trackingInfo.expectedDelivery;
  }
  pkg.events = trackingInfo.events;
  pkg.updatedAt = new Date();

  if (pkg.status === 'delivered' && !pkg.deliveredAt) {
    pkg.deliveredAt = new Date();
  }

  packages.set(pkgId, pkg);

  return pkg;
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
      description: `Add a package to track by its tracking number.
Use when user says:
- "Track package [number]"
- "I'm expecting a delivery"
- "Add tracking number"`,
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

        const pkg = await addPackage({
          userId,
          trackingNumber,
          description,
          carrier,
          sender,
        });

        let response = `📦 Now tracking: **${pkg.description}**\n`;
        response += `Carrier: ${getCarrierName(pkg.carrier)}\n`;
        response += `Status: ${pkg.status.replace(/_/g, ' ')}\n`;

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
      description: `Show all tracked packages.
Use when user asks "where are my packages?" or "what's being delivered?"`,
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
          response += `**In Transit:**\n`;
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
      description: `Check the latest status of a specific package.`,
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
        const refreshed = await refreshPackage(pkg.id);
        if (!refreshed) return `Error checking package status.`;

        let response = `📦 **${refreshed.description}**\n\n`;
        response += `**Status:** ${refreshed.status.replace(/_/g, ' ')}\n`;
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
      description: `Mark a package as delivered manually.
Use when user says "I got my package" or "package arrived".`,
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
      description: `Stop tracking a package.`,
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
      description: `Show what's expected to arrive soon.`,
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
          response += `📦 **Later This Week:**\n`;
          later.forEach((p) => {
            const exp = p.expectedDelivery
              ? p.expectedDelivery.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
              : 'TBD';
            response += `• ${p.description} - ${exp}\n`;
          });
        }

        return response;
      },
    }),
  };
}

export default createPackageTools;
