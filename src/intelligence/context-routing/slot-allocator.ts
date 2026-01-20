/**
 * Slot Allocator - Dynamic Slot Distribution by Conversation Mode
 *
 * Allocates context injection slots based on conversation mode.
 * Different modes prioritize different types of content.
 *
 * @module context-routing/slot-allocator
 */

import type {
  ConversationMode,
  SlotAllocation,
  CategoryToSlot,
  ContextInjection,
} from './types.js';
import { DEFAULT_SLOT_COUNT, FAST_MODE_SLOT_COUNT } from './types.js';

// ============================================================================
// MODE-BASED ALLOCATIONS
// ============================================================================

/**
 * Slot allocations per conversation mode.
 *
 * Design principles:
 * - Safety slots are "free" - they don't count against allocation
 * - Crisis mode maximizes emotional support
 * - Practical mode maximizes actionable content
 * - Deep mode maximizes superhuman insights
 * - Casual mode is lean (user just wants to chat)
 */
export const MODE_ALLOCATIONS: Record<ConversationMode, SlotAllocation> = {
  crisis: {
    emotional: 3, // Maximum emotional support
    practical: 1,
    memory: 1,
    superhuman: 1,
    safety: 0, // Safety is unlimited in crisis
  },
  emotional: {
    emotional: 2, // Strong emotional presence
    practical: 1,
    memory: 2, // Callbacks help connection
    superhuman: 1,
    safety: 0,
  },
  practical: {
    emotional: 1, // Still need warmth
    practical: 3, // Focus on helpful content
    memory: 1,
    superhuman: 1,
    safety: 0,
  },
  deep: {
    emotional: 1,
    practical: 1,
    memory: 2, // Context matters for depth
    superhuman: 2, // Maximize insight
    safety: 0,
  },
  casual: {
    emotional: 1, // Light touch
    practical: 1,
    memory: 0, // Don't over-contextualize
    superhuman: 1, // Can still surprise them
    safety: 0,
  },
  unknown: {
    emotional: 1, // Balanced default
    practical: 2,
    memory: 1,
    superhuman: 2,
    safety: 0,
  },
};

/**
 * Fast mode allocations (3 slots total).
 * Used when response latency is critical.
 */
export const FAST_MODE_ALLOCATIONS: Record<ConversationMode, SlotAllocation> = {
  crisis: {
    emotional: 2,
    practical: 0,
    memory: 1,
    superhuman: 0,
    safety: 0, // Always free
  },
  emotional: {
    emotional: 2,
    practical: 0,
    memory: 1,
    superhuman: 0,
    safety: 0,
  },
  practical: {
    emotional: 0,
    practical: 2,
    memory: 0,
    superhuman: 1,
    safety: 0,
  },
  deep: {
    emotional: 0,
    practical: 0,
    memory: 1,
    superhuman: 2,
    safety: 0,
  },
  casual: {
    emotional: 1,
    practical: 1,
    memory: 0,
    superhuman: 1,
    safety: 0,
  },
  unknown: {
    emotional: 1,
    practical: 1,
    memory: 0,
    superhuman: 1,
    safety: 0,
  },
};

// ============================================================================
// CATEGORY MAPPING
// ============================================================================

/**
 * Maps builder categories to their slot type.
 * This allows the system to know which "bucket" each category belongs to.
 */
export const CATEGORY_TO_SLOT: CategoryToSlot = {
  // Emotional slots
  emotional: 'emotional',
  voice: 'emotional',
  humanizing: 'emotional',
  empathy: 'emotional',
  presence: 'emotional',

  // Practical slots
  context: 'practical',
  coaching: 'practical',
  engagement: 'practical',
  guidance: 'practical',
  team: 'practical',

  // Memory slots
  memory: 'memory',
  persona: 'memory',
  callback: 'memory',
  relationship: 'memory',

  // Superhuman slots
  cognitive: 'superhuman',
  external: 'superhuman',
  learning: 'superhuman',
  proactive: 'superhuman',
  wisdom: 'superhuman',

  // Safety slots (always prioritized)
  safety: 'safety',
  crisis: 'safety',
  boundaries: 'safety',
  identity: 'safety',
};

/**
 * Essential categories that bypass normal slot allocation.
 * These are critical for safety and identity.
 */
export const ESSENTIAL_CATEGORIES = new Set([
  'safety',
  'crisis_response',
  'identity',
  'boundaries',
  'unsaid',
]);

// ============================================================================
// SLOT ALLOCATOR CLASS
// ============================================================================

/**
 * Manages slot allocation for context injections.
 */
export class SlotAllocator {
  private readonly mode: ConversationMode;
  private readonly isFastMode: boolean;
  private readonly allocation: SlotAllocation;
  private readonly usage: SlotAllocation;

  constructor(mode: ConversationMode, isFastMode = false) {
    this.mode = mode;
    this.isFastMode = isFastMode;
    this.allocation = isFastMode
      ? { ...FAST_MODE_ALLOCATIONS[mode] }
      : { ...MODE_ALLOCATIONS[mode] };
    this.usage = {
      emotional: 0,
      practical: 0,
      memory: 0,
      superhuman: 0,
      safety: 0,
    };
  }

