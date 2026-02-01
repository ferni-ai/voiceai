/**
 * Memory Threads UI
 *
 * Phase 18: Memory Experience Layer
 *
 * Visualizes memory threads - connected memories about topics, people, etc.
 * Shows how Ferni connects different memories to build understanding.
 *
 * @module ui/memory/memory-threads
 */

import { createLogger } from '../../utils/logger.js';
import {
  QUIZ_ICONS,
  GROWTH_ICONS,
  ANALYTICS_ICONS,
  EMOTION_ICONS,
} from '../icons/shared-icons.js';

const log = createLogger('MemoryThreadsUI');

// Thread type icons (SVG)
const THREAD_TYPE_ICONS: Record<ThreadType, string> = {
  person: QUIZ_ICONS.personality,
  topic: QUIZ_ICONS.memories,
  emotion: EMOTION_ICONS.reflective,
  goal: ANALYTICS_ICONS.target,
  timeline: ANALYTICS_ICONS.calendar,
};

// Memory node type icons with labels
const NODE_TYPE_ICONS: Record<MemoryNode['type'], { icon: string; label: string }> = {
  fact: { icon: GROWTH_ICONS.journal, label: 'Fact' },
  emotion: { icon: EMOTION_ICONS.reflective, label: 'Emotion' },
  event: { icon: ANALYTICS_ICONS.calendar, label: 'Event' },
  commitment: { icon: QUIZ_ICONS.correct, label: 'Commitment' },
  milestone: { icon: GROWTH_ICONS.celebration, label: 'Milestone' },
};

// Link icon for threads visualization
const LINK_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

// ============================================================================
// TYPES
// ============================================================================

/**
 * A memory thread (connected memories)
 */
export interface MemoryThread {
  /** Thread ID */
  id: string;
  /** Thread title */
  title: string;
  /** Thread type */
  type: ThreadType;
  /** Memory nodes in this thread */
  nodes: MemoryNode[];
  /** Connections between nodes */
  connections: ThreadConnection[];
  /** Last updated */
  updatedAt: Date;
  /** Emotional arc of the thread */
  emotionalArc?: EmotionalArc;
}

/**
 * Thread types
 */
export type ThreadType =
  | 'person'      // About a specific person
  | 'topic'       // About a topic (career, health, etc.)
  | 'emotion'     // Emotional journey
  | 'goal'        // Goal progress
  | 'timeline';   // Chronological events

/**
 * A node in a memory thread
 */
export interface MemoryNode {
  /** Node ID (memory ID) */
  id: string;
  /** Short label */
  label: string;
  /** Full content */
  content: string;
  /** Node type */
  type: 'fact' | 'emotion' | 'event' | 'commitment' | 'milestone';
  /** Timestamp */
  timestamp: Date;
  /** Confidence (0-1) */
  confidence: number;
  /** Emotional weight */
  emotionalWeight: number;
  /** Position in visualization */
  position?: { x: number; y: number };
}

/**
 * Connection between memory nodes
 */
export interface ThreadConnection {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Connection type */
  type: 'temporal' | 'causal' | 'emotional' | 'reference';
  /** Connection strength (0-1) */
  strength: number;
  /** Label */
  label?: string;
}

/**
 * Emotional arc across a thread
 */
export interface EmotionalArc {
  /** Starting emotion */
  start: { emotion: string; intensity: number };
  /** Current/ending emotion */
  end: { emotion: string; intensity: number };
  /** Trajectory */
  trajectory: 'improving' | 'declining' | 'stable' | 'volatile';
}

/**
 * Thread visualization state
 */
export interface ThreadVisualizationState {
  /** Currently selected thread */
  selectedThread?: MemoryThread;
  /** Selected node within thread */
  selectedNode?: string;
  /** Zoom level */
  zoom: number;
  /** Pan offset */
  panOffset: { x: number; y: number };
  /** Filter settings */
  filters: {
    showConfidenceBelow?: number;
    hideOlderThan?: Date;
    nodeTypes: MemoryNode['type'][];
  };
}

// ============================================================================
// STATE
// ============================================================================

let visualizationState: ThreadVisualizationState = {
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  filters: {
    nodeTypes: ['fact', 'emotion', 'event', 'commitment', 'milestone'],
  },
};

/**
 * Get current visualization state
 */
export function getVisualizationState(): ThreadVisualizationState {
  return { ...visualizationState };
}

/**
 * Update visualization state
 */
