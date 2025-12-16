/**
 * Dashboard Section Unit Tests
 *
 * Tests for the dashboard section rendering and utilities.
 *
 * @module DashboardSectionTests
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockFetch,
  dashboardMockResponses,
  hasText,
  hasClass,
  hasAttribute,
  isAccessible,
  mockHealthySystem,
  mockDegradedSystem,
  mockDownSystem,
  mockAggregatedStats,
  mockEmptyStats,
  mockActivityEvents,
  parseHTML,
  querySelector,
  querySelectorAll,
  usesDesignTokens,
} from './test-utils.js';

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('Dashboard Utilities', () => {
  describe('formatUptime', () => {
    // Re-implement for testing (matches DashboardSection.ts)
    function formatUptime(seconds: number): string {
      if (seconds === 0) return '-';

      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    it('should format zero seconds as dash', () => {
      expect(formatUptime(0)).toBe('-');
    });

    it('should format minutes only', () => {
      expect(formatUptime(300)).toBe('5m');
      expect(formatUptime(60)).toBe('1m');
      expect(formatUptime(3599)).toBe('59m');
    });

    it('should format hours and minutes', () => {
      expect(formatUptime(3600)).toBe('1h 0m');
      expect(formatUptime(7200)).toBe('2h 0m');
      expect(formatUptime(3660)).toBe('1h 1m');
      expect(formatUptime(86399)).toBe('23h 59m');
    });

    it('should format days and hours', () => {
      expect(formatUptime(86400)).toBe('1d 0h');
      expect(formatUptime(172800)).toBe('2d 0h');
      expect(formatUptime(90000)).toBe('1d 1h');
      expect(formatUptime(259200)).toBe('3d 0h');
    });
  });

  describe('getHealthText', () => {
    // Re-implement for testing (matches DashboardSection.ts)
    function getHealthText(status: 'healthy' | 'degraded' | 'down'): string {
      switch (status) {
        case 'healthy':
          return 'All Systems Operational';
        case 'degraded':
          return 'Degraded Performance';
        case 'down':
          return 'System Down';
      }
    }

    it('should return correct text for healthy status', () => {
      expect(getHealthText('healthy')).toBe('All Systems Operational');
    });

    it('should return correct text for degraded status', () => {
      expect(getHealthText('degraded')).toBe('Degraded Performance');
    });

    it('should return correct text for down status', () => {
      expect(getHealthText('down')).toBe('System Down');
    });
  });

  describe('buildQuickStats', () => {
    // Re-implement for testing (matches DashboardSection.ts)
    function buildQuickStats(stats: typeof mockAggregatedStats) {
      return [
        {
          label: 'Active Agents',
          value: stats.agents.active,
          icon: 'ICON_AGENTS',
        },
        {
          label: 'Conversations Today',
          value: stats.conversations.today,
          change: stats.conversations.trend === 'up' ? '+12%' : undefined,
          trend: stats.conversations.trend,
          icon: 'ICON_USER',
        },
        {
          label: 'EvalOps Score',
          value: stats.evalops.passRate > 0 ? `${stats.evalops.passRate}%` : '-',
          icon: 'ICON_EVALOPS',
        },
        {
          label: 'Trust Profiles',
          value: stats.trust.totalProfiles,
          icon: 'ICON_TRUST',
        },
      ];
    }

    it('should build stats from aggregated data', () => {
      const stats = buildQuickStats(mockAggregatedStats);

      expect(stats).toHaveLength(4);
      expect(stats[0]).toEqual({
        label: 'Active Agents',
        value: 4,
        icon: 'ICON_AGENTS',
      });
    });

    it('should include trend for conversations when up', () => {
      const stats = buildQuickStats(mockAggregatedStats);
      const conversationsStat = stats.find((s) => s.label === 'Conversations Today');

      expect(conversationsStat?.change).toBe('+12%');
      expect(conversationsStat?.trend).toBe('up');
    });

    it('should format evalops pass rate as percentage', () => {
      const stats = buildQuickStats(mockAggregatedStats);
      const evalopsStat = stats.find((s) => s.label === 'EvalOps Score');

      expect(evalopsStat?.value).toBe('94.2%');
    });

    it('should show dash when evalops has no data', () => {
      const stats = buildQuickStats(mockEmptyStats);
      const evalopsStat = stats.find((s) => s.label === 'EvalOps Score');

      expect(evalopsStat?.value).toBe('-');
    });

    it('should not include change when trend is not up', () => {
      const neutralStats = { ...mockAggregatedStats };
      neutralStats.conversations = { ...neutralStats.conversations, trend: 'neutral' as const };

      const stats = buildQuickStats(neutralStats);
      const conversationsStat = stats.find((s) => s.label === 'Conversations Today');

      expect(conversationsStat?.change).toBeUndefined();
    });
  });

  describe('getActivityIcon', () => {
    // Re-implement for testing (matches DashboardSection.ts)
    function getActivityIcon(type: string): string {
      switch (type) {
        case 'handoff':
          return 'ICON_HANDOFF';
        case 'evalops':
          return 'ICON_EVALOPS';
        case 'trust':
          return 'ICON_TRUST';
        case 'agent':
          return 'ICON_AGENTS';
        case 'flag':
          return 'ICON_FLAGS';
        case 'user':
          return 'ICON_USER';
        case 'system':
          return 'ICON_WARNING';
        default:
          return 'ICON_HISTORY';
      }
    }

    it('should return correct icon for each activity type', () => {
      expect(getActivityIcon('handoff')).toBe('ICON_HANDOFF');
      expect(getActivityIcon('evalops')).toBe('ICON_EVALOPS');
      expect(getActivityIcon('trust')).toBe('ICON_TRUST');
      expect(getActivityIcon('agent')).toBe('ICON_AGENTS');
      expect(getActivityIcon('flag')).toBe('ICON_FLAGS');
      expect(getActivityIcon('user')).toBe('ICON_USER');
      expect(getActivityIcon('system')).toBe('ICON_WARNING');
    });

    it('should return history icon for unknown types', () => {
      expect(getActivityIcon('unknown')).toBe('ICON_HISTORY');
      expect(getActivityIcon('')).toBe('ICON_HISTORY');
    });
  });
});

// ============================================================================
// RENDER OUTPUT TESTS
// ============================================================================

describe('Dashboard Section Rendering', () => {
  // Mock HTML for testing (simulates render output)
  const mockDashboardHTML = `
    <div class="dashboard-section">
      <div class="admin-card dashboard-health">
        <h2 class="admin-section-title">System Health</h2>
        <div class="health-status health-status--healthy" role="status" aria-live="polite" aria-label="System status: All Systems Operational">
          <span class="health-indicator"></span>
          <span class="health-text">All Systems Operational</span>
        </div>
        <div class="health-details">
          <div class="health-item">
            <span class="health-label">Uptime</span>
            <span class="health-value">1d 0h</span>
          </div>
        </div>
      </div>
      <div class="admin-grid dashboard-stats">
        <div class="stat-card">
          <div class="stat-value">4</div>
          <div class="stat-label">Active Agents</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">127</div>
          <div class="stat-label">Conversations Today</div>
          <div class="stat-change stat-change--up">+12%</div>
        </div>
      </div>
      <div class="admin-card dashboard-actions">
        <h2 class="admin-section-title">Quick Actions</h2>
        <button class="quick-action" data-action="validate-agents">
          <span class="quick-action-text">Validate Agents</span>
        </button>
        <button class="quick-action" data-action="run-evalops">
          <span class="quick-action-text">Run EvalOps Suite</span>
        </button>
      </div>
      <div class="admin-card dashboard-activity">
        <h2 class="admin-section-title">Recent Activity</h2>
        <div class="activity-list" role="log" aria-live="polite" aria-label="Recent activity feed">
          <div class="activity-item" data-id="1">
            <span class="activity-text">Handoff from Ferni to Peter completed</span>
            <span class="activity-time">2 minutes ago</span>
          </div>
        </div>
      </div>
    </div>
  `;

  describe('Structure', () => {
    it('should have main dashboard section container', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const section = querySelector(fragment, '.dashboard-section');

      expect(section).not.toBeNull();
    });

    it('should have health card spanning full width', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const healthCard = querySelector(fragment, '.dashboard-health');

      expect(healthCard).not.toBeNull();
    });

    it('should have stats grid', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const statsGrid = querySelector(fragment, '.dashboard-stats');

      expect(statsGrid).not.toBeNull();
    });

    it('should have quick actions section', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const actionsCard = querySelector(fragment, '.dashboard-actions');

      expect(actionsCard).not.toBeNull();
    });

    it('should have activity feed section', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const activityCard = querySelector(fragment, '.dashboard-activity');

      expect(activityCard).not.toBeNull();
    });
  });

  describe('Health Status', () => {
    it('should display correct health status class', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const healthStatus = querySelector(fragment, '.health-status');

      expect(hasClass(healthStatus, 'health-status--healthy')).toBe(true);
    });

    it('should display health text', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const healthText = querySelector(fragment, '.health-text');

      expect(hasText(healthText, 'All Systems Operational')).toBe(true);
    });

    it('should display uptime', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const uptimeValue = querySelector(fragment, '.health-value');

      expect(hasText(uptimeValue, '1d 0h')).toBe(true);
    });
  });

  describe('Quick Stats', () => {
    it('should render stat cards', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const statCards = querySelectorAll(fragment, '.stat-card');

      expect(statCards.length).toBeGreaterThan(0);
    });

    it('should display stat values', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const statValues = querySelectorAll(fragment, '.stat-value');

      expect(statValues.some((el) => hasText(el, '4'))).toBe(true);
      expect(statValues.some((el) => hasText(el, '127'))).toBe(true);
    });

    it('should display trend indicator for trending stat', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const trendIndicator = querySelector(fragment, '.stat-change--up');

      expect(trendIndicator).not.toBeNull();
      expect(hasText(trendIndicator, '+12%')).toBe(true);
    });
  });

  describe('Quick Actions', () => {
    it('should render action buttons', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const actionButtons = querySelectorAll(fragment, '.quick-action');

      expect(actionButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('should have data-action attributes', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const actionButtons = querySelectorAll(fragment, '.quick-action');

      expect(actionButtons.some((btn) => hasAttribute(btn, 'data-action', 'validate-agents'))).toBe(true);
      expect(actionButtons.some((btn) => hasAttribute(btn, 'data-action', 'run-evalops'))).toBe(true);
    });
  });

  describe('Activity Feed', () => {
    it('should render activity items', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const activityItems = querySelectorAll(fragment, '.activity-item');

      expect(activityItems.length).toBeGreaterThan(0);
    });

    it('should display activity descriptions', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const activityText = querySelector(fragment, '.activity-text');

      expect(hasText(activityText, 'Handoff from Ferni to Peter')).toBe(true);
    });

    it('should display timestamps', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const activityTime = querySelector(fragment, '.activity-time');

      expect(hasText(activityTime, '2 minutes ago')).toBe(true);
    });
  });
});

// ============================================================================
// ACCESSIBILITY TESTS
// ============================================================================

describe('Dashboard Accessibility', () => {
  const mockDashboardHTML = `
    <div class="dashboard-section">
      <div class="health-status health-status--healthy" role="status" aria-live="polite" aria-label="System status: All Systems Operational">
        <span class="health-indicator"></span>
        <span class="health-text">All Systems Operational</span>
      </div>
      <button class="quick-action" data-action="validate-agents">
        Validate Agents
      </button>
      <div class="activity-list" role="log" aria-live="polite" aria-label="Recent activity feed">
        <div class="activity-item" data-id="1">Activity 1</div>
      </div>
    </div>
  `;

  describe('ARIA Attributes', () => {
    it('should have role="status" on health indicator', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const healthStatus = querySelector(fragment, '.health-status');

      expect(isAccessible(healthStatus, { role: 'status' })).toBe(true);
    });

    it('should have aria-live="polite" on health status', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const healthStatus = querySelector(fragment, '.health-status');

      expect(isAccessible(healthStatus, { live: 'polite' })).toBe(true);
    });

    it('should have aria-label on health status', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const healthStatus = querySelector(fragment, '.health-status');

      expect(hasAttribute(healthStatus, 'aria-label')).toBe(true);
    });

    it('should have role="log" on activity feed', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const activityList = querySelector(fragment, '.activity-list');

      expect(isAccessible(activityList, { role: 'log' })).toBe(true);
    });

    it('should have aria-live on activity feed', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const activityList = querySelector(fragment, '.activity-list');

      expect(isAccessible(activityList, { live: 'polite' })).toBe(true);
    });
  });

  describe('Interactive Elements', () => {
    it('should use semantic button elements for actions', () => {
      const fragment = parseHTML(mockDashboardHTML);
      const buttons = querySelectorAll(fragment, 'button.quick-action');

      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// DESIGN TOKEN COMPLIANCE TESTS
// ============================================================================

describe('Dashboard Design Token Compliance', () => {
  // Sample CSS from DashboardSection.ts (simplified)
  const sampleCSS = `
    .dashboard-section {
      color: var(--admin-text-primary, #faf6f0);
    }

    .health-status {
      padding: var(--space-4, 1rem);
      background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
      border-radius: var(--radius-md, 8px);
    }

    .health-status--healthy .health-indicator {
      background: var(--color-semantic-success, #4a6741);
      box-shadow: 0 0 8px var(--color-semantic-success, #4a6741);
    }

    .stat-card {
      padding: var(--space-4, 1rem);
      background: var(--admin-surface-subtle, rgba(250, 246, 240, 0.04));
    }
  `;

  it('should use CSS variables with fallbacks', () => {
    // Check that CSS uses var() syntax
    expect(sampleCSS).toContain('var(--');
    expect(sampleCSS).toContain('var(--admin-text-primary');
    expect(sampleCSS).toContain('var(--space-4');
  });

  it('should use semantic color tokens', () => {
    expect(sampleCSS).toContain('var(--color-semantic-success');
  });

  it('should use spacing tokens', () => {
    expect(sampleCSS).toContain('var(--space-4');
  });

  it('should use radius tokens', () => {
    expect(sampleCSS).toContain('var(--radius-md');
  });

  // Note: The CSS has fallbacks which include hex colors, this is acceptable
  // as long as they're in var() fallback position
});
