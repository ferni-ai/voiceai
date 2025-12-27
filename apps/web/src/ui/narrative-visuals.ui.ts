/**
 * Narrative Visualization Components
 *
 * Unlike Fidelity's pure data focus, Ferni weaves stories through visuals.
 * These visualizations turn life data into meaningful narratives.
 *
 * @module @ferni/narrative-visuals
 */

import { createLogger } from '../utils/logger.js';
import { springToCubicBezier } from './emotional-springs.ui.js';

const log = createLogger('NarrativeVisuals');

// ============================================================================
// TYPES
// ============================================================================

export type TimelineNodeType = 'minor' | 'standard' | 'major' | 'milestone';
export type RelationshipStrength = 'strong' | 'medium' | 'weak';
export type GardenStage = 'seed' | 'sprout' | 'growing' | 'blooming' | 'flourishing';

export interface TimelineNode {
  id: string;
  date: Date;
  title: string;
  description?: string;
  type: TimelineNodeType;
  color?: string;
  icon?: string;
}

export interface ConstellationNode {
  id: string;
  name: string;
  type: 'user' | 'close' | 'regular' | 'distant';
  x?: number;
  y?: number;
  connections?: Array<{ targetId: string; strength: RelationshipStrength }>;
  avatar?: string;
}

export interface GardenPlant {
  id: string;
  name: string;
  stage: GardenStage;
  health: number;        // 0-1
  lastWatered?: Date;
  growthRate: number;    // 0-1
  type: 'habit' | 'goal' | 'relationship';
}

// ============================================================================
// CONFIGURATION (from insights.json)
// ============================================================================

const TIMELINE_CONFIG = {
  nodeSize: {
    minor: 8,
    standard: 12,
    major: 20,
    milestone: 32,
  },
  lineThickness: 2,
  spacing: 80,
  colors: {
    past: 'var(--color-stone, #8B7355)',
    present: 'var(--color-accent, #4A7C59)',
    future: 'var(--color-moonlight, #C4A77D)',
  },
};

const CONSTELLATION_CONFIG = {
  nodeSize: {
    user: 40,
    close: 24,
    regular: 16,
    distant: 10,
  },
  connectionOpacity: {
    strong: 0.6,
    medium: 0.3,
    weak: 0.1,
  },
};

const GARDEN_CONFIG = {
  stages: ['seed', 'sprout', 'growing', 'blooming', 'flourishing'] as GardenStage[],
  stageHeights: {
    seed: 10,
    sprout: 30,
    growing: 60,
    blooming: 90,
    flourishing: 120,
  },
  colors: {
    healthy: '#4A7C59',
    needsAttention: '#C4A77D',
    struggling: '#9B6B6B',
  },
};

// ============================================================================
// STYLES
// ============================================================================

