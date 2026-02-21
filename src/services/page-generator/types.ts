/**
 * Agent Page Generator Types
 *
 * Configuration interfaces for generating standalone agent landing pages
 * like meet-joel/index.html.
 */

/**
 * Brand configuration for the agent page
 */
export interface BrandConfig {
  /** Primary brand color (hex, e.g., "#96151D") */
  primary: string;

  /** Secondary brand color (auto-derived from primary if not provided) */
  secondary?: string;

  /** Custom font configuration */
  fonts?: {
    /** Display font family and optional CDN URLs */
    display?: FontConfig;
    /** Body font family and optional CDN URLs */
    body?: FontConfig;
  };

  /** Logo URL (optional, shown in header) */
  logoUrl?: string;
}

/**
 * Font configuration for custom typography
 */
export interface FontConfig {
  /** Font family name (e.g., "Mark Pro") */
  family: string;

  /** CDN URLs for @font-face definitions */
  urls?: Array<{
    url: string;
    weight: number;
    style?: 'normal' | 'italic';
  }>;

  /** Fallback font stack */
  fallback?: string;
}

/**
 * Voice configuration for the agent
 */
export interface VoiceConfig {
  /** Cartesia voice ID (for cloned or selected voices) */
  voiceId?: string;

  /** Voice provider (currently only Cartesia supported) */
  provider?: 'cartesia';
}

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  /** Custom token endpoint (auto-detects if not provided) */
  tokenEndpoint?: string;

  /** Environment for auto-detection */
  environment?: 'production' | 'development' | 'custom';

  /** Custom LiveKit URL (for self-hosted deployments) */
  livekitUrl?: string;
}

/**
 * SEO and Open Graph metadata
 */
export interface SEOConfig {
  /** Custom page title (defaults to "Meet {agent.name}") */
  title?: string;

  /** Meta description (defaults to agent.description) */
  description?: string;

  /** Open Graph image URL */
  ogImage?: string;

  /** Twitter card type */
  twitterCard?: 'summary' | 'summary_large_image';
}

/**
 * Main configuration for generating an agent page
 */
export interface AgentPageConfig {
  /** Agent identity information */
  agent: {
    /** Unique agent ID (used for CSS persona selector) */
    id: string;

    /** Full display name (e.g., "Joel Dickson") */
    name: string;

    /** Short display name for UI (defaults to first name) */
    displayName?: string;

    /** Initials for avatar and favicon (e.g., "JD") */
    initials: string;

    /** Tagline shown below name (e.g., "Global Head of...") */
    tagline: string;

    /** Description for meta tags and about section */
    description: string;

    /** Featured quote displayed below the hero */
    quote?: {
      text: string;
      /** Optional context or source for the quote */
      context?: string;
    };

    /** Credential cards displayed in a grid (e.g., experience, education) */
    credentials?: Array<{
      label: string;
      value: string;
    }>;

    /** Conversation starter prompts shown as tappable chips */
    conversationStarters?: string[];

    /** Custom CTA headline (defaults to "Ready to talk?") */
    ctaHeadline?: string;

    /** Custom CTA description */
    ctaDescription?: string;
  };

  /** Brand colors, fonts, and logo */
  brand: BrandConfig;

  /** Voice configuration (optional) */
  voice?: VoiceConfig;

  /** Theme mode */
  theme?: 'zen' | 'dark';

  /** Deployment configuration */
  deployment?: DeploymentConfig;

  /** SEO metadata */
  seo?: SEOConfig;

  /** Footer configuration */
  footer?: {
    /** Custom footer links (defaults to ferni.ai URLs) */
    links?: Array<{ label: string; href: string }>;
    /** Custom disclaimer text */
    disclaimer?: string;
  };

  /** Additional custom CSS to inject */
  customCss?: string;

  /** Additional custom JS to inject */
  customJs?: string;
}

/**
 * Result of page generation
 */
export interface GeneratedPage {
  /** Complete HTML string */
  html: string;

  /** Size in bytes */
  size: number;

  /** Generation timestamp */
  generatedAt: Date;

  /** Config used for generation (for debugging) */
  config: AgentPageConfig;
}

/**
 * Derived brand colors (auto-generated from primary)
 */
export interface DerivedBrandColors {
  primary: string;
  secondary: string;
  glow: string;
  tint: string;
  gradientOrb: string;
}

/**
 * Template context passed to Handlebars
 */
export interface TemplateContext {
  agent: AgentPageConfig['agent'] & {
    displayName: string; // Always populated
  };
  brand: DerivedBrandColors & {
    fonts?: BrandConfig['fonts'];
    logoUrl?: string;
  };
  voice: VoiceConfig;
  theme: 'zen' | 'dark';
  deployment: {
    tokenEndpoint: string;
    livekitUrl: string;
    isProduction: boolean;
  };
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    twitterCard: string;
  };
  footer?: {
    links?: Array<{ label: string; href: string }>;
    disclaimer?: string;
  };
  favicon: string; // Data URI
  personaCss: string; // Generated CSS block
  customCss?: string;
  customJs?: string;
}

// =============================================================================
// MULTI-ADVISOR PAGE TYPES
// =============================================================================

/**
 * Configuration for a single advisor in a multi-advisor page
 */
export interface AdvisorConfig {
  /** Unique advisor ID (used for routing) */
  id: string;

  /** Full display name (e.g., "Peter Lynch") */
  name: string;

  /** Initials for avatar (e.g., "PL") */
  initials: string;

  /** Short tagline (e.g., "The Stock Picker") */
  tagline: string;

  /** Description of their specialty */
  description: string;

  /** Primary brand color for this advisor (hex) */
  color: string;

  /** Icon emoji (optional) */
  icon?: string;

  /** Cartesia voice ID (optional, falls back to config) */
  voiceId?: string;
}

/**
 * Main configuration for generating a multi-advisor page
 */
export interface MultiAdvisorPageConfig {
  /** Page title (e.g., "Financial Legends") */
  title: string;

  /** Page description */
  description: string;

  /** List of advisors (2-5 recommended) */
  advisors: AdvisorConfig[];

  /** Brand configuration */
  brand: {
    /** Primary page color (hex) */
    primary: string;
    /** Secondary color (optional) */
    secondary?: string;
    /** Logo URL (optional) */
    logoUrl?: string;
    /** Custom fonts */
    fonts?: BrandConfig['fonts'];
  };

  /** Theme mode */
  theme?: 'zen' | 'dark';

  /** Deployment configuration */
  deployment?: DeploymentConfig;

  /** SEO metadata */
  seo?: SEOConfig;

  /** Additional custom CSS */
  customCss?: string;

  /** Additional custom JS */
  customJs?: string;
}

/**
 * Result of multi-advisor page generation
 */
export interface GeneratedMultiAdvisorPage {
  /** Complete HTML string */
  html: string;

  /** Size in bytes */
  size: number;

  /** Generation timestamp */
  generatedAt: Date;

  /** Config used for generation */
  config: MultiAdvisorPageConfig;
}

/**
 * Template context for multi-advisor Handlebars template
 */
export interface MultiAdvisorTemplateContext {
  title: string;
  description: string;
  advisors: Array<
    AdvisorConfig & {
      cssVars: string; // Generated CSS variables for this advisor
    }
  >;
  brand: DerivedBrandColors & {
    fonts?: BrandConfig['fonts'];
    logoUrl?: string;
  };
  theme: 'zen' | 'dark';
  deployment: {
    tokenEndpoint: string;
    livekitUrl: string;
    isProduction: boolean;
  };
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    twitterCard: string;
  };
  favicon: string;
  customCss?: string;
  customJs?: string;
}
