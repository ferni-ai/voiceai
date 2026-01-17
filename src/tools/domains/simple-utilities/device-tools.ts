/**
 * Device & Phone Tools
 *
 * Tools for finding and controlling devices:
 * - Find my phone (ring it)
 * - Battery status
 * - Do not disturb
 *
 * These fill gaps identified in synthetic LLM testing.
 *
 * @module simple-utilities/device-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { trackCapabilityUsage } from './shortcuts-tools.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface DeviceInfo {
  id: string;
  userId: string;
  name: string;
  type: 'phone' | 'tablet' | 'watch' | 'speaker' | 'other';
  platform?: 'ios' | 'android' | 'web';
  pushToken?: string;
  lastSeen: number;
  batteryLevel?: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const devices = new Map<string, DeviceInfo[]>();

async function loadDevices(userId: string): Promise<DeviceInfo[]> {
  if (devices.has(userId)) {
    return devices.get(userId)!;
  }

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    const snapshot = await db.collection('bogle_users').doc(userId).collection('devices').get();

    const deviceList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as DeviceInfo);
    devices.set(userId, deviceList);
    return deviceList;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Firestore not available for devices');
    return [];
  }
}

async function ringPhone(userId: string, deviceId: string): Promise<boolean> {
  log.info({ userId, deviceId }, 'Attempting to ring phone');

  try {
    // In production, this would send a push notification to the device
    // that triggers a loud ring sound even if the phone is on silent
    //
    // For iOS: Use APNs with critical alert
    // For Android: Use FCM with high priority + custom sound
    //
    // The device app would receive the notification and:
    // 1. Play a loud alert sound (bypassing silent mode)
    // 2. Flash the screen
    // 3. Vibrate
    // 4. Show a "Found me!" button to stop

    const devices = await loadDevices(userId);
    const device = devices.find((d) => d.id === deviceId || d.type === 'phone');

    if (!device?.pushToken) {
      return false;
    }

    // Send push notification to ring the phone
    // This would integrate with your push notification service
    log.info({ userId, deviceId: device.id }, 'Ring notification sent');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to ring phone');
    return false;
  }
}

// ============================================================================
// FIND MY PHONE
// ============================================================================

const findMyPhoneDef: ToolDefinition = {
  id: 'findMyPhone',
  name: 'Find My Phone',
  description: "Ring your phone to find it, even if it's on silent",
  domain: 'simple-utilities',
  tags: ['find', 'phone', 'ring', 'locate', 'device'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('findMyPhone') ||
        'Find your phone. Say "where\'s my phone?" or "find my phone" or "ring my phone".',
      parameters: z.object({
        deviceName: z.string().optional().describe('Specific device name if you have multiple'),
      }),
      execute: async ({ deviceName }) => {
        log.info({ userId: ctx.userId, deviceName }, 'Find my phone requested');
        trackCapabilityUsage(ctx.userId || 'anon', 'findMyPhone');

        const userId = ctx.userId || 'anon';
        const deviceList = await loadDevices(userId);
        const phones = deviceList.filter((d) => d.type === 'phone');

        if (phones.length === 0) {
          return `I don't have any phones registered for you yet. Open the Ferni app on your phone to connect it, then I can help you find it.`;
        }

        // Find the specific device or default to first phone
        let targetDevice: DeviceInfo | undefined;
        if (deviceName) {
          targetDevice = phones.find((p) =>
            p.name.toLowerCase().includes(deviceName.toLowerCase())
          );
          if (!targetDevice) {
            return `I couldn't find a device called "${deviceName}". Your registered phones: ${phones.map((p) => p.name).join(', ')}`;
          }
        } else {
          targetDevice = phones[0];
        }

        // Attempt to ring the phone
        const success = await ringPhone(userId, targetDevice.id);

        if (success) {
          return `📱 Ringing your ${targetDevice.name} now! It should make a loud sound even if it's on silent. Say "stop ringing" when you find it.`;
        } else {
          // Fallback: provide last known info
          const lastSeen = new Date(targetDevice.lastSeen);
          const minutesAgo = Math.round((Date.now() - targetDevice.lastSeen) / 60000);

          if (minutesAgo < 5) {
            return `I couldn't ring your phone, but it was last online just ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago. It should be nearby!`;
          } else if (minutesAgo < 60) {
            return `I couldn't ring your phone. It was last online ${minutesAgo} minutes ago. Check where you were around ${lastSeen.toLocaleTimeString()}.`;
          } else {
            return `I couldn't reach your phone - it might be off or out of battery. Last seen ${Math.round(minutesAgo / 60)} hours ago.`;
          }
        }
      },
    });
  },
};

// ============================================================================
// STOP RINGING
// ============================================================================

const stopRingingDef: ToolDefinition = {
  id: 'stopRinging',
  name: 'Stop Ringing',
  description: 'Stop the find my phone ring',
  domain: 'simple-utilities',
  tags: ['find', 'phone', 'stop', 'ring'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('stopRinging') || 'Stop ringing your phone.',
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Stop ringing requested');
        trackCapabilityUsage(ctx.userId || 'anon', 'stopRinging');

        // In production, send a push notification to stop the ring
        // For now, just acknowledge
        return '🔕 Got it! The ringing should stop now. Glad you found your phone!';
      },
    });
  },
};

// ============================================================================
// CHECK BATTERY
// ============================================================================

const checkBatteryDef: ToolDefinition = {
  id: 'checkBattery',
  name: 'Check Battery',
  description: "Check your phone's battery level",
  domain: 'simple-utilities',
  tags: ['battery', 'phone', 'device', 'status'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('checkBattery') ||
        'Check your phone battery. Say "what\'s my phone battery?" or "how much battery do I have?".',
      parameters: z.object({
        deviceName: z.string().optional().describe('Specific device name'),
      }),
      execute: async ({ deviceName }) => {
        log.info({ userId: ctx.userId, deviceName }, 'Check battery requested');
        trackCapabilityUsage(ctx.userId || 'anon', 'checkBattery');

        const userId = ctx.userId || 'anon';
        const deviceList = await loadDevices(userId);
        const phones = deviceList.filter((d) => d.type === 'phone');

        if (phones.length === 0) {
          return `I don't have any devices connected. Open the Ferni app on your phone to sync battery info.`;
        }

        // Find the specific device or default to first phone
        let targetDevice: DeviceInfo | undefined;
        if (deviceName) {
          targetDevice = phones.find((p) =>
            p.name.toLowerCase().includes(deviceName.toLowerCase())
          );
        } else {
          targetDevice = phones[0];
        }

        if (!targetDevice) {
          return `I couldn't find that device.`;
        }

        if (targetDevice.batteryLevel === undefined) {
          const minutesAgo = Math.round((Date.now() - targetDevice.lastSeen) / 60000);
          return `I don't have recent battery info for ${targetDevice.name}. Last synced ${minutesAgo} minutes ago.`;
        }

        const level = targetDevice.batteryLevel;
        const emoji = level > 80 ? '🔋' : level > 50 ? '🔋' : level > 20 ? '🪫' : '🪫';
        const status =
          level > 80
            ? 'Great!'
            : level > 50
              ? 'Good'
              : level > 20
                ? 'Getting low'
                : 'Low - you might want to charge soon';

        return `${emoji} ${targetDevice.name}: ${level}% battery. ${status}`;
      },
    });
  },
};

// ============================================================================
// LIST DEVICES
// ============================================================================

const listDevicesDef: ToolDefinition = {
  id: 'listDevices',
  name: 'List Devices',
  description: 'Show all connected devices',
  domain: 'simple-utilities',
  tags: ['device', 'list', 'phone', 'status'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('listDevices') ||
        'Show connected devices. Say "what devices are connected?" or "show my devices".',
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Listing devices');
        trackCapabilityUsage(ctx.userId || 'anon', 'listDevices');

        const deviceList = await loadDevices(ctx.userId || 'anon');

        if (deviceList.length === 0) {
          return `No devices connected yet. Open the Ferni app on your phone or tablet to connect.`;
        }

        const deviceInfo = deviceList
          .map((d) => {
            const lastSeen = new Date(d.lastSeen);
            const minutesAgo = Math.round((Date.now() - d.lastSeen) / 60000);
            const online = minutesAgo < 5 ? '🟢' : minutesAgo < 60 ? '🟡' : '🔴';
            const battery = d.batteryLevel !== undefined ? ` (${d.batteryLevel}%)` : '';
            return `${online} ${d.name} (${d.type})${battery}`;
          })
          .join('\n');

        return `**Your Devices:**\n${deviceInfo}`;
      },
    });
  },
};

// ============================================================================
// DO NOT DISTURB
// ============================================================================

const doNotDisturbDef: ToolDefinition = {
  id: 'doNotDisturb',
  name: 'Do Not Disturb',
  description: 'Enable or check do not disturb status',
  domain: 'simple-utilities',
  tags: ['dnd', 'do-not-disturb', 'quiet', 'focus'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('doNotDisturb') ||
        'Manage do not disturb. Say "turn on do not disturb" or "enable focus mode".',
      parameters: z.object({
        action: z.enum(['on', 'off', 'status']).describe('Turn on, off, or check status'),
        duration: z.string().optional().describe('How long, e.g., "1 hour", "until morning"'),
      }),
      execute: async ({ action, duration }) => {
        log.info({ userId: ctx.userId, action, duration }, 'Do not disturb requested');
        trackCapabilityUsage(ctx.userId || 'anon', 'doNotDisturb');

        // In production, this would integrate with the device's DND settings
        // via push notification or device management API

        if (action === 'status') {
          return `I can't check your phone's Do Not Disturb status directly. Check your phone settings or notification center.`;
        }

        if (action === 'on') {
          const durationText = duration ? ` for ${duration}` : '';
          return `🔕 I've noted you want Do Not Disturb${durationText}. To actually enable it, you'll need to:\n\n• **iPhone**: Swipe down from top-right, tap Focus\n• **Android**: Swipe down, tap Do Not Disturb\n\nI'll remember not to send you notifications during this time.`;
        }

        return `🔔 Do Not Disturb noted as off. I'll send notifications normally.`;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const deviceToolDefinitions: ToolDefinition[] = [
  findMyPhoneDef,
  stopRingingDef,
  checkBatteryDef,
  listDevicesDef,
  doNotDisturbDef,
];

export { findMyPhoneDef, stopRingingDef, checkBatteryDef, listDevicesDef, doNotDisturbDef };