  /**
   * Get total slots available (excluding safety which is unlimited).
   */
  getTotalSlots(): number {
    return this.isFastMode ? FAST_MODE_SLOT_COUNT : DEFAULT_SLOT_COUNT;
  }

  /**
   * Get current allocation for this mode.
   */
  getAllocation(): SlotAllocation {
    return { ...this.allocation };
  }

  /**
   * Get current slot usage.
   */
  getUsage(): SlotAllocation {
    return { ...this.usage };
  }

  /**
   * Get remaining slots by type.
   */
  getRemaining(): SlotAllocation {
    return {
      emotional: this.allocation.emotional - this.usage.emotional,
      practical: this.allocation.practical - this.usage.practical,
      memory: this.allocation.memory - this.usage.memory,
      superhuman: this.allocation.superhuman - this.usage.superhuman,
      safety: Infinity, // Safety is always available
    };
  }

  /**
   * Check if an injection can be allocated a slot.
   */
  canAllocate(injection: ContextInjection): boolean {
    const slotType = this.getSlotType(injection.category);

    // Safety/essential categories always get through
    if (slotType === 'safety' || ESSENTIAL_CATEGORIES.has(injection.category)) {
      return true;
    }

    const remaining = this.allocation[slotType] - this.usage[slotType];
    return remaining > 0;
  }

  /**
   * Attempt to allocate a slot for an injection.
   * Returns true if successful, false if no slot available.
   */
  allocate(injection: ContextInjection): boolean {
    const slotType = this.getSlotType(injection.category);

    // Safety/essential categories always get through
    if (slotType === 'safety' || ESSENTIAL_CATEGORIES.has(injection.category)) {
      this.usage.safety++;
      return true;
    }

    const remaining = this.allocation[slotType] - this.usage[slotType];
    if (remaining <= 0) {
      return false;
    }

    this.usage[slotType]++;
    return true;
  }

  /**
   * Get the slot type for a category.
   */
  getSlotType(category: string): keyof SlotAllocation {
    // Check direct mapping
    if (category in CATEGORY_TO_SLOT) {
      return CATEGORY_TO_SLOT[category];
    }

    // Check essential categories
    if (ESSENTIAL_CATEGORIES.has(category)) {
      return 'safety';
    }

    // Check for partial matches (e.g., "emotional_guidance" → "emotional")
    for (const [prefix, slot] of Object.entries(CATEGORY_TO_SLOT)) {
      if (category.startsWith(prefix) || category.includes(prefix)) {
        return slot;
      }
    }

    // Default to practical (most generic)
    return 'practical';
  }

  /**
   * Get the priority order for slot types based on current mode.
   * Higher priority slots are filled first when injections compete.
   */
  getSlotPriority(): (keyof SlotAllocation)[] {
    switch (this.mode) {
      case 'crisis':
        return ['safety', 'emotional', 'memory', 'practical', 'superhuman'];
      case 'emotional':
        return ['safety', 'emotional', 'memory', 'superhuman', 'practical'];
      case 'practical':
        return ['safety', 'practical', 'emotional', 'superhuman', 'memory'];
      case 'deep':
        return ['safety', 'superhuman', 'memory', 'emotional', 'practical'];
      case 'casual':
        return ['safety', 'emotional', 'practical', 'superhuman', 'memory'];
      default:
        return ['safety', 'practical', 'emotional', 'superhuman', 'memory'];
    }
  }

  /**
   * Get statistics about slot utilization.
   */
  getStats(): {
    mode: ConversationMode;
    totalSlots: number;
    usedSlots: number;
    safetySlots: number;
    utilization: number;
    byType: Record<keyof SlotAllocation, { allocated: number; used: number }>;
  } {
    const totalUsed =
      this.usage.emotional +
      this.usage.practical +
      this.usage.memory +
      this.usage.superhuman;

    return {
      mode: this.mode,
      totalSlots: this.getTotalSlots(),
      usedSlots: totalUsed,
      safetySlots: this.usage.safety,
      utilization: totalUsed / this.getTotalSlots(),
      byType: {
        emotional: { allocated: this.allocation.emotional, used: this.usage.emotional },
        practical: { allocated: this.allocation.practical, used: this.usage.practical },
        memory: { allocated: this.allocation.memory, used: this.usage.memory },
        superhuman: { allocated: this.allocation.superhuman, used: this.usage.superhuman },
        safety: { allocated: Infinity, used: this.usage.safety },
      },
    };
  }

  /**
   * Reset usage counters (for reuse).
   */
  reset(): void {
    this.usage.emotional = 0;
    this.usage.practical = 0;
    this.usage.memory = 0;
    this.usage.superhuman = 0;
    this.usage.safety = 0;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a slot allocator for the given mode.
 */
export function createSlotAllocator(
  mode: ConversationMode,
  isFastMode = false
): SlotAllocator {
  return new SlotAllocator(mode, isFastMode);
}

/**
 * Get the allocation for a mode without creating an allocator.
 */
export function getAllocationForMode(
  mode: ConversationMode,
  isFastMode = false
): SlotAllocation {
  return isFastMode
    ? { ...FAST_MODE_ALLOCATIONS[mode] }
    : { ...MODE_ALLOCATIONS[mode] };
}
