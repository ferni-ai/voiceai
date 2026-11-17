/**
 * Dev Panel - "Dashboards & Tools" links
 *
 * The anchor links shown in the panel's Dashboards & Tools section, as data.
 * The EvalOps and BTH Analytics buttons are not links (they open in-page
 * overlays through `data-action`), so they stay in the panel template.
 *
 * @module dev-panel/dashboard-links
 */

import { escapeHtml } from '../../utils/escape-html.js';
import { ICONS, type IconName } from './icons.js';

export interface DashboardLink {
  href: string;
  icon: IconName;
  label: string;
  /** Tooltip. Defaults to `label`. */
  title?: string;
}

export const CORE_DASHBOARD_LINKS: readonly DashboardLink[] = [
  {
    href: '/analytics-dashboard.html',
    icon: 'trendingUp',
    label: 'Analytics',
    title: 'Analytics Dashboard',
  },
  {
    href: '/metrics-dashboard.html',
    icon: 'barChart',
    label: 'Metrics',
    title: 'Metrics Dashboard',
  },
  { href: '/ux-dashboard.html', icon: 'colorPalette', label: 'UX', title: 'UX Dashboard' },
  {
    href: '/error-dashboard.html',
    icon: 'alertTriangle',
    label: 'Errors',
    title: 'Error Dashboard',
  },
];

export const MODEL_AND_VOICE_DASHBOARD_LINKS: readonly DashboardLink[] = [
  { href: '/llm-dashboard.html', icon: 'robot', label: 'LLM', title: 'LLM Dashboard' },
  {
    href: '/voice-presence-dashboard.html',
    icon: 'micFilled',
    label: 'Voice',
    title: 'Voice Presence Dashboard',
  },
  { href: '/persona-dashboard.html', icon: 'drama', label: 'Personas', title: 'Persona Dashboard' },
  {
    href: '/cognitive-dashboard.html',
    icon: 'brain',
    label: 'Cognitive',
    title: 'Cognitive Dashboard',
  },
];

export const INFRASTRUCTURE_DASHBOARD_LINKS: readonly DashboardLink[] = [
  {
    href: '/connection-dashboard.html',
    icon: 'signalStrength',
    label: 'Connection',
    title: 'Connection Dashboard',
  },
  { href: '/memory-dashboard.html', icon: 'save', label: 'Memory', title: 'Memory Dashboard' },
  { href: '/cost-dashboard.html', icon: 'coins', label: 'Costs', title: 'Cost Dashboard' },
  { href: '/dora-dashboard.html', icon: 'rocket', label: 'DORA', title: 'DORA Metrics' },
];

export const FEATURE_TOOL_LINKS: readonly DashboardLink[] = [
  {
    href: '/handoff-dashboard.html',
    icon: 'handshake',
    label: 'Handoffs',
    title: 'Handoff Dashboard',
  },
  {
    href: '/outreach-dashboard.html',
    icon: 'upload',
    label: 'Outreach',
    title: 'Outreach Dashboard',
  },
  { href: '/tools-dashboard.html', icon: 'wrench', label: 'Tools', title: 'Tools Dashboard' },
  {
    href: '/experiments-dashboard.html',
    icon: 'flask',
    label: 'Experiments',
    title: 'Experiments',
  },
  { href: '/feature-flags.html', icon: 'flag', label: 'Feature Flags', title: 'Feature Flags' },
  // The admin portal runs only at the path /admin (app.ts routes on it); /admin.html is the
  // static Admin Hub, which ignores ?section=.
  {
    href: '/admin?section=agent-flags',
    icon: 'flag',
    label: 'Agent flags (dev)',
    title: "Switch the dev voice agent's flags (admin portal)",
  },
];

export const ADMIN_UTILITY_LINKS: readonly DashboardLink[] = [
  { href: '/admin.html', icon: 'cog', label: 'Admin', title: 'Admin Panel' },
  {
    href: '/observability-hub.html',
    icon: 'eye',
    label: 'Observability',
    title: 'Observability Hub',
  },
  {
    href: '/animation-playground.html',
    icon: 'movie',
    label: 'Animations',
    title: 'Animation Playground',
  },
];

/**
 * The anchors for one group, in the markup the panel has always used. The href, title and
 * label are escaped; the icon is trusted SVG from ICONS.
 */
export function renderDashboardLinks(links: readonly DashboardLink[]): string {
  return links
    .map(
      (
        link
      ) => `<a class="dev-dashboard-link" href="${escapeHtml(link.href)}" target="_blank" title="${escapeHtml(link.title ?? link.label)}">
              ${ICONS[link.icon]} ${escapeHtml(link.label)}
            </a>`
    )
    .join('\n            ');
}
