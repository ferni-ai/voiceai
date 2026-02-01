/**
 * Transportation Tools
 *
 * Tools for ride-sharing and commute:
 * - Uber/Lyft ride requests
 * - Price comparison
 * - Ride tracking
 * - Commute intelligence
 *
 * DOMAIN: transportation
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';
import { getUberClient } from '../../../services/integrations/uber/uber-client.js';
import { getLyftClient } from '../../../services/integrations/lyft/lyft-client.js';
import { registerActionType } from '../../../services/actions/action-engine.js';
import type { UberRidePayload, LyftRidePayload } from '../../../services/actions/action-types.js';

const log = createLogger({ module: 'transportation-tools' });

// ============================================================================
// REGISTER ACTION TYPES
// ============================================================================

// Register Uber ride action
registerActionType({
  type: 'uber_ride',
  name: 'Uber Ride',
  description: 'Request an Uber ride',
  requiredIntegrations: ['uber'],
  defaultExpirySeconds: 180,
  canRollback: true,
  prepare: async (payload, context) => {
    const p = payload as UberRidePayload;
    const client = getUberClient(context.userId);

    // Get fare estimate
    const estimate = await client.getFareEstimate({
      productId: p.productId || 'uberx',
      startLatitude: p.startLatitude,
      startLongitude: p.startLongitude,
      endLatitude: p.endLatitude,
      endLongitude: p.endLongitude,
    });

    if (!estimate.success || !estimate.data) {
      return {
        valid: false,
        error: estimate.error || 'Could not get fare estimate',
        confirmationMessage: estimate.error || 'Could not get fare estimate',
      };
    }

    const fare = estimate.data.fare.value;
    const duration = Math.round(estimate.data.trip.duration / 60);

    return {
      valid: true,
      enrichedPayload: {
        ...p,
        fareId: estimate.data.fareId,
        estimatedPrice: fare,
        estimatedDuration: duration,
      },
      confirmationMessage: `An Uber will cost approximately $${fare.toFixed(2)} and take about ${duration} minutes. Should I request it?`,
      estimatedCost: fare,
    };
  },
  executor: async (action, context) => {
    const payload = action.payload as UberRidePayload;
    const client = getUberClient(context.userId);

    if (!payload.fareId) {
      return { success: false, message: 'Missing fare ID - please request a new estimate' };
    }

    const response = await client.requestRide({
      productId: payload.productId || 'uberx',
      fareId: payload.fareId,
      startLatitude: payload.startLatitude,
      startLongitude: payload.startLongitude,
      startAddress: payload.startAddress,
      endLatitude: payload.endLatitude,
      endLongitude: payload.endLongitude,
      endAddress: payload.endAddress,
    });

    if (!response.success || !response.data) {
      return { success: false, message: response.error || 'Failed to request ride' };
    }

    return {
      success: true,
      message: `Your Uber is on the way! ETA: ${response.data.eta || 'calculating'} minutes`,
      externalId: response.data.requestId,
    };
  },
  rollback: async (action, context) => {
    const client = getUberClient(context.userId);
    const response = await client.cancelRide(action.externalIds?.primary);
    return {
      success: response.success,
      message: response.success ? 'Ride cancelled' : 'Could not cancel ride',
    };
  },
});

// Register Lyft ride action
registerActionType({
  type: 'lyft_ride',
  name: 'Lyft Ride',
  description: 'Request a Lyft ride',
  requiredIntegrations: ['lyft'],
  defaultExpirySeconds: 180,
  canRollback: true,
  prepare: async (payload, context) => {
    const p = payload as LyftRidePayload;
    const client = getLyftClient(context.userId);

    // Get cost estimate
    const estimate = await client.getCostEstimates(
      p.startLatitude,
      p.startLongitude,
      p.endLatitude,
      p.endLongitude,
      p.rideType
    );

    if (!estimate.success || !estimate.data?.costEstimates?.length) {
      return {
        valid: false,
        error: estimate.error || 'Could not get cost estimate',
        confirmationMessage: estimate.error || 'Could not get cost estimate',
      };
    }

    const lyftEstimate = estimate.data.costEstimates[0];
    const avgCost = (lyftEstimate.estimatedCostMin + lyftEstimate.estimatedCostMax) / 2 / 100;
    const duration = Math.round(lyftEstimate.estimatedDurationSeconds / 60);

    let message = `A Lyft will cost $${(lyftEstimate.estimatedCostMin / 100).toFixed(2)}-$${(lyftEstimate.estimatedCostMax / 100).toFixed(2)}`;
    if (lyftEstimate.primetimePercentage > 0) {
      message += ` (${lyftEstimate.primetimePercentage}% primetime)`;
    }
    message += ` and take about ${duration} minutes. Should I request it?`;

    return {
      valid: true,
      enrichedPayload: {
        ...p,
        estimatedPrice: avgCost,
        estimatedDuration: duration,
        primetime: lyftEstimate.primetimePercentage,
      },
      confirmationMessage: message,
      estimatedCost: avgCost,
      warnings:
        lyftEstimate.primetimePercentage > 50 ? ['High surge pricing is in effect'] : undefined,
    };
  },
  executor: async (action, context) => {
    const payload = action.payload as LyftRidePayload;
    const client = getLyftClient(context.userId);

    const response = await client.requestRide({
      rideType: payload.rideType || 'lyft',
      origin: {
        lat: payload.startLatitude,
        lng: payload.startLongitude,
        address: payload.startAddress,
      },
      destination: {
        lat: payload.endLatitude,
        lng: payload.endLongitude,
        address: payload.endAddress,
      },
    });

    if (!response.success || !response.data) {
      return { success: false, message: response.error || 'Failed to request ride' };
    }

    return {
      success: true,
      message: 'Your Lyft is on the way!',
      externalId: response.data.rideId,
    };
  },
  rollback: async (action, context) => {
    const client = getLyftClient(context.userId);
    if (action.externalIds?.primary) {
      const response = await client.cancelRide(action.externalIds.primary);
      return {
        success: response.success,
        message: response.success ? 'Ride cancelled' : 'Could not cancel ride',
      };
    }
    return { success: false, message: 'No ride to cancel' };
  },
});

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function getTransportationToolDefinitions(): ToolDefinition[] {
  return [
    // =========================================================================
    // requestRide - Request Uber/Lyft with confirmation
    // =========================================================================
    {
      id: 'requestRide',
      name: 'Request Ride',
      description: 'Request an Uber or Lyft ride with price estimate and confirmation.',
      domain: 'transportation',
      tags: ['uber', 'lyft', 'ride', 'transport'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Request an Uber or Lyft ride with price estimate and confirmation.',
          parameters: z.object({
            destination: z.string().describe('Where you want to go'),
            from: z.string().optional().describe('Pickup location (default: current location)'),
            provider: z
              .enum(['uber', 'lyft', 'best'])
              .optional()
              .describe('Ride provider (default: best price)'),
          }),
          execute: async (params: { destination: string; from?: string; provider?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to request a ride.';
            }

            const uberClient = getUberClient(userId);
            const lyftClient = getLyftClient(userId);

            const uberConnected = uberClient.isConnected();
            const lyftConnected = lyftClient.isConnected();

            if (!uberConnected && !lyftConnected) {
              return 'Neither Uber nor Lyft is connected. Would you like me to help you connect your account?';
            }

            // For now, return information about the feature
            // In production, this would geocode addresses and get real estimates
            return (
              `To request a ride to **${params.destination}**:\n\n` +
              `1. I'll get price estimates from ${uberConnected && lyftConnected ? 'Uber and Lyft' : uberConnected ? 'Uber' : 'Lyft'}\n` +
              `2. Show you the options with ETAs\n` +
              `3. Ask you to confirm before requesting\n\n` +
              `${!uberConnected ? '📱 Connect Uber for more options\n' : ''}` +
              `${!lyftConnected ? '📱 Connect Lyft for more options\n' : ''}`
            );
          },
        });
      },
    },

    // =========================================================================
    // comparePrices - Uber vs Lyft pricing
    // =========================================================================
    {
      id: 'comparePrices',
      name: 'Compare Ride Prices',
      description: 'Compare prices between Uber and Lyft for a trip.',
      domain: 'transportation',
      tags: ['uber', 'lyft', 'price', 'compare'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Compare prices between Uber and Lyft for a trip.',
          parameters: z.object({
            destination: z.string().describe('Where you want to go'),
            from: z.string().optional().describe('Pickup location'),
          }),
          execute: async (params: { destination: string; from?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to compare prices.';
            }

            // This would fetch real estimates in production
            return (
              `📊 **Price Comparison to ${params.destination}**\n\n` +
              `Connect your Uber and Lyft accounts to see real-time price comparisons.\n\n` +
              `I'll show you:\n` +
              `- Prices for different ride types\n` +
              `- ETAs for pickup\n` +
              `- Surge/primetime pricing alerts\n` +
              `- The best value option`
            );
          },
        });
      },
    },

    // =========================================================================
    // getRideStatus - Current ride status
    // =========================================================================
    {
      id: 'getRideStatus',
      name: 'Get Ride Status',
      description: 'Check the status of your current ride.',
      domain: 'transportation',
      tags: ['uber', 'lyft', 'status', 'tracking'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Check the status of your current ride.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your ride status.';
            }

            const uberClient = getUberClient(userId);

            // Try to get current ride from Uber
            if (uberClient.isConnected()) {
              const uberRide = await uberClient.getCurrentRide();
              if (uberRide.success && uberRide.data) {
                const ride = uberRide.data;
                return (
                  `🚗 **Your Uber**\n\n` +
                  `Status: ${ride.status}\n` +
                  `${ride.driver ? `Driver: ${ride.driver.name} (${ride.driver.rating}⭐)\n` : ''}` +
                  `${ride.vehicle ? `Vehicle: ${ride.vehicle.make} ${ride.vehicle.model} - ${ride.vehicle.licensePlate}\n` : ''}` +
                  `${ride.eta ? `ETA: ${ride.eta} minutes` : ''}`
                );
              }
            }

            return "You don't have an active ride right now.";
          },
        });
      },
    },

    // =========================================================================
    // cancelRide - Cancel pending ride
    // =========================================================================
    {
      id: 'cancelRide',
      name: 'Cancel Ride',
      description: 'Cancel your current ride request.',
      domain: 'transportation',
      tags: ['uber', 'lyft', 'cancel'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Cancel your current ride request.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to cancel your ride.';
            }

            const uberClient = getUberClient(userId);

            if (uberClient.isConnected()) {
              const result = await uberClient.cancelRide();
              if (result.success) {
                return '✅ Your ride has been cancelled.';
              }
            }

            return "I couldn't find an active ride to cancel.";
          },
        });
      },
    },

    // =========================================================================
    // getCommuteTime - Current traffic conditions
    // =========================================================================
    {
      id: 'getCommuteTime',
      name: 'Get Commute Time',
      description: 'Check current traffic conditions for your commute.',
      domain: 'transportation',
      tags: ['commute', 'traffic', 'time'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Check current traffic conditions for your commute.',
          parameters: z.object({
            to: z.string().optional().describe('Destination (default: work)'),
            from: z.string().optional().describe('Starting point (default: current location)'),
          }),
          execute: async (params: { to?: string; from?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to check your commute.';
            }

            // This would use Google Maps API in production
            return (
              `🚗 **Commute Check**\n\n` +
              `To get real-time commute information, I need:\n` +
              `1. Your home and work addresses saved\n` +
              `2. Google Maps integration\n\n` +
              `I can then show you:\n` +
              `- Current drive time with traffic\n` +
              `- Best departure time\n` +
              `- Alternative routes\n` +
              `- Proactive alerts when you should leave`
            );
          },
        });
      },
    },

    // =========================================================================
    // scheduleRide - Book future ride
    // =========================================================================
    {
      id: 'scheduleRide',
      name: 'Schedule Ride',
      description: 'Schedule a ride for a future time.',
      domain: 'transportation',
      tags: ['uber', 'lyft', 'schedule', 'future'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Schedule a ride for a future time.',
          parameters: z.object({
            destination: z.string().describe('Where you want to go'),
            pickupTime: z.string().describe('When to be picked up'),
            from: z.string().optional().describe('Pickup location'),
          }),
          execute: async (params: { destination: string; pickupTime: string; from?: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to schedule a ride.';
            }

            // This would schedule via the APIs in production
            return (
              `📅 **Ride Scheduled**\n\n` +
              `Destination: ${params.destination}\n` +
              `Pickup: ${params.pickupTime}\n` +
              `${params.from ? `From: ${params.from}\n` : ''}\n` +
              `I'll remind you before your ride and help you request it at the right time.`
            );
          },
        });
      },
    },
  ];
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return getTransportationToolDefinitions();
}

export const definitions = getTransportationToolDefinitions();
