import Foundation
import CoreLocation
import Combine

// MARK: - Location Service
/// Provides location-aware intelligence
/// Geofencing for habits, commute detection, place awareness

class LocationService: NSObject, ObservableObject {

    // MARK: - Published State

    /// Current location (if available)
    @Published private(set) var currentLocation: CLLocation?

    /// Current place name (Home, Work, Gym, etc.)
    @Published private(set) var currentPlace: String?

    /// Whether user is commuting
    @Published private(set) var isCommuting: Bool = false

    /// Authorization status
    @Published private(set) var authorizationStatus: CLAuthorizationStatus = .notDetermined

    /// Whether location access is granted
    @Published private(set) var hasAccess: Bool = false

    /// Last location update time
    @Published private(set) var lastUpdate: Date?

    // MARK: - Saved Places

    /// User-defined places for geofencing
    @Published var savedPlaces: [SavedPlace] = []

    // MARK: - Private Properties

    private let locationManager = CLLocationManager()
    private var isMonitoring = false

    // Default places (can be customized by user)
    private let defaultPlaceRadius: CLLocationDistance = 100 // meters

    // MARK: - Initialization

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.distanceFilter = 50 // Update every 50 meters

        checkAuthorizationStatus()
        loadSavedPlaces()
    }

    // MARK: - Authorization

    func checkAuthorizationStatus() {
        authorizationStatus = locationManager.authorizationStatus
        hasAccess = authorizationStatus == .authorizedAlways || authorizationStatus == .authorized
    }

    /// Request location permission
    func requestAccess() {
        locationManager.requestWhenInUseAuthorization()
    }

    /// Request always-on location for geofencing
    func requestAlwaysAccess() {
        locationManager.requestAlwaysAuthorization()
    }

    /// Open System Settings to Location section
    func openLocationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Location Monitoring

    /// Start monitoring location changes
    func startMonitoring() {
        guard hasAccess, !isMonitoring else { return }

        locationManager.startUpdatingLocation()
        isMonitoring = true

        // Start monitoring saved places
        for place in savedPlaces {
            startMonitoringPlace(place)
        }
    }

    /// Stop monitoring location changes
    func stopMonitoring() {
        locationManager.stopUpdatingLocation()
        isMonitoring = false

        // Stop monitoring all regions
        for region in locationManager.monitoredRegions {
            locationManager.stopMonitoring(for: region)
        }
    }

    /// Request a single location update
    func requestLocation() {
        guard hasAccess else { return }
        locationManager.requestLocation()
    }

    // MARK: - Place Management

    /// Add a new saved place
    func addPlace(name: String, location: CLLocation, radius: CLLocationDistance? = nil) {
        let place = SavedPlace(
            id: UUID().uuidString,
            name: name,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            radius: radius ?? defaultPlaceRadius
        )

        savedPlaces.append(place)
        savePlaces()

        if isMonitoring {
            startMonitoringPlace(place)
        }
    }

    /// Remove a saved place
    func removePlace(_ place: SavedPlace) {
        savedPlaces.removeAll { $0.id == place.id }
        savePlaces()
        stopMonitoringPlace(place)
    }

    /// Save current location as a place
    func saveCurrentLocationAsPlace(name: String) {
        guard let location = currentLocation else { return }
        addPlace(name: name, location: location)
    }

    private func startMonitoringPlace(_ place: SavedPlace) {
        let region = CLCircularRegion(
            center: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude),
            radius: place.radius,
            identifier: place.id
        )
        region.notifyOnEntry = true
        region.notifyOnExit = true

        locationManager.startMonitoring(for: region)
    }

    private func stopMonitoringPlace(_ place: SavedPlace) {
        if let region = locationManager.monitoredRegions.first(where: { $0.identifier == place.id }) {
            locationManager.stopMonitoring(for: region)
        }
    }

    // MARK: - Persistence

    private func loadSavedPlaces() {
        if let data = UserDefaults.standard.data(forKey: "savedPlaces"),
           let places = try? JSONDecoder().decode([SavedPlace].self, from: data) {
            savedPlaces = places
        } else {
            // Set up default places
            savedPlaces = []
        }
    }

    private func savePlaces() {
        if let data = try? JSONEncoder().encode(savedPlaces) {
            UserDefaults.standard.set(data, forKey: "savedPlaces")
        }
    }

    // MARK: - Place Detection

    /// Determine current place based on location
    private func updateCurrentPlace() {
        guard let location = currentLocation else {
            currentPlace = nil
            return
        }

        // Check against saved places
        for place in savedPlaces {
            let placeLocation = CLLocation(latitude: place.latitude, longitude: place.longitude)
            let distance = location.distance(from: placeLocation)

            if distance <= place.radius {
                currentPlace = place.name
                return
            }
        }

        // Not at any saved place
        currentPlace = nil
    }

    // MARK: - Commute Detection

    /// Simple commute detection based on speed and movement
    private func updateCommuteStatus() {
        guard let location = currentLocation else {
            isCommuting = false
            return
        }

        // If moving faster than walking speed (~5 km/h = ~1.4 m/s)
        // and not at a saved place, likely commuting
        let walkingSpeed: CLLocationSpeed = 1.4
        isCommuting = location.speed > walkingSpeed && currentPlace == nil
    }

    // MARK: - Context Generation

    /// Generate context string for the agent
    func generateContextString() -> String {
        var parts: [String] = []

        if let place = currentPlace {
            parts.append("Location: \(place)")
        }

        if isCommuting {
            parts.append("Currently commuting")
        }

        return parts.joined(separator: "\n")
    }

    /// Get location context for data channel
    func getLocationContext() -> [String: Any] {
        var context: [String: Any] = [
            "hasAccess": hasAccess
        ]

        if let place = currentPlace {
            context["location"] = place
        }

        if isCommuting {
            context["isCommuting"] = true
        }

        return context
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationService: CLLocationManagerDelegate {

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        checkAuthorizationStatus()

        if hasAccess {
            startMonitoring()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        currentLocation = location
        lastUpdate = Date()

        updateCurrentPlace()
        updateCommuteStatus()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Location] Failed: \(error.localizedDescription)")
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        if let place = savedPlaces.first(where: { $0.id == region.identifier }) {
            currentPlace = place.name
            print("[Location] Entered: \(place.name)")

            // Post notification for arrival
            NotificationCenter.default.post(
                name: .didEnterPlace,
                object: nil,
                userInfo: ["place": place.name]
            )
        }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        if let place = savedPlaces.first(where: { $0.id == region.identifier }) {
            print("[Location] Exited: \(place.name)")

            // Post notification for departure
            NotificationCenter.default.post(
                name: .didExitPlace,
                object: nil,
                userInfo: ["place": place.name]
            )

            // Update current place
            updateCurrentPlace()
        }
    }
}

// MARK: - Saved Place Model

struct SavedPlace: Identifiable, Codable {
    let id: String
    let name: String
    let latitude: Double
    let longitude: Double
    let radius: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let didEnterPlace = Notification.Name("com.ferni.voice.didEnterPlace")
    static let didExitPlace = Notification.Name("com.ferni.voice.didExitPlace")
}

// MARK: - NSWorkspace Import

import AppKit
