/**
 * Storytelling Visualizations - Complete Suite
 *
 * A comprehensive set of narrative-driven visualizations that transform
 * metrics into meaning. These go beyond charts to tell the user's story.
 *
 * Philosophy: "What you notice" vs "What I notice" - every visualization
 * surfaces deeper patterns the user might not see themselves.
 *
 * Phase 2 Components:
 * - Life Seasons: Seasonal rhythm visualization
 * - Conversation River: Topic flow over time
 * - The Mirror: Surface vs deeper insight
 * - Energy Flow: Emotional energy Sankey diagram
 *
 * Phase 3 Components:
 * - The Unsaid: Detecting unspoken topics
 * - Growth Rings: Long-term progress tree rings
 * - Values Alignment: Radar chart of values
 * - Unfinished Stories: Open loops tracker
 * - Ripple Effects: Causality visualization
 *
 * @module ui/storytelling-visualizations
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('StorytellingVisualizations');

// ============================================================================
// TYPES
// ============================================================================

export interface SeasonData {
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  label: string;
  energy: number; // 0-100
  themes: string[];
  insight: string;
}

export interface ConversationTopic {
  id: string;
  name: string;
  frequency: number;
  trend: 'rising' | 'falling' | 'stable';
  lastMentioned: Date;
  emotionalWeight: number; // -1 to 1
}

export interface MirrorInsight {
  surface: string; // What they said
  deeper: string; // What it might mean
  pattern?: string; // Recurring pattern noticed
  invitation?: string; // Gentle question
}

export interface EnergyNode {
  id: string;
  label: string;
  value: number;
  type: 'source' | 'sink' | 'transform';
}

export interface EnergyFlow {
  from: string;
  to: string;
  value: number;
  label?: string;
}

export interface UnsaidTopic {
  topic: string;
  signals: string[];
  confidence: number; // 0-1
  gentlePrompt: string;
}

export interface GrowthRing {
  period: string;
  label: string;
  growth: number; // ring thickness
  highlights: string[];
  color: string;
}

export interface ValueAlignment {
  value: string;
  stated: number; // 0-100 what they say
  lived: number; // 0-100 what actions show
  gap: number;
  insight: string;
}

export interface UnfinishedStory {
  id: string;
  title: string;
  started: Date;
  lastMentioned: Date;
  progress: number; // 0-100
  emotionalSignificance: number;
  gentleReminder: string;
}

export interface RippleEffect {
  trigger: string;
  effects: Array<{
    area: string;
    impact: number; // -1 to 1
    description: string;
  }>;
  timeframe: string;
}

// ============================================================================
// LIFE SEASONS VISUALIZATION
// ============================================================================

/**
 * Creates a Life Seasons visualization showing emotional/energy patterns
 * across seasons or life phases.
 */
