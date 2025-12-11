/**
 * Math Utilities
 *
 * Quick math tools: tip calculation, bill splitting, percentages.
 *
 * @module simple-utilities/math-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { recordUsage, generateInsight } from './pattern-intelligence.js';
import { updateTipPreferences } from './persistence.js';

const calculateTipDef: ToolDefinition = {
  id: 'calculateTip',
  name: 'Calculate Tip',
  description: 'Calculate tip amount and total bill',
  domain: 'simple-utilities',
  tags: ['math', 'tip', 'restaurant', 'money'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate the tip on a bill. Use when someone asks:
- "What's 20% tip on $47?"
- "How much should I tip on $85?"
- "Calculate the tip for dinner"`,
      parameters: z.object({
        billAmount: z.number().describe('The bill amount in dollars'),
        tipPercent: z.number().default(20).describe('Tip percentage (default 20%)'),
        splitWays: z.number().optional().describe('If splitting, how many people'),
      }),
      execute: async ({ billAmount, tipPercent, splitWays }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Record usage for pattern learning
        recordUsage(userId, 'calculateTip', { billAmount, tipPercent, splitWays });

        const tip = billAmount * (tipPercent / 100);
        const total = billAmount + tip;

        let response = `On $${billAmount.toFixed(2)}:\n`;
        response += `• ${tipPercent}% tip = $${tip.toFixed(2)}\n`;
        response += `• Total = $${total.toFixed(2)}`;

        if (splitWays && splitWays > 1) {
          const perPerson = total / splitWays;
          response += `\n• Split ${splitWays} ways = $${perPerson.toFixed(2)} each`;
        }

        // Add quick reference for other percentages
        if (tipPercent === 20) {
          const tip15 = billAmount * 0.15;
          const tip25 = billAmount * 0.25;
          response += `\n\n(Quick ref: 15% = $${tip15.toFixed(2)}, 25% = $${tip25.toFixed(2)})`;
        }

        // Apply pattern intelligence - notice patterns, add wisdom
        const insight = generateInsight(
          userId,
          'calculateTip',
          { billAmount, tipPercent },
          response
        );
        let finalResponse = insight.response;
        if (insight.followUp) {
          finalResponse += `\n\n${insight.followUp}`;
        }

        // Persist tip preference for cross-session learning
        updateTipPreferences(userId, tipPercent).catch((err) =>
          getLogger().debug({ err }, 'Failed to persist tip preference')
        );

        return finalResponse;
      },
    });
  },
};

const splitBillDef: ToolDefinition = {
  id: 'splitBill',
  name: 'Split Bill',
  description: 'Split a bill evenly between people',
  domain: 'simple-utilities',
  tags: ['math', 'split', 'money', 'group'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Split a bill between multiple people. Use when someone asks:
- "Split $150 four ways"
- "How much do we each owe if the bill is $87?"
- "Divide this bill between 3 people"`,
      parameters: z.object({
        totalAmount: z.number().describe('Total bill amount'),
        numberOfPeople: z.number().min(2).describe('Number of people splitting'),
        includeTip: z.boolean().default(true).describe('Add tip before splitting'),
        tipPercent: z.number().default(20).describe('Tip percentage if including tip'),
      }),
      execute: async ({ totalAmount, numberOfPeople, includeTip, tipPercent }) => {
        let finalTotal = totalAmount;
        let response = '';

        if (includeTip) {
          const tip = totalAmount * (tipPercent / 100);
          finalTotal = totalAmount + tip;
          response = `Bill: $${totalAmount.toFixed(2)} + ${tipPercent}% tip ($${tip.toFixed(2)}) = $${finalTotal.toFixed(2)}\n\n`;
        } else {
          response = `Total: $${totalAmount.toFixed(2)}\n\n`;
        }

        const perPerson = finalTotal / numberOfPeople;
        response += `**Split ${numberOfPeople} ways: $${perPerson.toFixed(2)} each**`;

        // Handle uneven splits
        const rounded = Math.ceil(perPerson * 100) / 100;
        const totalCollected = rounded * numberOfPeople;
        if (totalCollected !== finalTotal) {
          response += `\n\n(If everyone pays $${rounded.toFixed(2)}, you'll collect $${totalCollected.toFixed(2)} — ${totalCollected > finalTotal ? 'extra covers rounding' : 'close enough'})`;
        }

        return response;
      },
    });
  },
};

const calculatePercentageDef: ToolDefinition = {
  id: 'calculatePercentage',
  name: 'Calculate Percentage',
  description: 'Quick percentage calculations',
  domain: 'simple-utilities',
  tags: ['math', 'percentage', 'calculation'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate percentages. Use when someone asks:
- "What's 15% of 240?"
- "What percentage is 30 of 120?"
- "Increase 50 by 20%"
- "Decrease 80 by 25%"`,
      parameters: z.object({
        operation: z
          .enum(['of', 'is_what_percent', 'increase', 'decrease'])
          .describe('What type of calculation'),
        value: z.number().describe('The main value'),
        percent: z.number().optional().describe('The percentage (for of/increase/decrease)'),
        partValue: z.number().optional().describe('The part value (for is_what_percent)'),
      }),
      execute: async ({ operation, value, percent, partValue }) => {
        switch (operation) {
          case 'of': {
            const result = value * ((percent || 0) / 100);
            return `${percent}% of ${value} = **${result.toFixed(2)}**`;
          }
          case 'is_what_percent': {
            const percentage = ((partValue || 0) / value) * 100;
            return `${partValue} is **${percentage.toFixed(1)}%** of ${value}`;
          }
          case 'increase': {
            const increase = value * ((percent || 0) / 100);
            const result = value + increase;
            return `${value} + ${percent}% = **${result.toFixed(2)}** (increased by ${increase.toFixed(2)})`;
          }
          case 'decrease': {
            const decrease = value * ((percent || 0) / 100);
            const result = value - decrease;
            return `${value} - ${percent}% = **${result.toFixed(2)}** (decreased by ${decrease.toFixed(2)})`;
          }
          default:
            return 'I can help with percentage calculations. Try "what is 15% of 200" or "what percent is 30 of 120"';
        }
      },
    });
  },
};

const quickMathDef: ToolDefinition = {
  id: 'quickMath',
  name: 'Quick Math',
  description: 'Simple arithmetic calculations',
  domain: 'simple-utilities',
  tags: ['math', 'calculator', 'arithmetic'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Do quick math calculations. Use for:
- Basic arithmetic: "What's 247 + 183?"
- Multiplication: "12 times 15"
- Division: "Split 847 by 12"`,
      parameters: z.object({
        expression: z.string().describe('The math expression to calculate'),
      }),
      execute: async ({ expression }) => {
        try {
          // Clean up the expression
          const cleaned = expression
            .toLowerCase()
            .replace(/what's|what is|calculate|equals/gi, '')
            .replace(/times|x|×/gi, '*')
            .replace(/divided by|÷/gi, '/')
            .replace(/plus/gi, '+')
            .replace(/minus/gi, '-')
            .replace(/[^0-9+\-*/().]/g, '')
            .trim();

          // Safe evaluation using Function constructor (no eval)
          const result = new Function(`return ${cleaned}`)();

          if (typeof result !== 'number' || !isFinite(result)) {
            return `I couldn't calculate that. Could you rephrase the math problem?`;
          }

          // Format nicely
          const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(2);

          return `${expression} = **${formatted}**`;
        } catch {
          return `I had trouble with that calculation. Could you give me the numbers more clearly?`;
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const mathToolDefinitions: ToolDefinition[] = [
  calculateTipDef,
  splitBillDef,
  calculatePercentageDef,
  quickMathDef,
];

export { calculateTipDef, splitBillDef, calculatePercentageDef, quickMathDef };