const NARRATIVE_STYLES = `
  /* Timeline */
  .ferni-timeline {
    position: relative;
    padding: 24px 0;
  }

  .ferni-timeline__line {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(
      to bottom,
      ${TIMELINE_CONFIG.colors.past} 0%,
      ${TIMELINE_CONFIG.colors.present} 50%,
      ${TIMELINE_CONFIG.colors.future} 100%
    );
    transform: translateX(-50%);
  }

  .ferni-timeline__node {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 40px;
    opacity: 0;
    transform: translateY(20px);
    animation: ferni-timeline-reveal 0.5s ease-out forwards;
  }

  .ferni-timeline__node--left {
    flex-direction: row-reverse;
    text-align: right;
  }

  .ferni-timeline__node--right {
    text-align: left;
  }

  .ferni-timeline__dot {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 50%;
    background: var(--color-bg-elevated, #2a2a3e);
    border: 3px solid currentColor;
    z-index: 1;
    transition: transform 0.3s ${springToCubicBezier('bouncy')};
  }

  .ferni-timeline__dot:hover {
    transform: translateX(-50%) scale(1.2);
  }

  .ferni-timeline__content {
    width: calc(50% - 40px);
    padding: 16px;
    background: var(--glass-regular-background, rgba(255, 255, 255, 0.05));
    border-radius: 12px;
    border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  .ferni-timeline__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin-bottom: 4px;
  }

  .ferni-timeline__date {
    font-size: 12px;
    color: var(--color-text-muted, #888);
    margin-bottom: 8px;
  }

  .ferni-timeline__description {
    font-size: 14px;
    color: var(--color-text-secondary, #a0a0a0);
    line-height: 1.5;
  }

  /* Constellation */
  .ferni-constellation {
    position: relative;
    width: 100%;
    height: 400px;
    background: radial-gradient(
      ellipse at center,
      rgba(74, 124, 89, 0.05) 0%,
      transparent 70%
    );
    overflow: hidden;
  }

  .ferni-constellation__node {
    position: absolute;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.3s ${springToCubicBezier('gentle')},
                box-shadow 0.3s ease;
  }

  .ferni-constellation__node:hover {
    transform: scale(1.15);
    z-index: 10;
  }

  .ferni-constellation__node--user {
    background: var(--color-accent, #4A7C59);
    box-shadow: 0 0 30px rgba(74, 124, 89, 0.4);
    z-index: 5;
  }

  .ferni-constellation__node--close {
    background: var(--color-ferni, #4a6741);
    box-shadow: 0 0 15px rgba(74, 103, 65, 0.3);
  }

  .ferni-constellation__node--regular {
    background: rgba(139, 115, 85, 0.6);
  }

  .ferni-constellation__node--distant {
    background: rgba(139, 115, 85, 0.3);
  }

  .ferni-constellation__label {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 8px;
    font-size: 11px;
    color: var(--color-text-muted, #888);
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  .ferni-constellation__node:hover .ferni-constellation__label {
    opacity: 1;
  }

  .ferni-constellation__connection {
    position: absolute;
    pointer-events: none;
    stroke: rgba(255, 255, 255, 0.2);
    stroke-width: 1;
    fill: none;
  }

  /* Garden */
  .ferni-garden {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 24px;
    padding: 40px 24px 24px;
    min-height: 200px;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(74, 124, 89, 0.05) 100%
    );
  }

  .ferni-garden__ground {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 24px;
    background: linear-gradient(
      to bottom,
      rgba(139, 115, 85, 0.2) 0%,
      rgba(139, 115, 85, 0.4) 100%
    );
    border-radius: 0 0 12px 12px;
  }

  .ferni-garden__plant {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    z-index: 1;
  }

  .ferni-garden__stem {
    width: 4px;
    background: linear-gradient(
      to top,
      #6B5B4F 0%,
      #4A7C59 100%
    );
    border-radius: 2px;
    transform-origin: bottom center;
    animation: ferni-sway 3s ease-in-out infinite;
  }

  .ferni-garden__leaves {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ferni-garden__leaf {
    width: 20px;
    height: 10px;
    background: #4A7C59;
    border-radius: 0 50% 50% 50%;
    transform-origin: left center;
  }

  .ferni-garden__leaf--left {
    transform: rotate(-30deg) translateX(-5px);
  }

  .ferni-garden__leaf--right {
    transform: rotate(30deg) scaleX(-1) translateX(-5px);
  }

  .ferni-garden__flower {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 30% 30%,
      #C4A77D 0%,
      #9B7B6B 100%
    );
    box-shadow: 0 0 10px rgba(196, 167, 125, 0.3);
  }

  .ferni-garden__name {
    margin-top: 12px;
    font-size: 12px;
    color: var(--color-text-secondary, #a0a0a0);
    text-align: center;
    max-width: 80px;
  }

  .ferni-garden__health {
    margin-top: 4px;
    width: 40px;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .ferni-garden__health-bar {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* Animations */
  @keyframes ferni-timeline-reveal {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes ferni-constellation-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  @keyframes ferni-orbit {
    from { transform: rotate(0deg) translateX(var(--orbit-radius)) rotate(0deg); }
    to { transform: rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg); }
  }

  @keyframes ferni-sway {
    0%, 100% { transform: rotate(-2deg); }
    50% { transform: rotate(2deg); }
  }

  @keyframes ferni-grow {
    0% { transform: scaleY(0); }
    60% { transform: scaleY(1.1); }
    100% { transform: scaleY(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ferni-garden__stem,
    .ferni-timeline__node,
    .ferni-constellation__node {
      animation: none;
      transition: none;
    }
  }
`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('ferni-narrative-styles')) return;

  const style = document.createElement('style');
  style.id = 'ferni-narrative-styles';
  style.textContent = NARRATIVE_STYLES;
  document.head.appendChild(style);
}

function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

// ============================================================================
// TIMELINE COMPONENT
// ============================================================================

/**
 * Create a life timeline visualization
 */
