/**
 * The admin portal's sections, in nav order. AdminPortal.ts renders the nav from this list
 * and loads each section through its `component`.
 *
 * @module AdminSectionRegistry
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
  ICON_SPARKLES,
  ICON_SPEAKER,
  ICON_TARGET,
  ICON_TRUST,
} from './icons.js';
import { setupDesignSystemHandlers } from './admin-events.js';

export interface AdminSection {
  id: string;
  name: string;
  icon: string;
  description: string;
  badge?: string;
  /** The section's HTML. */
  component: () => Promise<string>;
  /** Wires the section once its HTML is in `root`, the portal's content area. */
  setup?: (root: HTMLElement) => void | Promise<void>;
  /** Stops what `setup` started (timers, polling) when the portal leaves the section. */
  cleanup?: () => void;
}

const businessMetrics = async () => import('./sections/BusinessMetricsSection.js');
const semanticRouting = async () => import('./sections/SemanticRoutingSection.js');
const bthValidation = async () => import('./sections/BTHValidationSection.js');
const blindEvaluation = async () => import('./sections/BlindEvaluationPanel.js');
const experiments = async () => import('./sections/ExperimentsSection.js');
const agentFlags = async () => import('./sections/AgentFlagsSection.js');
const finops = async () => import('./sections/FinOpsSection.js');
const avatarSoul = async () => import('./sections/AvatarSoulSection.js');
const modelConfig = async () => import('./sections/ModelConfigSection.js');

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
    component: async () => (await businessMetrics()).render(),
    setup: async () => (await businessMetrics()).init(),
    cleanup: () => void businessMetrics().then((s) => s.cleanup()),
  },
  {
    id: 'semantic-routing',
    name: 'Semantic Routing',
    icon: ICON_ROUTING,
    description: 'Tool routing accuracy, learning, A/B tests',
    badge: 'NEW',
    component: async () => (await semanticRouting()).render(),
    setup: async () => (await semanticRouting()).init(),
    cleanup: () => void semanticRouting().then((s) => s.cleanup()),
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
    component: async () => (await bthValidation()).render(),
    setup: async (root) => (await bthValidation()).setupEvents(root),
    cleanup: () => void bthValidation().then((s) => s.cleanup()),
  },
  {
    id: 'blind-evaluation',
    name: 'Blind Evaluation',
    icon: ICON_EYE_OFF,
    description: 'A/B evaluation panel for human vs AI comparison',
    badge: 'NEW',
    component: async () => (await blindEvaluation()).render(),
    setup: async (root) => (await blindEvaluation()).setupEvents(root),
    cleanup: () => void blindEvaluation().then((s) => s.cleanup()),
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
    component: async () => (await experiments()).render(),
    setup: async () => (await experiments()).setupEvents(),
  },
  {
    id: 'flags',
    name: 'Feature Flags',
    icon: ICON_FLAGS,
    description: 'Toggle features and rollouts',
    component: async () => (await import('./sections/FlagsSection.js')).render(),
  },
  {
    id: 'agent-flags',
    name: 'Agent flags (dev)',
    icon: ICON_FLAGS,
    description: "Switch the dev voice agent's flags",
    component: async () => (await agentFlags()).render(),
    setup: async () => (await agentFlags()).setupEvents(),
  },
  {
    id: 'finops',
    name: 'FinOps',
    icon: ICON_CHART,
    description: 'Cost tracking, unit economics, burn rate',
    badge: 'NEW',
    component: async () => (await finops()).render(),
    setup: async () => (await finops()).setupEvents(),
    cleanup: () => void finops().then((s) => s.cleanup()),
  },
  {
    id: 'operations',
    name: 'Operations',
    icon: ICON_CHART,
    description: 'Infrastructure health & metrics',
    badge: 'NEW',
    component: async () => (await import('./sections/OperationsSection.js')).render(),
    setup: async (root) => (await import('./sections/OperationsSection.js')).setupEvents(root),
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
    description: 'The real avatar and its moments',
    component: async () => (await avatarSoul()).render(),
    setup: async (root) => (await avatarSoul()).setupEvents(root),
    cleanup: () => void avatarSoul().then((s) => s.cleanup()),
  },
  {
    id: 'design-system',
    name: 'Design System',
    icon: ICON_DESIGN_SYSTEM,
    description: 'Animations and visual tokens',
    component: async () => (await import('./sections/DesignSystemSection.js')).render(),
    setup: () => setupDesignSystemHandlers(),
  },
  {
    id: 'model-config',
    name: 'Model Config',
    icon: ICON_SPARKLES,
    description: 'LLM parameters and system prompts',
    badge: 'NEW',
    component: async () => (await modelConfig()).render(),
    setup: async () => (await modelConfig()).setupEvents(),
  },
  {
    id: 'more-dashboards',
    name: 'More Dashboards',
    icon: ICON_LAYOUT_GRID,
    description: 'All standalone dashboards',
    component: async () => (await import('./sections/MoreDashboardsSection.js')).render(),
  },
];

/** `href` naming section `id` in `?section=`, so a reload or a shared link opens that section. */
export function sectionHref(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set('section', id);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The section `?section=<id>` names (how the Dev Panel opens one), or `fallback`. */
export function initialSectionId(search: string, fallback: string): string {
  const id = new URLSearchParams(search).get('section');
  return id && ADMIN_SECTIONS.some((s) => s.id === id) ? id : fallback;
}
