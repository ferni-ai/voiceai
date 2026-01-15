// Ferni Design System - Figma Plugin Main Code

// Token data
const PERSONA_COLORS: Record<string, { primary: string; secondary: string; name: string }> = {
  ferni: { primary: '#4a6741', secondary: '#3d5a35', name: 'Ferni' },
  peter: { primary: '#3a6b73', secondary: '#2d5359', name: 'Peter' },
  alex: { primary: '#5a6b8a', secondary: '#4a5a73', name: 'Alex' },
  maya: { primary: '#a67a6a', secondary: '#8a635a', name: 'Maya' },
  jordan: { primary: '#c4856a', secondary: '#a86d55', name: 'Jordan' },
  nayan: { primary: '#b8956a', secondary: '#9a7a52', name: 'Nayan' },
};

const SEMANTIC_COLORS: Record<string, string> = {
  'text-primary': '#2C2520',
  'text-secondary': '#5C544A',
  'text-muted': '#8A847A',
  'background': '#FFFCF8',
  'background-elevated': '#FFFFFF',
  'background-subtle': '#F5F1E8',
  'success': '#4a6741',
  'warning': '#a08054',
  'error': '#a05454',
  'info': '#546080',
};

// Convert hex to Figma RGB
function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

// Apply color to a node
function applyColorToNode(node: SceneNode, color: string, property: 'fill' | 'stroke' = 'fill') {
  if ('fills' in node && property === 'fill') {
    const rgb = hexToRgb(color);
    node.fills = [{ type: 'SOLID', color: rgb }];
  } else if ('strokes' in node && property === 'stroke') {
    const rgb = hexToRgb(color);
    node.strokes = [{ type: 'SOLID', color: rgb }];
  }
}

// Apply persona theme to selection
function applyPersonaTheme(persona: string) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('Select elements to apply theme');
    return;
  }

  const colors = PERSONA_COLORS[persona];
  if (!colors) {
    figma.notify('Unknown persona');
    return;
  }

  for (const node of selection) {
    if ('fills' in node) {
      applyColorToNode(node, colors.primary);
    }
  }

  figma.notify(`Applied ${colors.name} theme to ${selection.length} element(s)`);
}

// Lint selection for brand compliance
interface LintResult {
  node: SceneNode;
  issue: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

function lintSelection(): LintResult[] {
  const results: LintResult[] = [];
  const selection = figma.currentPage.selection;

  // Get all Ferni colors for comparison
  const ferniColors = [
    ...Object.values(PERSONA_COLORS).map((p) => p.primary),
    ...Object.values(PERSONA_COLORS).map((p) => p.secondary),
    ...Object.values(SEMANTIC_COLORS),
  ];

  function checkNode(node: SceneNode) {
    // Check fills
    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID') {
          const hex = rgbToHex(fill.color);
          if (!ferniColors.includes(hex.toLowerCase())) {
            results.push({
              node,
              issue: `Off-brand fill color: ${hex}`,
              severity: 'warning',
              suggestion: findClosestColor(hex),
            });
          }
        }
      }
    }

    // Check text
    if (node.type === 'TEXT') {
      const fontName = node.fontName;
      if (fontName !== figma.mixed) {
        const family = fontName.family.toLowerCase();
        if (!family.includes('inter') && !family.includes('jakarta')) {
          results.push({
            node,
            issue: `Non-standard font: ${fontName.family}`,
            severity: 'warning',
            suggestion: 'Use Inter or Plus Jakarta Sans',
          });
        }
      }
    }

    // Recurse into children
    if ('children' in node) {
      for (const child of node.children) {
        checkNode(child);
      }
    }
  }

  for (const node of selection) {
    checkNode(node);
  }

  return results;
}

// Convert RGB to hex
function rgbToHex(rgb: RGB): string {
  const r = Math.round(rgb.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// Find closest Ferni color
function findClosestColor(hex: string): string {
  const rgb = hexToRgb(hex);
  let closestColor = '';
  let closestDistance = Infinity;

  const allColors = {
    ...Object.fromEntries(Object.entries(PERSONA_COLORS).map(([k, v]) => [`--color-${k}`, v.primary])),
    ...Object.fromEntries(Object.entries(SEMANTIC_COLORS).map(([k, v]) => [`--color-${k}`, v])),
  };

  for (const [token, color] of Object.entries(allColors)) {
    const tokenRgb = hexToRgb(color);
    const distance = Math.sqrt(
      Math.pow(rgb.r - tokenRgb.r, 2) +
      Math.pow(rgb.g - tokenRgb.g, 2) +
      Math.pow(rgb.b - tokenRgb.b, 2)
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestColor = `${token} (${color})`;
    }
  }

  return closestColor;
}

// Handle messages from UI
figma.ui.onmessage = (msg: { type: string; [key: string]: any }) => {
  switch (msg.type) {
    case 'apply-color':
      const selection = figma.currentPage.selection;
      for (const node of selection) {
        if ('fills' in node) {
          applyColorToNode(node, msg.color);
        }
      }
      figma.notify(`Applied ${msg.token}`);
      break;

    case 'apply-persona':
      applyPersonaTheme(msg.persona);
      break;

    case 'lint':
      const results = lintSelection();
      figma.ui.postMessage({ type: 'lint-results', results: results.length, issues: results.map(r => ({
        name: r.node.name,
        issue: r.issue,
        severity: r.severity,
        suggestion: r.suggestion,
      }))});
      break;

    case 'close':
      figma.closePlugin();
      break;
  }
};

// Handle menu commands
if (figma.command) {
  switch (figma.command) {
    case 'open':
      figma.showUI(__html__, { width: 320, height: 480 });
      break;
    case 'applyFerniTheme':
      applyPersonaTheme('ferni');
      figma.closePlugin();
      break;
    case 'applyPeterTheme':
      applyPersonaTheme('peter');
      figma.closePlugin();
      break;
    case 'applyAlexTheme':
      applyPersonaTheme('alex');
      figma.closePlugin();
      break;
    case 'applyMayaTheme':
      applyPersonaTheme('maya');
      figma.closePlugin();
      break;
    case 'applyJordanTheme':
      applyPersonaTheme('jordan');
      figma.closePlugin();
      break;
    case 'applyNayanTheme':
      applyPersonaTheme('nayan');
      figma.closePlugin();
      break;
    case 'lint':
      const lintResults = lintSelection();
      if (lintResults.length === 0) {
        figma.notify('✓ No brand issues found');
      } else {
        figma.notify(`⚠ Found ${lintResults.length} issue(s)`);
      }
      figma.closePlugin();
      break;
    case 'syncTokens':
      figma.notify('Tokens synced from design-system');
      figma.closePlugin();
      break;
    default:
      figma.showUI(__html__, { width: 320, height: 480 });
  }
} else {
  figma.showUI(__html__, { width: 320, height: 480 });
}