export function createTimeline(
  container: HTMLElement,
  nodes: TimelineNode[],
  options: {
    onNodeClick?: (node: TimelineNode) => void;
  } = {}
): { destroy: () => void; addNode: (node: TimelineNode) => void } {
  injectStyles();
  clearElement(container);

  container.className = 'ferni-timeline';

  // Sort nodes by date
  const sortedNodes = [...nodes].sort((a, b) => a.date.getTime() - b.date.getTime());
  const now = new Date();

  // Create timeline line
  const line = document.createElement('div');
  line.className = 'ferni-timeline__line';
  container.appendChild(line);

  // Render nodes
  const renderNode = (node: TimelineNode, index: number) => {
    const isPast = node.date < now;
    const isAlternate = index % 2 === 0;

    const nodeEl = document.createElement('div');
    nodeEl.className = `ferni-timeline__node ferni-timeline__node--${isAlternate ? 'left' : 'right'}`;
    nodeEl.style.animationDelay = `${index * 0.1}s`;

    // Dot
    const dot = document.createElement('div');
    dot.className = 'ferni-timeline__dot';
    const size = TIMELINE_CONFIG.nodeSize[node.type];
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.color = node.color || (isPast ? TIMELINE_CONFIG.colors.past : TIMELINE_CONFIG.colors.present);

    if (node.icon) {
      dot.textContent = node.icon;
      dot.style.fontSize = `${size * 0.5}px`;
      dot.style.display = 'flex';
      dot.style.alignItems = 'center';
      dot.style.justifyContent = 'center';
    }

    nodeEl.appendChild(dot);

    // Content
    const content = document.createElement('div');
    content.className = 'ferni-timeline__content';

    const title = document.createElement('div');
    title.className = 'ferni-timeline__title';
    title.textContent = node.title;
    content.appendChild(title);

    const date = document.createElement('div');
    date.className = 'ferni-timeline__date';
    date.textContent = formatDate(node.date);
    content.appendChild(date);

    if (node.description) {
      const desc = document.createElement('div');
      desc.className = 'ferni-timeline__description';
      desc.textContent = node.description;
      content.appendChild(desc);
    }

    nodeEl.appendChild(content);

    // Click handler
    if (options.onNodeClick) {
      nodeEl.style.cursor = 'pointer';
      nodeEl.addEventListener('click', () => options.onNodeClick!(node));
    }

    container.appendChild(nodeEl);
  };

  sortedNodes.forEach(renderNode);

  return {
    destroy: () => clearElement(container),
    addNode: (node: TimelineNode) => {
      sortedNodes.push(node);
      sortedNodes.sort((a, b) => a.date.getTime() - b.date.getTime());
      clearElement(container);
      container.appendChild(line);
      sortedNodes.forEach(renderNode);
    },
  };
}

// ============================================================================
// CONSTELLATION COMPONENT
// ============================================================================

/**
 * Create a relationship constellation visualization
 */
