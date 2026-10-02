/**
 * Admin Portal - section definitions (extracted from AdminPortal.ts).
 */

import {
  ICON_AGENTS,
  ICON_API_DOCS,
  ICON_CHART,
  ICON_DASHBOARD,
  ICON_DESIGN_SYSTEM,
  ICON_DIAGNOSTICS,
  ICON_EVALOPS,
  ICON_EYE_OFF,
  ICON_FLAGS,
  ICON_LAYOUT_GRID,
  ICON_ROUTING,
  ICON_SETTINGS,
  ICON_SPARKLES,
  ICON_SPEAKER,
  ICON_TARGET,
  ICON_TRUST,
} from './icons.js';

export interface AdminSection {
  id: string;
  name: string;
  icon: string;
  description: string;
  badge?: string;
  component: () => Promise<string>;
  /** Wire up event handlers once the section's HTML is in the DOM. */
  afterRender?: (content: HTMLElement) => Promise<void>;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: ICON_DASHBOARD,
    description: 'System overview and health',
    component: async () => (await import('./sections/DashboardSection.js')).render(),
  },
  {
    id: 'business-metrics',
    name: 'Business Metrics',
    icon: ICON_CHART,
    description: 'DAU/WAU/MAU, MRR, churn',
    badge: 'NEW',
    component: async () => (await import('./sections/BusinessMetricsSection.js')).render(),
  },
  {
    id: 'semantic-routing',
    name: 'Semantic Routing',
    icon: ICON_ROUTING,
    description: 'Tool routing accuracy, learning, A/B tests',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/SemanticRoutingSection.js');
      const html = section.render();
      setTimeout(() => section.init(), 100);
      return html;
    },
  },
  {
    id: 'agents',
    name: 'Agents',
    icon: ICON_AGENTS,
    description: 'Manage AI agents and personas',
    component: async () => (await import('./sections/AgentsSection.js')).render(),
  },
  {
    id: 'evalops',
    name: 'EvalOps',
    icon: ICON_EVALOPS,
    description: 'Evaluation operations',
    badge: 'NEW',
    component: async () => (await import('./sections/EvalOpsSection.js')).render(),
  },
  {
    id: 'bth-validation',
    name: 'BTH Validation',
    icon: ICON_TARGET,
    description: 'Better Than Human benchmark metrics',
    badge: 'NEW',
    // Wrapped in .admin-section-content: setupEvents re-renders into it.
    component: async () => {
      const section = await import('./sections/BTHValidationSection.js');
      return `<div class="admin-section-content">${await section.render()}</div>`;
    },
    afterRender: async (content) => {
      const section = await import('./sections/BTHValidationSection.js');
      const root = content.querySelector<HTMLElement>('.admin-section-content');
      if (root) section.setupEvents(root);
    },
  },
  {
    id: 'blind-evaluation',
    name: 'Blind Evaluation',
    icon: ICON_EYE_OFF,
    description: 'A/B evaluation panel for human vs AI comparison',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/BlindEvaluationPanel.js');
      return `<div class="admin-section-content">${await section.render()}</div>`;
    },
    afterRender: async (content) => {
      const section = await import('./sections/BlindEvaluationPanel.js');
      const root = content.querySelector<HTMLElement>('.admin-section-content');
      if (root) section.setupEvents(root);
    },
  },
  {
    id: 'trust',
    name: 'Trust',
    icon: ICON_TRUST,
    description: 'Trust system analytics',
    component: async () => (await import('./sections/TrustSection.js')).render(),
  },
  {
    id: 'human-listening',
    name: 'Human Listening',
    icon: ICON_SPEAKER,
    description: 'Better-than-human listening insights',
    badge: 'NEW',
    component: async () => (await import('./sections/HumanListeningSection.js')).render(),
  },
  {
    id: 'speech-metrics',
    name: 'Speech Metrics',
    icon: ICON_SPEAKER,
    description: 'Unified speech pipeline performance',
    badge: 'NEW',
    component: async () => (await import('./sections/SpeechMetricsSection.js')).render(),
  },
  {
    id: 'experiments',
    name: 'Experiments',
    icon: ICON_FLAGS, // Using flags icon for now
    description: 'A/B tests and experiments',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/ExperimentsSection.js');
      const html = await section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'flags',
    name: 'Feature Flags',
    icon: ICON_FLAGS,
    description: 'Toggle features and rollouts',
    component: async () => (await import('./sections/FlagsSection.js')).render(),
  },
  {
    id: 'finops',
    name: 'FinOps',
    icon: ICON_CHART,
    description: 'Cost tracking, unit economics, burn rate',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/FinOpsSection.js');
      const html = await section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'operations',
    name: 'Operations',
    icon: ICON_CHART,
    description: 'Infrastructure health & metrics',
    badge: 'NEW',
    component: async () => (await import('./sections/OperationsSection.js')).render(),
  },
  {
    id: 'builder-metrics',
    name: 'Builder Metrics',
    icon: ICON_SETTINGS,
    description: 'Context builder performance & health',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/BuilderMetricsSection.js');
      const html = section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    icon: ICON_DIAGNOSTICS,
    description: 'Handoff and system diagnostics',
    component: async () => (await import('./sections/DiagnosticsSection.js')).render(),
  },
  {
    id: 'api-docs',
    name: 'API Docs',
    icon: ICON_API_DOCS,
    description: 'API documentation and testing',
    component: async () => (await import('./sections/ApiDocsSection.js')).render(),
  },
  {
    id: 'avatar-soul',
    name: 'Avatar Soul',
    icon: ICON_SPARKLES,
    description: 'Better Than Human animations',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/AvatarSoulSection.js');
      const html = await section.render();
      // Schedule event setup after render
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'design-system',
    name: 'Design System',
    icon: ICON_DESIGN_SYSTEM,
    description: 'Animations and visual tokens',
    component: async () => (await import('./sections/DesignSystemSection.js')).render(),
  },
  {
    id: 'model-config',
    name: 'Model Config',
    icon: ICON_SPARKLES,
    description: 'LLM parameters and system prompts',
    badge: 'NEW',
    component: async () => {
      const section = await import('./sections/ModelConfigSection.js');
      const html = await section.render();
      setTimeout(() => section.setupEvents(), 100);
      return html;
    },
  },
  {
    id: 'more-dashboards',
    name: 'More Dashboards',
    icon: ICON_LAYOUT_GRID,
    description: 'All standalone dashboards',
    component: async () => (await import('./sections/MoreDashboardsSection.js')).render(),
  },
];