export function updateVisualizationState(update: Partial<ThreadVisualizationState>): void {
  visualizationState = { ...visualizationState, ...update };
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render memory thread visualization
 */
export function renderMemoryThreads(
  container: HTMLElement,
  threads: MemoryThread[]
): void {
  // Clear existing content
  container.innerHTML = '';

  // Create container
  const wrapper = document.createElement('div');
  wrapper.className = 'memory-threads-container';
  wrapper.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
  `;

  // Create thread list sidebar
  const sidebar = createThreadSidebar(threads);
  wrapper.appendChild(sidebar);

  // Create visualization area
  const vizArea = createVisualizationArea();
  wrapper.appendChild(vizArea);

  container.appendChild(wrapper);

  log.debug({ threadCount: threads.length }, 'Memory threads rendered');
}

/**
 * Create thread list sidebar
 */
function createThreadSidebar(threads: MemoryThread[]): HTMLElement {
  const sidebar = document.createElement('div');
  sidebar.className = 'memory-threads-sidebar';
  sidebar.style.cssText = `
    width: 240px;
    height: 100%;
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: var(--space-4);
  `;

  // Title
  const title = document.createElement('h3');
  title.textContent = 'Memory Threads';
  title.style.cssText = `
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin-bottom: var(--space-4);
    color: var(--color-text-primary);
  `;
  sidebar.appendChild(title);

  // Thread list
  for (const thread of threads) {
    const item = createThreadListItem(thread);
    sidebar.appendChild(item);
  }

  return sidebar;
}

/**
 * Create thread list item
 */
function createThreadListItem(thread: MemoryThread): HTMLElement {
  const item = document.createElement('div');
  item.className = 'memory-thread-item';
  item.dataset.threadId = thread.id;
  item.style.cssText = `
    padding: var(--space-3);
    margin-bottom: var(--space-2);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--duration-normal);
  `;

  item.innerHTML = `
    <div style="display: flex; align-items: center; gap: var(--space-2);">
      <span class="thread-icon" style="display: inline-flex; align-items: center; width: 20px; height: 20px; color: var(--color-text-secondary);">${THREAD_TYPE_ICONS[thread.type]}</span>
      <span style="font-weight: 500; color: var(--color-text-primary);">${thread.title}</span>
    </div>
    <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-1);">
      ${thread.nodes.length} memories
    </div>
  `;

  // Style the SVG icon
  const iconEl = item.querySelector('.thread-icon svg');
  if (iconEl) {
    (iconEl as SVGElement).style.width = '20px';
    (iconEl as SVGElement).style.height = '20px';
  }

  item.addEventListener('click', () => selectThread(thread));
  item.addEventListener('mouseenter', () => {
    item.style.background = 'var(--color-background-hover)';
  });
  item.addEventListener('mouseleave', () => {
    item.style.background = '';
  });

  return item;
}

/**
 * Create visualization area
 */
function createVisualizationArea(): HTMLElement {
  const area = document.createElement('div');
  area.className = 'memory-threads-visualization';
  area.style.cssText = `
    flex: 1;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Empty state
  const emptyState = document.createElement('div');
  emptyState.className = 'memory-threads-empty';
  emptyState.style.cssText = `
    text-align: center;
    color: var(--color-text-secondary);
  `;
  emptyState.innerHTML = `
    <div style="display: flex; justify-content: center; margin-bottom: var(--space-4); color: var(--color-text-muted);">${LINK_ICON}</div>
    <p>Select a thread to visualize</p>
  `;
  // Style the SVG icon
  const iconEl = emptyState.querySelector('svg');
  if (iconEl) {
    iconEl.style.width = '48px';
    iconEl.style.height = '48px';
  }
  area.appendChild(emptyState);

  return area;
}

/**
 * Select a thread for visualization
 */
function selectThread(thread: MemoryThread): void {
  updateVisualizationState({ selectedThread: thread, selectedNode: undefined });

  // Update UI
  const vizArea = document.querySelector('.memory-threads-visualization');
  if (!vizArea) return;

  vizArea.innerHTML = '';
  renderThreadVisualization(vizArea as HTMLElement, thread);

  log.debug({ threadId: thread.id, nodeCount: thread.nodes.length }, 'Thread selected');
}

/**
 * Render thread visualization (simplified - would use D3 or similar in production)
 */
function renderThreadVisualization(container: HTMLElement, thread: MemoryThread): void {
  const viz = document.createElement('div');
  viz.className = 'thread-viz';
  viz.style.cssText = `
    width: 100%;
    height: 100%;
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
  `;

  // Thread header
  const header = document.createElement('div');
  header.innerHTML = `
    <h2 style="font-size: var(--font-size-xl); color: var(--color-text-primary); margin-bottom: var(--space-2);">
      ${thread.title}
    </h2>
    <p style="color: var(--color-text-secondary);">
      ${thread.nodes.length} connected memories
    </p>
  `;
  viz.appendChild(header);

  // Render nodes as timeline
  for (const node of thread.nodes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())) {
    const nodeEl = renderMemoryNode(node);
    viz.appendChild(nodeEl);
  }

  container.appendChild(viz);
}

/**
 * Render a memory node
 */
function renderMemoryNode(node: MemoryNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'memory-node';
  el.style.cssText = `
    padding: var(--space-4);
    background: var(--color-background-elevated);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--color-accent);
  `;

  const nodeTypeInfo = NODE_TYPE_ICONS[node.type];
  const timeAgo = getTimeAgo(node.timestamp);

  el.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
      <span class="node-type-label" style="display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--font-size-sm); color: var(--color-text-secondary);">
        <span class="node-icon" style="display: inline-flex; align-items: center; width: 14px; height: 14px;">${nodeTypeInfo.icon}</span>
        ${nodeTypeInfo.label}
      </span>
      <span style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
        ${timeAgo}
      </span>
    </div>
    <p style="color: var(--color-text-primary);">
      ${node.content}
    </p>
    <div style="margin-top: var(--space-2); font-size: var(--font-size-sm); color: var(--color-text-muted);">
      Confidence: ${Math.round(node.confidence * 100)}%
    </div>
  `;

  // Style the SVG icon
  const iconEl = el.querySelector('.node-icon svg');
  if (iconEl) {
    (iconEl as SVGElement).style.width = '14px';
    (iconEl as SVGElement).style.height = '14px';
  }

  return el;
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  return `${Math.floor(seconds / 2592000)} months ago`;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup memory threads UI
 */
export function cleanupMemoryThreadsUI(): void {
  visualizationState = {
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    filters: {
      nodeTypes: ['fact', 'emotion', 'event', 'commitment', 'milestone'],
    },
  };
}
