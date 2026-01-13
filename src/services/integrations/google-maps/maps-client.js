/**
 * Google Maps API Client
 *
 * Integration with Google Maps for:
 * - Geocoding (address to coordinates)
 * - Reverse geocoding (coordinates to address)
 * - Directions (routes between locations)
 * - Distance Matrix (travel times)
 * - Places (search, autocomplete)
 * - Traffic (real-time conditions)
 *
 * @module services/integrations/google-maps
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'google-maps-client' });
// ============================================================================
// GOOGLE MAPS CLIENT CLASS
// ============================================================================
export class GoogleMapsClient {
    apiKey;
    baseUrl = 'https://maps.googleapis.com/maps/api';
    constructor() {
        this.apiKey = process.env.GOOGLE_MAPS_API_KEY || null;
        if (!this.apiKey) {
            log.warn('Google Maps API key not configured');
        }
    }
    /**
     * Check if the API key is configured
     */
    isConfigured() {
        return !!this.apiKey;
    }
    // ==========================================================================
    // GEOCODING
    // ==========================================================================
    /**
     * Convert address to coordinates
     */
    async geocode(address) {
        if (!this.apiKey) {
            return { success: false, error: 'Google Maps API key not configured' };
        }
        try {
            const url = new URL(`${this.baseUrl}/geocode/json`);
            url.searchParams.set('address', address);
            url.searchParams.set('key', this.apiKey);
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status !== 'OK' || !data.results?.length) {
                return { success: false, error: data.error_message || `Geocoding failed: ${data.status}` };
            }
            const result = data.results[0];
            return {
                success: true,
                data: {
                    placeId: result.place_id,
                    formattedAddress: result.formatted_address,
                    latitude: result.geometry.location.lat,
                    longitude: result.geometry.location.lng,
                    types: result.types,
                    addressComponents: result.address_components.map(c => ({
                        longName: c.long_name,
                        shortName: c.short_name,
                        types: c.types,
                    })),
                },
            };
        }
        catch (error) {
            log.error({ error: String(error) }, 'Geocoding error');
            return { success: false, error: String(error) };
        }
    }
    /**
     * Convert coordinates to address
     */
    async reverseGeocode(latitude, longitude) {
        if (!this.apiKey) {
            return { success: false, error: 'Google Maps API key not configured' };
        }
        try {
            const url = new URL(`${this.baseUrl}/geocode/json`);
            url.searchParams.set('latlng', `${latitude},${longitude}`);
            url.searchParams.set('key', this.apiKey);
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status !== 'OK' || !data.results?.length) {
                return { success: false, error: data.error_message || `Reverse geocoding failed: ${data.status}` };
            }
            const result = data.results[0];
            return {
                success: true,
                data: {
                    placeId: result.place_id,
                    formattedAddress: result.formatted_address,
                    latitude: result.geometry.location.lat,
                    longitude: result.geometry.location.lng,
                    types: result.types,
                    addressComponents: result.address_components.map(c => ({
                        longName: c.long_name,
                        shortName: c.short_name,
                        types: c.types,
                    })),
                },
            };
        }
        catch (error) {
            log.error({ error: String(error) }, 'Reverse geocoding error');
            return { success: false, error: String(error) };
        }
    }
    // ==========================================================================
    // DIRECTIONS
    // ==========================================================================
    /**
     * Get directions between two locations
     */
    async getDirections(params) {
        if (!this.apiKey) {
            return { success: false, error: 'Google Maps API key not configured' };
        }
        try {
            const url = new URL(`${this.baseUrl}/directions/json`);
            // Format origin/destination
            const formatLocation = (loc) => {
                if (typeof loc === 'string')
                    return loc;
                return `${loc.lat},${loc.lng}`;
            };
            url.searchParams.set('origin', formatLocation(params.origin));
            url.searchParams.set('destination', formatLocation(params.destination));
            url.searchParams.set('mode', params.mode || 'driving');
            url.searchParams.set('key', this.apiKey);
            if (params.departureTime) {
                url.searchParams.set('departure_time', Math.floor(params.departureTime.getTime() / 1000).toString());
            }
            else if (params.mode === 'driving') {
                // Use 'now' for real-time traffic
                url.searchParams.set('departure_time', 'now');
            }
            if (params.trafficModel) {
                url.searchParams.set('traffic_model', params.trafficModel);
            }
            if (params.alternatives) {
                url.searchParams.set('alternatives', 'true');
            }
            const avoid = [];
            if (params.avoidHighways)
                avoid.push('highways');
            if (params.avoidTolls)
                avoid.push('tolls');
            if (avoid.length > 0) {
                url.searchParams.set('avoid', avoid.join('|'));
            }
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status !== 'OK' || !data.routes?.length) {
                return { success: false, error: data.error_message || `Directions failed: ${data.status}` };
            }
            const routes = data.routes.map(route => {
                const leg = route.legs[0]; // Single leg for simple A to B
                return {
                    summary: route.summary,
                    distanceMeters: leg.distance.value,
                    distanceText: leg.distance.text,
                    durationSeconds: leg.duration.value,
                    durationText: leg.duration.text,
                    durationInTrafficSeconds: leg.duration_in_traffic?.value,
                    durationInTrafficText: leg.duration_in_traffic?.text,
                    startAddress: leg.start_address,
                    endAddress: leg.end_address,
                    startLocation: leg.start_location,
                    endLocation: leg.end_location,
                    steps: leg.steps.map(step => ({
                        instruction: step.html_instructions.replace(/<[^>]*>/g, ''), // Strip HTML
                        distanceMeters: step.distance.value,
                        distanceText: step.distance.text,
                        durationSeconds: step.duration.value,
                        durationText: step.duration.text,
                        startLocation: step.start_location,
                        endLocation: step.end_location,
                        travelMode: step.travel_mode.toLowerCase(),
                        maneuver: step.maneuver,
                    })),
                    polyline: route.overview_polyline.points,
                    warnings: route.warnings,
                };
            });
            return { success: true, data: routes };
        }
        catch (error) {
            log.error({ error: String(error) }, 'Directions error');
            return { success: false, error: String(error) };
        }
    }
    // ==========================================================================
    // DISTANCE MATRIX
    // ==========================================================================
    /**
     * Get travel times between multiple origins and destinations
     */
    async getDistanceMatrix(params) {
        if (!this.apiKey) {
            return { success: false, error: 'Google Maps API key not configured' };
        }
        try {
            const url = new URL(`${this.baseUrl}/distancematrix/json`);
            const formatLocations = (locs) => {
                return locs.map(loc => {
                    if (typeof loc === 'string')
                        return loc;
                    return `${loc.lat},${loc.lng}`;
                }).join('|');
            };
            url.searchParams.set('origins', formatLocations(params.origins));
            url.searchParams.set('destinations', formatLocations(params.destinations));
            url.searchParams.set('mode', params.mode || 'driving');
            url.searchParams.set('key', this.apiKey);
            if (params.departureTime) {
                url.searchParams.set('departure_time', Math.floor(params.departureTime.getTime() / 1000).toString());
            }
            else if (params.mode === 'driving') {
                url.searchParams.set('departure_time', 'now');
            }
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status !== 'OK') {
                return { success: false, error: data.error_message || `Distance matrix failed: ${data.status}` };
            }
            const matrix = data.rows.map(row => row.elements.map(el => ({
                distance: el.distance || { value: 0, text: '' },
                duration: el.duration || { value: 0, text: '' },
                durationInTraffic: el.duration_in_traffic,
                status: el.status,
            })));
            return { success: true, data: matrix };
        }
        catch (error) {
            log.error({ error: String(error) }, 'Distance matrix error');
            return { success: false, error: String(error) };
        }
    }
    // ==========================================================================
    // PLACES
    // ==========================================================================
    /**
     * Search for places
     */
    async searchPlaces(params) {
        if (!this.apiKey) {
            return { success: false, error: 'Google Maps API key not configured' };
        }
        try {
            const url = new URL(`${this.baseUrl}/place/textsearch/json`);
            url.searchParams.set('query', params.query);
            url.searchParams.set('key', this.apiKey);
            if (params.location) {
                url.searchParams.set('location', `${params.location.lat},${params.location.lng}`);
            }
            if (params.radius) {
                url.searchParams.set('radius', params.radius.toString());
            }
            if (params.type) {
                url.searchParams.set('type', params.type);
            }
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                return { success: false, error: data.error_message || `Place search failed: ${data.status}` };
            }
            const places = (data.results || []).map(place => ({
                placeId: place.place_id,
                name: place.name,
                formattedAddress: place.formatted_address,
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng,
                types: place.types,
                rating: place.rating,
                priceLevel: place.price_level,
                openNow: place.opening_hours?.open_now,
                photoReference: place.photos?.[0]?.photo_reference,
            }));
            return { success: true, data: places };
        }
        catch (error) {
            log.error({ error: String(error) }, 'Place search error');
            return { success: false, error: String(error) };
        }
    }
    /**
     * Get place autocomplete suggestions
     */
    async getPlaceAutocomplete(params) {
        if (!this.apiKey) {
            return { success: false, error: 'Google Maps API key not configured' };
        }
        try {
            const url = new URL(`${this.baseUrl}/place/autocomplete/json`);
            url.searchParams.set('input', params.input);
            url.searchParams.set('key', this.apiKey);
            if (params.location) {
                url.searchParams.set('location', `${params.location.lat},${params.location.lng}`);
            }
            if (params.radius) {
                url.searchParams.set('radius', params.radius.toString());
            }
            if (params.types) {
                url.searchParams.set('types', params.types);
            }
            const response = await fetch(url.toString());
            const data = await response.json();
            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                return { success: false, error: data.error_message || `Autocomplete failed: ${data.status}` };
            }
            const suggestions = (data.predictions || []).map(pred => ({
                placeId: pred.place_id,
                description: pred.description,
                mainText: pred.structured_formatting.main_text,
                secondaryText: pred.structured_formatting.secondary_text,
                types: pred.types,
            }));
            return { success: true, data: suggestions };
        }
        catch (error) {
            log.error({ error: String(error) }, 'Place autocomplete error');
            return { success: false, error: String(error) };
        }
    }
    // ==========================================================================
    // TRAFFIC
    // ==========================================================================
    /**
     * Get traffic conditions between two locations
     */
    async getTrafficInfo(origin, destination) {
        // Get directions with and without traffic to calculate delay
        const directionsResult = await this.getDirections({
            origin,
            destination,
            mode: 'driving',
            departureTime: new Date(), // Now for real-time traffic
        });
        if (!directionsResult.success || !directionsResult.data?.length) {
            return { success: false, error: directionsResult.error || 'Could not get traffic info' };
        }
        const route = directionsResult.data[0];
        const normalDuration = route.durationSeconds;
        const currentDuration = route.durationInTrafficSeconds || normalDuration;
        const delay = currentDuration - normalDuration;
        // Determine traffic condition
        let condition;
        const delayRatio = delay / normalDuration;
        if (delayRatio < 0.1) {
            condition = 'light';
        }
        else if (delayRatio < 0.3) {
            condition = 'moderate';
        }
        else if (delayRatio < 0.5) {
            condition = 'heavy';
        }
        else {
            condition = 'severe';
        }
        return {
            success: true,
            data: {
                origin: route.startAddress,
                destination: route.endAddress,
                normalDurationSeconds: normalDuration,
                currentDurationSeconds: currentDuration,
                trafficDelaySeconds: delay,
                trafficCondition: condition,
            },
        };
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let mapsClientInstance = null;
export function getGoogleMapsClient() {
    if (!mapsClientInstance) {
        mapsClientInstance = new GoogleMapsClient();
    }
    return mapsClientInstance;
}
export function resetGoogleMapsClient() {
    mapsClientInstance = null;
}
//# sourceMappingURL=maps-client.js.map