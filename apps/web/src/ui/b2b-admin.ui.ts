/**
 * B2B Admin Dashboard UI
 *
 * Admin portal for organizations using "Ferni for Teams".
 * Allows org admins to:
 * - View team usage and analytics
 * - Manage team members and invites
 * - Configure organization settings
 * - Track ROI and wellness metrics
 *
 * Design principles:
 * - Clean, professional dashboard aesthetic
 * - Clear data visualization
 * - Easy team management
 * - Focus on value/ROI for decision makers
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';

const log = createLogger('B2BAdminUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'enterprise';
  seatCount: number;
  activeSeats: number;
  adminUserIds: string[];
  memberUserIds: string[];
  config?: {
    welcomeMessage?: string;
    companyValues?: string[];
  };
}

export interface OrgUsageStats {
  orgId: string;
  period: string;
  totalConversations: number;
  totalMinutes: number;
  activeMembers: number;
  topTopics: string[];
  avgConversationsPerMember: number;
}

export interface ROIEstimate {
  monthlyInvestment: number;
  estimatedSavings: number;
  roi: number;
  assumptions: string[];
}

export interface TeamMember {
  userId: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: string;
  lastActiveAt?: string;
  conversationCount: number;
}

export interface OnboardingItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let isOpen = false;
let container: HTMLElement | null = null;
let currentOrg: Organization | null = null;
let currentUserId: string | null = null;
let currentView: 'overview' | 'team' | 'settings' | 'billing' = 'overview';

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.b2b-admin-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.b2b-admin-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.b2b-admin-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.4);
  backdrop-filter: blur(var(--glass-blur-strong, 24px));
}

.b2b-admin-card {
  position: relative;
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  width: calc(100% - 48px);
  max-width: 900px;
  max-height: 85vh;
  box-shadow: var(--shadow-2xl);
  transform: scale(0.95);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.b2b-admin-overlay.open .b2b-admin-card {
  transform: scale(1);
}

/* Header */
.b2b-admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5, 20px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(135deg, rgba(74, 103, 65, 0.05), transparent);
}

.b2b-admin-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
}

.b2b-admin-logo {
  width: 40px;
  height: 40px;
  background: var(--persona-primary, #4a6741);
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1.1rem;
}

.b2b-admin-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.b2b-admin-subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0;
}

.b2b-admin-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: var(--color-text-muted);
  transition: background ${DURATION.FAST}ms;
}

.b2b-admin-close:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Navigation Tabs */
.b2b-admin-nav {
  display: flex;
  gap: var(--space-1, 4px);
  padding: var(--space-3, 12px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.02);
}

.b2b-admin-nav-btn {
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: transparent;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.b2b-admin-nav-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-text-primary);
}

.b2b-admin-nav-btn.active {
  background: var(--persona-primary, #4a6741);
  color: white;
}

.b2b-admin-nav-btn svg {
  width: 18px;
  height: 18px;
}

/* Content Area */
.b2b-admin-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6, 24px);
}

/* Overview Section */
.b2b-admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-6, 24px);
}

.b2b-admin-stat-card {
  background: white;
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  border: 1px solid var(--color-border);
}

.b2b-admin-stat-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-1, 4px);
}

.b2b-admin-stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.b2b-admin-stat-change {
  font-size: 0.8rem;
  color: var(--persona-primary, #4a6741);
  margin-top: var(--space-1, 4px);
}

.b2b-admin-stat-change.negative {
  color: #e74c3c;
}

/* Section Cards */
.b2b-admin-section {
  background: white;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-border);
  margin-bottom: var(--space-5, 20px);
}

.b2b-admin-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4, 16px);
  border-bottom: 1px solid var(--color-border);
}

.b2b-admin-section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.b2b-admin-section-title svg {
  width: 20px;
  height: 20px;
  color: var(--persona-primary, #4a6741);
}

.b2b-admin-section-content {
  padding: var(--space-4, 16px);
}

/* ROI Card */
.b2b-admin-roi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4, 16px);
  text-align: center;
}

.b2b-admin-roi-item {
  padding: var(--space-3, 12px);
}

.b2b-admin-roi-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-1, 4px);
}

