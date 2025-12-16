/**
 * Admin Test Utilities
 *
 * Shared utilities for testing admin sections.
 * Provides mocking, rendering, and assertion helpers.
 *
 * @module AdminTestUtils
 */

// ============================================================================
// MOCK DATA TYPES (mirror the section types)
// ============================================================================

export interface MockSystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  services: Array<{ name: string; status: string; latency?: number }>;
}

export interface MockAggregatedStats {
  agents: { total: number; active: number };
  conversations: { today: number; thisWeek: number; trend: 'up' | 'down' | 'neutral' };
  evalops: { totalEvaluations: number; passRate: number; flaggedCount: number };
  trust: { totalProfiles: number; avgTrustScore: number; activeRelationships: number };
  system: { uptime: number; responseTime: number; errorRate: number; activeSessions: number };
}

export interface MockActivityEvent {
  id: string;
  type: string;
  action: string;
  description: string;
  timestamp: string;
}

export interface MockFeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
  percentage?: number;
  environments: string[];
}

export interface MockAgent {
  id: string;
  name: string;
  persona: string;
  enabled: boolean;
  description: string;
}

// ============================================================================
// DEFAULT MOCK DATA
// ============================================================================

export const mockHealthySystem: MockSystemHealth = {
  status: 'healthy',
  uptime: 86400, // 1 day
  services: [
    { name: 'Voice Pipeline', status: 'healthy', latency: 45 },
    { name: 'Memory Service', status: 'healthy', latency: 12 },
    { name: 'EvalOps', status: 'healthy', latency: 89 },
    { name: 'Trust System', status: 'healthy', latency: 23 },
  ],
};

export const mockDegradedSystem: MockSystemHealth = {
  status: 'degraded',
  uptime: 3600, // 1 hour
  services: [
    { name: 'Voice Pipeline', status: 'healthy', latency: 45 },
    { name: 'Memory Service', status: 'degraded', latency: 500 },
    { name: 'EvalOps', status: 'healthy', latency: 89 },
    { name: 'Trust System', status: 'healthy', latency: 23 },
  ],
};

export const mockDownSystem: MockSystemHealth = {
  status: 'down',
  uptime: 0,
  services: [],
};

export const mockAggregatedStats: MockAggregatedStats = {
  agents: { total: 6, active: 4 },
  conversations: { today: 127, thisWeek: 892, trend: 'up' },
  evalops: { totalEvaluations: 1543, passRate: 94.2, flaggedCount: 12 },
  trust: { totalProfiles: 234, avgTrustScore: 78.5, activeRelationships: 189 },
  system: { uptime: 86400, responseTime: 42, errorRate: 0.002, activeSessions: 18 },
};

export const mockEmptyStats: MockAggregatedStats = {
  agents: { total: 0, active: 0 },
  conversations: { today: 0, thisWeek: 0, trend: 'neutral' },
  evalops: { totalEvaluations: 0, passRate: 0, flaggedCount: 0 },
  trust: { totalProfiles: 0, avgTrustScore: 0, activeRelationships: 0 },
  system: { uptime: 0, responseTime: 0, errorRate: 0, activeSessions: 0 },
};

export const mockActivityEvents: MockActivityEvent[] = [
  {
    id: '1',
    type: 'handoff',
    action: 'handoff_completed',
    description: 'Handoff from Ferni to Peter completed',
    timestamp: '2 minutes ago',
  },
  {
    id: '2',
    type: 'evalops',
    action: 'evaluation_flagged',
    description: 'Response flagged for review: empathy score low',
    timestamp: '15 minutes ago',
  },
  {
    id: '3',
    type: 'trust',
    action: 'trust_milestone',
    description: 'User reached "Trusted Friend" milestone',
    timestamp: '1 hour ago',
  },
  {
    id: '4',
    type: 'agent',
    action: 'agent_created',
    description: 'New agent "Jordan" created from template',
    timestamp: '3 hours ago',
  },
];

export const mockFeatureFlags: MockFeatureFlag[] = [
  {
    id: 'voice-humanization',
    name: 'Voice Humanization',
    description: 'Enable advanced voice humanization features',
    enabled: true,
    category: 'voice',
    percentage: 100,
    environments: ['production', 'staging'],
  },
  {
    id: 'dynamic-speed',
    name: 'Dynamic Speed Control',
    description: 'Adjust speech speed based on user engagement',
    enabled: true,
    category: 'voice',
    percentage: 50,
    environments: ['staging'],
  },
  {
    id: 'trust-system-v2',
    name: 'Trust System V2',
    description: 'New trust scoring algorithm',
    enabled: false,
    category: 'trust',
    environments: [],
  },
];

export const mockAgents: MockAgent[] = [
  {
    id: 'ferni',
    name: 'Ferni',
    persona: 'Life Coach',
    enabled: true,
    description: 'Your supportive life coach and guide',
  },
  {
    id: 'peter',
    name: 'Peter',
    persona: 'Research',
    enabled: true,
    description: 'Deep research and due diligence expert',
  },
  {
    id: 'alex',
    name: 'Alex',
    persona: 'Communication',
    enabled: true,
    description: 'Communication and relationship specialist',
  },
  {
    id: 'maya',
    name: 'Maya',
    persona: 'Habits',
    enabled: true,
    description: 'Habits and routines coach',
  },
  {
    id: 'jordan',
    name: 'Jordan',
    persona: 'Events',
    enabled: false,
    description: 'Event planning and logistics coordinator',
  },
  {
    id: 'nayan',
    name: 'Nayan',
    persona: 'Wisdom',
    enabled: true,
    description: 'Philosophy and wisdom guide',
  },
];

