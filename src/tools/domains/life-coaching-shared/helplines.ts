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

/**
 * National helplines the app's tools and prompts name that are in none of the other helpline
 * tables (the LGBT National Help Center that the coming-out tool prints, the old Lifeline
 * number that still routes to 988, the Disaster Distress Helpline, the 988 site). Add a
 * helpline here when the scan test in personas/__tests__/helpline-literals.test.ts finds one.
 */
export const NATIONAL_HELPLINES = {
  lgbtHelpCenter: { name: 'LGBT National Help Center', phone: '1-888-843-4564' },
  oldLifeline: {
    name: 'National Suicide Prevention Lifeline (routes to 988)',
    phone: '1-800-273-8255',
  },
  disasterDistress: { name: 'Disaster Distress Helpline', phone: '1-800-985-5990' },
  lifeline988: { name: '988 Suicide & Crisis Lifeline', website: 'https://988lifeline.org' },
} as const;

/**
 * Resource websites the tools and prompts name (support groups, treatment and food locators,
 * legal aid, caregiver and LGBTQ+ organisations) plus a few national resources a model names
 * on its own (nami.org, 211.org, childhelp.org, postpartum.net). Not hotlines, but a reply
 * that names one is helping, so they are house facts too. The scan test in
 * personas/__tests__/helpline-literals.test.ts fails on any site literal in those domains
 * that is not here or in a helpline table: add it here.
 */
export const RESOURCE_SITES: readonly string[] = [
  'iasp.info',
  'rainn.org',
  'aa.org',
  'na.org',
  'smartrecovery.org',
  'veteranscrisisline.net',
  'findfood.gov',
  'fns.usda.gov',
  'findtreatment.gov',
  'feedingamerica.org',
  'needymeds.org',
  'psychologytoday.com',
  'openpathcollective.org',
  'lawhelp.org',
  'coachfederation.org',
  'caregiving.org',
  'caregiver.org',
  'archrespite.org',
  'thetrevorproject.org',
  'pflag.org',
  'glaad.org',
  '988lifeline.org',
  'crisistextline.org',
  'thehotline.org',
  'nationaleatingdisorders.org',
  'samhsa.gov',
  'twloha.com',
  'ncadv.org',
  'hotline.rainn.org',
  'nami.org',
  '211.org',
  'childhelp.org',
  'postpartum.net',
];
