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
export interface GeocodingResult {
    placeId: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    types: string[];
    addressComponents: Array<{
        longName: string;
        shortName: string;
        types: string[];
    }>;
}
export interface DirectionsRoute {
    summary: string;
    distanceMeters: number;
    distanceText: string;
    durationSeconds: number;
    durationText: string;
    durationInTrafficSeconds?: number;
    durationInTrafficText?: string;
    startAddress: string;
    endAddress: string;
    startLocation: {
        lat: number;
        lng: number;
    };
    endLocation: {
        lat: number;
        lng: number;
    };
    steps: DirectionsStep[];
    polyline: string;
    warnings: string[];
}
export interface DirectionsStep {
    instruction: string;
    distanceMeters: number;
    distanceText: string;
    durationSeconds: number;
    durationText: string;
    startLocation: {
        lat: number;
        lng: number;
    };
    endLocation: {
        lat: number;
        lng: number;
    };
    travelMode: TravelMode;
    maneuver?: string;
}
export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';
export type TrafficModel = 'best_guess' | 'pessimistic' | 'optimistic';
export interface DistanceMatrixElement {
    distance: {
        value: number;
        text: string;
    };
    duration: {
        value: number;
        text: string;
    };
    durationInTraffic?: {
        value: number;
        text: string;
    };
    status: 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS' | 'MAX_ROUTE_LENGTH_EXCEEDED';
}
export interface PlaceResult {
    placeId: string;
    name: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    types: string[];
    rating?: number;
    priceLevel?: number;
    openNow?: boolean;
    photoReference?: string;
}
export interface PlaceAutocompleteResult {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
    types: string[];
}
export interface TrafficInfo {
    origin: string;
    destination: string;
    normalDurationSeconds: number;
    currentDurationSeconds: number;
    trafficDelaySeconds: number;
    trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe';
}
export interface MapsClientResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}
export declare class GoogleMapsClient {
    private apiKey;
    private baseUrl;
    constructor();
    /**
     * Check if the API key is configured
     */
    isConfigured(): boolean;
    /**
     * Convert address to coordinates
     */
    geocode(address: string): Promise<MapsClientResult<GeocodingResult>>;
    /**
     * Convert coordinates to address
     */
    reverseGeocode(latitude: number, longitude: number): Promise<MapsClientResult<GeocodingResult>>;
    /**
     * Get directions between two locations
     */
    getDirections(params: {
        origin: string | {
            lat: number;
            lng: number;
        };
        destination: string | {
            lat: number;
            lng: number;
        };
        mode?: TravelMode;
        departureTime?: Date;
        trafficModel?: TrafficModel;
        alternatives?: boolean;
        avoidHighways?: boolean;
        avoidTolls?: boolean;
    }): Promise<MapsClientResult<DirectionsRoute[]>>;
    /**
     * Get travel times between multiple origins and destinations
     */
    getDistanceMatrix(params: {
        origins: Array<string | {
            lat: number;
            lng: number;
        }>;
        destinations: Array<string | {
            lat: number;
            lng: number;
        }>;
        mode?: TravelMode;
        departureTime?: Date;
    }): Promise<MapsClientResult<DistanceMatrixElement[][]>>;
    /**
     * Search for places
     */
    searchPlaces(params: {
        query: string;
        location?: {
            lat: number;
            lng: number;
        };
        radius?: number;
        type?: string;
    }): Promise<MapsClientResult<PlaceResult[]>>;
    /**
     * Get place autocomplete suggestions
     */
    getPlaceAutocomplete(params: {
        input: string;
        location?: {
            lat: number;
            lng: number;
        };
        radius?: number;
        types?: string;
    }): Promise<MapsClientResult<PlaceAutocompleteResult[]>>;
    /**
     * Get traffic conditions between two locations
     */
    getTrafficInfo(origin: string | {
        lat: number;
        lng: number;
    }, destination: string | {
        lat: number;
        lng: number;
    }): Promise<MapsClientResult<TrafficInfo>>;
}
export declare function getGoogleMapsClient(): GoogleMapsClient;
export declare function resetGoogleMapsClient(): void;
//# sourceMappingURL=maps-client.d.ts.map