export function createLifeSeasonsElement(seasons: SeasonData[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'life-seasons';

  // Defensive check for array
  const seasonsArray = Array.isArray(seasons) ? seasons : [];

  // Title
  const title = document.createElement('h3');
  title.className = 'life-seasons__title';
  title.textContent = 'Your Life Seasons';
  container.appendChild(title);

  // Seasons wheel
  const wheel = document.createElement('div');
  wheel.className = 'life-seasons__wheel';

  const SEASON_COLORS: Record<string, string> = {
    spring: 'var(--color-maya, #a67a6a)',
    summer: 'var(--color-nayan, #b8956a)',
    autumn: 'var(--color-peter, #3a6b73)',
    winter: 'var(--color-alex, #5a6b8a)',
  };

  seasonsArray.forEach((season, index) => {
    const segment = document.createElement('div');
    segment.className = `life-seasons__segment life-seasons__segment--${season.season}`;
    segment.style.setProperty('--segment-index', String(index));
    segment.style.setProperty('--segment-energy', String(season.energy / 100));
    segment.style.setProperty('--segment-color', SEASON_COLORS[season.season] || 'var(--persona-primary)');

    const label = document.createElement('span');
    label.className = 'life-seasons__label';
    label.textContent = season.label;
    segment.appendChild(label);

    const energyBar = document.createElement('div');
    energyBar.className = 'life-seasons__energy';
    energyBar.style.height = `${season.energy}%`;
    segment.appendChild(energyBar);

    // Tooltip with themes
    segment.title = `${season.label}: ${season.themes.join(', ')}\n${season.insight}`;

    wheel.appendChild(segment);
  });

  container.appendChild(wheel);

  // Current season insight
  const currentSeason = seasons.find(s => s.season === getCurrentSeason()) || seasons[0];
  if (currentSeason) {
    const insight = document.createElement('p');
    insight.className = 'life-seasons__insight';
    insight.textContent = currentSeason.insight;
    container.appendChild(insight);
  }

  return container;
}

function getCurrentSeason(): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

// ============================================================================
// CONVERSATION RIVER VISUALIZATION
// ============================================================================

/**
 * Creates a Conversation River showing topic flow over time.
 * Topics flow like tributaries joining and separating.
 */
export function createConversationRiverElement(topics: ConversationTopic[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'conversation-river';

  // Defensive check for array
  const topicsArray = Array.isArray(topics) ? topics : [];

  const title = document.createElement('h3');
  title.className = 'conversation-river__title';
  title.textContent = 'Your Conversation Currents';
  container.appendChild(title);

  // River container with SVG
  const riverSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  riverSvg.setAttribute('viewBox', '0 0 400 200');
  riverSvg.setAttribute('class', 'conversation-river__svg');

  // Sort by frequency
  const sortedTopics = [...topicsArray].sort((a, b) => b.frequency - a.frequency).slice(0, 5);

  // Draw river streams
  sortedTopics.forEach((topic, index) => {
    const yBase = 30 + index * 35;
    const width = Math.max(2, topic.frequency / 10);

    // Create wavy path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = generateRiverPath(yBase, width, topic.trend);
    path.setAttribute('d', d);
    path.setAttribute('class', `conversation-river__stream conversation-river__stream--${topic.trend}`);
    path.setAttribute('stroke-width', String(width));

    // Color based on emotional weight
    const hue = topic.emotionalWeight > 0 ? 120 : topic.emotionalWeight < 0 ? 0 : 200;
    const saturation = Math.abs(topic.emotionalWeight) * 50 + 20;
    path.style.stroke = `hsl(${hue}, ${saturation}%, 50%)`;

    riverSvg.appendChild(path);

    // Add label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '10');
    text.setAttribute('y', String(yBase + 4));
    text.setAttribute('class', 'conversation-river__label');
    text.textContent = topic.name;
    riverSvg.appendChild(text);
  });

  container.appendChild(riverSvg);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'conversation-river__legend';
  legend.textContent = sortedTopics.length > 0
    ? `${sortedTopics[0].name} flows strongest in your conversations`
    : 'Start talking to see your conversation currents';
  container.appendChild(legend);

  return container;
}

function generateRiverPath(yBase: number, width: number, trend: string): string {
  const amplitude = trend === 'rising' ? 8 : trend === 'falling' ? -8 : 4;
  let d = `M 80 ${yBase}`;

  for (let x = 80; x <= 390; x += 30) {
    const variance = Math.sin(x / 30) * amplitude;
    const trendOffset = trend === 'rising' ? (x - 80) / 40 : trend === 'falling' ? -(x - 80) / 40 : 0;
    d += ` Q ${x + 15} ${yBase + variance + trendOffset}, ${x + 30} ${yBase + trendOffset}`;
  }

  return d;
}

// ============================================================================
// THE MIRROR VISUALIZATION
// ============================================================================

/**
 * Creates The Mirror view - showing surface statements vs deeper patterns.
 */
export function createMirrorElement(insights: MirrorInsight[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'the-mirror';

  // Defensive check for array
  const insightsArray = Array.isArray(insights) ? insights : [];

  const title = document.createElement('h3');
  title.className = 'the-mirror__title';
  title.textContent = 'The Mirror';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'the-mirror__subtitle';
  subtitle.textContent = 'What you say... and what I notice';
  container.appendChild(subtitle);

  insightsArray.forEach(insight => {
    const card = document.createElement('div');
    card.className = 'the-mirror__card';

    // Left side - surface
    const surface = document.createElement('div');
    surface.className = 'the-mirror__surface';

    const surfaceLabel = document.createElement('span');
    surfaceLabel.className = 'the-mirror__label';
    surfaceLabel.textContent = 'You said';
    surface.appendChild(surfaceLabel);

    const surfaceText = document.createElement('p');
    surfaceText.className = 'the-mirror__text';
    surfaceText.textContent = `"${insight.surface}"`;
    surface.appendChild(surfaceText);

    card.appendChild(surface);

    // Divider with reflection effect
    const divider = document.createElement('div');
    divider.className = 'the-mirror__divider';
    card.appendChild(divider);

    // Right side - deeper
    const deeper = document.createElement('div');
    deeper.className = 'the-mirror__deeper';

    const deeperLabel = document.createElement('span');
    deeperLabel.className = 'the-mirror__label';
    deeperLabel.textContent = 'I notice';
    deeper.appendChild(deeperLabel);

    const deeperText = document.createElement('p');
    deeperText.className = 'the-mirror__text the-mirror__text--insight';
    deeperText.textContent = insight.deeper;
    deeper.appendChild(deeperText);

    if (insight.pattern) {
      const pattern = document.createElement('p');
      pattern.className = 'the-mirror__pattern';
      pattern.textContent = `Pattern: ${insight.pattern}`;
      deeper.appendChild(pattern);
    }

    if (insight.invitation) {
      const invitation = document.createElement('p');
      invitation.className = 'the-mirror__invitation';
      invitation.textContent = insight.invitation;
      deeper.appendChild(invitation);
    }

    card.appendChild(deeper);
    container.appendChild(card);
  });

  return container;
}

// ============================================================================
// ENERGY FLOW VISUALIZATION (SANKEY-STYLE)
// ============================================================================

/**
 * Creates an Energy Flow visualization showing how emotional energy
 * transforms through different areas of life.
 */
export function createEnergyFlowElement(nodes: EnergyNode[], flows: EnergyFlow[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'energy-flow';

  // Defensive checks for arrays
  const nodesArray = Array.isArray(nodes) ? nodes : [];
  const flowsArray = Array.isArray(flows) ? flows : [];

  const title = document.createElement('h3');
  title.className = 'energy-flow__title';
  title.textContent = 'Your Energy Flow';
  container.appendChild(title);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 500 300');
  svg.setAttribute('class', 'energy-flow__svg');

  // Position nodes in columns
  const sources = nodesArray.filter(n => n.type === 'source');
  const transforms = nodesArray.filter(n => n.type === 'transform');
  const sinks = nodesArray.filter(n => n.type === 'sink');

  const nodePositions: Record<string, { x: number; y: number; height: number }> = {};

  // Position sources (left)
  sources.forEach((node, i) => {
    const y = 20 + i * (260 / Math.max(sources.length, 1));
    const height = Math.max(20, node.value / 2);
    nodePositions[node.id] = { x: 20, y, height };
    drawNode(svg, node, 20, y, 60, height);
  });

  // Position transforms (middle)
  transforms.forEach((node, i) => {
    const y = 40 + i * (220 / Math.max(transforms.length, 1));
    const height = Math.max(20, node.value / 2);
    nodePositions[node.id] = { x: 200, y, height };
    drawNode(svg, node, 200, y, 80, height);
  });

  // Position sinks (right)
  sinks.forEach((node, i) => {
    const y = 20 + i * (260 / Math.max(sinks.length, 1));
    const height = Math.max(20, node.value / 2);
    nodePositions[node.id] = { x: 400, y, height };
    drawNode(svg, node, 400, y, 80, height);
  });

  // Draw flows
  flowsArray.forEach(flow => {
    const from = nodePositions[flow.from];
    const to = nodePositions[flow.to];
    if (from && to) {
      drawFlow(svg, from, to, flow.value);
    }
  });

  container.appendChild(svg);

  return container;
}

function drawNode(svg: SVGSVGElement, node: EnergyNode, x: number, y: number, width: number, height: number): void {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('rx', '4');
  rect.setAttribute('class', `energy-flow__node energy-flow__node--${node.type}`);
  svg.appendChild(rect);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(x + width / 2));
  text.setAttribute('y', String(y + height / 2 + 4));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'energy-flow__label');
  text.textContent = node.label;
  svg.appendChild(text);
}

function drawFlow(
  svg: SVGSVGElement,
  from: { x: number; y: number; height: number },
  to: { x: number; y: number; height: number },
  value: number
): void {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const thickness = Math.max(2, value / 10);

  const x1 = from.x + 60;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const cx = (x1 + x2) / 2;

  const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  path.setAttribute('d', d);
  path.setAttribute('class', 'energy-flow__path');
  path.setAttribute('stroke-width', String(thickness));
  svg.appendChild(path);
}

// ============================================================================
// THE UNSAID VISUALIZATION
// ============================================================================

/**
 * Creates The Unsaid visualization - gently surfacing unspoken topics.
 */
export function createUnsaidElement(topics: UnsaidTopic[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'the-unsaid';

  // Defensive check for array
  const topicsArray = Array.isArray(topics) ? topics : [];

  const title = document.createElement('h3');
  title.className = 'the-unsaid__title';
  title.textContent = 'The Unsaid';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'the-unsaid__subtitle';
  subtitle.textContent = 'Things that might be on your mind...';
  container.appendChild(subtitle);

  if (topicsArray.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'the-unsaid__empty';
    empty.textContent = 'I\'m still learning your patterns. Keep talking.';
    container.appendChild(empty);
    return container;
  }

  topicsArray.forEach(topic => {
    const card = document.createElement('div');
    card.className = 'the-unsaid__card';
    card.style.setProperty('--confidence', String(topic.confidence));

    const header = document.createElement('div');
    header.className = 'the-unsaid__header';

    const topicName = document.createElement('span');
    topicName.className = 'the-unsaid__topic';
    topicName.textContent = topic.topic;
    header.appendChild(topicName);

    const confidence = document.createElement('span');
    confidence.className = 'the-unsaid__confidence';
    confidence.textContent = topic.confidence > 0.7 ? 'Strong signal' : topic.confidence > 0.4 ? 'Gentle signal' : 'Faint signal';
    header.appendChild(confidence);

    card.appendChild(header);

    // Signals (what made me notice)
    const signals = document.createElement('ul');
    signals.className = 'the-unsaid__signals';
    topic.signals.slice(0, 3).forEach(signal => {
      const li = document.createElement('li');
      li.textContent = signal;
      signals.appendChild(li);
    });
    card.appendChild(signals);

    // Gentle prompt
    const prompt = document.createElement('p');
    prompt.className = 'the-unsaid__prompt';
    prompt.textContent = topic.gentlePrompt;
    card.appendChild(prompt);

    container.appendChild(card);
  });

  return container;
}

// ============================================================================
// GROWTH RINGS VISUALIZATION
// ============================================================================

/**
 * Creates Growth Rings visualization - like tree rings showing long-term growth.
 */
export function createGrowthRingsElement(rings: GrowthRing[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'growth-rings';

  // Defensive check for array
  const ringsArray = Array.isArray(rings) ? rings : [];

  const title = document.createElement('h3');
  title.className = 'growth-rings__title';
  title.textContent = 'Your Growth Rings';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'growth-rings__subtitle';
  subtitle.textContent = 'Each ring marks a season of growth';
  container.appendChild(subtitle);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 300 300');
  svg.setAttribute('class', 'growth-rings__svg');

  const centerX = 150;
  const centerY = 150;
  let currentRadius = 20;

  ringsArray.forEach((ring, index) => {
    const thickness = Math.max(8, ring.growth / 5);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(centerX));
    circle.setAttribute('cy', String(centerY));
    circle.setAttribute('r', String(currentRadius + thickness / 2));
    circle.setAttribute('class', 'growth-rings__ring');
    circle.setAttribute('stroke-width', String(thickness));
    circle.style.stroke = ring.color || `hsl(${120 + index * 20}, 40%, ${50 - index * 5}%)`;

    // Add slight irregularity for organic feel
    const variance = Math.random() * 2;
    circle.style.strokeDasharray = `${10 + variance} ${2 + variance}`;

    svg.appendChild(circle);

    currentRadius += thickness + 3;
  });

  // Center dot (current moment)
  const center = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  center.setAttribute('cx', String(centerX));
  center.setAttribute('cy', String(centerY));
  center.setAttribute('r', '8');
  center.setAttribute('class', 'growth-rings__center');
  svg.appendChild(center);

  container.appendChild(svg);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'growth-rings__legend';
  rings.forEach(ring => {
    const item = document.createElement('div');
    item.className = 'growth-rings__legend-item';

    const dot = document.createElement('span');
    dot.className = 'growth-rings__legend-dot';
    dot.style.backgroundColor = ring.color;
    item.appendChild(dot);

    const text = document.createElement('span');
    text.textContent = `${ring.label}: ${ring.highlights[0] || ''}`;
    item.appendChild(text);

    legend.appendChild(item);
  });
  container.appendChild(legend);

  return container;
}

// ============================================================================
// VALUES ALIGNMENT VISUALIZATION (RADAR CHART)
// ============================================================================

/**
 * Creates Values Alignment radar chart - stated vs lived values.
 */
export function createValuesAlignmentElement(values: ValueAlignment[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'values-alignment';

  // Defensive check for array
  const valuesArray = Array.isArray(values) ? values : [];

  const title = document.createElement('h3');
  title.className = 'values-alignment__title';
  title.textContent = 'Values Alignment';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'values-alignment__subtitle';
  subtitle.textContent = 'What you say matters vs. what your actions show';
  container.appendChild(subtitle);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 300 300');
  svg.setAttribute('class', 'values-alignment__svg');

  const centerX = 150;
  const centerY = 150;
  const maxRadius = 100;
  const angleStep = valuesArray.length > 0 ? (2 * Math.PI) / valuesArray.length : 0;

  // Draw grid circles
  [25, 50, 75, 100].forEach(percent => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(centerX));
    circle.setAttribute('cy', String(centerY));
    circle.setAttribute('r', String((percent / 100) * maxRadius));
    circle.setAttribute('class', 'values-alignment__grid');
    svg.appendChild(circle);
  });

  // Draw axis lines and labels
  valuesArray.forEach((value, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * maxRadius;
    const y = centerY + Math.sin(angle) * maxRadius;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'values-alignment__axis');
    svg.appendChild(line);

    // Label
    const labelX = centerX + Math.cos(angle) * (maxRadius + 20);
    const labelY = centerY + Math.sin(angle) * (maxRadius + 20);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(labelX));
    text.setAttribute('y', String(labelY));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'values-alignment__label');
    text.textContent = value.value;
    svg.appendChild(text);
  });

  // Draw stated values polygon
  const statedPoints = valuesArray.map((value, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (value.stated / 100) * maxRadius;
    return `${centerX + Math.cos(angle) * r},${centerY + Math.sin(angle) * r}`;
  }).join(' ');

  const statedPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  statedPolygon.setAttribute('points', statedPoints);
  statedPolygon.setAttribute('class', 'values-alignment__stated');
  svg.appendChild(statedPolygon);

  // Draw lived values polygon
  const livedPoints = valuesArray.map((value, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (value.lived / 100) * maxRadius;
    return `${centerX + Math.cos(angle) * r},${centerY + Math.sin(angle) * r}`;
  }).join(' ');

  const livedPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  livedPolygon.setAttribute('points', livedPoints);
  livedPolygon.setAttribute('class', 'values-alignment__lived');
  svg.appendChild(livedPolygon);

  container.appendChild(svg);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'values-alignment__legend';

  const statedLegend = document.createElement('span');
  statedLegend.className = 'values-alignment__legend-item values-alignment__legend-item--stated';
  statedLegend.textContent = 'What you say matters';
  legend.appendChild(statedLegend);

  const livedLegend = document.createElement('span');
  livedLegend.className = 'values-alignment__legend-item values-alignment__legend-item--lived';
  livedLegend.textContent = 'What your actions show';
  legend.appendChild(livedLegend);

  container.appendChild(legend);

  // Insights for gaps
  const gaps = valuesArray.filter(v => Math.abs(v.gap) > 20);
  if (gaps.length > 0) {
    const insights = document.createElement('div');
    insights.className = 'values-alignment__insights';

    gaps.forEach(gap => {
      const insight = document.createElement('p');
      insight.className = 'values-alignment__insight';
      insight.textContent = gap.insight;
      insights.appendChild(insight);
    });

    container.appendChild(insights);
  }

  return container;
}

