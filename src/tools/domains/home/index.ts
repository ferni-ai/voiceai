/**
 * Home & Living Domain Tools
 *
 * Tools for home maintenance, organization, moving, and managing the
 * practical aspects of living spaces.
 *
 * DOMAIN: home
 * TOOLS:
 *   Maintenance: remindHomeMaintenance, trackRepair, seasonalChecklist
 *   Organization: coachDecluttering, organizeSpace
 *   Moving: planMove, createMovingChecklist
 *   Projects: planHomeProject, manageContractor
 *   Safety: assessEmergencyPreparedness
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// MAINTENANCE DATABASES
// ============================================================================

const SEASONAL_MAINTENANCE = {
  spring: [
    { task: 'HVAC filter replacement', frequency: 'Every 1-3 months', priority: 'high' },
    { task: 'Gutter cleaning', frequency: 'Twice yearly', priority: 'medium' },
    { task: 'Check smoke/CO detectors', frequency: 'Monthly/batteries yearly', priority: 'high' },
    { task: 'Deep clean after winter', frequency: 'Yearly', priority: 'low' },
    { task: 'Service AC before summer', frequency: 'Yearly', priority: 'high' },
    { task: 'Check roof for winter damage', frequency: 'Yearly', priority: 'medium' },
    { task: 'Outdoor furniture setup', frequency: 'Yearly', priority: 'low' },
  ],
  summer: [
    { task: 'Maintain AC filters', frequency: 'Monthly', priority: 'high' },
    { task: 'Check sprinkler system', frequency: 'Yearly', priority: 'medium' },
    { task: 'Pest inspection', frequency: 'Yearly', priority: 'medium' },
    { task: 'Deck/patio maintenance', frequency: 'Yearly', priority: 'medium' },
    { task: 'Window cleaning', frequency: '2-3 times/year', priority: 'low' },
  ],
  fall: [
    { task: 'Furnace inspection/service', frequency: 'Yearly', priority: 'high' },
    { task: 'Gutter cleaning', frequency: 'Twice yearly', priority: 'medium' },
    { task: 'Chimney cleaning (if used)', frequency: 'Yearly', priority: 'high' },
    { task: 'Winterize outdoor faucets', frequency: 'Yearly', priority: 'high' },
    { task: 'Clean dryer vent', frequency: 'Yearly', priority: 'high' },
    { task: 'Store outdoor furniture', frequency: 'Yearly', priority: 'low' },
    { task: 'Check weatherstripping', frequency: 'Yearly', priority: 'medium' },
  ],
  winter: [
    { task: 'Check for ice dams', frequency: 'As needed', priority: 'high' },
    { task: 'Test sump pump', frequency: 'Before spring thaw', priority: 'medium' },
    { task: 'Monitor for drafts', frequency: 'Ongoing', priority: 'medium' },
    { task: 'Indoor deep cleaning projects', frequency: 'Good indoor time', priority: 'low' },
  ],
};

const EMERGENCY_PREP_CHECKLIST = {
  supplies: [
    'Water (1 gallon/person/day for 3 days minimum)',
    'Non-perishable food (3 days minimum)',
    'Manual can opener',
    'Flashlights and batteries',
    'First aid kit',
    'Medications (7-day supply)',
    'Battery-powered or hand-crank radio',
    'Phone chargers (battery backup)',
    'Cash (small bills)',
    'Whistle',
  ],
  documents: [
    'Copies of important IDs',
    'Insurance policies',
    'Bank account info',
    'Emergency contacts list',
    'Medical information',
    'Photos of valuables (for insurance)',
  ],
  planning: [
    'Know your emergency meeting point',
    'Know evacuation routes',
    'Have a communication plan',
    'Know how to turn off utilities',
    'Consider pets in your plan',
  ],
};

// ============================================================================
// MAINTENANCE TOOLS
// ============================================================================

const remindHomeMaintenanceDef: ToolDefinition = {
  id: 'remindHomeMaintenance',
  name: 'Remind Home Maintenance',
  description: 'Seasonal and routine maintenance reminders',
  domain: 'home',
  tags: ['home', 'maintenance', 'reminders'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Provide home maintenance reminders based on season and timing.',
      parameters: z.object({
        season: z
          .enum(['spring', 'summer', 'fall', 'winter'])
          .describe('Current or upcoming season'),
        homeType: z.enum(['house', 'condo', 'apartment', 'other']).optional(),
      }),
      execute: async ({ season, homeType }) => {
        getLogger().info({ agentId: ctx.agentId, season }, 'Reminding home maintenance');

        const tasks = SEASONAL_MAINTENANCE[season];

        let response = `**${season.charAt(0).toUpperCase() + season.slice(1)} Home Maintenance**\n\n`;

        if (homeType === 'apartment' || homeType === 'condo') {
          response += `_Note: Some tasks may be handled by your building management._\n\n`;
        }

        response += `**High Priority:**\n`;
        tasks
          .filter((t) => t.priority === 'high')
          .forEach((task) => {
            response += `☐ ${task.task} (${task.frequency})\n`;
          });

        response += `\n**Medium Priority:**\n`;
        tasks
          .filter((t) => t.priority === 'medium')
          .forEach((task) => {
            response += `☐ ${task.task} (${task.frequency})\n`;
          });

        response += `\n**Lower Priority:**\n`;
        tasks
          .filter((t) => t.priority === 'low')
          .forEach((task) => {
            response += `☐ ${task.task} (${task.frequency})\n`;
          });

        response += `\n---\n\n`;
        response += `**Year-Round Reminders:**\n`;
        response += `• Test smoke/CO detectors monthly\n`;
        response += `• Change HVAC filters (every 1-3 months)\n`;
        response += `• Check for water leaks regularly\n\n`;

        response += `Would you like to add any of these to your task list?`;

        return response;
      },
    });
  },
};

const trackRepairDef: ToolDefinition = {
  id: 'trackRepair',
  name: 'Track Repair',
  description: 'Track needed and completed repairs',
  domain: 'home',
  tags: ['home', 'repairs', 'tracking'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help track home repairs needed or completed.',
      parameters: z.object({
        action: z
          .enum(['log-needed', 'log-completed', 'list', 'prioritize'])
          .describe('What to do'),
        repair: z.string().optional().describe('Description of repair'),
        urgency: z.enum(['urgent', 'soon', 'eventually']).optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ action, repair, urgency, notes }) => {
        getLogger().info({ agentId: ctx.agentId, action, repair }, 'Tracking repair');

        let response = '';

        if (action === 'log-needed') {
          response = `**Repair Logged**\n\n`;
          response += `**Issue:** ${repair}\n`;
          if (urgency) response += `**Urgency:** ${urgency}\n`;
          if (notes) response += `**Notes:** ${notes}\n`;
          response += `\n---\n\n`;
          response += `**Next steps to consider:**\n`;
          response += `• Get quotes if professional help needed\n`;
          response += `• Research DIY if appropriate\n`;
          response += `• Schedule the repair\n`;
          response += `• Document for insurance or landlord if applicable\n`;
        } else if (action === 'log-completed') {
          response = `**Repair Completed! ✅**\n\n`;
          response += `**Repair:** ${repair}\n`;
          if (notes) response += `**Notes:** ${notes}\n`;
          response += `\n---\n\n`;
          response += `**Good practice:**\n`;
          response += `• Save any receipts/warranties\n`;
          response += `• Note the date for future reference\n`;
          response += `• Take photos of completed work\n`;
        } else if (action === 'prioritize') {
          response = `**Repair Prioritization Framework**\n\n`;
          response += `**Urgent (do immediately):**\n`;
          response += `• Safety issues (gas leaks, electrical problems)\n`;
          response += `• Water damage/leaks (can worsen quickly)\n`;
          response += `• Security issues (locks, doors, windows)\n`;
          response += `• No heat in winter / no AC in extreme heat\n\n`;
          response += `**Soon (within weeks):**\n`;
          response += `• Issues that will worsen if ignored\n`;
          response += `• Problems affecting daily life\n`;
          response += `• Preventive repairs\n\n`;
          response += `**Eventually (schedule when convenient):**\n`;
          response += `• Cosmetic issues\n`;
          response += `• Upgrades\n`;
          response += `• Non-urgent improvements\n`;
        } else {
          response = `I can help you track home repairs. Would you like to:\n`;
          response += `• Log a repair needed\n`;
          response += `• Mark something as completed\n`;
          response += `• Review your repair list\n`;
          response += `• Get help prioritizing repairs`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// ORGANIZATION TOOLS
// ============================================================================

const coachDeclutteringDef: ToolDefinition = {
  id: 'coachDecluttering',
  name: 'Coach Decluttering',
  description: 'Guide the decluttering process',
  domain: 'home',
  tags: ['home', 'organization', 'decluttering'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Coach user through decluttering their space.',
      parameters: z.object({
        area: z.string().describe('Area to declutter'),
        overwhelm: z.enum(['low', 'medium', 'high']).optional(),
        approach: z.enum(['konmari', 'room-by-room', 'category', 'quick-wins']).optional(),
      }),
      execute: async ({ area, overwhelm, approach }) => {
        getLogger().info({ agentId: ctx.agentId, area, approach }, 'Coaching decluttering');

        let response = `**Decluttering: ${area}**\n\n`;

        if (overwhelm === 'high') {
          response += `**Feeling overwhelmed? Start smaller:**\n`;
          response += `• Just one drawer\n`;
          response += `• Just 5 minutes\n`;
          response += `• Just one category (all pens, all socks)\n`;
          response += `• You don't have to finish today\n\n`;
        }

        response += `---\n\n`;

        if (approach === 'konmari') {
          response += `**KonMari Method:**\n\n`;
          response += `1. Commit to tidying up\n`;
          response += `2. Imagine your ideal lifestyle\n`;
          response += `3. Finish discarding first\n`;
          response += `4. Tidy by category, not location\n`;
          response += `5. Ask: "Does this spark joy?"\n\n`;
          response += `**The question:** Hold each item. Does it spark joy? Thank items that don't and let them go.\n`;
        } else if (approach === 'quick-wins') {
          response += `**Quick Win Approach:**\n\n`;
          response += `Start with obvious items:\n`;
          response += `• Trash and recycling\n`;
          response += `• Expired items\n`;
          response += `• Broken things you won't repair\n`;
          response += `• Duplicates\n`;
          response += `• Things that belong elsewhere\n\n`;
          response += `This builds momentum without hard decisions.`;
        } else {
          response += `**General Decluttering Steps:**\n\n`;
          response += `1. **Empty** - Take everything out\n`;
          response += `2. **Sort** - Keep, Donate, Trash, Relocate\n`;
          response += `3. **Clean** - Wipe down the empty space\n`;
          response += `4. **Replace** - Only keep items, thoughtfully\n`;
          response += `5. **Maintain** - One in, one out rule\n`;
        }

        response += `\n---\n\n`;

        response += `**Decision Questions:**\n`;
        response += `• Have I used this in the past year?\n`;
        response += `• Would I buy this again today?\n`;
        response += `• Do I have something that serves the same purpose?\n`;
        response += `• Am I keeping this out of guilt?\n`;
        response += `• Does it fit my current life?\n\n`;

        response += `**Remember:** Clutter is often delayed decisions. Make the decision now.\n\n`;

        response += `What feels like the right place to start?`;

        return response;
      },
    });
  },
};

const organizeSpaceDef: ToolDefinition = {
  id: 'organizeSpace',
  name: 'Organize Space',
  description: 'Help organize specific spaces',
  domain: 'home',
  tags: ['home', 'organization', 'space'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help organize a specific space or area.',
      parameters: z.object({
        space: z
          .enum([
            'closet',
            'kitchen',
            'bathroom',
            'garage',
            'office',
            'kids-room',
            'living-room',
            'pantry',
            'other',
          ])
          .describe('Space to organize'),
        goals: z.array(z.string()).optional().describe('Goals for the space'),
      }),
      execute: async ({ space, goals }) => {
        getLogger().info({ agentId: ctx.agentId, space }, 'Organizing space');

        let response = `**Organizing: ${space}**\n\n`;
        if (goals?.length) response += `**Goals:** ${goals.join(', ')}\n\n`;

        const spaceTips: Record<string, string> = {
          closet:
            `**Closet Organization:**\n\n` +
            `• Group similar items (all shirts together, etc.)\n` +
            `• Use vertical space (shelf dividers, hooks)\n` +
            `• Put frequently used items at eye level\n` +
            `• Store out-of-season items higher up\n` +
            `• Clear floor space if possible\n` +
            `• Consider: matching hangers, shelf dividers, door organizers`,

          kitchen:
            `**Kitchen Organization:**\n\n` +
            `• Zone your kitchen (cooking, prep, storage, cleaning)\n` +
            `• Most-used items in easiest-to-reach spots\n` +
            `• Clear counters = calmer kitchen\n` +
            `• Use drawer dividers for utensils\n` +
            `• Lazy susans for corner cabinets\n` +
            `• Consider: pull-out organizers, shelf risers, container systems`,

          pantry:
            `**Pantry Organization:**\n\n` +
            `• Group by category (baking, snacks, canned goods)\n` +
            `• FIFO: First In, First Out for expiring items\n` +
            `• Clear containers make contents visible\n` +
            `• Label everything\n` +
            `• Keep inventory of staples\n` +
            `• Consider: tiered shelves, door organizers, bins`,

          office:
            `**Office Organization:**\n\n` +
            `• Clear desk = clearer mind\n` +
            `• Papers: File, Action, or Trash (no "maybe" pile)\n` +
            `• Cable management (ties, boxes, under-desk)\n` +
            `• Vertical files over horizontal piles\n` +
            `• Designated inbox area\n` +
            `• Consider: desk drawer organizers, filing system, cord management`,

          garage:
            `**Garage Organization:**\n\n` +
            `• Use wall space (pegboards, wall systems)\n` +
            `• Zone by activity (tools, sports, garden)\n` +
            `• Ceiling storage for seasonal items\n` +
            `• Clear labels on all bins\n` +
            `• Keep floor clear for parking/workspace\n` +
            `• Consider: wall mount systems, overhead storage, tool organization`,
        };

        response +=
          spaceTips[space] ||
          `**General Organization Principles:**\n` +
            `• Everything should have a "home"\n` +
            `• Group like with like\n` +
            `• Most used = most accessible\n` +
            `• Contain items in bins, baskets, dividers\n` +
            `• Label to maintain the system\n`;

        response += `\n---\n\n`;

        response += `**Maintenance Tips:**\n`;
        response += `• Take 5 minutes daily to reset\n`;
        response += `• One in, one out rule\n`;
        response += `• Regular mini-purges prevent big ones\n`;
        response += `• Systems only work if everyone in the house uses them\n\n`;

        response += `What specific part would you like to tackle first?`;

        return response;
      },
    });
  },
};

// ============================================================================
// MOVING TOOLS
// ============================================================================

const planMoveDef: ToolDefinition = {
  id: 'planMove',
  name: 'Plan Move',
  description: 'Comprehensive moving planning',
  domain: 'home',
  tags: ['home', 'moving', 'planning'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help plan a residential move.',
      parameters: z.object({
        timeUntilMove: z
          .enum(['1-week', '2-weeks', '1-month', '2-months', 'more'])
          .describe('Time until move'),
        moveType: z.enum(['local', 'long-distance', 'international']).describe('Type of move'),
        situation: z.enum(['renting', 'selling', 'buying']).optional(),
      }),
      execute: async ({ timeUntilMove, moveType, situation }) => {
        getLogger().info({ agentId: ctx.agentId, timeUntilMove, moveType }, 'Planning move');

        let response = `**Moving Plan**\n\n`;
        response += `**Time until move:** ${timeUntilMove}\n`;
        response += `**Move type:** ${moveType}\n`;
        if (situation) response += `**Situation:** ${situation}\n`;
        response += `\n---\n\n`;

        response += `**8+ Weeks Before:**\n`;
        response += `☐ Start decluttering - less stuff = cheaper move\n`;
        response += `☐ Get moving quotes (3+ companies)\n`;
        response += `☐ Create moving binder/folder for documents\n`;
        response += `☐ Start using up pantry items\n`;
        if (situation === 'selling') {
          response += `☐ Prep house for sale\n`;
          response += `☐ Research real estate agents\n`;
        }
        if (situation === 'renting') {
          response += `☐ Give notice (check lease requirements)\n`;
          response += `☐ Document current condition for deposit\n`;
        }

        response += `\n**4-6 Weeks Before:**\n`;
        response += `☐ Book movers or truck rental\n`;
        response += `☐ Notify important parties (employer, school, etc.)\n`;
        response += `☐ Start packing non-essentials\n`;
        response += `☐ Arrange utility transfers/shutoffs\n`;
        response += `☐ Forward mail (USPS)\n`;
        response += `☐ Gather packing supplies\n`;

        response += `\n**2-3 Weeks Before:**\n`;
        response += `☐ Pack room by room\n`;
        response += `☐ Label boxes clearly (contents + room)\n`;
        response += `☐ Confirm moving company/truck\n`;
        response += `☐ Arrange pet/child care for moving day\n`;
        response += `☐ Refill prescriptions\n`;

        response += `\n**1 Week Before:**\n`;
        response += `☐ Confirm all appointments\n`;
        response += `☐ Pack suitcase for first few days\n`;
        response += `☐ Clean as you pack\n`;
        response += `☐ Defrost freezer\n`;
        response += `☐ Prepare "open first" box\n`;

        response += `\n**Moving Day:**\n`;
        response += `☐ Final walkthrough of old place\n`;
        response += `☐ Check all closets, cabinets, garage\n`;
        response += `☐ Collect all keys\n`;
        response += `☐ Document meter readings\n`;
        response += `☐ Tip movers (if applicable)\n`;

        if (moveType === 'long-distance' || moveType === 'international') {
          response += `\n**For ${moveType} moves:**\n`;
          response += `☐ Research your new area\n`;
          response += `☐ Transfer important records\n`;
          response += `☐ Update driver's license/registration\n`;
          response += `☐ Find new service providers (doctors, etc.)\n`;
        }

        response += `\n---\n\n`;
        response += `Would you like a detailed checklist for any specific phase?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EMERGENCY PREPAREDNESS
// ============================================================================

const assessEmergencyPreparednessDef: ToolDefinition = {
  id: 'assessEmergencyPreparedness',
  name: 'Assess Emergency Preparedness',
  description: 'Evaluate household emergency preparedness',
  domain: 'home',
  tags: ['home', 'emergency', 'safety', 'preparedness'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help assess and improve household emergency preparedness.',
      parameters: z.object({
        focus: z.enum(['supplies', 'documents', 'planning', 'all']).describe('What to focus on'),
        householdSize: z.number().optional().describe('Number of people in household'),
      }),
      execute: async ({ focus, householdSize }) => {
        getLogger().info({ agentId: ctx.agentId, focus }, 'Assessing emergency preparedness');

        let response = `**Emergency Preparedness Assessment**\n\n`;
        if (householdSize) response += `**Household size:** ${householdSize} people\n\n`;

        if (focus === 'supplies' || focus === 'all') {
          response += `**📦 Emergency Supplies:**\n\n`;
          EMERGENCY_PREP_CHECKLIST.supplies.forEach((item) => {
            response += `☐ ${item}\n`;
          });
          response += `\n`;
        }

        if (focus === 'documents' || focus === 'all') {
          response += `**📄 Important Documents:**\n\n`;
          EMERGENCY_PREP_CHECKLIST.documents.forEach((item) => {
            response += `☐ ${item}\n`;
          });
          response += `\n_Store copies in waterproof container or upload to secure cloud storage_\n\n`;
        }

        if (focus === 'planning' || focus === 'all') {
          response += `**📋 Emergency Planning:**\n\n`;
          EMERGENCY_PREP_CHECKLIST.planning.forEach((item) => {
            response += `☐ ${item}\n`;
          });
          response += `\n`;
        }

        response += `---\n\n`;

        response += `**Common Risks to Prepare For:**\n`;
        response += `• Power outages\n`;
        response += `• Severe weather (specific to your area)\n`;
        response += `• Medical emergencies\n`;
        response += `• Fire\n`;
        response += `• Natural disasters in your region\n\n`;

        response += `**Maintenance:**\n`;
        response += `• Check supplies every 6 months\n`;
        response += `• Rotate food and water\n`;
        response += `• Update documents as needed\n`;
        response += `• Review plan with household yearly\n\n`;

        response += `What area would you like to work on first?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PROJECT MANAGEMENT TOOLS
// ============================================================================

const planHomeProjectDef: ToolDefinition = {
  id: 'planHomeProject',
  name: 'Plan Home Project',
  description: 'Plan home improvement projects',
  domain: 'home',
  tags: ['home', 'projects', 'planning', 'improvement'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help plan a home improvement project.',
      parameters: z.object({
        project: z.string().describe('The project'),
        budget: z.string().optional().describe('Budget range'),
        timeline: z.string().optional().describe('Desired timeline'),
        diyOrPro: z.enum(['diy', 'professional', 'unsure']).optional(),
      }),
      execute: async ({ project, budget, timeline, diyOrPro }) => {
        getLogger().info({ agentId: ctx.agentId, project }, 'Planning home project');

        let response = `**Home Project Plan: ${project}**\n\n`;
        if (budget) response += `**Budget:** ${budget}\n`;
        if (timeline) response += `**Timeline:** ${timeline}\n`;
        response += `\n---\n\n`;

        response += `**Planning Steps:**\n\n`;

        response += `**1. Define Scope**\n`;
        response += `• Exactly what will be done?\n`;
        response += `• What will NOT be included?\n`;
        response += `• What's the desired end result?\n\n`;

        response += `**2. Research & Estimate**\n`;
        response += `• Research costs for materials/labor\n`;
        response += `• Get multiple quotes if using professionals\n`;
        response += `• Add 10-20% contingency for surprises\n`;
        response += `• Understand permits needed\n\n`;

        response += `**3. DIY vs Professional**\n`;
        if (diyOrPro === 'unsure') {
          response += `**Consider professional if:**\n`;
          response += `• Involves electrical, plumbing, or structural\n`;
          response += `• Requires permits and inspections\n`;
          response += `• Mistakes would be costly or dangerous\n`;
          response += `• Time is more valuable than money saved\n\n`;
          response += `**DIY might work if:**\n`;
          response += `• Purely cosmetic changes\n`;
          response += `• You have the skills and tools\n`;
          response += `• You have time to learn and redo if needed\n`;
          response += `• Failure wouldn't be catastrophic\n\n`;
        }

        response += `**4. Create Timeline**\n`;
        response += `• Realistic timeline including research phase\n`;
        response += `• Account for ordering materials/scheduling\n`;
        response += `• Build in buffer for delays\n`;
        response += `• Consider impact on daily life during project\n\n`;

        response += `**5. Prepare**\n`;
        response += `• Gather materials and tools\n`;
        response += `• Clear and protect the work area\n`;
        response += `• Have a plan for disruption\n`;
        response += `• Know your backup plan if things go wrong\n\n`;

        response += `---\n\n`;
        response += `What aspect would you like to plan in more detail?`;

        return response;
      },
    });
  },
};

const manageContractorDef: ToolDefinition = {
  id: 'manageContractor',
  name: 'Manage Contractor',
  description: 'Guidance for working with contractors',
  domain: 'home',
  tags: ['home', 'contractors', 'management'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help with finding and managing home contractors.',
      parameters: z.object({
        phase: z
          .enum(['finding', 'vetting', 'contracting', 'during-project', 'issues'])
          .describe('Project phase'),
        projectType: z.string().optional().describe('Type of project'),
      }),
      execute: async ({ phase, projectType }) => {
        getLogger().info({ agentId: ctx.agentId, phase }, 'Managing contractor');

        let response = `**Working with Contractors**\n\n`;
        if (projectType) response += `**Project:** ${projectType}\n\n`;

        const phaseAdvice: Record<string, string> = {
          finding:
            `**Finding Good Contractors:**\n\n` +
            `• Ask neighbors and friends for referrals\n` +
            `• Check local community groups/Nextdoor\n` +
            `• Look for specialists in your type of project\n` +
            `• Verify license on state contractor board website\n` +
            `• Get at least 3 quotes\n\n` +
            `**Red flags:**\n` +
            `• No physical address or only a P.O. box\n` +
            `• Demands full payment upfront\n` +
            `• Significantly lower than other bids\n` +
            `• Pressure to decide immediately\n` +
            `• Won't provide references`,

          vetting:
            `**Vetting Contractors:**\n\n` +
            `**Questions to ask:**\n` +
            `• How long have you been in business?\n` +
            `• Are you licensed and insured? (Verify!)\n` +
            `• Will you pull permits?\n` +
            `• What's your timeline?\n` +
            `• Who will be on-site daily?\n` +
            `• Can you provide references?\n` +
            `• What's your warranty?\n\n` +
            `**Check:**\n` +
            `• License status (state website)\n` +
            `• Insurance certificates\n` +
            `• BBB rating\n` +
            `• Online reviews (multiple sources)\n` +
            `• References (actually call them)`,

          contracting:
            `**The Contract:**\n\n` +
            `**Must include:**\n` +
            `• Detailed scope of work\n` +
            `• Materials specifications\n` +
            `• Total price and payment schedule\n` +
            `• Start and completion dates\n` +
            `• Change order process\n` +
            `• Warranty information\n` +
            `• Permit responsibilities\n` +
            `• Cleanup expectations\n\n` +
            `**Payment tips:**\n` +
            `• Never pay in full upfront\n` +
            `• Typical: 10-30% deposit, progress payments, final payment\n` +
            `• Hold final 10-15% until fully complete\n` +
            `• Pay by check or card for records`,

          'during-project':
            `**During the Project:**\n\n` +
            `• Document everything (photos, notes)\n` +
            `• Communicate in writing when possible\n` +
            `• Ask questions if something seems wrong\n` +
            `• Address issues immediately, don't wait\n` +
            `• Keep records of all payments\n` +
            `• Be available for decisions\n` +
            `• Be respectful but firm about expectations`,

          issues:
            `**Handling Problems:**\n\n` +
            `**First steps:**\n` +
            `• Address directly with contractor\n` +
            `• Document the issue in writing\n` +
            `• Reference the contract\n` +
            `• Give reasonable time to fix\n\n` +
            `**If unresolved:**\n` +
            `• File complaint with licensing board\n` +
            `• Contact BBB\n` +
            `• Consult attorney if significant\n` +
            `• Review contract for dispute resolution\n\n` +
            `**Prevention:**\n` +
            `• Good contract is your best protection\n` +
            `• Don't pay ahead of work completed\n` +
            `• Document everything`,
        };

        response += phaseAdvice[phase];

        response += `\n\n---\n\n`;
        response += `What specific situation would you like to discuss?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const homeTools: ToolDefinition[] = [
  // Maintenance
  remindHomeMaintenanceDef,
  trackRepairDef,
  // Organization
  coachDeclutteringDef,
  organizeSpaceDef,
  // Moving
  planMoveDef,
  // Emergency
  assessEmergencyPreparednessDef,
  // Projects
  planHomeProjectDef,
  manageContractorDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('home', homeTools);

export default getToolDefinitions;
