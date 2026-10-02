/**
 * Service health - types, polling constants and display helpers. Extracted from service-health.ui.ts.
 */

export interface CircuitStatus {
  name: string;
  state: 'closed' | 'open' | 'half_open';
  successRate: string;
  totalRequests: number;
}

export interface ServiceHealthData {
  status: 'healthy' | 'degraded' | 'unavailable';
  timestamp: string;
  summary: {
    totalClients: number;
    healthyClients: number;
    openCircuits: number;
    halfOpenCircuits: number;
  };
  unhealthyServices: string[];
  httpClients: CircuitStatus[];
}

export interface ServiceHealthState {
  visible: boolean;
  expanded: boolean;
  data: ServiceHealthData | null;
  lastFetch: number;
  error: string | null;
}

export const POLL_INTERVAL_MS = 30000; // 30 seconds

export const CACHE_TTL_MS = 10000; // 10 seconds

export const INDICATOR_SIZE = '12px';

// Service name to user-friendly name mapping
export const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  'yahoo-finance': 'Stock Data',
  'alpha-vantage': 'Market Data',
  'google-apis': 'Weather & Maps',
  wikipedia: 'Historical Facts',
  'home-assistant': 'Smart Home',
  'philips-hue': 'Lighting',
  lifx: 'Lighting',
  smartthings: 'Smart Home',
  'context-service': 'AI Context',
  spotify: 'Music',
};

export function getDisplayName(serviceName: string): string {
  return SERVICE_DISPLAY_NAMES[serviceName] || serviceName.replace(/-/g, ' ');
}

export function getStatusClass(state: string): string {
  switch (state) {
    case 'closed':
      return 'healthy';
    case 'half_open':
      return 'degraded';
    case 'open':
      return 'unavailable';
    default:
      return 'healthy';
  }
}
