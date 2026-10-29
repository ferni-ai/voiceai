/**
 * Helplines that coaching tools print in their own text (new-parent postpartumCheckin,
 * caregiver caregiverBurnout). The house facts guard (agents/personas/house-facts.ts) loads
 * these as static helplines instead of trusting those tools' output, which echoes the
 * model's own arguments. A test reads each tool's real output and checks every number in it
 * is here or in the other helpline tables, so the text and this list cannot drift apart.
 *
 * @module tools/domains/life-coaching-shared/helplines
 */
export const COACHING_HELPLINES = {
  postpartum: { name: 'Postpartum Support International', phone: '1-800-944-4773' },
  caregiver: { name: 'Caregiver Action Network', phone: '1-855-227-3640' },
} as const;
