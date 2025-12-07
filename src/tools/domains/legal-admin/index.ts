/**
 * Legal & Administrative Domain Tools
 *
 * Tools for supporting document organization, estate planning, insurance review,
 * and other administrative life tasks. This domain helps with life logistics.
 *
 * IMPORTANT: We provide organizational support, NOT legal advice.
 * Always recommend consulting professionals for legal matters.
 *
 * DOMAIN: legal-admin
 * TOOLS:
 *   Documents: organizeDocuments, locateDocument
 *   Estate Planning: promptEstatePlanning, reviewBeneficiaries
 *   Insurance: reviewInsuranceCoverage, identifyInsuranceGaps
 *   Taxes: prepareForTaxSeason, gatherTaxDocuments
 *   Administrative: explainContract, reminderAnnualTasks
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// ADMINISTRATIVE CHECKLISTS
// ============================================================================

const ESTATE_PLANNING_CHECKLIST = {
  essential: [
    { item: 'Will', description: 'Legally specifies how your assets should be distributed' },
    { item: 'Healthcare Power of Attorney', description: 'Names someone to make medical decisions if you cannot' },
    { item: 'Financial Power of Attorney', description: 'Names someone to handle financial matters if you cannot' },
    { item: 'Advance Directive/Living Will', description: 'Specifies your healthcare wishes' },
  ],
  additional: [
    { item: 'Trust', description: 'May help avoid probate and provide control over asset distribution' },
    { item: 'Beneficiary Designations', description: 'On retirement accounts, life insurance, etc.' },
    { item: 'Digital Asset Plan', description: 'Passwords, accounts, digital property' },
    { item: 'Letter of Intent', description: 'Non-legal guidance for your wishes' },
    { item: 'Guardianship Designation', description: 'For minor children' },
  ],
};

const INSURANCE_TYPES = {
  health: {
    name: 'Health Insurance',
    purpose: 'Medical expenses coverage',
    review: 'During open enrollment annually',
  },
  life: {
    name: 'Life Insurance',
    purpose: 'Income replacement for dependents',
    review: 'When life circumstances change (marriage, kids, mortgage)',
  },
  disability: {
    name: 'Disability Insurance',
    purpose: 'Income protection if you cannot work',
    review: 'When income or expenses change significantly',
  },
  auto: {
    name: 'Auto Insurance',
    purpose: 'Vehicle and liability coverage',
    review: 'Annually or when buying/selling vehicle',
  },
  home: {
    name: 'Homeowners/Renters Insurance',
    purpose: 'Property and liability protection',
    review: 'Annually or when home value/contents change',
  },
  umbrella: {
    name: 'Umbrella Insurance',
    purpose: 'Additional liability coverage beyond other policies',
    review: 'When assets grow or risks increase',
  },
};

const ANNUAL_ADMIN_TASKS = {
  january: [
    'Review and update beneficiaries on accounts',
    'Check credit report (free at annualcreditreport.com)',
    'Review insurance coverages',
  ],
  spring: [
    'File taxes or extension (April)',
    'Review retirement contributions',
    'Update emergency contacts',
  ],
  summer: [
    'Review estate planning documents',
    'Update home inventory for insurance',
    'Mid-year financial check-in',
  ],
  fall: [
    'Open enrollment for health insurance',
    'Review FSA/HSA contributions',
    'Charitable giving planning',
  ],
  december: [
    'Max out retirement contributions',
    'Tax-loss harvesting',
    'Required minimum distributions (if applicable)',
    'Year-end charitable donations',
  ],
};

// ============================================================================
// DOCUMENT ORGANIZATION TOOLS
// ============================================================================

const organizeDocumentsDef: ToolDefinition = {
  id: 'organizeDocuments',
  name: 'Organize Documents',
  description: 'Important document organization guidance',
  domain: 'legal-admin',
  tags: ['legal-admin', 'documents', 'organization'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help organize important documents and create a system.',
      parameters: z.object({
        focus: z.enum([
          'getting-started',
          'what-to-keep',
          'storage-system',
          'digital-backup',
        ]).describe('What to focus on'),
        currentState: z.enum(['chaos', 'somewhat-organized', 'need-system']).optional(),
      }),
      execute: async ({ focus, currentState }) => {
        getLogger().info({ agentId: ctx.agentId, focus }, 'Organizing documents');

        let response = `**Document Organization**\n\n`;

        if (focus === 'getting-started') {
          response += `**Getting Started:**\n\n`;
          response += `Start with these critical documents:\n\n`;
          response += `**Must have accessible:**\n`;
          response += `☐ Birth certificates\n`;
          response += `☐ Social Security cards\n`;
          response += `☐ Passports\n`;
          response += `☐ Marriage/divorce certificates\n`;
          response += `☐ Driver's licenses (copies)\n`;
          response += `☐ Insurance policies\n`;
          response += `☐ Estate planning documents (will, POA, etc.)\n`;
          response += `☐ Property deeds/titles\n`;
          response += `☐ Vehicle titles\n`;
          response += `☐ Tax returns (last 7 years)\n\n`;
          response += `**Next steps:**\n`;
          response += `1. Gather everything in one place\n`;
          response += `2. Sort by category\n`;
          response += `3. Create storage system\n`;
          response += `4. Make digital backups\n`;
          response += `5. Tell someone trusted where things are\n`;
        } else if (focus === 'what-to-keep') {
          response += `**What to Keep and How Long:**\n\n`;
          response += `**Keep forever:**\n`;
          response += `• Birth/death certificates\n`;
          response += `• Marriage/divorce papers\n`;
          response += `• Adoption papers\n`;
          response += `• Military discharge papers\n`;
          response += `• Social Security documents\n`;
          response += `• Pension documents\n\n`;
          response += `**Keep 7 years:**\n`;
          response += `• Tax returns and supporting documents\n`;
          response += `• Major purchase receipts\n`;
          response += `• Investment records\n\n`;
          response += `**Keep 1 year:**\n`;
          response += `• Bank statements (digital is fine)\n`;
          response += `• Pay stubs (until you get W-2)\n`;
          response += `• Utility bills\n\n`;
          response += `**Can shred after verifying:**\n`;
          response += `• ATM receipts\n`;
          response += `• Sales receipts (unless for returns/warranty)\n`;
        } else if (focus === 'storage-system') {
          response += `**Creating a Storage System:**\n\n`;
          response += `**Physical storage:**\n`;
          response += `• Fireproof safe for critical originals\n`;
          response += `• Filing cabinet or accordion folder\n`;
          response += `• Safe deposit box for irreplaceable items\n\n`;
          response += `**Category labels:**\n`;
          response += `• Personal Identity\n`;
          response += `• Financial/Banking\n`;
          response += `• Insurance\n`;
          response += `• Legal/Estate\n`;
          response += `• Property\n`;
          response += `• Medical\n`;
          response += `• Tax (by year)\n`;
          response += `• Warranties/Receipts\n\n`;
          response += `**Tips:**\n`;
          response += `• Less is more - don't keep everything\n`;
          response += `• Review annually and purge\n`;
          response += `• Color coding helps\n`;
        } else {
          response += `**Digital Backup:**\n\n`;
          response += `**What to scan/backup:**\n`;
          response += `• All critical documents\n`;
          response += `• Insurance policies\n`;
          response += `• Photos of valuables (for insurance)\n`;
          response += `• Receipts for big purchases\n\n`;
          response += `**Where to store:**\n`;
          response += `• Cloud storage (Google Drive, Dropbox, iCloud)\n`;
          response += `• External hard drive (keep in separate location)\n`;
          response += `• Encrypted if sensitive\n\n`;
          response += `**Organization:**\n`;
          response += `• Mirror your physical filing system\n`;
          response += `• Name files descriptively (2024_Tax_Return.pdf)\n`;
          response += `• Include dates in filenames\n\n`;
          response += `**Password management:**\n`;
          response += `• Use a password manager\n`;
          response += `• Document how to access for emergencies\n`;
        }

        response += `\n---\n\nWhat aspect of document organization would you like to tackle?`;

        return response;
      },
    });
  },
};

const locateDocumentDef: ToolDefinition = {
  id: 'locateDocument',
  name: 'Locate Document',
  description: 'Help find or replace specific documents',
  domain: 'legal-admin',
  tags: ['legal-admin', 'documents', 'locate'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help locate or replace important documents.',
      parameters: z.object({
        documentType: z.enum([
          'birth-certificate',
          'social-security',
          'passport',
          'marriage-certificate',
          'tax-return',
          'deed',
          'other',
        ]).describe('Type of document needed'),
        situation: z.enum(['lost', 'never-had', 'need-copy']).describe('Current situation'),
      }),
      execute: async ({ documentType, situation }) => {
        getLogger().info({ agentId: ctx.agentId, documentType, situation }, 'Locating document');

        let response = `**Getting Your ${documentType}**\n`;
        response += `_Situation: ${situation}_\n\n`;
        response += `---\n\n`;

        const docInfo: Record<string, string> = {
          'birth-certificate':
            `**Birth Certificate:**\n\n` +
            `• Contact vital records office in the state where you were born\n` +
            `• VitalChek.com can help (official partner of many states)\n` +
            `• Expect to pay $10-30 fee\n` +
            `• Need: ID, possibly parent info\n` +
            `• Takes: 1-8 weeks depending on state\n`,

          'social-security':
            `**Social Security Card:**\n\n` +
            `• Apply at ssa.gov or local Social Security office\n` +
            `• Replacement is free (limit 3/year, 10/lifetime)\n` +
            `• Need: Proof of identity, citizenship/immigration status\n` +
            `• Takes: 10-14 business days\n` +
            `• Note: Many things don't actually require the card, just the number\n`,

          passport:
            `**Passport:**\n\n` +
            `• Apply at travel.state.gov\n` +
            `• New passport: acceptance facility (post offices, courthouses)\n` +
            `• Renewal: Can mail in if meets criteria\n` +
            `• Cost: $130-160 for adults\n` +
            `• Takes: 6-8 weeks routine, 2-3 weeks expedited ($60 extra)\n` +
            `• Lost/stolen: Report immediately, different process\n`,

          'marriage-certificate':
            `**Marriage Certificate:**\n\n` +
            `• Contact vital records office in county/state where married\n` +
            `• Or county clerk's office\n` +
            `• Need: Names, date of marriage, IDs\n` +
            `• Cost: Usually $10-30\n`,

          'tax-return':
            `**Tax Return Copy:**\n\n` +
            `• IRS.gov Get Transcript tool for free transcripts\n` +
            `• Form 4506-T for transcript (free)\n` +
            `• Form 4506 for actual copy ($43)\n` +
            `• Tax software may have copies (TurboTax, H&R Block)\n` +
            `• Takes: Transcripts available immediately online, copies take weeks\n`,

          deed:
            `**Property Deed:**\n\n` +
            `• Contact county recorder's/registrar's office where property is located\n` +
            `• Usually available online through county website\n` +
            `• Title company may have copies\n` +
            `• Small fee for certified copy\n`,
        };

        response += docInfo[documentType] || `For this document, contact the issuing agency directly. `;
        response += `If you're not sure who issued it, start with your state's vital records office or the relevant government agency.\n`;

        response += `\n---\n\n`;
        response += `Need help with the process?`;

        return response;
      },
    });
  },
};

// ============================================================================
// ESTATE PLANNING TOOLS
// ============================================================================

const promptEstatePlanningDef: ToolDefinition = {
  id: 'promptEstatePlanning',
  name: 'Prompt Estate Planning',
  description: 'Encourage estate planning basics',
  domain: 'legal-admin',
  tags: ['legal-admin', 'estate', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Encourage and guide estate planning basics. Not legal advice.',
      parameters: z.object({
        lifeSituation: z.enum([
          'single',
          'married',
          'has-kids',
          'owns-property',
          'general',
        ]).optional().describe('Life situation'),
        currentDocuments: z.array(z.string()).optional().describe('Documents they already have'),
      }),
      execute: async ({ lifeSituation, currentDocuments }) => {
        getLogger().info({ agentId: ctx.agentId, lifeSituation }, 'Prompting estate planning');

        let response = `**Estate Planning Basics**\n\n`;
        if (lifeSituation) response += `_Life situation: ${lifeSituation}_\n\n`;
        response += `⚠️ **Note:** This is general information, not legal advice. Consult an attorney for your specific situation.\n\n`;
        response += `---\n\n`;

        response += `**Essential Documents:**\n\n`;
        ESTATE_PLANNING_CHECKLIST.essential.forEach(({ item, description }) => {
          const hasIt = currentDocuments?.includes(item.toLowerCase());
          response += `${hasIt ? '✅' : '☐'} **${item}**\n`;
          response += `   ${description}\n\n`;
        });

        response += `**Also Important:**\n\n`;
        ESTATE_PLANNING_CHECKLIST.additional.forEach(({ item, description }) => {
          response += `☐ **${item}**\n`;
          response += `   ${description}\n\n`;
        });

        if (lifeSituation === 'has-kids') {
          response += `---\n\n`;
          response += `**With children, especially important:**\n`;
          response += `• Guardianship designation in your will\n`;
          response += `• Life insurance adequate to raise them\n`;
          response += `• Trust to manage assets for minors\n`;
          response += `• Updated beneficiaries on all accounts\n`;
        }

        response += `\n---\n\n`;

        response += `**Getting Started:**\n`;
        response += `• Online services (LegalZoom, Trust & Will) for basic situations\n`;
        response += `• Estate planning attorney for complex situations\n`;
        response += `• Some employers offer legal benefits including estate planning\n`;
        response += `• Many attorneys offer free initial consultations\n\n`;

        response += `What's your biggest barrier to getting this done?`;

        return response;
      },
    });
  },
};

const reviewBeneficiariesDef: ToolDefinition = {
  id: 'reviewBeneficiaries',
  name: 'Review Beneficiaries',
  description: 'Prompt annual beneficiary review',
  domain: 'legal-admin',
  tags: ['legal-admin', 'beneficiaries', 'review'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Remind and guide annual beneficiary review.',
      parameters: z.object({
        lastReview: z.string().optional().describe('When last reviewed'),
        lifeChange: z.string().optional().describe('Recent life change'),
      }),
      execute: async ({ lastReview, lifeChange }) => {
        getLogger().info({ agentId: ctx.agentId, lifeChange }, 'Reviewing beneficiaries');

        let response = `**Beneficiary Review**\n\n`;
        if (lastReview) response += `_Last reviewed: ${lastReview}_\n`;
        if (lifeChange) response += `_Recent change: ${lifeChange}_\n`;
        response += `\n---\n\n`;

        response += `**Why This Matters:**\n`;
        response += `Beneficiary designations often override your will. An outdated beneficiary (like an ex-spouse) could inherit your retirement account despite what your will says.\n\n`;

        response += `**Accounts to Check:**\n\n`;
        response += `☐ 401(k) / 403(b) / retirement accounts\n`;
        response += `☐ IRAs\n`;
        response += `☐ Life insurance policies\n`;
        response += `☐ Pension benefits\n`;
        response += `☐ Bank accounts (POD/TOD)\n`;
        response += `☐ Brokerage accounts (TOD)\n`;
        response += `☐ HSA accounts\n`;
        response += `☐ Annuities\n\n`;

        response += `**What to Review:**\n`;
        response += `• Is the primary beneficiary correct?\n`;
        response += `• Is the contingent beneficiary named and current?\n`;
        response += `• Are percentages/shares correct if multiple?\n`;
        response += `• Are minor children named appropriately (trust vs direct)?\n`;
        response += `• Are addresses/contact info current?\n\n`;

        response += `**When to Update:**\n`;
        response += `• Marriage/divorce\n`;
        response += `• Birth/adoption of child\n`;
        response += `• Death of beneficiary\n`;
        response += `• Annual review (at minimum)\n\n`;

        response += `Would you like help creating a beneficiary review checklist?`;

        return response;
      },
    });
  },
};

// ============================================================================
// INSURANCE TOOLS
// ============================================================================

const reviewInsuranceCoverageDef: ToolDefinition = {
  id: 'reviewInsuranceCoverage',
  name: 'Review Insurance Coverage',
  description: 'Guide insurance coverage review',
  domain: 'legal-admin',
  tags: ['legal-admin', 'insurance', 'review'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help review insurance coverage for adequacy.',
      parameters: z.object({
        insuranceType: z.enum([
          'health', 'life', 'disability', 'auto', 'home', 'umbrella', 'all',
        ]).describe('Type to review'),
        lifeChange: z.string().optional().describe('Recent life change'),
      }),
      execute: async ({ insuranceType, lifeChange }) => {
        getLogger().info({ agentId: ctx.agentId, insuranceType }, 'Reviewing insurance');

        let response = `**Insurance Coverage Review**\n\n`;
        if (lifeChange) response += `_Life change: ${lifeChange}_\n\n`;
        response += `---\n\n`;

        if (insuranceType === 'all') {
          response += `**Insurance Types to Review:**\n\n`;
          Object.entries(INSURANCE_TYPES).forEach(([key, info]) => {
            response += `**${info.name}**\n`;
            response += `Purpose: ${info.purpose}\n`;
            response += `Review: ${info.review}\n\n`;
          });
        } else {
          const info = INSURANCE_TYPES[insuranceType];
          response += `**${info.name}**\n\n`;
          response += `**Purpose:** ${info.purpose}\n`;
          response += `**When to review:** ${info.review}\n\n`;

          if (insuranceType === 'life') {
            response += `**Do you need life insurance?**\n`;
            response += `• Yes if others depend on your income\n`;
            response += `• How much? Common rule: 10-12x annual income\n`;
            response += `• Term vs Whole: Term is usually better value\n\n`;
          } else if (insuranceType === 'disability') {
            response += `**Disability Insurance:**\n`;
            response += `• Often overlooked but critical\n`;
            response += `• You're more likely to become disabled than die young\n`;
            response += `• Check if employer provides (usually 60% of salary)\n`;
            response += `• Consider supplemental for more coverage\n\n`;
          } else if (insuranceType === 'home') {
            response += `**Homeowners/Renters:**\n`;
            response += `• Does coverage match current home value/contents?\n`;
            response += `• Is liability coverage adequate?\n`;
            response += `• Are valuables covered (jewelry, electronics)?\n`;
            response += `• Do you need flood insurance (not usually included)?\n\n`;
          }
        }

        response += `**General Review Questions:**\n`;
        response += `• What is covered? What isn't?\n`;
        response += `• What's the deductible? Can you afford it?\n`;
        response += `• Is coverage adequate for your current situation?\n`;
        response += `• Are you paying for coverage you don't need?\n`;
        response += `• When did you last shop around for rates?\n\n`;

        response += `Would you like to dive deeper into any coverage area?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TAX TOOLS
// ============================================================================

const prepareForTaxSeasonDef: ToolDefinition = {
  id: 'prepareForTaxSeason',
  name: 'Prepare For Tax Season',
  description: 'Tax preparation reminders and guidance',
  domain: 'legal-admin',
  tags: ['legal-admin', 'taxes', 'preparation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help prepare for tax season.',
      parameters: z.object({
        timing: z.enum(['year-end', 'jan-feb', 'march-april', 'extension']).describe('Where in tax season'),
        situation: z.enum(['simple', 'complex', 'changed']).optional(),
      }),
      execute: async ({ timing, situation }) => {
        getLogger().info({ agentId: ctx.agentId, timing }, 'Preparing for tax season');

        let response = `**Tax Season Preparation**\n`;
        response += `_Timing: ${timing}_\n\n`;
        response += `---\n\n`;

        if (timing === 'year-end') {
          response += `**Year-End Tax Moves:**\n\n`;
          response += `☐ Max out retirement contributions (401k, IRA)\n`;
          response += `☐ Consider tax-loss harvesting\n`;
          response += `☐ Make charitable donations\n`;
          response += `☐ Review FSA balance (use it or lose it)\n`;
          response += `☐ Estimate income - any surprise tax liability?\n`;
          response += `☐ Consider bunching deductions if near standard deduction\n`;
        } else if (timing === 'jan-feb') {
          response += `**January-February Tasks:**\n\n`;
          response += `☐ Gather W-2s (due by Jan 31)\n`;
          response += `☐ Gather 1099s (due by Feb 15)\n`;
          response += `☐ Collect receipts and records\n`;
          response += `☐ Organize deduction documentation\n`;
          response += `☐ Get last year's return for reference\n`;
          response += `☐ Decide: DIY, software, or professional?\n`;
        } else if (timing === 'march-april') {
          response += `**March-April Final Prep:**\n\n`;
          response += `☐ Ensure all documents received\n`;
          response += `☐ File by April 15 (or request extension)\n`;
          response += `☐ Make IRA contribution (deadline is tax day)\n`;
          response += `☐ Review return carefully before filing\n`;
          response += `☐ Set up direct deposit for refund\n`;
          response += `☐ Plan for any payment due\n`;
        } else {
          response += `**Filing an Extension:**\n\n`;
          response += `• Extensions are automatic - file Form 4868\n`;
          response += `• Extends filing deadline to October 15\n`;
          response += `• Does NOT extend payment deadline\n`;
          response += `• Estimate and pay what you owe by April 15\n`;
          response += `• Penalty is for late payment, not late filing\n`;
        }

        response += `\n---\n\n`;

        response += `**Key Dates:**\n`;
        response += `• Jan 31: W-2s and some 1099s due\n`;
        response += `• Feb 15: Most 1099s due\n`;
        response += `• April 15: Filing deadline (or extension deadline)\n`;
        response += `• April 15: IRA contribution deadline for prior year\n`;
        response += `• Oct 15: Extended filing deadline\n\n`;

        response += `What's your biggest tax season concern?`;

        return response;
      },
    });
  },
};

// ============================================================================
// ANNUAL TASKS TOOL
// ============================================================================

const reminderAnnualTasksDef: ToolDefinition = {
  id: 'reminderAnnualTasks',
  name: 'Reminder Annual Tasks',
  description: 'Administrative task reminders throughout the year',
  domain: 'legal-admin',
  tags: ['legal-admin', 'annual', 'reminders'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Provide reminders for annual administrative tasks.',
      parameters: z.object({
        currentPeriod: z.enum(['january', 'spring', 'summer', 'fall', 'december']).describe('Time of year'),
      }),
      execute: async ({ currentPeriod }) => {
        getLogger().info({ agentId: ctx.agentId, currentPeriod }, 'Annual task reminders');

        const tasks = ANNUAL_ADMIN_TASKS[currentPeriod];

        let response = `**${currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1)} Administrative Tasks**\n\n`;
        response += `---\n\n`;

        response += `**This Period:**\n`;
        tasks.forEach(task => {
          response += `☐ ${task}\n`;
        });

        response += `\n---\n\n`;

        response += `**Annual Admin Calendar:**\n\n`;
        Object.entries(ANNUAL_ADMIN_TASKS).forEach(([period, periodTasks]) => {
          response += `**${period.charAt(0).toUpperCase() + period.slice(1)}:**\n`;
          periodTasks.slice(0, 2).forEach(task => {
            response += `• ${task}\n`;
          });
          response += `\n`;
        });

        response += `---\n\n`;
        response += `Setting up recurring calendar reminders can help ensure these don't slip through the cracks.\n\n`;
        response += `Which task would you like to tackle first?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const legalAdminTools: ToolDefinition[] = [
  // Documents
  organizeDocumentsDef,
  locateDocumentDef,
  // Estate Planning
  promptEstatePlanningDef,
  reviewBeneficiariesDef,
  // Insurance
  reviewInsuranceCoverageDef,
  // Taxes
  prepareForTaxSeasonDef,
  // Annual Tasks
  reminderAnnualTasksDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'legal-admin',
  legalAdminTools
);

export default getToolDefinitions;