export function createConstellation(
  container: HTMLElement,
  nodes: ConstellationNode[],
  options: {
    width?: number;
    height?: number;
    onNodeClick?: (node: ConstellationNode) => void;
    animated?: boolean;
  } = {}
): { destroy: () => void; updateNode: (id: string, updates: Partial<ConstellationNode>) => void } {
  injectStyles();
  clearElement(container);

  const { width = 600, height = 400, onNodeClick, animated = true } = options;

  container.className = 'ferni-constellation';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  // Position nodes if not already positioned
  const centerX = width / 2;
  const centerY = height / 2;

  const positionedNodes = nodes.map((node, index) => {
    if (node.x !== undefined && node.y !== undefined) {
      return node;
    }

    // Position based on type
    if (node.type === 'user') {
      return { ...node, x: centerX, y: centerY };
    }

    // Distribute others in rings
    const ringRadius = node.type === 'close' ? 80 : node.type === 'regular' ? 140 : 180;
    const angleStep = (2 * Math.PI) / nodes.filter(n => n.type === node.type).length;
    const typeIndex = nodes.filter((n, i) => n.type === node.type && i < index).length;
    const angle = angleStep * typeIndex - Math.PI / 2;

    return {
      ...node,
      x: centerX + ringRadius * Math.cos(angle),
      y: centerY + ringRadius * Math.sin(angle),
    };
  });

  // Create SVG for connections
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  container.appendChild(svg);

  // Draw connections
  positionedNodes.forEach(node => {
    if (!node.connections) return;

    node.connections.forEach(conn => {
      const target = positionedNodes.find(n => n.id === conn.targetId);
      if (!target || node.x === undefined || node.y === undefined || target.x === undefined || target.y === undefined) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(node.x));
      line.setAttribute('y1', String(node.y));
      line.setAttribute('x2', String(target.x));
      line.setAttribute('y2', String(target.y));
      line.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
      line.setAttribute('stroke-width', conn.strength === 'strong' ? '2' : '1');
      line.setAttribute('stroke-opacity', String(CONSTELLATION_CONFIG.connectionOpacity[conn.strength]));
      svg.appendChild(line);
    });
  });

  // Render nodes
  const nodeElements: Map<string, HTMLElement> = new Map();

  positionedNodes.forEach((node, index) => {
    const size = CONSTELLATION_CONFIG.nodeSize[node.type];

    const nodeEl = document.createElement('div');
    nodeEl.className = `ferni-constellation__node ferni-constellation__node--${node.type}`;
    nodeEl.style.width = `${size}px`;
    nodeEl.style.height = `${size}px`;
    nodeEl.style.left = `${(node.x || centerX) - size / 2}px`;
    nodeEl.style.top = `${(node.y || centerY) - size / 2}px`;

    if (animated && node.type !== 'user') {
      nodeEl.style.animation = 'ferni-constellation-pulse 4s ease-in-out infinite';
      nodeEl.style.animationDelay = `${index * 0.2}s`;
    }

    // Avatar or initial
    if (node.avatar) {
      const img = document.createElement('img');
      img.src = node.avatar;
      img.alt = node.name;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.borderRadius = '50%';
      img.style.objectFit = 'cover';
      nodeEl.appendChild(img);
    } else {
      const initial = document.createElement('span');
      initial.textContent = node.name.charAt(0).toUpperCase();
      initial.style.color = 'white';
      initial.style.fontSize = `${size * 0.4}px`;
      initial.style.fontWeight = '600';
      nodeEl.appendChild(initial);
    }

    // Label
    const label = document.createElement('div');
    label.className = 'ferni-constellation__label';
    label.textContent = node.name;
    nodeEl.appendChild(label);

    // Click handler
    if (onNodeClick) {
      nodeEl.addEventListener('click', () => onNodeClick(node));
    }

    container.appendChild(nodeEl);
    nodeElements.set(node.id, nodeEl);
  });

  return {
    destroy: () => clearElement(container),
    updateNode: (id: string, updates: Partial<ConstellationNode>) => {
      const nodeEl = nodeElements.get(id);
      if (!nodeEl) return;

      if (updates.x !== undefined || updates.y !== undefined) {
        const node = positionedNodes.find(n => n.id === id);
        if (node) {
          const size = CONSTELLATION_CONFIG.nodeSize[node.type];
          nodeEl.style.left = `${(updates.x || node.x || 0) - size / 2}px`;
          nodeEl.style.top = `${(updates.y || node.y || 0) - size / 2}px`;
        }
      }
    },
  };
}

// ============================================================================
// GARDEN COMPONENT
// ============================================================================

/**
 * Create a growth garden visualization
 */
