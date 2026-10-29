/**
 * Crisis resources: the helplines the crisis tools hand out, in one place. The house
 * facts guard (personas/house-facts.ts) reads the numbers from here, so a hotline added
 * below is never blocked as an invented number.
 *
 * @module tools/domains/crisis/crisis-resources
 */
// ============================================================================
// CRISIS RESOURCES DATABASE
// ============================================================================

export interface CrisisResource {
  primary: {
    name: string;
    contact: string;
    available: string;
    description: string;
  };
  secondary?: {
    name: string;
    contact: string;
    available?: string;
    description?: string;
  };
  additional?: Array<{ name: string; url?: string; contact?: string; description?: string }>;
}

export const CRISIS_RESOURCES: Record<string, CrisisResource> = {
  'suicide-self-harm': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description:
        'Free, confidential support for people in distress, prevention and crisis resources',
    },
    secondary: {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      available: '24/7',
      description: 'Free, confidential crisis counseling via text',
    },
    additional: [
      {
        name: 'International Association for Suicide Prevention',
        url: 'https://www.iasp.info/resources/Crisis_Centres/',
      },
    ],
  },
  'mental-health': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description: 'Mental health crisis support and resources',
    },
    secondary: {
      name: 'NAMI Helpline',
      contact: '1-800-950-NAMI (6264)',
      available: 'Mon-Fri, 10am-10pm ET',
      description: 'National Alliance on Mental Illness - information, referrals, and support',
    },
  },
  'domestic-violence': {
    primary: {
      name: 'National Domestic Violence Hotline',
      contact: '1-800-799-7233 (SAFE)',
      available: '24/7',
      description:
        'Confidential support, safety planning, and resources for domestic violence survivors',
    },
    secondary: {
      name: 'Text Support',
      contact: 'Text START to 88788',
      available: '24/7',
    },
  },
  'sexual-assault': {
    primary: {
      name: 'RAINN National Sexual Assault Hotline',
      contact: '1-800-656-4673 (HOPE)',
      available: '24/7',
      description: 'Confidential support from trained staff members',
    },
    secondary: {
      name: 'Online Chat',
      contact: 'https://www.rainn.org/get-help',
      available: '24/7',
    },
  },
  'substance-abuse': {
    primary: {
      name: 'SAMHSA National Helpline',
      contact: '1-800-662-4357',
      available: '24/7, 365 days',
      description: 'Free, confidential treatment referrals and information service',
    },
    secondary: {
      name: 'Alcoholics Anonymous',
      contact: 'https://www.aa.org/find-aa',
      description: 'Find local AA meetings',
    },
    additional: [
      { name: 'Narcotics Anonymous', url: 'https://www.na.org/meetingsearch/' },
      { name: 'SMART Recovery', url: 'https://www.smartrecovery.org/community/calendar.php' },
    ],
  },
  'child-abuse': {
    primary: {
      name: 'Childhelp National Child Abuse Hotline',
      contact: '1-800-422-4453 (4-A-CHILD)',
      available: '24/7',
      description: 'Professional crisis counselors for child abuse intervention and prevention',
    },
  },
  'financial-crisis': {
    primary: {
      name: '211',
      contact: 'Call 211 or text your zip code to 898211',
      available: '24/7',
      description: 'Connect to local services for housing, food, utilities, and more',
    },
    secondary: {
      name: 'National Foundation for Credit Counseling',
      contact: '1-800-388-2227',
      description: 'Nonprofit credit counseling and debt management',
    },
  },
  'general-distress': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description:
        "Support for any emotional distress - you don't need to be suicidal to reach out",
    },
    secondary: {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      available: '24/7',
    },
  },
  'veteran-crisis': {
    primary: {
      name: 'Veterans Crisis Line',
      contact: 'Call 988, then press 1',
      available: '24/7',
      description: 'Specialized support for veterans and their families',
    },
    secondary: {
      name: 'Veterans Crisis Line Chat',
      contact: 'https://www.veteranscrisisline.net/get-help-now/chat/',
      available: '24/7',
    },
  },
  'lgbtq-crisis': {
    primary: {
      name: 'Trevor Project',
      contact: '1-866-488-7386',
      available: '24/7',
      description: 'Crisis intervention for LGBTQ+ young people',
    },
    secondary: {
      name: 'Trevor Project Text/Chat',
      contact: 'Text START to 678-678',
      available: '24/7',
    },
    additional: [
      {
        name: 'Trans Lifeline',
        contact: '1-877-565-8860',
        description: 'Peer support for trans people',
      },
    ],
  },
};

/** What the tool says when it can't build a reply: the two lines that must always get through. */
export const CRISIS_FALLBACK_RESPONSE =
  `If you're in crisis or need support right now:\n\n` +
  `📞 **988 Suicide & Crisis Lifeline** - Call or text 988 (24/7)\n` +
  `📱 **Crisis Text Line** - Text HOME to 741741 (24/7)\n\n` +
  `You don't have to face this alone. These trained professionals are ready to help.`;

/**
 * Every contact line in the data above, one string each (a number never runs into the next
 * line's): what the guard reads helpline numbers and sites from.
 * A vanity number written with its digits after it ("1-800-950-NAMI (6264)") comes twice:
 * as written and as digits ("1-800-950-6264"), the way it is dialled and said.
 */
export function crisisContactLines(): string[] {
  const lines: string[] = [...CRISIS_FALLBACK_RESPONSE.split('\n')];
  for (const resource of Object.values(CRISIS_RESOURCES)) {
    lines.push(resource.primary.contact);
    if (resource.secondary) lines.push(resource.secondary.contact);
    for (const extra of resource.additional ?? []) {
      if (extra.contact) lines.push(extra.contact);
      if (extra.url) lines.push(extra.url);
    }
  }
  return lines.flatMap((line) => {
    const dialled = line.replace(/-[A-Z]{3,}\s*\((\d{4})\)/gu, '-$1');
    return dialled === line ? [line] : [line, dialled];
  });
}
