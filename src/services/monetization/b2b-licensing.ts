/**
 * B2B Licensing Service
 *
 * Companies pay for "Ferni for Teams" as an employee wellness benefit.
 * This is where the real sustainable revenue comes from.
 *
 * Value proposition:
 * - Cheaper than EAP (Employee Assistance Programs)
 * - Available 24/7 (not just business hours)
 * - No scheduling, no waiting lists
 * - Reduces healthcare costs (mental health support)
 * - Improves employee communication and productivity
 */

import {
  ORGANIZATION_PLANS,
  type Organization,
  type OrganizationInvite,
  type OrganizationPlan,
  type OrganizationPlanConfig,
} from '../../types/monetization.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'B2BLicensing' });

// ============================================================================
// IN-MEMORY STORAGE (Replace with DB in production)
// ============================================================================

const organizations: Map<string, Organization> = new Map();
const invites: Map<string, OrganizationInvite> = new Map();
const userOrgMembership: Map<string, string> = new Map(); // userId -> orgId

// ============================================================================
// ORGANIZATION MANAGEMENT
// ============================================================================

/**
 * Create a new organization
 */
export async function createOrganization(params: {
  name: string;
  plan: OrganizationPlan;
  seatCount: number;
  adminUserId: string;
  config?: Organization['config'];
}): Promise<Organization> {
  const { name, plan, seatCount, adminUserId, config } = params;

  const planConfig = ORGANIZATION_PLANS[plan];

  // Validate seat count
  if (seatCount < planConfig.minimumSeats) {
    throw new Error(`Minimum ${planConfig.minimumSeats} seats required for ${planConfig.name}`);
  }
  if (planConfig.maximumSeats && seatCount > planConfig.maximumSeats) {
    throw new Error(`Maximum ${planConfig.maximumSeats} seats for ${planConfig.name}`);
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const org: Organization = {
    id: `org_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    slug,
    plan,
    seatCount,
    activeSeats: 1, // Admin counts as first seat
    adminUserIds: [adminUserId],
    memberUserIds: [adminUserId],
    config,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  organizations.set(org.id, org);
  userOrgMembership.set(adminUserId, org.id);

  log.info(
    {
      orgId: org.id,
      name,
      plan,
      seatCount,
    },
    'Organization created'
  );

  return org;
}

/**
 * Get organization by ID
 */
export function getOrganization(orgId: string): Organization | null {
  return organizations.get(orgId) ?? null;
}

/**
 * Get organization for a user
 */
export function getUserOrganization(userId: string): Organization | null {
  const orgId = userOrgMembership.get(userId);
  return orgId ? (organizations.get(orgId) ?? null) : null;
}

/**
 * Check if user is an org admin
 */
export function isOrgAdmin(userId: string, orgId: string): boolean {
  const org = organizations.get(orgId);
  return org?.adminUserIds.includes(userId) ?? false;
}

/**
 * Update organization settings
 */
export async function updateOrganization(
  orgId: string,
  updates: Partial<Pick<Organization, 'name' | 'config' | 'seatCount'>>
): Promise<Organization> {
  const org = organizations.get(orgId);
  if (!org) throw new Error('Organization not found');

  Object.assign(org, updates, { updatedAt: new Date() });

  log.info({ orgId, updates: Object.keys(updates) }, 'Organization updated');

  return org;
}

// ============================================================================
// MEMBER MANAGEMENT
// ============================================================================

/**
 * Create an invite
 */
export async function createInvite(params: {
  orgId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
}): Promise<OrganizationInvite> {
  const { orgId, email, role, invitedBy } = params;

  const org = organizations.get(orgId);
  if (!org) throw new Error('Organization not found');

  // Check if admin
  if (!org.adminUserIds.includes(invitedBy)) {
    throw new Error('Only admins can send invites');
  }

  // Check seat availability
  if (org.activeSeats >= org.seatCount) {
    throw new Error('No seats available. Upgrade your plan to add more members.');
  }

  const invite: OrganizationInvite = {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    organizationId: orgId,
    email,
    role,
    status: 'pending',
    invitedBy,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: new Date(),
  };

  invites.set(invite.id, invite);

  log.info({ inviteId: invite.id, orgId, email, role }, 'Invite created');

  return invite;
}

/**
 * Accept an invite
 */
export async function acceptInvite(inviteId: string, userId: string): Promise<Organization> {
  const invite = invites.get(inviteId);
  if (!invite) throw new Error('Invite not found');

  if (invite.acceptedAt) throw new Error('Invite already used');
  if (invite.expiresAt < new Date()) throw new Error('Invite expired');

  const org = organizations.get(invite.organizationId);
  if (!org) throw new Error('Organization not found');

  // Check seat availability
  if (org.activeSeats >= org.seatCount) {
    throw new Error('No seats available');
  }

  // Add member
  org.memberUserIds.push(userId);
  if (invite.role === 'admin') {
    org.adminUserIds.push(userId);
  }
  org.activeSeats++;
  org.updatedAt = new Date();

  // Track membership
  userOrgMembership.set(userId, org.id);

  // Mark invite used
  invite.acceptedAt = new Date();
  invite.status = 'accepted';

  log.info({ orgId: org.id, userId, role: invite.role }, 'Invite accepted');

  return org;
}

/**
 * Remove a member from organization
 */
export async function removeMember(
  orgId: string,
  userId: string,
  removedBy: string
): Promise<void> {
  const org = organizations.get(orgId);
  if (!org) throw new Error('Organization not found');

  // Check permissions
  if (!org.adminUserIds.includes(removedBy)) {
    throw new Error('Only admins can remove members');
  }

  // Can't remove last admin
  if (org.adminUserIds.includes(userId) && org.adminUserIds.length === 1) {
    throw new Error("Can't remove the last admin");
  }

  // Remove from arrays
  org.memberUserIds = org.memberUserIds.filter((id) => id !== userId);
  org.adminUserIds = org.adminUserIds.filter((id) => id !== userId);
  org.activeSeats = org.memberUserIds.length;
  org.updatedAt = new Date();

  // Remove membership tracking
  userOrgMembership.delete(userId);

  log.info({ orgId, userId, removedBy }, 'Member removed');
}

// ============================================================================
// BILLING & PRICING
// ============================================================================

/**
 * Calculate monthly cost for an organization
 */
export function calculateMonthlyCost(plan: OrganizationPlan, seatCount: number): number {
  const config = ORGANIZATION_PLANS[plan];

  if (config.pricePerSeatCents === 0) {
    // Enterprise - custom pricing
    return 0;
  }

  return config.pricePerSeatCents * seatCount;
}

/**
 * Get plan comparison for upgrade decisions
 */
export function getPlanComparison(): Array<OrganizationPlanConfig & { plan: OrganizationPlan }> {
  return (Object.entries(ORGANIZATION_PLANS) as [OrganizationPlan, OrganizationPlanConfig][]).map(
    ([plan, config]) => ({
      ...config,
      plan,
    })
  );
}

/**
 * Check if organization can upgrade to a plan
 */
export function canUpgradeToPlan(
  org: Organization,
  targetPlan: OrganizationPlan
): {
  canUpgrade: boolean;
  reason?: string;
} {
  const currentPlanIndex = ['starter', 'growth', 'enterprise'].indexOf(org.plan);
  const targetPlanIndex = ['starter', 'growth', 'enterprise'].indexOf(targetPlan);

  if (targetPlanIndex <= currentPlanIndex) {
    return { canUpgrade: false, reason: "Can't downgrade via this method" };
  }

  const targetConfig = ORGANIZATION_PLANS[targetPlan];

  // Check minimum seats
  if (org.activeSeats < targetConfig.minimumSeats) {
    return {
      canUpgrade: false,
      reason: `${targetConfig.name} requires at least ${targetConfig.minimumSeats} seats`,
    };
  }

  return { canUpgrade: true };
}

// ============================================================================
// USAGE & ANALYTICS
// ============================================================================

export interface OrgUsageStats {
  orgId: string;
  period: string; // "2024-01"
  totalConversations: number;
  totalMinutes: number;
  activeMembers: number;
  topTopics: string[];
  avgConversationsPerMember: number;
}

/**
 * Get organization usage stats (mock implementation)
 */
export function getOrgUsageStats(orgId: string, period?: string): OrgUsageStats {
  const org = organizations.get(orgId);
  if (!org) throw new Error('Organization not found');

  // In production, this would aggregate from actual usage data
  return {
    orgId,
    period: period ?? new Date().toISOString().slice(0, 7),
    totalConversations: org.activeSeats * 15, // Mock: 15 per member
    totalMinutes: org.activeSeats * 45, // Mock: 45 min per member
    activeMembers: org.activeSeats,
    topTopics: ['stress', 'productivity', 'communication', 'work-life balance'],
    avgConversationsPerMember: 15,
  };
}

/**
 * Get ROI estimate for organization
 */
export function getROIEstimate(org: Organization): {
  monthlyInvestment: number;
  estimatedSavings: number;
  roi: number;
  assumptions: string[];
} {
  const monthlyInvestment = calculateMonthlyCost(org.plan, org.seatCount);

  // Conservative assumptions
  const avgTherapySessionCost = 15000; // $150
  const sessionsReplacedPerEmployee = 0.5; // 0.5 therapy sessions per month
  const productivityGainPerEmployee = 2000; // $20/month in productivity

  const therapySavings = org.activeSeats * sessionsReplacedPerEmployee * avgTherapySessionCost;
  const productivityGains = org.activeSeats * productivityGainPerEmployee;
  const estimatedSavings = therapySavings + productivityGains;

  const roi =
    monthlyInvestment > 0 ? ((estimatedSavings - monthlyInvestment) / monthlyInvestment) * 100 : 0;

  return {
    monthlyInvestment,
    estimatedSavings,
    roi: Math.round(roi),
    assumptions: [
      'Each employee replaces 0.5 therapy sessions/month with Ferni',
      'Average therapy session cost: $150',
      'Productivity improvement worth $20/employee/month',
    ],
  };
}

// ============================================================================
// ONBOARDING
// ============================================================================

/**
 * Get organization onboarding checklist
 */
export function getOnboardingChecklist(org: Organization): Array<{
  id: string;
  title: string;
  description: string;
  completed: boolean;
}> {
  return [
    {
      id: 'invite_team',
      title: 'Invite your team',
      description: 'Send invites to at least 5 team members',
      completed: org.activeSeats >= 5,
    },
    {
      id: 'customize_welcome',
      title: 'Customize welcome message',
      description: 'Add a personalized welcome for your team',
      completed: !!org.config?.welcomeMessage,
    },
    {
      id: 'add_values',
      title: 'Add company values',
      description: "Ferni can incorporate your company's values in conversations",
      completed: !!org.config?.companyValues?.length,
    },
    {
      id: 'first_conversation',
      title: 'Have your first conversation',
      description: 'Try talking to Ferni yourself',
      completed: true, // Admin has likely talked
    },
    {
      id: 'review_analytics',
      title: 'Review team analytics',
      description: 'Check how your team is using Ferni',
      completed: false, // Would check actual views
    },
  ];
}

// ============================================================================
// EXPORTS
// ============================================================================

export const b2bLicensing = {
  // Organization management
  createOrganization,
  getOrganization,
  getUserOrganization,
  isOrgAdmin,
  updateOrganization,

  // Member management
  createInvite,
  acceptInvite,
  removeMember,

  // Billing
  calculateMonthlyCost,
  getPlanComparison,
  canUpgradeToPlan,

  // Analytics
  getOrgUsageStats,
  getROIEstimate,

  // Onboarding
  getOnboardingChecklist,

  // Constants
  PLANS: ORGANIZATION_PLANS,
};

export default b2bLicensing;