// ============================================================================
// UNFINISHED STORIES VISUALIZATION
// ============================================================================

/**
 * Creates Unfinished Stories visualization - tracking open loops.
 */
export function createUnfinishedStoriesElement(stories: UnfinishedStory[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'unfinished-stories';

  // Defensive check for array
  const storiesArray = Array.isArray(stories) ? stories : [];

  const title = document.createElement('h3');
  title.className = 'unfinished-stories__title';
  title.textContent = 'Unfinished Stories';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'unfinished-stories__subtitle';
  subtitle.textContent = 'Threads waiting to be woven...';
  container.appendChild(subtitle);

  if (storiesArray.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'unfinished-stories__empty';
    empty.textContent = 'No open loops detected. You\'re present in the moment.';
    container.appendChild(empty);
    return container;
  }

  // Sort by emotional significance
  const sortedStories = [...storiesArray].sort((a, b) => b.emotionalSignificance - a.emotionalSignificance);

  sortedStories.forEach(story => {
    const card = document.createElement('div');
    card.className = 'unfinished-stories__card';

    // Progress ring
    const ring = document.createElement('div');
    ring.className = 'unfinished-stories__ring';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '18');
    bgCircle.setAttribute('cy', '18');
    bgCircle.setAttribute('r', '15.9');
    bgCircle.setAttribute('class', 'unfinished-stories__ring-bg');
    svg.appendChild(bgCircle);

    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('cx', '18');
    progressCircle.setAttribute('cy', '18');
    progressCircle.setAttribute('r', '15.9');
    progressCircle.setAttribute('class', 'unfinished-stories__ring-progress');
    progressCircle.setAttribute('stroke-dasharray', `${story.progress} ${100 - story.progress}`);
    progressCircle.setAttribute('stroke-dashoffset', '25');
    svg.appendChild(progressCircle);

    ring.appendChild(svg);

    const progressText = document.createElement('span');
    progressText.className = 'unfinished-stories__progress-text';
    progressText.textContent = `${story.progress}%`;
    ring.appendChild(progressText);

    card.appendChild(ring);

    // Content
    const content = document.createElement('div');
    content.className = 'unfinished-stories__content';

    const storyTitle = document.createElement('h4');
    storyTitle.className = 'unfinished-stories__story-title';
    storyTitle.textContent = story.title;
    content.appendChild(storyTitle);

    const daysSince = Math.floor((Date.now() - story.lastMentioned.getTime()) / (1000 * 60 * 60 * 24));
    const timeAgo = document.createElement('span');
    timeAgo.className = 'unfinished-stories__time-ago';
    timeAgo.textContent = daysSince === 0 ? 'Mentioned today' : `${daysSince} days since last mention`;
    content.appendChild(timeAgo);

    const reminder = document.createElement('p');
    reminder.className = 'unfinished-stories__reminder';
    reminder.textContent = story.gentleReminder;
    content.appendChild(reminder);

    card.appendChild(content);
    container.appendChild(card);
  });

  return container;
}