export function createGarden(
  container: HTMLElement,
  plants: GardenPlant[],
  options: {
    onPlantClick?: (plant: GardenPlant) => void;
    showHealth?: boolean;
    animated?: boolean;
  } = {}
): {
  destroy: () => void;
  waterPlant: (id: string) => void;
  updatePlant: (id: string, updates: Partial<GardenPlant>) => void;
} {
  injectStyles();
  clearElement(container);

  const { onPlantClick, showHealth = true, animated = true } = options;

  container.className = 'ferni-garden';

  // Ground
  const ground = document.createElement('div');
  ground.className = 'ferni-garden__ground';
  container.appendChild(ground);

  const plantElements: Map<string, HTMLElement> = new Map();

  // Render plants
  const renderPlant = (plant: GardenPlant, index: number) => {
    const stageHeight = GARDEN_CONFIG.stageHeights[plant.stage];

    const plantEl = document.createElement('div');
    plantEl.className = 'ferni-garden__plant';

    // Stem
    const stem = document.createElement('div');
    stem.className = 'ferni-garden__stem';
    stem.style.height = `${stageHeight}px`;

    if (animated) {
      stem.style.animation = `ferni-grow 0.8s ${springToCubicBezier('gentle')} forwards, ferni-sway 3s ease-in-out infinite`;
      stem.style.animationDelay = `${index * 0.1}s, ${index * 0.2}s`;
    }

    plantEl.appendChild(stem);

    // Leaves (for growing+ stages)
    if (['growing', 'blooming', 'flourishing'].includes(plant.stage)) {
      const leaves = document.createElement('div');
      leaves.className = 'ferni-garden__leaves';
      leaves.style.position = 'absolute';
      leaves.style.bottom = `${stageHeight * 0.6}px`;

      const leftLeaf = document.createElement('div');
      leftLeaf.className = 'ferni-garden__leaf ferni-garden__leaf--left';
      leaves.appendChild(leftLeaf);

      const rightLeaf = document.createElement('div');
      rightLeaf.className = 'ferni-garden__leaf ferni-garden__leaf--right';
      leaves.appendChild(rightLeaf);

      plantEl.appendChild(leaves);
    }

    // Flower (for blooming+ stages)
    if (['blooming', 'flourishing'].includes(plant.stage)) {
      const flower = document.createElement('div');
      flower.className = 'ferni-garden__flower';
      flower.style.position = 'absolute';
      flower.style.bottom = `${stageHeight}px`;
      flower.style.transform = 'translateX(-50%)';
      flower.style.left = '50%';

      if (plant.stage === 'flourishing') {
        flower.style.width = '32px';
        flower.style.height = '32px';
        flower.style.boxShadow = '0 0 20px rgba(196, 167, 125, 0.5)';
      }

      plantEl.appendChild(flower);
    }

    // Name
    const name = document.createElement('div');
    name.className = 'ferni-garden__name';
    name.textContent = plant.name;
    plantEl.appendChild(name);

    // Health bar
    if (showHealth) {
      const health = document.createElement('div');
      health.className = 'ferni-garden__health';

      const healthBar = document.createElement('div');
      healthBar.className = 'ferni-garden__health-bar';
      healthBar.style.width = `${plant.health * 100}%`;

      // Color based on health
      if (plant.health > 0.7) {
        healthBar.style.background = GARDEN_CONFIG.colors.healthy;
      } else if (plant.health > 0.4) {
        healthBar.style.background = GARDEN_CONFIG.colors.needsAttention;
      } else {
        healthBar.style.background = GARDEN_CONFIG.colors.struggling;
      }

      health.appendChild(healthBar);
      plantEl.appendChild(health);
    }

    // Click handler
    if (onPlantClick) {
      plantEl.style.cursor = 'pointer';
      plantEl.addEventListener('click', () => onPlantClick(plant));
    }

    container.appendChild(plantEl);
    plantElements.set(plant.id, plantEl);
  };

  plants.forEach(renderPlant);

  return {
    destroy: () => clearElement(container),

    waterPlant: (id: string) => {
      const plantEl = plantElements.get(id);
      if (!plantEl) return;

      // Water animation
      const droplet = document.createElement('div');
      droplet.style.cssText = `
        position: absolute;
        top: -20px;
        left: 50%;
        width: 8px;
        height: 12px;
        background: #6B8E9B;
        border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
        transform: translateX(-50%);
        animation: ferni-drop 0.5s ease-in forwards;
      `;

      // Add drop animation
      if (!document.getElementById('ferni-garden-drop-style')) {
        const dropStyle = document.createElement('style');
        dropStyle.id = 'ferni-garden-drop-style';
        dropStyle.textContent = `
          @keyframes ferni-drop {
            to {
              top: 100%;
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(dropStyle);
      }

      plantEl.appendChild(droplet);
      setTimeout(() => {
        if (droplet.parentNode) {
          droplet.parentNode.removeChild(droplet);
        }
      }, 500);

      log.debug('Plant watered', { id });
    },

    updatePlant: (id: string, updates: Partial<GardenPlant>) => {
      const plant = plants.find(p => p.id === id);
      if (!plant) return;

      Object.assign(plant, updates);

      // Re-render the plant
      const index = plants.findIndex(p => p.id === id);
      const oldEl = plantElements.get(id);
      if (oldEl) {
        container.removeChild(oldEl);
      }
      renderPlant(plant, index);
    },
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

export function initNarrativeVisuals(): void {
  if (initialized) return;
  initialized = true;

  injectStyles();
  log.info('Narrative visuals initialized');
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  initNarrativeVisuals();
}