// ============================================================================
// MOCK API HELPERS
// ============================================================================

type MockResponses = {
  [endpoint: string]: { status: number; body: unknown };
};

/**
 * Create a mock fetch function for admin APIs
 */
export function createMockFetch(responses: MockResponses): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    // Safely extract URL string from various input types
    const url = typeof input === 'string' 
      ? input 
      : input instanceof URL 
        ? input.href 
        : input.url;

    for (const [endpoint, { status, body }] of Object.entries(responses)) {
      if (url.includes(endpoint)) {
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Default: 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/**
 * Standard mock responses for admin dashboard
 */
export const dashboardMockResponses: MockResponses = {
  '/api/v1/admin/dashboard/health': { status: 200, body: mockHealthySystem },
  '/api/v1/admin/dashboard/stats': { status: 200, body: mockAggregatedStats },
  '/api/v1/admin/dashboard/activity': { status: 200, body: { activity: mockActivityEvents } },
};

/**
 * Standard mock responses for feature flags
 */
export const flagsMockResponses: MockResponses = {
  '/api/v1/admin/flags': { status: 200, body: { flags: mockFeatureFlags } },
};

/**
 * Standard mock responses for agents
 */
export const agentsMockResponses: MockResponses = {
  '/api/agents': { status: 200, body: { agents: mockAgents } },
};

// ============================================================================
// RENDERING HELPERS
// ============================================================================

/**
 * Parse HTML string into a document fragment for testing
 */
export function parseHTML(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

/**
 * Query selector helper for parsed HTML
 */
export function querySelector<T extends Element>(
  fragment: DocumentFragment,
  selector: string
): T | null {
  return fragment.querySelector<T>(selector);
}

/**
 * Query selector all helper for parsed HTML
 */
export function querySelectorAll<T extends Element>(
  fragment: DocumentFragment,
  selector: string
): T[] {
  return Array.from(fragment.querySelectorAll<T>(selector));
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Check if element has specific text content
 */
export function hasText(element: Element | null, text: string): boolean {
  return element?.textContent?.includes(text) ?? false;
}

/**
 * Check if element has specific class
 */
export function hasClass(element: Element | null, className: string): boolean {
  return element?.classList.contains(className) ?? false;
}

/**
 * Check if element has specific attribute
 */
export function hasAttribute(element: Element | null, attr: string, value?: string): boolean {
  if (!element) return false;
  if (value === undefined) return element.hasAttribute(attr);
  return element.getAttribute(attr) === value;
}

/**
 * Get computed CSS variable value (for design token validation)
 */
export function getCSSVariable(element: Element, variable: string): string {
  return getComputedStyle(element).getPropertyValue(variable).trim();
}

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

/**
 * Check if element is accessible (has proper ARIA attributes)
 */
export function isAccessible(
  element: Element | null,
  options: {
    role?: string;
    label?: string;
    labelledBy?: string;
    describedBy?: string;
    live?: 'polite' | 'assertive' | 'off';
  } = {}
): boolean {
  if (!element) return false;

  if (options.role && element.getAttribute('role') !== options.role) return false;
  if (options.label && element.getAttribute('aria-label') !== options.label) return false;
  if (options.labelledBy && element.getAttribute('aria-labelledby') !== options.labelledBy)
    return false;
  if (options.describedBy && element.getAttribute('aria-describedby') !== options.describedBy)
    return false;
  if (options.live && element.getAttribute('aria-live') !== options.live) return false;

  return true;
}

/**
 * Check if element is keyboard focusable
 */
export function isKeyboardFocusable(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  const tabIndex = element.getAttribute('tabindex');

  // Naturally focusable elements
  if (['a', 'button', 'input', 'select', 'textarea'].includes(tagName)) {
    return tabIndex !== '-1';
  }

  // Elements with explicit tabindex
  return tabIndex !== null && tabIndex !== '-1';
}

// ============================================================================
// DESIGN TOKEN HELPERS
// ============================================================================

/**
 * Check if element uses design tokens (no hardcoded colors)
 */
export function usesDesignTokens(html: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check for hardcoded hex colors
  const hexPattern = /#[0-9a-fA-F]{3,6}\b/g;
  const hexMatches = html.match(hexPattern) || [];
  hexMatches.forEach((match) => {
    // Allow pure black/white as occasional exceptions
    if (match !== '#fff' && match !== '#000') {
      violations.push(`Hardcoded color: ${match}`);
    }
  });

  // Check for hardcoded rgba (excluding opacity-only usage)
  const rgbaPattern = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
  const rgbaMatches = html.match(rgbaPattern) || [];
  rgbaMatches.forEach((match) => {
    violations.push(`Hardcoded rgba: ${match}...)`);
  });

  // Check for hardcoded pixel values in common properties (excluding 0px)
  const pxPattern = /:\s*[1-9]\d*px/g;
  const pxMatches = html.match(pxPattern) || [];
  // This is a soft check - log but don't fail
  if (pxMatches.length > 10) {
    violations.push(
      `Many hardcoded pixel values (${pxMatches.length}), consider using spacing tokens`
    );
  }

  return { valid: violations.length === 0, violations };
}

// ============================================================================
// EVENT SIMULATION
// ============================================================================

/**
 * Simulate a click event
 */
export function simulateClick(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/**
 * Simulate keyboard event
 */
export function simulateKeyPress(
  element: Element,
  key: string,
  options: KeyboardEventInit = {}
): void {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  );
}

/**
 * Simulate form input
 */
export function simulateInput(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
