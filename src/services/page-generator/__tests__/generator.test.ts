/**
 * Agent Page Generator Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateAgentPage,
  generatePreviewSnippet,
  clearTemplateCache,
  warmTemplateCache,
  parseHex,
  hexToRgba,
  lightenColor,
  darkenColor,
  deriveSecondaryColor,
  deriveBrandColors,
  generatePersonaCss,
  isDarkColor,
  getContrastTextColor,
  generateFavicon,
  generateAppleTouchIcon,
  generateMsTileIcon,
  generateAllFavicons,
} from '../index.js';
import type { AgentPageConfig } from '../types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const validConfig: AgentPageConfig = {
  agent: {
    id: 'test-agent',
    name: 'Test Agent',
    initials: 'TA',
    tagline: 'A test agent',
    description: 'This is a test agent for unit testing',
  },
  brand: {
    primary: '#96151D',
  },
};

const fullConfig: AgentPageConfig = {
  agent: {
    id: 'joel-dickson',
    name: 'Joel Dickson',
    displayName: 'Joel',
    initials: 'JD',
    tagline: 'Global Head of Investment Strategy',
    description: 'Expert in investment research and strategy',
  },
  brand: {
    primary: '#96151D',
    secondary: '#B41E28',
  },
  voice: {
    voiceId: 'custom-voice-123',
    provider: 'cartesia',
  },
  theme: 'zen',
  deployment: {
    environment: 'production',
  },
  seo: {
    title: 'Meet Joel Dickson',
    description: 'Talk with Joel about investment strategy',
    twitterCard: 'summary_large_image',
  },
};

// ============================================================================
// COLOR UTILITY TESTS
// ============================================================================

describe('Color Utilities', () => {
  describe('parseHex', () => {
    it('should parse 6-digit hex colors', () => {
      const { r, g, b } = parseHex('#96151D');
      expect(r).toBe(150);
      expect(g).toBe(21);
      expect(b).toBe(29);
    });

    it('should parse 3-digit hex colors', () => {
      const { r, g, b } = parseHex('#fff');
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    });

    it('should handle colors without hash', () => {
      const { r, g, b } = parseHex('96151D');
      expect(r).toBe(150);
      expect(g).toBe(21);
      expect(b).toBe(29);
    });

    it('should throw on invalid hex', () => {
      expect(() => parseHex('invalid')).toThrow('Invalid hex color');
    });
  });

  describe('hexToRgba', () => {
    it('should convert hex to rgba', () => {
      const rgba = hexToRgba('#96151D', 0.5);
      expect(rgba).toBe('rgba(150, 21, 29, 0.5)');
    });

    it('should handle alpha of 0', () => {
      const rgba = hexToRgba('#000000', 0);
      expect(rgba).toBe('rgba(0, 0, 0, 0)');
    });

    it('should handle alpha of 1', () => {
      const rgba = hexToRgba('#ffffff', 1);
      expect(rgba).toBe('rgba(255, 255, 255, 1)');
    });
  });

  describe('lightenColor', () => {
    it('should lighten a dark color', () => {
      const lightened = lightenColor('#000000', 50);
      // Should be lighter (higher luminance)
      const { r, g, b } = parseHex(lightened);
      expect(r).toBeGreaterThan(0);
      expect(g).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(0);
    });

    it('should not exceed white', () => {
      const lightened = lightenColor('#ffffff', 100);
      expect(lightened.toLowerCase()).toBe('#ffffff');
    });
  });

  describe('darkenColor', () => {
    it('should darken a light color', () => {
      const darkened = darkenColor('#ffffff', 50);
      // Should be darker (lower luminance)
      const { r, g, b } = parseHex(darkened);
      expect(r).toBeLessThan(255);
      expect(g).toBeLessThan(255);
      expect(b).toBeLessThan(255);
    });

    it('should not go below black', () => {
      const darkened = darkenColor('#000000', 100);
      expect(darkened.toLowerCase()).toBe('#000000');
    });
  });

  describe('deriveSecondaryColor', () => {
    it('should create a lighter variant', () => {
      const secondary = deriveSecondaryColor('#96151D');
      expect(secondary).not.toBe('#96151D');
      // Secondary should be a valid hex color
      expect(secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('deriveBrandColors', () => {
    it('should derive all brand colors from primary', () => {
      const colors = deriveBrandColors('#96151D');

      expect(colors.primary).toBe('#96151D');
      expect(colors.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(colors.glow).toContain('rgba');
      expect(colors.tint).toContain('rgba');
      expect(colors.gradientOrb).toContain('linear-gradient');
    });

    it('should use provided secondary if given', () => {
      const colors = deriveBrandColors('#96151D', '#B41E28');
      expect(colors.secondary).toBe('#B41E28');
    });
  });

  describe('isDarkColor', () => {
    it('should identify dark colors', () => {
      expect(isDarkColor('#000000')).toBe(true);
      expect(isDarkColor('#96151D')).toBe(true);
    });

    it('should identify light colors', () => {
      expect(isDarkColor('#ffffff')).toBe(false);
      expect(isDarkColor('#ffff00')).toBe(false);
    });
  });

  describe('getContrastTextColor', () => {
    it('should return white for dark backgrounds', () => {
      expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
      expect(getContrastTextColor('#96151D')).toBe('#FFFFFF');
    });

    it('should return black for light backgrounds', () => {
      expect(getContrastTextColor('#ffffff')).toBe('#000000');
    });
  });

  describe('generatePersonaCss', () => {
    it('should generate valid CSS block', () => {
      const colors = deriveBrandColors('#96151D');
      const css = generatePersonaCss('test-agent', colors);

      expect(css).toContain('[data-persona="test-agent"]');
      expect(css).toContain('--persona-primary: #96151D');
      expect(css).toContain('@keyframes test-agentSpeakingRing');
    });
  });
});

// ============================================================================
// FAVICON GENERATOR TESTS
// ============================================================================

describe('Favicon Generator', () => {
  describe('generateFavicon', () => {
    it('should generate SVG data URI', () => {
      const favicon = generateFavicon('JD', '#96151D');

      expect(favicon).toContain('data:image/svg+xml,');
      expect(favicon).toContain('JD');
      // Color is double-encoded: # → %23 → %2523
      expect(favicon).toContain('%252396151D');
    });

    it('should truncate long initials to 3 characters', () => {
      const favicon = generateFavicon('ABCD', '#96151D');
      expect(favicon).toContain('ABC');
      expect(favicon).not.toContain('ABCD');
    });

    it('should uppercase initials', () => {
      const favicon = generateFavicon('jd', '#96151D');
      expect(favicon).toContain('JD');
    });
  });

  describe('generateAppleTouchIcon', () => {
    it('should generate larger icon with gradient', () => {
      const icon = generateAppleTouchIcon('JD', '#96151D');

      expect(icon).toContain('data:image/svg+xml,');
      expect(icon).toContain('180'); // viewBox dimension
      expect(icon).toContain('linearGradient');
    });
  });

  describe('generateMsTileIcon', () => {
    it('should generate MS tile icon', () => {
      const icon = generateMsTileIcon('JD', '#96151D');

      expect(icon).toContain('data:image/svg+xml,');
      expect(icon).toContain('144'); // viewBox dimension
      expect(icon).toContain('rect'); // Square tile
    });
  });

  describe('generateAllFavicons', () => {
    it('should generate all favicon variants', () => {
      const icons = generateAllFavicons('JD', '#96151D');

      expect(icons.favicon).toContain('data:image/svg+xml,');
      expect(icons.appleTouchIcon).toContain('data:image/svg+xml,');
      expect(icons.msTileIcon).toContain('data:image/svg+xml,');
      expect(icons.tileColor).toBe('#96151D');
      expect(icons.themeColor).toBe('#96151D');
    });
  });
});

// ============================================================================
// PAGE GENERATOR TESTS
// ============================================================================

describe('Page Generator', () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  afterEach(() => {
    clearTemplateCache();
  });

  describe('generateAgentPage', () => {
    it('should generate HTML from valid config', async () => {
      const result = await generateAgentPage(validConfig);

      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('Test Agent');
      expect(result.html).toContain('data-persona="test-agent"');
      expect(result.size).toBeGreaterThan(0);
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.config).toEqual(validConfig);
    });

    it('should include persona CSS', async () => {
      const result = await generateAgentPage(validConfig);

      expect(result.html).toContain('--persona-primary: #96151D');
    });

    it('should generate favicon', async () => {
      const result = await generateAgentPage(validConfig);

      expect(result.html).toContain('data:image/svg+xml,');
      expect(result.html).toContain('rel="icon"');
    });

    it('should use display name (first name) by default', async () => {
      const result = await generateAgentPage(validConfig);

      expect(result.html).toContain('Test'); // First name
    });

    it('should use custom display name if provided', async () => {
      const result = await generateAgentPage(fullConfig);

      expect(result.html).toContain('Joel');
    });

    it('should include LiveKit connection script', async () => {
      const result = await generateAgentPage(validConfig);

      expect(result.html).toContain('livekit-client');
      expect(result.html).toContain('Room');
    });

    it('should reject missing agent.id', async () => {
      const badConfig = { ...validConfig, agent: { ...validConfig.agent, id: '' } };
      await expect(generateAgentPage(badConfig)).rejects.toThrow('agent.id is required');
    });

    it('should reject missing agent.name', async () => {
      const badConfig = { ...validConfig, agent: { ...validConfig.agent, name: '' } };
      await expect(generateAgentPage(badConfig)).rejects.toThrow('agent.name is required');
    });

    it('should reject missing brand.primary', async () => {
      const badConfig = { ...validConfig, brand: { primary: '' } };
      await expect(generateAgentPage(badConfig)).rejects.toThrow('brand.primary color is required');
    });

    it('should reject invalid hex color format', async () => {
      const badConfig = { ...validConfig, brand: { primary: 'red' } };
      await expect(generateAgentPage(badConfig)).rejects.toThrow('Invalid primary color format');
    });

    it('should handle zen theme', async () => {
      const result = await generateAgentPage({ ...validConfig, theme: 'zen' });
      expect(result.html).toContain('data-theme="zen"');
    });

    it('should handle dark theme', async () => {
      const result = await generateAgentPage({ ...validConfig, theme: 'dark' });
      expect(result.html).toContain('data-theme="dark"');
    });

    it('should inject custom CSS if provided', async () => {
      const config = {
        ...validConfig,
        customCss: '.custom-class { color: red; }',
      };
      const result = await generateAgentPage(config);

      expect(result.html).toContain('.custom-class { color: red; }');
    });

    it('should inject custom JS if provided', async () => {
      const config = {
        ...validConfig,
        customJs: 'console.log("Hello from custom JS");',
      };
      const result = await generateAgentPage(config);

      expect(result.html).toContain('console.log("Hello from custom JS")');
    });
  });

  describe('generatePreviewSnippet', () => {
    it('should generate CSS and avatar HTML', async () => {
      const preview = await generatePreviewSnippet(validConfig);

      expect(preview.css).toContain('[data-persona="test-agent"]');
      expect(preview.avatarHtml).toContain('id="coach"');
      expect(preview.avatarHtml).toContain('TA'); // Initials
    });
  });

  describe('template caching', () => {
    it('should cache compiled template', async () => {
      warmTemplateCache();

      // Second call should use cache
      const start = Date.now();
      await generateAgentPage(validConfig);
      const firstDuration = Date.now() - start;

      const start2 = Date.now();
      await generateAgentPage(fullConfig);
      const secondDuration = Date.now() - start2;

      // Both should complete quickly (template is cached)
      expect(firstDuration).toBeLessThan(500);
      expect(secondDuration).toBeLessThan(500);
    });

    it('should clear cache when requested', async () => {
      warmTemplateCache();
      clearTemplateCache();

      // Should still work after cache clear
      const result = await generateAgentPage(validConfig);
      expect(result.html).toContain('Test Agent');
    });
  });
});

// ============================================================================
// ENVIRONMENT-SPECIFIC TESTS
// ============================================================================

describe('Deployment Configuration', () => {
  it('should use development endpoints for dev environment', async () => {
    const config: AgentPageConfig = {
      ...validConfig,
      deployment: { environment: 'development' },
    };
    const result = await generateAgentPage(config);

    // Dev uses a relative token endpoint (proxy forwards /token to the token
    // server) but the dev LiveKit project URL
    expect(result.html).toContain("'/token'");
    expect(result.html).toContain('dev-8sm1ba0z.livekit.cloud');
  });

  it('should use production endpoints by default', async () => {
    const result = await generateAgentPage(validConfig);

    // Production uses relative URL for token endpoint (works on any host)
    expect(result.html).toContain("'/token'");
    expect(result.html).toContain('test-rvg91u1z.livekit.cloud');
  });

  it('should use custom endpoints if provided', async () => {
    const config: AgentPageConfig = {
      ...validConfig,
      deployment: {
        tokenEndpoint: 'https://custom.com/token',
        livekitUrl: 'wss://custom.livekit.cloud',
      },
    };
    const result = await generateAgentPage(config);

    expect(result.html).toContain('custom.com/token');
    expect(result.html).toContain('custom.livekit.cloud');
  });
});