// ============================================================================
// RIPPLE EFFECTS VISUALIZATION
// ============================================================================

/**
 * Creates Ripple Effects visualization - showing how one action affects many areas.
 */
export function createRippleEffectsElement(ripple: RippleEffect): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ripple-effects';

  const title = document.createElement('h3');
  title.className = 'ripple-effects__title';
  title.textContent = 'Ripple Effects';
  container.appendChild(title);

  // Trigger (center)
  const trigger = document.createElement('div');
  trigger.className = 'ripple-effects__trigger';
  trigger.textContent = ripple.trigger;
  container.appendChild(trigger);

  // Effects radiating out
  const effectsContainer = document.createElement('div');
  effectsContainer.className = 'ripple-effects__effects';

  ripple.effects.forEach((effect, index) => {
    const effectEl = document.createElement('div');
    effectEl.className = `ripple-effects__effect ripple-effects__effect--${effect.impact > 0 ? 'positive' : effect.impact < 0 ? 'negative' : 'neutral'}`;
    effectEl.style.setProperty('--effect-index', String(index));
    effectEl.style.setProperty('--effect-count', String(ripple.effects.length));
    effectEl.style.setProperty('--effect-magnitude', String(Math.abs(effect.impact)));

    const area = document.createElement('span');
    area.className = 'ripple-effects__area';
    area.textContent = effect.area;
    effectEl.appendChild(area);

    const desc = document.createElement('span');
    desc.className = 'ripple-effects__desc';
    desc.textContent = effect.description;
    effectEl.appendChild(desc);

    effectsContainer.appendChild(effectEl);
  });

  container.appendChild(effectsContainer);

  // Timeframe
  const timeframe = document.createElement('p');
  timeframe.className = 'ripple-effects__timeframe';
  timeframe.textContent = `Timeframe: ${ripple.timeframe}`;
  container.appendChild(timeframe);

  return container;
}

