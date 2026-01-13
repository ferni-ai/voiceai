/**
 * Base Components - Index
 *
 * Exports all base component classes and utilities.
 *
 * @module @ferni/components/base
 */

// Base component
export {
  BaseComponent,
  type TrackedListener,
  type ComponentOptions,
} from './component.js';

// Modal
export {
  Modal,
  injectModalStyles,
  type ModalConfig,
  type ModalOptions,
} from './modal.js';

// Panel
export {
  Panel,
  injectPanelStyles,
  type PanelConfig,
  type PanelOptions,
} from './panel.js';
