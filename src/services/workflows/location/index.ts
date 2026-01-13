/**
 * Workflow Location Services
 *
 * Location-based workflow automation triggers.
 *
 * @module services/workflows/location
 */

export {
  GeofenceService,
  getGeofenceService,
  resetGeofenceService,
  type Coordinates,
  type CircularGeofence,
  type PolygonGeofence,
  type GeofenceShape,
  type GeofenceTriggerType,
  type Geofence,
  type UserLocationState,
  type GeofenceEvent,
} from './geofence-service.js';
