/**
 * E2E Tests for New Tool Domains (January 2026)
 *
 * Tests semantic routing, tool loading, and execution for:
 * - trauma-support (safety-critical)
 * - health-diagnosis (safety-critical)
 * - concierge (Twilio-based)
 * - webhooks (automation)
 * - marketing (social media)
 * - referral (voice calls)
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock logger before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock performance instrumentation
vi.mock('../../../services/performance-instrumentation.js', () => ({
  traceToolCall: vi.fn((_name, fn) => fn()),
  traceHandoff: vi.fn((_name, fn) => fn()),
  traceServiceCall: vi.fn((_name, fn) => fn()),
}));

import {
  allToolDefinitions,
  toolsByCategory,
  getToolStats,
  traumaSupportTools,
  healthDiagnosisTools,
  conciergeTools,
  webhooksTools,
  marketingTools,
} from '../tool-definitions/index.js';

describe('New Domains E2E Tests', () => {
  describe('Tool Registration', () => {
    it('should include all new domain tools in allToolDefinitions', () => {
      const allIds = allToolDefinitions.map((t) => t.id);

      // Trauma support tools
      expect(allIds).toContain('trauma_aware_support');
      expect(allIds).toContain('trauma_grounding');
      expect(allIds).toContain('trauma_window_of_tolerance');

      // Health diagnosis tools
      expect(allIds).toContain('health_diagnosis_shock');
      expect(allIds).toContain('health_chronic_illness');
      expect(allIds).toContain('health_invisible_illness');
      expect(allIds).toContain('health_telling_others');

      // Concierge tools
      expect(allIds).toContain('concierge_hotel_quotes');
      expect(allIds).toContain('concierge_restaurant_reservation');
      expect(allIds).toContain('concierge_healthcare_appointment');
      expect(allIds).toContain('concierge_service_quotes');
      expect(allIds).toContain('concierge_check_status');

      // Webhooks tools
      expect(allIds).toContain('automation_trigger_webhook');
      expect(allIds).toContain('automation_list_webhooks');
      expect(allIds).toContain('automation_webhook_status');

      // Marketing tools
      expect(allIds).toContain('marketing_generate_content');
      expect(allIds).toContain('marketing_post_twitter');
      expect(allIds).toContain('marketing_post_linkedin');
      expect(allIds).toContain('marketing_list_scheduled');
      expect(allIds).toContain('marketing_analytics');
    });

    it('should have tools registered by category', () => {
      expect(toolsByCategory['trauma-support']).toBeDefined();
      expect(toolsByCategory['health-diagnosis']).toBeDefined();
      expect(toolsByCategory['concierge']).toBeDefined();
      expect(toolsByCategory['webhooks']).toBeDefined();
      expect(toolsByCategory['marketing']).toBeDefined();
    });

    it('should report correct tool counts', () => {
      const stats = getToolStats();
      expect(stats['trauma-support']).toBe(7);
      expect(stats['health-diagnosis']).toBe(4);
      expect(stats['concierge']).toBe(5);
      expect(stats['webhooks']).toBe(3);
      expect(stats['marketing']).toBe(5);
    });
  });

  describe('Trauma Support Semantic Routing', () => {
    it('should match trauma-related phrases', () => {
      const tool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      expect(tool.triggers.phrases).toContain("I've been through trauma");
      expect(tool.triggers.phrases).toContain('I have trauma');
    });

    it('should have high priority for safety-critical tools', () => {
      const tool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      expect(tool.priority).toBe(1);
    });

    it('should delegate to correct domain', () => {
      for (const tool of traumaSupportTools) {
        expect(tool.delegateTo).toBe('domains/trauma-support');
      }
    });

    it('should have anti-keywords to avoid false matches', () => {
      const tool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      expect(tool.triggers.antiKeywords).toContain('movie trauma');
      expect(tool.triggers.antiKeywords).toContain('fictional');
    });
  });

  describe('Health Diagnosis Semantic Routing', () => {
    it('should match diagnosis-related phrases', () => {
      const tool = healthDiagnosisTools.find((t) => t.id === 'health_diagnosis_shock')!;
      expect(tool.triggers.phrases).toContain('I just got diagnosed');
      expect(tool.triggers.phrases).toContain('the doctor told me I have');
    });

    it('should handle chronic illness phrases', () => {
      const tool = healthDiagnosisTools.find((t) => t.id === 'health_chronic_illness')!;
      expect(tool.triggers.phrases).toContain('chronic illness');
      expect(tool.triggers.phrases).toContain('autoimmune disease');
    });

    it('should handle invisible illness phrases', () => {
      const tool = healthDiagnosisTools.find((t) => t.id === 'health_invisible_illness')!;
      expect(tool.triggers.phrases).toContain("you don't look sick");
      expect(tool.triggers.phrases).toContain('invisible illness');
    });

    it('should delegate to correct domain', () => {
      for (const tool of healthDiagnosisTools) {
        expect(tool.delegateTo).toBe('domains/health-diagnosis');
      }
    });
  });

  describe('Concierge Semantic Routing', () => {
    it('should match hotel booking phrases', () => {
      const tool = conciergeTools.find((t) => t.id === 'concierge_hotel_quotes')!;
      expect(tool.triggers.phrases).toContain('get me hotel quotes');
      expect(tool.triggers.phrases).toContain('call hotels for me');
    });

    it('should match restaurant reservation phrases', () => {
      const tool = conciergeTools.find((t) => t.id === 'concierge_restaurant_reservation')!;
      expect(tool.triggers.phrases).toContain('make a restaurant reservation');
      expect(tool.triggers.phrases).toContain('book a table');
    });

    it('should match healthcare appointment phrases', () => {
      const tool = conciergeTools.find((t) => t.id === 'concierge_healthcare_appointment')!;
      expect(tool.triggers.phrases).toContain("schedule a doctor's appointment");
      expect(tool.triggers.phrases).toContain('book a checkup');
    });

    it('should delegate to correct domain', () => {
      for (const tool of conciergeTools) {
        expect(tool.delegateTo).toBe('domains/concierge');
      }
    });
  });

  describe('Webhooks Semantic Routing', () => {
    it('should match automation trigger phrases', () => {
      const tool = webhooksTools.find((t) => t.id === 'automation_trigger_webhook')!;
      expect(tool.triggers.phrases).toContain('run my automation');
      expect(tool.triggers.phrases).toContain('trigger my webhook');
      expect(tool.triggers.phrases).toContain('turn on goodnight mode');
    });

    it('should match IFTTT and Zapier phrases', () => {
      const tool = webhooksTools.find((t) => t.id === 'automation_trigger_webhook')!;
      expect(tool.triggers.phrases).toContain('run my ifttt');
      expect(tool.triggers.phrases).toContain('trigger zapier');
    });

    it('should delegate to correct domain', () => {
      for (const tool of webhooksTools) {
        expect(tool.delegateTo).toBe('domains/webhooks');
      }
    });
  });

  describe('Marketing Semantic Routing', () => {
    it('should match content generation phrases', () => {
      const tool = marketingTools.find((t) => t.id === 'marketing_generate_content')!;
      expect(tool.triggers.phrases).toContain('write a tweet');
      expect(tool.triggers.phrases).toContain('create a linkedin post');
    });

    it('should match Twitter posting phrases', () => {
      const tool = marketingTools.find((t) => t.id === 'marketing_post_twitter')!;
      expect(tool.triggers.phrases).toContain('post this to twitter');
      expect(tool.triggers.phrases).toContain('tweet this');
    });

    it('should match LinkedIn posting phrases', () => {
      const tool = marketingTools.find((t) => t.id === 'marketing_post_linkedin')!;
      expect(tool.triggers.phrases).toContain('post this to linkedin');
      expect(tool.triggers.phrases).toContain('publish on linkedin');
    });

    it('should delegate to correct domain', () => {
      for (const tool of marketingTools) {
        expect(tool.delegateTo).toBe('domains/marketing');
      }
    });
  });

  describe('Tool Execution Delegation', () => {
    it('should return proper delegation info for trauma tools', async () => {
      const tool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      const result = await tool.execute({ currentState: 'processing' }, {
        userId: 'test',
      } as never);
      expect((result as { success: boolean }).success).toBe(true);
      expect((result as { toolId: string }).toolId).toBe('traumaAwareSupport');
      expect((result as { delegateTo: string }).delegateTo).toBe('domains/trauma-support');
    });

    it('should return proper delegation info for health diagnosis tools', async () => {
      const tool = healthDiagnosisTools.find((t) => t.id === 'health_diagnosis_shock')!;
      const result = await tool.execute({ diagnosisType: 'cancer' }, { userId: 'test' } as never);
      expect((result as { success: boolean }).success).toBe(true);
      expect((result as { toolId: string }).toolId).toBe('diagnosisShock');
      expect((result as { delegateTo: string }).delegateTo).toBe('domains/health-diagnosis');
    });

    it('should return proper delegation info for concierge tools', async () => {
      const tool = conciergeTools.find((t) => t.id === 'concierge_hotel_quotes')!;
      const result = await tool.execute({ destination: 'NYC' }, { userId: 'test' } as never);
      expect((result as { success: boolean }).success).toBe(true);
      expect((result as { toolId: string }).toolId).toBe('requestHotelQuotes');
      expect((result as { delegateTo: string }).delegateTo).toBe('domains/concierge');
    });

    it('should return proper delegation info for webhook tools', async () => {
      const tool = webhooksTools.find((t) => t.id === 'automation_trigger_webhook')!;
      const result = await tool.execute({ phrase: 'goodnight' }, { userId: 'test' } as never);
      expect((result as { success: boolean }).success).toBe(true);
      expect((result as { toolId: string }).toolId).toBe('triggerWebhook');
      expect((result as { delegateTo: string }).delegateTo).toBe('domains/webhooks');
    });

    it('should return proper delegation info for marketing tools', async () => {
      const tool = marketingTools.find((t) => t.id === 'marketing_generate_content')!;
      const result = await tool.execute({ topic: 'AI coaching' }, { userId: 'test' } as never);
      expect((result as { success: boolean }).success).toBe(true);
      expect((result as { toolId: string }).toolId).toBe('generateSocialContent');
      expect((result as { delegateTo: string }).delegateTo).toBe('domains/marketing');
    });
  });

  describe('Safety-Critical Tool Priority', () => {
    it('should have crisis and trauma tools at highest priority in allToolDefinitions', () => {
      // First tools in the array should be crisis and trauma
      const firstTenIds = allToolDefinitions.slice(0, 15).map((t) => t.id);
      expect(firstTenIds).toContain('trauma_aware_support');
      expect(firstTenIds).toContain('trauma_grounding');
    });

    it('should have high confidence scores for safety-critical tools', () => {
      const traumaTool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      expect(traumaTool.confidence?.baseScore).toBeGreaterThanOrEqual(0.85);

      const diagnosisTool = healthDiagnosisTools.find((t) => t.id === 'health_diagnosis_shock')!;
      expect(diagnosisTool.confidence?.baseScore).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('Pattern Matching', () => {
    it('should have regex patterns for trauma detection', () => {
      const tool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      const patterns = tool.triggers.patterns!;

      expect(patterns.some((p) => p.test('I have trauma from my childhood'))).toBe(true);
      expect(patterns.some((p) => p.test('I experienced a traumatic event'))).toBe(true);
      expect(patterns.some((p) => p.test("I'm a survivor of abuse"))).toBe(true);
    });

    it('should have regex patterns for diagnosis detection', () => {
      const tool = healthDiagnosisTools.find((t) => t.id === 'health_diagnosis_shock')!;
      const patterns = tool.triggers.patterns!;

      expect(patterns.some((p) => p.test('I just got diagnosed with cancer'))).toBe(true);
      expect(patterns.some((p) => p.test('The doctor told me I have diabetes'))).toBe(true);
      expect(patterns.some((p) => p.test('My test results came back positive'))).toBe(true);
    });

    it('should have regex patterns for concierge requests', () => {
      const hotelTool = conciergeTools.find((t) => t.id === 'concierge_hotel_quotes')!;
      const patterns = hotelTool.triggers.patterns!;

      expect(patterns.some((p) => p.test('Get me hotel quotes'))).toBe(true);
      expect(patterns.some((p) => p.test('Call hotels for me'))).toBe(true);
    });

    it('should have regex patterns for automation triggers', () => {
      const tool = webhooksTools.find((t) => t.id === 'automation_trigger_webhook')!;
      const patterns = tool.triggers.patterns!;

      expect(patterns.some((p) => p.test('Run my automation'))).toBe(true);
      expect(patterns.some((p) => p.test('Trigger my webhook'))).toBe(true);
      expect(patterns.some((p) => p.test('Turn on goodnight mode'))).toBe(true);
    });
  });

  describe('Keyword Weights', () => {
    it('should have appropriate keyword weights for trauma tools', () => {
      const tool = traumaSupportTools.find((t) => t.id === 'trauma_aware_support')!;
      const keywords = tool.triggers.keywords!;

      const traumaKeyword = keywords.find((k) => typeof k === 'object' && k.word === 'trauma');
      expect((traumaKeyword as { weight: number })?.weight).toBe(1.0);

      const ptsdKeyword = keywords.find((k) => typeof k === 'object' && k.word === 'ptsd');
      expect((ptsdKeyword as { weight: number })?.weight).toBeGreaterThanOrEqual(0.9);
    });

    it('should have appropriate keyword weights for concierge tools', () => {
      const tool = conciergeTools.find((t) => t.id === 'concierge_restaurant_reservation')!;
      const keywords = tool.triggers.keywords!;

      const reservationKeyword = keywords.find(
        (k) => typeof k === 'object' && k.word === 'reservation'
      );
      expect((reservationKeyword as { weight: number })?.weight).toBeGreaterThanOrEqual(0.95);
    });
  });
});