// ============================================================================
// STYLES
// ============================================================================

export function injectStorytellingVisualizationStyles(): void {
  if (document.getElementById('storytelling-viz-styles')) return;

  const style = document.createElement('style');
  style.id = 'storytelling-viz-styles';
  style.textContent = `
    /* =========================================================================
       SHARED VISUALIZATION STYLES
       ========================================================================= */

    .life-seasons,
    .conversation-river,
    .the-mirror,
    .energy-flow,
    .the-unsaid,
    .growth-rings,
    .values-alignment,
    .unfinished-stories,
    .ripple-effects {
      padding: var(--space-4, 1rem);
      background: var(--glass-thin-bg, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-xl, 1.25rem);
      border: 1px solid var(--glass-thin-border, rgba(255, 255, 255, 0.1));
    }

    .life-seasons__title,
    .conversation-river__title,
    .the-mirror__title,
    .energy-flow__title,
    .the-unsaid__title,
    .growth-rings__title,
    .values-alignment__title,
    .unfinished-stories__title,
    .ripple-effects__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-2, 0.5rem);
    }

    .life-seasons__subtitle,
    .conversation-river__subtitle,
    .the-mirror__subtitle,
    .the-unsaid__subtitle,
    .growth-rings__subtitle,
    .values-alignment__subtitle,
    .unfinished-stories__subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: 0 0 var(--space-4, 1rem);
    }

    /* =========================================================================
       LIFE SEASONS
       ========================================================================= */

    .life-seasons__wheel {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-2, 0.5rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .life-seasons__segment {
      position: relative;
      height: 100px;
      background: var(--segment-color);
      border-radius: var(--radius-lg, 1rem);
      opacity: calc(0.3 + var(--segment-energy) * 0.7);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: var(--space-2, 0.5rem);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      cursor: help;
    }

    .life-seasons__segment:hover {
      transform: scale(1.05);
    }

    .life-seasons__label {
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }

    .life-seasons__energy {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(255,255,255,0.3);
      border-radius: 0 0 var(--radius-lg, 1rem) var(--radius-lg, 1rem);
    }

    .life-seasons__insight {
      font-size: var(--text-sm, 0.875rem);
      font-style: italic;
      color: var(--persona-primary, #4a6741);
      text-align: center;
      margin: 0;
    }

    /* =========================================================================
       CONVERSATION RIVER
       ========================================================================= */

    .conversation-river__svg {
      width: 100%;
      height: 180px;
      margin-bottom: var(--space-3, 0.75rem);
    }

    .conversation-river__stream {
      fill: none;
      stroke-linecap: round;
      opacity: 0.7;
    }

    .conversation-river__stream--rising {
      stroke-dasharray: none;
    }

    .conversation-river__stream--falling {
      stroke-dasharray: 8 4;
    }

    .conversation-river__stream--stable {
      stroke-dasharray: 2 2;
    }

    .conversation-river__label {
      font-size: 10px;
      fill: var(--color-text-secondary, #5a4a42);
    }

    .conversation-river__legend {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      text-align: center;
    }

    /* =========================================================================
       THE MIRROR
       ========================================================================= */

    .the-mirror__card {
      display: flex;
      gap: var(--space-4, 1rem);
      padding: var(--space-4, 1rem);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.02));
      border-radius: var(--radius-lg, 1rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .the-mirror__surface,
    .the-mirror__deeper {
      flex: 1;
    }

    .the-mirror__label {
      display: block;
      font-size: var(--text-2xs, 0.625rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-text-muted, #70605a);
      margin-bottom: var(--space-2, 0.5rem);
    }

    .the-mirror__text {
      font-size: var(--text-sm, 0.875rem);
      line-height: 1.5;
      margin: 0;
      color: var(--color-text-secondary, #5a4a42);
    }

    .the-mirror__text--insight {
      color: var(--persona-primary, #4a6741);
      font-weight: 500;
    }

    .the-mirror__divider {
      width: 1px;
      background: linear-gradient(
        to bottom,
        transparent,
        var(--color-border-medium, rgba(44, 37, 32, 0.15)),
        transparent
      );
    }

    .the-mirror__pattern {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin: var(--space-2, 0.5rem) 0 0;
    }

    .the-mirror__invitation {
      font-size: var(--text-xs, 0.75rem);
      font-style: italic;
      color: var(--color-maya, #a67a6a);
      margin: var(--space-2, 0.5rem) 0 0;
    }

    /* =========================================================================
       ENERGY FLOW
       ========================================================================= */

    .energy-flow__svg {
      width: 100%;
      height: 250px;
    }

    .energy-flow__node {
      fill: var(--color-bg-elevated, #FFFDFB);
      stroke: var(--color-border-medium, rgba(44, 37, 32, 0.15));
      stroke-width: 1;
    }

    .energy-flow__node--source {
      fill: var(--color-maya, #a67a6a);
    }

    .energy-flow__node--transform {
      fill: var(--persona-primary, #4a6741);
    }

    .energy-flow__node--sink {
      fill: var(--color-peter, #3a6b73);
    }

    .energy-flow__label {
      font-size: 10px;
      fill: white;
    }

    .energy-flow__path {
      fill: none;
      stroke: var(--color-border-medium, rgba(44, 37, 32, 0.2));
      opacity: 0.5;
    }

    /* =========================================================================
       THE UNSAID
       ========================================================================= */

    .the-unsaid__empty {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      font-style: italic;
      text-align: center;
      padding: var(--space-6, 1.5rem);
    }

    .the-unsaid__card {
      padding: var(--space-4, 1rem);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.02));
      border-radius: var(--radius-lg, 1rem);
      border-left: 3px solid;
      border-left-color: hsl(calc(120 * var(--confidence)), 50%, 50%);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .the-unsaid__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-2, 0.5rem);
    }

    .the-unsaid__topic {
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .the-unsaid__confidence {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .the-unsaid__signals {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin: 0 0 var(--space-2, 0.5rem);
      padding-left: var(--space-4, 1rem);
    }

    .the-unsaid__signals li {
      margin-bottom: var(--space-1, 0.25rem);
    }

    .the-unsaid__prompt {
      font-size: var(--text-sm, 0.875rem);
      font-style: italic;
      color: var(--persona-primary, #4a6741);
      margin: 0;
    }

    /* =========================================================================
       GROWTH RINGS
       ========================================================================= */

    .growth-rings__svg {
      width: 100%;
      max-width: 250px;
      height: 250px;
      display: block;
      margin: 0 auto var(--space-4, 1rem);
    }

    .growth-rings__ring {
      fill: none;
      stroke-linecap: round;
    }

    .growth-rings__center {
      fill: var(--persona-primary, #4a6741);
    }

    .growth-rings__legend {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 0.5rem);
    }

    .growth-rings__legend-item {
      display: flex;
      align-items: center;
      gap: var(--space-2, 0.5rem);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-secondary, #5a4a42);
    }

    .growth-rings__legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* =========================================================================
       VALUES ALIGNMENT
       ========================================================================= */

    .values-alignment__svg {
      width: 100%;
      max-width: 280px;
      height: 280px;
      display: block;
      margin: 0 auto var(--space-4, 1rem);
    }

    .values-alignment__grid {
      fill: none;
      stroke: var(--color-border-subtle, rgba(44, 37, 32, 0.06));
      stroke-width: 1;
    }

    .values-alignment__axis {
      stroke: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      stroke-width: 1;
    }

    .values-alignment__label {
      font-size: 10px;
      fill: var(--color-text-muted, #70605a);
    }

    .values-alignment__stated {
      fill: var(--color-maya, #a67a6a);
      fill-opacity: 0.3;
      stroke: var(--color-maya, #a67a6a);
      stroke-width: 2;
    }

    .values-alignment__lived {
      fill: var(--persona-primary, #4a6741);
      fill-opacity: 0.3;
      stroke: var(--persona-primary, #4a6741);
      stroke-width: 2;
    }

    .values-alignment__legend {
      display: flex;
      justify-content: center;
      gap: var(--space-4, 1rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .values-alignment__legend-item {
      font-size: var(--text-xs, 0.75rem);
      display: flex;
      align-items: center;
      gap: var(--space-1, 0.25rem);
    }

    .values-alignment__legend-item--stated::before {
      content: '';
      width: 12px;
      height: 12px;
      background: var(--color-maya, #a67a6a);
      border-radius: 2px;
    }

    .values-alignment__legend-item--lived::before {
      content: '';
      width: 12px;
      height: 12px;
      background: var(--persona-primary, #4a6741);
      border-radius: 2px;
    }

    .values-alignment__insights {
      border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06));
      padding-top: var(--space-3, 0.75rem);
    }

    .values-alignment__insight {
      font-size: var(--text-sm, 0.875rem);
      font-style: italic;
      color: var(--persona-primary, #4a6741);
      margin: 0 0 var(--space-2, 0.5rem);
    }

    /* =========================================================================
       UNFINISHED STORIES
       ========================================================================= */

    .unfinished-stories__empty {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      font-style: italic;
      text-align: center;
      padding: var(--space-6, 1.5rem);
    }

    .unfinished-stories__card {
      display: flex;
      gap: var(--space-4, 1rem);
      padding: var(--space-4, 1rem);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.02));
      border-radius: var(--radius-lg, 1rem);
      margin-bottom: var(--space-3, 0.75rem);
    }

    .unfinished-stories__ring {
      position: relative;
      width: 50px;
      height: 50px;
      flex-shrink: 0;
    }

    .unfinished-stories__ring svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .unfinished-stories__ring-bg {
      fill: none;
      stroke: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      stroke-width: 3;
    }

    .unfinished-stories__ring-progress {
      fill: none;
      stroke: var(--persona-primary, #4a6741);
      stroke-width: 3;
      stroke-linecap: round;
    }

    .unfinished-stories__progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .unfinished-stories__content {
      flex: 1;
    }

    .unfinished-stories__story-title {
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 0.25rem);
    }

    .unfinished-stories__time-ago {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      display: block;
      margin-bottom: var(--space-2, 0.5rem);
    }

    .unfinished-stories__reminder {
      font-size: var(--text-sm, 0.875rem);
      font-style: italic;
      color: var(--persona-primary, #4a6741);
      margin: 0;
    }

    /* =========================================================================
       RIPPLE EFFECTS
       ========================================================================= */

    .ripple-effects {
      text-align: center;
    }

    .ripple-effects__trigger {
      display: inline-block;
      padding: var(--space-3, 0.75rem) var(--space-5, 1.25rem);
      background: var(--persona-primary, #4a6741);
      color: white;
      border-radius: var(--radius-full, 9999px);
      font-weight: 600;
      margin-bottom: var(--space-4, 1rem);
    }

    .ripple-effects__effects {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-3, 0.75rem);
    }

    .ripple-effects__effect {
      padding: var(--space-3, 0.75rem);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.02));
      border-radius: var(--radius-lg, 1rem);
      min-width: 120px;
      animation: rippleIn ${DURATION.SLOW}ms ${EASING.SPRING} forwards;
      animation-delay: calc(var(--effect-index) * 100ms);
      opacity: 0;
      transform: scale(0.8);
    }

    @keyframes rippleIn {
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .ripple-effects__effect--positive {
      border-left: 3px solid var(--color-semantic-success, #7dad7a);
    }

    .ripple-effects__effect--negative {
      border-left: 3px solid var(--color-semantic-error, #c97b7b);
    }

    .ripple-effects__effect--neutral {
      border-left: 3px solid var(--color-border-medium, rgba(44, 37, 32, 0.15));
    }

    .ripple-effects__area {
      display: block;
      font-weight: 600;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
      margin-bottom: var(--space-1, 0.25rem);
    }

    .ripple-effects__desc {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .ripple-effects__timeframe {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin: var(--space-4, 1rem) 0 0;
    }

    /* =========================================================================
       RESPONSIVE
       ========================================================================= */

    @media (max-width: 480px) {
      .life-seasons__wheel {
        grid-template-columns: repeat(2, 1fr);
      }

      .the-mirror__card {
        flex-direction: column;
      }

      .the-mirror__divider {
        width: 100%;
        height: 1px;
      }

      .values-alignment__svg {
        max-width: 220px;
        height: 220px;
      }
    }

    /* =========================================================================
       REDUCED MOTION
       ========================================================================= */

    @media (prefers-reduced-motion: reduce) {
      .life-seasons__segment,
      .ripple-effects__effect {
        animation: none;
        transition: none;
        opacity: 1;
        transform: none;
      }
    }
  `;

  document.head.appendChild(style);
  log.debug('Storytelling visualization styles injected');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initStorytellingVisualizations(): void {
  injectStorytellingVisualizationStyles();
  log.info('Storytelling visualizations initialized');
}
