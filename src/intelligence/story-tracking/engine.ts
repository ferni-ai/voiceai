/**
 * Story Arc Tracking Engine
 *
 * Track narrative threads across sessions.
 *
 * @module @ferni/intelligence/story-tracking/engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  IStoryArcTracker,
  StoryArc,
  StoryEvent,
  Cliffhanger,
  ContinuityPrompt,
} from './types.js';

const log = createLogger({ module: 'StoryArcTracker' });

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const storage = new Map<string, StoryArc[]>();

function getArcs(userId: string): StoryArc[] {
  return storage.get(userId) || [];
}

function setArcs(userId: string, arcs: StoryArc[]): void {
  storage.set(userId, arcs);
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class StoryArcTracker implements IStoryArcTracker {
  async createArc(
    userId: string,
    arc: Omit<StoryArc, 'id' | 'events' | 'cliffhangers' | 'startedAt' | 'updatedAt'>
  ): Promise<StoryArc> {
    const arcs = getArcs(userId);

    const newArc: StoryArc = {
      ...arc,
      id: `arc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      events: [],
      cliffhangers: [],
      startedAt: new Date(),
      updatedAt: new Date(),
    };

    arcs.push(newArc);
    setArcs(userId, arcs);

    log.debug({ userId, arcId: newArc.id, title: newArc.title }, 'Story arc created');
    return newArc;
  }

  async getActiveArcs(userId: string): Promise<StoryArc[]> {
    return getArcs(userId).filter((a) => a.status === 'active');
  }

  async getArc(userId: string, arcId: string): Promise<StoryArc | null> {
    return getArcs(userId).find((a) => a.id === arcId) || null;
  }

  async addEvent(
    userId: string,
    arcId: string,
    event: Omit<StoryEvent, 'timestamp'>
  ): Promise<void> {
    const arcs = getArcs(userId);
    const arc = arcs.find((a) => a.id === arcId);

    if (arc) {
      arc.events.push({
        ...event,
        timestamp: new Date(),
      });
      arc.updatedAt = new Date();
      setArcs(userId, arcs);

      log.debug({ userId, arcId, sessionId: event.sessionId }, 'Event added to arc');
    }
  }

  async addCliffhanger(
    userId: string,
    arcId: string,
    cliffhanger: Omit<Cliffhanger, 'id' | 'lastMentioned' | 'sessionIds' | 'resolved'>
  ): Promise<Cliffhanger> {
    const arcs = getArcs(userId);
    const arc = arcs.find((a) => a.id === arcId);

    if (!arc) {
      throw new Error(`Arc not found: ${arcId}`);
    }

    const newCliffhanger: Cliffhanger = {
      ...cliffhanger,
      id: `cliff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      lastMentioned: new Date(),
      sessionIds: [],
      resolved: false,
    };

    arc.cliffhangers.push(newCliffhanger);
    arc.updatedAt = new Date();
    setArcs(userId, arcs);

    log.debug({ userId, arcId, cliffhangerId: newCliffhanger.id }, 'Cliffhanger added');
    return newCliffhanger;
  }

  async resolveCliffhanger(userId: string, arcId: string, cliffhangerId: string): Promise<void> {
    const arcs = getArcs(userId);
    const arc = arcs.find((a) => a.id === arcId);

    if (arc) {
      const cliffhanger = arc.cliffhangers.find((c) => c.id === cliffhangerId);
      if (cliffhanger) {
        cliffhanger.resolved = true;
        arc.updatedAt = new Date();
        setArcs(userId, arcs);
      }
    }
  }

  async getUnresolvedCliffhangers(userId: string): Promise<
    Array<{
      arc: StoryArc;
      cliffhanger: Cliffhanger;
    }>
  > {
    const result: Array<{ arc: StoryArc; cliffhanger: Cliffhanger }> = [];
    const arcs = getArcs(userId);

    for (const arc of arcs) {
      if (arc.status === 'active') {
        for (const cliffhanger of arc.cliffhangers) {
          if (!cliffhanger.resolved) {
            result.push({ arc, cliffhanger });
          }
        }
      }
    }

    // Sort by priority and recency
    return result.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff =
        priorityOrder[a.cliffhanger.priority] - priorityOrder[b.cliffhanger.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return (
        new Date(b.cliffhanger.lastMentioned).getTime() -
        new Date(a.cliffhanger.lastMentioned).getTime()
      );
    });
  }

  async resolveArc(userId: string, arcId: string, resolution: string): Promise<void> {
    const arcs = getArcs(userId);
    const arc = arcs.find((a) => a.id === arcId);

    if (arc) {
      arc.status = 'resolved';
      arc.resolution = resolution;
      arc.updatedAt = new Date();
      setArcs(userId, arcs);

      log.debug({ userId, arcId }, 'Arc resolved');
    }
  }

  async getContinuityPrompts(userId: string): Promise<ContinuityPrompt[]> {
    const prompts: ContinuityPrompt[] = [];

    // Get unresolved cliffhangers
    const cliffhangers = await this.getUnresolvedCliffhangers(userId);

    for (const { arc, cliffhanger } of cliffhangers.slice(0, 3)) {
      const daysSince = Math.floor(
        (Date.now() - new Date(cliffhanger.lastMentioned).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince <= 14) {
        let promptText: string;
        if (daysSince === 0) {
          promptText = `Last time, you mentioned "${cliffhanger.situation}". How did that go?`;
        } else if (daysSince <= 3) {
          promptText = `I've been wondering about "${cliffhanger.situation}". Any updates?`;
        } else {
          promptText = `A while back, you were dealing with "${cliffhanger.situation}". How's that situation now?`;
        }

        prompts.push({
          type: 'follow-up',
          prompt: promptText,
          arcId: arc.id,
          cliffhangerId: cliffhanger.id,
          confidence: cliffhanger.priority === 'high' ? 0.9 : 0.7,
        });
      }
    }

    // Get active arcs with recent events
    const activeArcs = await this.getActiveArcs(userId);
    for (const arc of activeArcs.slice(0, 2)) {
      if (arc.events.length > 0) {
        const lastEvent = arc.events[arc.events.length - 1];
        const daysSince = Math.floor(
          (Date.now() - new Date(lastEvent.timestamp).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSince >= 3 && daysSince <= 14) {
          prompts.push({
            type: 'check-in',
            prompt: `How's the ${arc.title} situation going?`,
            arcId: arc.id,
            confidence: 0.6,
          });
        }
      }
    }

    return prompts.sort((a, b) => b.confidence - a.confidence);
  }

  async buildContextInjection(userId: string): Promise<string> {
    const sections: string[] = ['[STORY CONTINUITY]'];
    let hasContent = false;

    // Active arcs
    const activeArcs = await this.getActiveArcs(userId);
    if (activeArcs.length > 0) {
      sections.push('Active story arcs:');
      for (const arc of activeArcs.slice(0, 3)) {
        sections.push(`- ${arc.title} (${arc.type})`);
        if (arc.characters.length > 0) {
          sections.push(`  People: ${arc.characters.join(', ')}`);
        }
        hasContent = true;
      }
    }

    // Unresolved cliffhangers
    const cliffhangers = await this.getUnresolvedCliffhangers(userId);
    if (cliffhangers.length > 0) {
      sections.push('Unresolved situations to follow up on:');
      for (const { cliffhanger } of cliffhangers.slice(0, 3)) {
        sections.push(`- ${cliffhanger.situation} (${cliffhanger.priority} priority)`);
        hasContent = true;
      }
    }

    if (!hasContent) return '';
    return sections.join('\n');
  }

  reset(): void {
    storage.clear();
    log.debug('Story arc tracker reset');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: StoryArcTracker | null = null;

export function getStoryArcTracker(): IStoryArcTracker {
  if (!instance) {
    instance = new StoryArcTracker();
  }
  return instance;
}

export function createStoryArcTracker(): IStoryArcTracker {
  return new StoryArcTracker();
}

export function resetStoryArcTracker(): void {
  instance = null;
}

export async function clearUserData(userId: string): Promise<void> {
  storage.delete(userId);
}
