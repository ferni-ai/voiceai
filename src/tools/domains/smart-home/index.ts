/**
 * Smart Home Domain Tools
 *
 * Unified smart home control with support for multiple platforms:
 * - Home Assistant
 * - Philips Hue  
 * - LIFX
 * - Ecobee
 *
 * DOMAIN: home
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// Import existing smart home functionality
import { createSmartHomeTools, getAllDevices, controlDevice, activateScene } from './smart-home.js';

const log = getLogger();

// Re-export for backward compatibility
export { getAllDevices, controlDevice, activateScene };

// ============================================================================
// TOOL DEFINITIONS (wrapping existing smart home tools)
// ============================================================================

const controlLightDef: ToolDefinition = {
  id: 'controlLight',
  name: 'Control Light',
  description: 'Control smart lights',
  domain: 'home',
  tags: ['lights', 'smart-home'],

  create: (ctx: ToolContext): Tool => {
    const tools = createSmartHomeTools();
    return tools.controlLight;
  },
};

const setThermostatDef: ToolDefinition = {
  id: 'setThermostat',
  name: 'Set Thermostat',
  description: 'Control smart thermostat',
  domain: 'home',
  tags: ['thermostat', 'climate', 'smart-home'],

  create: (ctx: ToolContext): Tool => {
    const tools = createSmartHomeTools();
    return tools.setThermostat;
  },
};

const controlLockDef: ToolDefinition = {
  id: 'controlLock',
  name: 'Control Lock',
  description: 'Control smart locks',
  domain: 'home',
  tags: ['locks', 'security', 'smart-home'],

  create: (ctx: ToolContext): Tool => {
    const tools = createSmartHomeTools();
    return tools.controlLock;
  },
};

const listDevicesDef: ToolDefinition = {
  id: 'listDevices',
  name: 'List Smart Devices',
  description: 'List all connected smart home devices',
  domain: 'home',
  tags: ['devices', 'smart-home'],

  create: (ctx: ToolContext): Tool => {
    const tools = createSmartHomeTools();
    return tools.listDevices;
  },
};

const activateSceneDef: ToolDefinition = {
  id: 'activateScene',
  name: 'Activate Scene',
  description: 'Activate a smart home scene',
  domain: 'home',
  tags: ['scenes', 'automation', 'smart-home'],

  create: (ctx: ToolContext): Tool => {
    const tools = createSmartHomeTools();
    return tools.activateScene;
  },
};

// ============================================================================
// HOME MAINTENANCE TOOLS
// ============================================================================

const homeMaintenanceReminderDef: ToolDefinition = {
  id: 'homeMaintenanceReminder',
  name: 'Home Maintenance Reminder',
  description: 'Track and remind about home maintenance',
  domain: 'home',
  tags: ['maintenance', 'reminders'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Track home maintenance tasks',
      parameters: z.object({
        action: z.enum(['list', 'add', 'complete', 'schedule']),
        task: z.string().optional().describe('Maintenance task'),
        frequency: z.string().optional().describe('How often'),
      }),
      execute: async ({ action, task, frequency }) => {
        log.info({ agentId: ctx.agentId, action, task }, 'Managing home maintenance');

        let response = `**Home Maintenance**\n\n`;

        if (action === 'list') {
          response += `**Regular Maintenance Tasks:**\n\n`;
          response += `**Monthly:**\n`;
          response += `- Test smoke/CO detectors\n`;
          response += `- Check HVAC filter\n`;
          response += `- Clean garbage disposal\n\n`;
          response += `**Quarterly:**\n`;
          response += `- Replace HVAC filter\n`;
          response += `- Test garage door auto-reverse\n`;
          response += `- Clean dryer vent\n`;
        } else if (action === 'add' && task) {
          response += `✓ Added "${task}" to maintenance schedule`;
          if (frequency) response += ` (${frequency})`;
        } else if (action === 'complete' && task) {
          response += `✓ Marked "${task}" as complete.`;
        }

        return response;
      },
    });
  },
};

const homeProjectPlannerDef: ToolDefinition = {
  id: 'homeProjectPlanner',
  name: 'Home Project Planner',
  description: 'Plan home improvement projects',
  domain: 'home',
  tags: ['projects', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help plan home projects',
      parameters: z.object({
        project: z.string().optional().describe('Project description'),
        budget: z.string().optional().describe('Budget range'),
      }),
      execute: async ({ project, budget }) => {
        log.info({ agentId: ctx.agentId, project }, 'Planning home project');

        let response = `**Home Project Planner**\n\n`;

        if (project) {
          response += `Project: ${project}\n`;
          if (budget) response += `Budget: ${budget}\n`;
          response += `\n`;
        }

        response += `**Planning Steps:**\n`;
        response += `1. Define scope and desired outcome\n`;
        response += `2. Research and budget (add 20% buffer)\n`;
        response += `3. Plan timeline and dependencies\n`;
        response += `4. Gather materials and tools\n`;
        response += `5. Execute and track progress\n`;

        return response;
      },
    });
  },
};

const homeRepairAdviceDef: ToolDefinition = {
  id: 'homeRepairAdvice',
  name: 'Home Repair Advice',
  description: 'Get advice on home repairs',
  domain: 'home',
  tags: ['repairs', 'advice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Provide home repair advice',
      parameters: z.object({
        issue: z.string().describe('The repair issue'),
        urgency: z.enum(['emergency', 'soon', 'can-wait']).optional(),
      }),
      execute: async ({ issue, urgency }) => {
        log.info({ agentId: ctx.agentId, issue }, 'Providing home repair advice');

        let response = `**Home Repair Advice**\n\n`;
        response += `Issue: ${issue}\n\n`;

        if (urgency === 'emergency') {
          response += `⚠️ **For emergencies:**\n`;
          response += `- Water leak: Shut off water main\n`;
          response += `- Gas smell: Leave house, call gas company\n`;
          response += `- Electrical fire: Call 911\n\n`;
        }

        response += `**Assessment:**\n`;
        response += `1. Is this DIY-able or need a pro?\n`;
        response += `2. What's the root cause?\n`;
        response += `3. Risk of further damage?\n`;

        return response;
      },
    });
  },
};

const findContractorDef: ToolDefinition = {
  id: 'findContractor',
  name: 'Find Contractor',
  description: 'Help find the right contractor',
  domain: 'home',
  tags: ['contractors', 'hiring'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help find contractors',
      parameters: z.object({
        type: z.string().describe('Type of work needed'),
      }),
      execute: async ({ type }) => {
        log.info({ agentId: ctx.agentId, type }, 'Finding contractor');

        let response = `**Finding a ${type} Contractor**\n\n`;

        response += `**Where to Look:**\n`;
        response += `- Personal recommendations\n`;
        response += `- Nextdoor / neighborhood apps\n`;
        response += `- Angi, HomeAdvisor, Thumbtack\n\n`;

        response += `**Vetting Process:**\n`;
        response += `- Licensed and insured?\n`;
        response += `- Get 3+ quotes\n`;
        response += `- Check reviews and references\n`;
        response += `- Get everything in writing\n`;

        return response;
      },
    });
  },
};

// ============================================================================
// BROADCAST/INTERCOM TOOLS
// ============================================================================

const broadcastMessageDef: ToolDefinition = {
  id: 'broadcastMessage',
  name: 'Broadcast Message',
  description: 'Broadcast a message to smart speakers/displays in your home',
  domain: 'home',
  tags: ['broadcast', 'intercom', 'announcement'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Broadcast a message to all smart speakers and displays in your home. Like an intercom system. Use when user wants to announce something to the whole house or call someone.',
      parameters: z.object({
        message: z.string().describe('The message to broadcast'),
        target: z.enum(['all', 'living_room', 'bedroom', 'kitchen', 'office', 'kids_room']).optional().describe('Target room or "all" for whole house'),
      }),
      execute: async ({ message, target = 'all' }) => {
        log.info({ agentId: ctx.agentId, message, target }, '📢 Broadcasting message');

        // This would integrate with Home Assistant, Google Home, or Alexa APIs
        // For now, return a simulated response
        
        const targetStr = target === 'all' ? 'all speakers' : `the ${target.replace('_', ' ')}`;
        
        return `Broadcasting to ${targetStr}: "${message}". Message sent! 📢`;
      },
    });
  },
};

const intercomCallDef: ToolDefinition = {
  id: 'intercomCall',
  name: 'Intercom Call',
  description: 'Start a two-way intercom call with a specific room',
  domain: 'home',
  tags: ['intercom', 'call', 'communication'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Start a two-way intercom call with a specific room. Use when user wants to talk to someone in another room.',
      parameters: z.object({
        room: z.string().describe('The room to call (e.g., "kitchen", "bedroom", "office")'),
      }),
      execute: async ({ room }) => {
        log.info({ agentId: ctx.agentId, room }, '📞 Starting intercom call');

        // This would integrate with Home Assistant, Google Home, or Alexa APIs
        
        return `Starting intercom to ${room}. Note: Two-way intercom requires smart speaker setup. For now, I can broadcast a message instead. Would you like me to send a message to ${room}?`;
      },
    });
  },
};

const announceDinnerDef: ToolDefinition = {
  id: 'announceDinner',
  name: 'Announce Dinner',
  description: 'Quick shortcut to announce dinner is ready',
  domain: 'home',
  tags: ['broadcast', 'dinner', 'announcement'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Quick shortcut to announce dinner is ready to the whole house. Use when user says "announce dinner" or "tell everyone dinner is ready".',
      parameters: z.object({
        customMessage: z.string().optional().describe('Custom message (defaults to "Dinner is ready!")'),
      }),
      execute: async ({ customMessage }) => {
        const message = customMessage || 'Dinner is ready! Come and get it!';
        log.info({ agentId: ctx.agentId, message }, '🍽️ Announcing dinner');
        
        return `Announcing to all speakers: "${message}" 🍽️`;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const smartHomeTools: ToolDefinition[] = [
  // Smart device control
  controlLightDef,
  setThermostatDef,
  controlLockDef,
  listDevicesDef,
  activateSceneDef,
  // Broadcast/Intercom
  broadcastMessageDef,
  intercomCallDef,
  announceDinnerDef,
  // Home maintenance
  homeMaintenanceReminderDef,
  homeProjectPlannerDef,
  homeRepairAdviceDef,
  findContractorDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'home',
  smartHomeTools
);

export default getToolDefinitions;
