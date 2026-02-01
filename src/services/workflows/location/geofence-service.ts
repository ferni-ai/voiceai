/**
 * Geofence Service
 *
 * Location-based trigger system for workflows:
 * - Define geofence regions (circular or polygon)
 * - Detect enter/exit events
 * - Track user proximity to locations
 * - Integrate with workflow automation
 *
 * @module services/workflows/location/geofence-service
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getEventBus, type EventPayload } from '../events/event-bus.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
} from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'geofence-service' });

// ============================================================================
// TYPES
// ============================================================================

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface CircularGeofence {
  type: 'circle';
  center: Coordinates;
  radiusMeters: number;
}

export interface PolygonGeofence {
  type: 'polygon';
  vertices: Coordinates[];
}

export type GeofenceShape = CircularGeofence | PolygonGeofence;

export type GeofenceTriggerType = 'enter' | 'exit' | 'dwell' | 'near';

export interface Geofence {
  id: string;
  userId: string;
  name: string;
  description?: string;
  shape: GeofenceShape;
  triggers: GeofenceTriggerType[];

  // For 'near' trigger
  proximityMeters?: number;

  // For 'dwell' trigger
  dwellTimeMinutes?: number;

  // Associated workflow
  workflowId?: string;

  // Active status
  enabled: boolean;

  // Metadata
  address?: string;
  category?: 'home' | 'work' | 'gym' | 'store' | 'restaurant' | 'custom';
  icon?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface UserLocationState {
  userId: string;
  currentLocation?: Coordinates;
  lastUpdated?: Date;

  // Current geofence states
  insideGeofences: string[]; // Geofence IDs
  nearGeofences: string[]; // Geofence IDs

  // Dwell tracking
  dwellTimers: Record<string, { geofenceId: string; enteredAt: Date }>;
}

export interface GeofenceEvent {
  geofenceId: string;
  geofenceName: string;
  userId: string;
  eventType: GeofenceTriggerType;
  location: Coordinates;
  timestamp: Date;
  distanceMeters?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EARTH_RADIUS_METERS = 6371000;

// ============================================================================
// GEOFENCE SERVICE CLASS
// ============================================================================

export class GeofenceService {
  private geofences: Map<string, Geofence> = new Map();
  private userStates: Map<string, UserLocationState> = new Map();
  private dwellTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    log.info('Geofence service initialized');
  }

  // ==========================================================================
  // GEOFENCE MANAGEMENT
  // ==========================================================================

  /**
   * Create a new geofence
   */
  async createGeofence(
    userId: string,
    params: Omit<Geofence, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<Geofence> {
    const geofence: Geofence = {
      id: `geo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      ...params,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.geofences.set(geofence.id, geofence);
    await this.persistGeofence(geofence);

    log.info({ geofenceId: geofence.id, name: geofence.name }, 'Geofence created');

    return geofence;
  }

  /**
   * Update a geofence
   */
  async updateGeofence(
    geofenceId: string,
    updates: Partial<Omit<Geofence, 'id' | 'userId' | 'createdAt'>>
  ): Promise<Geofence | null> {
    const geofence = this.geofences.get(geofenceId);
    if (!geofence) return null;

    Object.assign(geofence, updates, { updatedAt: new Date() });
    await this.persistGeofence(geofence);

    return geofence;
  }

  /**
   * Delete a geofence
   */
  async deleteGeofence(geofenceId: string): Promise<boolean> {
    const geofence = this.geofences.get(geofenceId);
    if (!geofence) return false;

    this.geofences.delete(geofenceId);

    // Clear any dwell timers
    const timerKey = `${geofence.userId}:${geofenceId}`;
    const timer = this.dwellTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.dwellTimers.delete(timerKey);
    }

    // Remove from persistence
    await this.deleteGeofenceFromStore(geofence.userId, geofenceId);

    log.info({ geofenceId }, 'Geofence deleted');
    return true;
  }

  /**
   * Get user's geofences
   */
  getUserGeofences(userId: string): Geofence[] {
    return Array.from(this.geofences.values()).filter((g) => g.userId === userId);
  }

  /**
   * Get geofence by ID
   */
  getGeofence(geofenceId: string): Geofence | undefined {
    return this.geofences.get(geofenceId);
  }

  // ==========================================================================
  // LOCATION UPDATES
  // ==========================================================================

  /**
   * Update user's location and check geofences
   */
  async updateUserLocation(userId: string, location: Coordinates): Promise<GeofenceEvent[]> {
    const events: GeofenceEvent[] = [];
    const userGeofences = this.getUserGeofences(userId).filter((g) => g.enabled);

    // Get or create user state
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        userId,
        insideGeofences: [],
        nearGeofences: [],
        dwellTimers: {},
      };
      this.userStates.set(userId, state);
    }

    const previousInside = new Set(state.insideGeofences);
    const previousNear = new Set(state.nearGeofences);
    const currentInside: string[] = [];
    const currentNear: string[] = [];

    for (const geofence of userGeofences) {
      const distance = this.calculateDistance(location, geofence.shape);
      const isInside = distance <= 0;
      const isNear = geofence.proximityMeters ? distance <= geofence.proximityMeters : false;

      // Check enter trigger
      if (isInside && !previousInside.has(geofence.id)) {
        if (geofence.triggers.includes('enter')) {
          events.push(this.createEvent(geofence, 'enter', location));
        }

        // Start dwell timer if needed
        if (geofence.triggers.includes('dwell') && geofence.dwellTimeMinutes) {
          this.startDwellTimer(userId, geofence, location);
        }
      }

      // Check exit trigger
      if (!isInside && previousInside.has(geofence.id)) {
        if (geofence.triggers.includes('exit')) {
          events.push(this.createEvent(geofence, 'exit', location));
        }

        // Cancel dwell timer
        this.cancelDwellTimer(userId, geofence.id);
      }

      // Check near trigger (only on entry to proximity zone)
      if (isNear && !isInside && !previousNear.has(geofence.id)) {
        if (geofence.triggers.includes('near')) {
          events.push(this.createEvent(geofence, 'near', location, distance));
        }
      }

      if (isInside) currentInside.push(geofence.id);
      if (isNear && !isInside) currentNear.push(geofence.id);
    }

    // Update state
    state.currentLocation = location;
    state.lastUpdated = new Date();
    state.insideGeofences = currentInside;
    state.nearGeofences = currentNear;

    // Publish events to event bus
    for (const event of events) {
      await getEventBus().publish({
        userId,
        eventType:
          event.eventType === 'enter'
            ? 'location_entered'
            : event.eventType === 'exit'
              ? 'location_exited'
              : 'location_near',
        source: 'geofence-service',
        data: {
          geofenceId: event.geofenceId,
          geofenceName: event.geofenceName,
          location: event.location,
          distance: event.distanceMeters,
        },
      });
    }

    if (events.length > 0) {
      log.debug({ userId, eventCount: events.length }, 'Location events triggered');
    }

    return events;
  }

  /**
   * Get user's current location state
   */
  getUserLocationState(userId: string): UserLocationState | undefined {
    return this.userStates.get(userId);
  }

  // ==========================================================================
  // DISTANCE CALCULATIONS
  // ==========================================================================

  /**
   * Calculate distance from a point to a geofence
   * Returns 0 if inside, positive distance if outside
   */
  calculateDistance(point: Coordinates, shape: GeofenceShape): number {
    if (shape.type === 'circle') {
      const centerDistance = this.haversineDistance(point, shape.center);
      return Math.max(0, centerDistance - shape.radiusMeters);
    } else {
      return this.pointToPolygonDistance(point, shape.vertices);
    }
  }

  /**
   * Haversine distance between two points
   */
  private haversineDistance(point1: Coordinates, point2: Coordinates): number {
    const lat1 = this.toRadians(point1.latitude);
    const lat2 = this.toRadians(point2.latitude);
    const deltaLat = this.toRadians(point2.latitude - point1.latitude);
    const deltaLon = this.toRadians(point2.longitude - point1.longitude);

    const a =
      Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_METERS * c;
  }

  /**
   * Check if point is inside polygon and get distance
   */
  private pointToPolygonDistance(point: Coordinates, vertices: Coordinates[]): number {
    if (this.isPointInPolygon(point, vertices)) {
      return 0;
    }

    // Find minimum distance to any edge
    let minDistance = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const distance = this.pointToLineDistance(point, vertices[i], vertices[j]);
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  }

  /**
   * Ray casting algorithm for point in polygon
   */
  private isPointInPolygon(point: Coordinates, vertices: Coordinates[]): boolean {
    let inside = false;
    const x = point.longitude;
    const y = point.latitude;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].longitude;
      const yi = vertices[i].latitude;
      const xj = vertices[j].longitude;
      const yj = vertices[j].latitude;

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Distance from point to line segment
   */
  private pointToLineDistance(
    point: Coordinates,
    lineStart: Coordinates,
    lineEnd: Coordinates
  ): number {
    const d1 = this.haversineDistance(point, lineStart);
    const d2 = this.haversineDistance(point, lineEnd);
    const dLine = this.haversineDistance(lineStart, lineEnd);

    if (dLine === 0) return d1;

    // Project point onto line
    const t = Math.max(0, Math.min(1, (d1 ** 2 - d2 ** 2 + dLine ** 2) / (2 * dLine ** 2)));

    const projLat = lineStart.latitude + t * (lineEnd.latitude - lineStart.latitude);
    const projLon = lineStart.longitude + t * (lineEnd.longitude - lineStart.longitude);

    return this.haversineDistance(point, { latitude: projLat, longitude: projLon });
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  // ==========================================================================
  // DWELL TIMERS
  // ==========================================================================

  /**
   * Start dwell timer for a geofence
   */
  private startDwellTimer(userId: string, geofence: Geofence, location: Coordinates): void {
    const timerKey = `${userId}:${geofence.id}`;

    // Cancel existing timer if any
    this.cancelDwellTimer(userId, geofence.id);

    const dwellMs = (geofence.dwellTimeMinutes || 5) * 60 * 1000;

    const timer = setTimeout(async () => {
      // Check if user is still inside
      const state = this.userStates.get(userId);
      if (state?.insideGeofences.includes(geofence.id)) {
        const event = this.createEvent(geofence, 'dwell', location);

        await getEventBus().publish({
          userId,
          eventType: 'location_entered',
          source: 'geofence-service',
          data: {
            geofenceId: event.geofenceId,
            geofenceName: event.geofenceName,
            location: event.location,
            dwelled: true,
            dwellMinutes: geofence.dwellTimeMinutes,
          },
        });

        log.debug(
          { userId, geofenceId: geofence.id, dwellMinutes: geofence.dwellTimeMinutes },
          'Dwell trigger fired'
        );
      }

      this.dwellTimers.delete(timerKey);
    }, dwellMs);

    this.dwellTimers.set(timerKey, timer);
  }

  /**
   * Cancel dwell timer
   */
  private cancelDwellTimer(userId: string, geofenceId: string): void {
    const timerKey = `${userId}:${geofenceId}`;
    const timer = this.dwellTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.dwellTimers.delete(timerKey);
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Create a geofence event
   */
  private createEvent(
    geofence: Geofence,
    eventType: GeofenceTriggerType,
    location: Coordinates,
    distance?: number
  ): GeofenceEvent {
    return {
      geofenceId: geofence.id,
      geofenceName: geofence.name,
      userId: geofence.userId,
      eventType,
      location,
      timestamp: new Date(),
      distanceMeters: distance,
    };
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Persist geofence to Firestore
   */
  private async persistGeofence(geofence: Geofence): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      recordDegradation('geofence-service', 'persistGeofence');
      return;
    }

    try {
      const docRef = db
        .collection('users')
        .doc(geofence.userId)
        .collection('geofences')
        .doc(geofence.id);

      await docRef.set(
        cleanForFirestore({
          ...geofence,
          createdAt: geofence.createdAt.toISOString(),
          updatedAt: geofence.updatedAt.toISOString(),
        })
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to persist geofence');
    }
  }

  /**
   * Delete geofence from store
   */
  private async deleteGeofenceFromStore(userId: string, geofenceId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;

    try {
      await db.collection('users').doc(userId).collection('geofences').doc(geofenceId).delete();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to delete geofence from store');
    }
  }

  /**
   * Load user's geofences from Firestore
   */
  async loadUserGeofences(userId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      recordDegradation('geofence-service', 'loadUserGeofences');
      return;
    }

    try {
      const snapshot = await db.collection('users').doc(userId).collection('geofences').get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const geofence: Geofence = {
          ...data,
          id: doc.id,
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        } as Geofence;

        this.geofences.set(geofence.id, geofence);
      }

      log.info({ userId, count: snapshot.size }, 'User geofences loaded');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load geofences');
    }
  }

  /**
   * Clear all timers (for cleanup)
   */
  clearAllTimers(): void {
    for (const timer of this.dwellTimers.values()) {
      clearTimeout(timer);
    }
    this.dwellTimers.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let geofenceServiceInstance: GeofenceService | null = null;

export function getGeofenceService(): GeofenceService {
  if (!geofenceServiceInstance) {
    geofenceServiceInstance = new GeofenceService();
  }
  return geofenceServiceInstance;
}

export function resetGeofenceService(): void {
  if (geofenceServiceInstance) {
    geofenceServiceInstance.clearAllTimers();
  }
  geofenceServiceInstance = null;
}