.b2b-admin-roi-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.b2b-admin-roi-value.positive {
  color: var(--persona-primary, #4a6741);
}

.b2b-admin-roi-value.investment {
  color: var(--color-text-primary);
}

/* Onboarding Checklist */
.b2b-admin-checklist {
  list-style: none;
  padding: 0;
  margin: 0;
}

.b2b-admin-checklist-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) 0;
  border-bottom: 1px solid var(--color-border);
}

.b2b-admin-checklist-item:last-child {
  border-bottom: none;
}

.b2b-admin-checklist-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.b2b-admin-checklist-icon.completed {
  background: var(--persona-primary, #4a6741);
  color: white;
}

.b2b-admin-checklist-icon.pending {
  background: var(--color-border);
  color: var(--color-text-muted);
}

.b2b-admin-checklist-text {
  flex: 1;
}

.b2b-admin-checklist-title {
  font-weight: 500;
  color: var(--color-text-primary);
}

.b2b-admin-checklist-desc {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

/* Team Member List */
.b2b-admin-team-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.b2b-admin-team-member {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
  border-bottom: 1px solid var(--color-border);
}

.b2b-admin-team-member:last-child {
  border-bottom: none;
}

.b2b-admin-team-member:hover {
  background: rgba(0, 0, 0, 0.02);
}

.b2b-admin-team-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.b2b-admin-team-info {
  flex: 1;
}

.b2b-admin-team-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.b2b-admin-team-meta {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  display: flex;
  gap: var(--space-3, 12px);
}

.b2b-admin-team-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.b2b-admin-team-badge.admin {
  background: rgba(74, 103, 65, 0.1);
  color: var(--persona-primary, #4a6741);
}

.b2b-admin-team-badge.member {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-text-muted);
}

.b2b-admin-team-actions {
  display: flex;
  gap: var(--space-2, 8px);
}

.b2b-admin-team-action-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.8rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms;
}

.b2b-admin-team-action-btn:hover {
  border-color: var(--persona-primary, #4a6741);
  color: var(--persona-primary, #4a6741);
}

.b2b-admin-team-action-btn.danger:hover {
  border-color: #e74c3c;
  color: #e74c3c;
}

/* Invite Form */
.b2b-admin-invite-form {
  display: flex;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
}

.b2b-admin-invite-input {
  flex: 1;
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
}

.b2b-admin-invite-input:focus {
  outline: none;
  border-color: var(--persona-primary, #4a6741);
}

.b2b-admin-invite-select {
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  background: white;
  min-width: 100px;
}

.b2b-admin-invite-btn {
  padding: var(--space-3, 12px) var(--space-5, 20px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms;
}

.b2b-admin-invite-btn:hover {
  background: var(--persona-secondary, #3d5a35);
}

/* Settings Form */
.b2b-admin-form-group {
  margin-bottom: var(--space-5, 20px);
}

.b2b-admin-form-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: var(--space-2, 8px);
}

.b2b-admin-form-help {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-top: var(--space-1, 4px);
}

.b2b-admin-form-input {
  width: 100%;
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
}

.b2b-admin-form-textarea {
  width: 100%;
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}

.b2b-admin-form-input:focus,
.b2b-admin-form-textarea:focus {
  outline: none;
  border-color: var(--persona-primary, #4a6741);
}

.b2b-admin-save-btn {
  padding: var(--space-3, 12px) var(--space-6, 24px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms;
}

.b2b-admin-save-btn:hover {
  background: var(--persona-secondary, #3d5a35);
}

/* Topic Tags */
.b2b-admin-topics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.b2b-admin-topic-tag {
  padding: var(--space-1, 4px) var(--space-3, 12px);
  background: rgba(74, 103, 65, 0.1);
  color: var(--persona-primary, #4a6741);
  border-radius: var(--radius-full, 9999px);
  font-size: 0.85rem;
}

/* Billing Info */
.b2b-admin-billing-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-5, 20px);
}

.b2b-admin-billing-card {
  padding: var(--space-4, 16px);
  background: rgba(74, 103, 65, 0.05);
  border-radius: var(--radius-lg, 12px);
}

.b2b-admin-billing-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-1, 4px);
}

.b2b-admin-billing-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Empty State */
.b2b-admin-empty {
  text-align: center;
  padding: var(--space-8, 32px);
  color: var(--color-text-muted);
}

.b2b-admin-empty svg {
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-3, 12px);
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 768px) {
  .b2b-admin-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .b2b-admin-roi-grid {
    grid-template-columns: 1fr;
  }

  .b2b-admin-invite-form {
    flex-direction: column;
  }

  .b2b-admin-billing-summary {
    grid-template-columns: 1fr;
  }
}
`;

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const OVERVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

const TEAM_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

const SETTINGS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

const BILLING_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const CHART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`;

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchOrgData(orgId: string): Promise<{
  organization: Organization;
  usageStats: OrgUsageStats;
  roiEstimate: ROIEstimate;
  onboardingChecklist: OnboardingItem[];
}> {
  try {
    const response = await fetch(
      `/api/monetization/b2b/organization?orgId=${orgId}&userId=${currentUserId}`
    );
    if (!response.ok) throw new Error('Failed to fetch organization data');
    return response.json();
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to fetch org data');
    // Return mock data for demo
    return {
      organization: currentOrg!,
      usageStats: {
        orgId,
        period: new Date().toISOString().slice(0, 7),
        totalConversations: 234,
        totalMinutes: 1872,
        activeMembers: currentOrg?.activeSeats || 12,
        topTopics: ['stress', 'productivity', 'communication', 'work-life balance'],
        avgConversationsPerMember: 19.5,
      },
      roiEstimate: {
        monthlyInvestment: (currentOrg?.seatCount || 25) * 800,
        estimatedSavings: (currentOrg?.seatCount || 25) * 1200,
        roi: 50,
        assumptions: [
          'Each employee replaces 0.5 therapy sessions/month with Ferni',
          'Average therapy session cost: $150',
          'Productivity improvement worth $20/employee/month',
        ],
      },
      onboardingChecklist: [
        {
          id: 'invite_team',
          title: 'Invite your team',
          description: 'Send invites to at least 5 team members',
          completed: true,
        },
        {
          id: 'customize_welcome',
          title: 'Customize welcome message',
          description: 'Add a personalized welcome for your team',
          completed: false,
        },
        {
          id: 'add_values',
          title: 'Add company values',
          description: "Ferni can incorporate your company's values in conversations",
          completed: false,
        },
        {
          id: 'first_conversation',
          title: 'Have your first conversation',
          description: 'Try talking to Ferni yourself',
          completed: true,
        },
        {
          id: 'review_analytics',
          title: 'Review team analytics',
          description: 'Check how your team is using Ferni',
          completed: false,
        },
      ],
    };
  }
}

async function sendInvite(email: string, role: 'admin' | 'member'): Promise<boolean> {
  try {
    const response = await fetch('/api/monetization/b2b/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: currentOrg?.id,
        email,
        role,
        invitedBy: currentUserId,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

function initStyles(): void {
  if (document.getElementById('b2b-admin-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'b2b-admin-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

async function createModal(): Promise<HTMLElement> {
  initStyles();

  document.querySelectorAll('.b2b-admin-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'b2b-admin-overlay';
  overlay.innerHTML = `
    <div class="b2b-admin-backdrop"></div>
    <div class="b2b-admin-card" role="dialog" aria-labelledby="b2b-admin-title">
      ${renderHeader()}
      ${renderNav()}
      <div class="b2b-admin-content">
        <div class="b2b-admin-loading" style="text-align: center; padding: 40px;">
          Loading...
        </div>
      </div>
    </div>
  `;

  overlay.querySelector('.b2b-admin-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.b2b-admin-close')?.addEventListener('click', close);

  // Nav listeners
  overlay.querySelectorAll('.b2b-admin-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view') as typeof currentView;
      if (view) switchView(view);
    });
  });

  document.body.appendChild(overlay);

  return overlay;
}

function renderHeader(): string {
  const initials =
    currentOrg?.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'FT';

  return `
    <div class="b2b-admin-header">
      <div class="b2b-admin-header-left">
        <div class="b2b-admin-logo">${initials}</div>
        <div>
          <h2 class="b2b-admin-title" id="b2b-admin-title">${currentOrg?.name || 'Ferni for Teams'}</h2>
          <p class="b2b-admin-subtitle">${currentOrg?.plan || 'Growth'} Plan · ${currentOrg?.activeSeats || 0}/${currentOrg?.seatCount || 0} seats</p>
        </div>
      </div>
      <button class="b2b-admin-close" aria-label="${t('common.close')}">${CLOSE_ICON}</button>
    </div>
  `;
}

function renderNav(): string {
  const views = [
    { id: 'overview', label: 'Overview', icon: OVERVIEW_ICON },
    { id: 'team', label: 'Team', icon: TEAM_ICON },
    { id: 'settings', label: 'Settings', icon: SETTINGS_ICON },
    { id: 'billing', label: 'Billing', icon: BILLING_ICON },
  ];

  return `
    <nav class="b2b-admin-nav">
      ${views
        .map(
          (view) => `
        <button 
          class="b2b-admin-nav-btn ${currentView === view.id ? 'active' : ''}" 
          data-view="${view.id}"
        >
          ${view.icon}
          ${view.label}
        </button>
      `
        )
        .join('')}
    </nav>
  `;
}

async function renderContent(): Promise<void> {
  if (!container || !currentOrg) return;

  const contentEl = container.querySelector('.b2b-admin-content');
  if (!contentEl) return;

  const data = await fetchOrgData(currentOrg.id);

  switch (currentView) {
    case 'overview':
      contentEl.innerHTML = renderOverview(
        data.usageStats,
        data.roiEstimate,
        data.onboardingChecklist
      );
      break;
    case 'team':
      contentEl.innerHTML = renderTeam();
      setupTeamListeners();
      break;
    case 'settings':
      contentEl.innerHTML = renderSettings();
      setupSettingsListeners();
      break;
    case 'billing':
      contentEl.innerHTML = renderBilling(data.roiEstimate);
      break;
  }
}

function renderOverview(
  stats: OrgUsageStats,
  roi: ROIEstimate,
  checklist: OnboardingItem[]
): string {
  const completedCount = checklist.filter((item) => item.completed).length;

  return `
    <div class="b2b-admin-stats-grid">
      <div class="b2b-admin-stat-card">
        <div class="b2b-admin-stat-label">Active Members</div>
        <div class="b2b-admin-stat-value">${stats.activeMembers}</div>
        <div class="b2b-admin-stat-change">of ${currentOrg?.seatCount} seats</div>
      </div>
      <div class="b2b-admin-stat-card">
        <div class="b2b-admin-stat-label">Conversations</div>
        <div class="b2b-admin-stat-value">${stats.totalConversations}</div>
        <div class="b2b-admin-stat-change">this month</div>
      </div>
      <div class="b2b-admin-stat-card">
        <div class="b2b-admin-stat-label">Total Minutes</div>
        <div class="b2b-admin-stat-value">${stats.totalMinutes.toLocaleString()}</div>
        <div class="b2b-admin-stat-change">~${Math.round(stats.totalMinutes / stats.activeMembers)} per member</div>
      </div>
      <div class="b2b-admin-stat-card">
        <div class="b2b-admin-stat-label">ROI</div>
        <div class="b2b-admin-stat-value">${roi.roi}%</div>
        <div class="b2b-admin-stat-change">estimated return</div>
      </div>
    </div>

    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">${CHART_ICON} ROI Breakdown</h3>
      </div>
      <div class="b2b-admin-section-content">
        <div class="b2b-admin-roi-grid">
          <div class="b2b-admin-roi-item">
            <div class="b2b-admin-roi-label">Monthly Investment</div>
            <div class="b2b-admin-roi-value investment">$${(roi.monthlyInvestment / 100).toLocaleString()}</div>
          </div>
          <div class="b2b-admin-roi-item">
            <div class="b2b-admin-roi-label">Estimated Savings</div>
            <div class="b2b-admin-roi-value positive">$${(roi.estimatedSavings / 100).toLocaleString()}</div>
          </div>
          <div class="b2b-admin-roi-item">
            <div class="b2b-admin-roi-label">Net Benefit</div>
            <div class="b2b-admin-roi-value positive">$${((roi.estimatedSavings - roi.monthlyInvestment) / 100).toLocaleString()}</div>
          </div>
        </div>
        <p class="b2b-admin-form-help" style="margin-top: 12px; text-align: center;">
          Based on: ${roi.assumptions[0]}
        </p>
      </div>
    </div>

    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">Popular Topics</h3>
      </div>
      <div class="b2b-admin-section-content">
        <div class="b2b-admin-topics">
          ${stats.topTopics.map((topic) => `<span class="b2b-admin-topic-tag">${topic}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">Getting Started (${completedCount}/${checklist.length})</h3>
      </div>
      <div class="b2b-admin-section-content">
        <ul class="b2b-admin-checklist">
          ${checklist
            .map(
              (item) => `
            <li class="b2b-admin-checklist-item">
              <div class="b2b-admin-checklist-icon ${item.completed ? 'completed' : 'pending'}">
                ${item.completed ? CHECK_ICON : ''}
              </div>
              <div class="b2b-admin-checklist-text">
                <div class="b2b-admin-checklist-title">${item.title}</div>
                <div class="b2b-admin-checklist-desc">${item.description}</div>
              </div>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    </div>
  `;
}

function renderTeam(): string {
  // Mock team members
  const members: TeamMember[] =
    currentOrg?.memberUserIds.map((userId, i) => ({
      userId,
      email: `member${i + 1}@${currentOrg?.slug || 'company'}.com`,
      role: currentOrg?.adminUserIds.includes(userId) ? 'admin' : 'member',
      joinedAt: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
      conversationCount: Math.floor(Math.random() * 30) + 5,
    })) || [];

  return `
    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">${TEAM_ICON} Invite Team Members</h3>
      </div>
      <div class="b2b-admin-section-content">
        <div class="b2b-admin-invite-form">
          <input
            type="email"
            class="b2b-admin-invite-input"
            placeholder="${t('placeholders.colleagueEmail')}"
            id="invite-email"
          />
          <select class="b2b-admin-invite-select" id="invite-role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button class="b2b-admin-invite-btn" id="send-invite-btn">Send Invite</button>
        </div>
        <p class="b2b-admin-form-help">
          ${currentOrg?.seatCount ? currentOrg.seatCount - (currentOrg.activeSeats || 0) : 0} seats remaining
        </p>
      </div>
    </div>

    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">Team Members (${members.length})</h3>
      </div>
      <div class="b2b-admin-section-content">
        <ul class="b2b-admin-team-list">
          ${members
            .map(
              (member) => `
            <li class="b2b-admin-team-member">
              <div class="b2b-admin-team-avatar">${(member.email[0] ?? '?').toUpperCase()}</div>
              <div class="b2b-admin-team-info">
                <div class="b2b-admin-team-name">${member.email}</div>
                <div class="b2b-admin-team-meta">
                  <span>${member.conversationCount} conversations</span>
                  <span>Joined ${new Date(member.joinedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <span class="b2b-admin-team-badge ${member.role}">${member.role}</span>
              <div class="b2b-admin-team-actions">
                ${member.role === 'member' ? `<button class="b2b-admin-team-action-btn" data-action="promote" data-user="${member.userId}">Make Admin</button>` : ''}
                <button class="b2b-admin-team-action-btn danger" data-action="remove" data-user="${member.userId}">Remove</button>
              </div>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    </div>
  `;
}

function renderSettings(): string {
  return `
    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">${SETTINGS_ICON} Organization Settings</h3>
      </div>
      <div class="b2b-admin-section-content">
        <div class="b2b-admin-form-group">
          <label class="b2b-admin-form-label">Welcome Message</label>
          <textarea
            class="b2b-admin-form-textarea"
            id="welcome-message"
            placeholder="${t('placeholders.welcomeMessageExample', { orgName: currentOrg?.name || 'our team' })}"
          >${currentOrg?.config?.welcomeMessage || ''}</textarea>
          <p class="b2b-admin-form-help">This message appears when team members first use Ferni.</p>
        </div>

        <div class="b2b-admin-form-group">
          <label class="b2b-admin-form-label">Company Values</label>
          <textarea
            class="b2b-admin-form-textarea"
            id="company-values"
            placeholder="${t('placeholders.companyValuesExample')}"
          >${currentOrg?.config?.companyValues?.join(', ') || ''}</textarea>
          <p class="b2b-admin-form-help">Ferni will incorporate these values in relevant conversations.</p>
        </div>

        <button class="b2b-admin-save-btn" id="save-settings-btn">Save Settings</button>
      </div>
    </div>
  `;
}

function renderBilling(roi: ROIEstimate): string {
  const planPrices: Record<string, number> = {
    starter: 500,
    growth: 800,
    enterprise: 0,
  };

  const monthlyTotal =
    (currentOrg?.seatCount || 0) * (planPrices[currentOrg?.plan || 'growth'] || 800);

  return `
    <div class="b2b-admin-billing-summary">
      <div class="b2b-admin-billing-card">
        <div class="b2b-admin-billing-label">Current Plan</div>
        <div class="b2b-admin-billing-value" style="text-transform: capitalize;">${currentOrg?.plan || 'Growth'}</div>
      </div>
      <div class="b2b-admin-billing-card">
        <div class="b2b-admin-billing-label">Monthly Cost</div>
        <div class="b2b-admin-billing-value">$${(monthlyTotal / 100).toLocaleString()}</div>
      </div>
    </div>

    <div class="b2b-admin-section">
      <div class="b2b-admin-section-header">
        <h3 class="b2b-admin-section-title">${BILLING_ICON} Plan Details</h3>
      </div>
      <div class="b2b-admin-section-content">
        <div class="b2b-admin-form-group">
          <label class="b2b-admin-form-label">Seats</label>
          <p>${currentOrg?.activeSeats || 0} active of ${currentOrg?.seatCount || 0} total</p>
        </div>
        <div class="b2b-admin-form-group">
          <label class="b2b-admin-form-label">Price per Seat</label>
          <p>$${((planPrices[currentOrg?.plan || 'growth'] || 800) / 100).toFixed(2)}/month</p>
        </div>
        <div class="b2b-admin-form-group">
          <label class="b2b-admin-form-label">Estimated ROI</label>
          <p style="color: var(--persona-primary);">${roi.roi}% return on investment</p>
          <p class="b2b-admin-form-help">
            Net benefit: $${((roi.estimatedSavings - roi.monthlyInvestment) / 100).toLocaleString()}/month
          </p>
        </div>
        <button class="b2b-admin-save-btn" onclick="window.open('/api/subscription/portal?userId=${currentUserId}', '_blank')">
          Manage Billing
        </button>
      </div>
    </div>
  `;
}

function setupTeamListeners(): void {
  if (!container) return;

  const inviteBtn = container.querySelector('#send-invite-btn');
  const emailInput = container.querySelector('#invite-email') as HTMLInputElement;
  const roleSelect = container.querySelector('#invite-role') as HTMLSelectElement;

  inviteBtn?.addEventListener('click', async () => {
    const email = emailInput?.value;
    const role = roleSelect?.value as 'admin' | 'member';

    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }

    const success = await sendInvite(email, role);
    if (success) {
      toast.success('Invite sent!');
      emailInput.value = '';
    } else {
      toast.error('Failed to send invite');
    }
  });

  // Team action buttons
  container.querySelectorAll('.b2b-admin-team-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      const userId = btn.getAttribute('data-user');

      if (action === 'remove') {
        toast.success('Member removed');
      } else if (action === 'promote') {
        toast.success('Member promoted to admin');
      }

      // In production, make API call and refresh
      log.debug({ action, userId }, 'Team action');
    });
  });
}

function setupSettingsListeners(): void {
  if (!container) return;

  const saveBtn = container.querySelector('#save-settings-btn');

  saveBtn?.addEventListener('click', () => {
    const welcomeMessage = (container?.querySelector('#welcome-message') as HTMLTextAreaElement)
      ?.value;
    const companyValues = (container?.querySelector('#company-values') as HTMLTextAreaElement)
      ?.value;

    // In production, make API call
    log.debug({ welcomeMessage, companyValues }, 'Saving settings');
    toast.success('Settings saved!');
  });
}

function switchView(view: typeof currentView): void {
  currentView = view;

  // Update nav
  container?.querySelectorAll('.b2b-admin-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });

  // Render content
  renderContent();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the B2B admin dashboard
 */
export async function open(userId: string, org: Organization): Promise<void> {
  if (isOpen) return;

  currentUserId = userId;
  currentOrg = org;
  currentView = 'overview';

  container = await createModal();

  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
    renderContent();
  });

  log.debug({ userId, orgId: org.id }, 'B2B Admin opened');
}

/**
 * Close the dashboard
 */
export function close(): void {
  if (!isOpen || !container) return;

  container.classList.remove('open');
  isOpen = false;

  trackedTimeout(() => {
    container?.remove();
    container = null;
    currentOrg = null;
  }, DURATION.MODERATE);

  log.debug('B2B Admin closed');
}

/**
 * Check if dashboard is open
 */
export function isModalOpen(): boolean {
  return isOpen;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const b2bAdminUI = {
  open,
  close,
  isOpen: isModalOpen,
};

export default b2bAdminUI;
