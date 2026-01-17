/**
 * Visualization Adapters Index
 *
 * Re-exports all adapters for platform-specific rendering.
 *
 * @module visualizations/adapters
 */

export {
  createDeviceAdapter,
  createDeviceContext,
  detectDeviceType,
  detectPlatform,
  type DeviceAdapter,
  type DeviceAdapterOptions,
} from './device-adapter.js';
