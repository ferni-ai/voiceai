import CoreLocation
import Foundation
import os

/// Location Service for context-aware support
/// "Better Than Human" - knows when you're home, at work, or traveling
@MainActor
final class LocationService: NSObject, ObservableObject {
    static let shared = LocationService()

    // MARK: - Published State

    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var currentContext: LocationContext = .unknown
    @Published private(set) var isHome: Bool = false
    @Published private(set) var isAtWork: Bool = false
    @Published private(set) var isTraveling: Bool = false

    // MARK: - Location Context

    enum LocationContext: String {
        case home = "home"
        case work = "work"
        case commuting = "commuting"
        case traveling = "traveling"
        case gym = "gym"
        case outdoors = "outdoors"
        case unknown = "unknown"

        var description: String {
            switch self {
            case .home: return "at home"
            case .work: return "at work"
            case .commuting: return "on your way"
            case .traveling: return "traveling"
            case .gym: return "at the gym"
            case .outdoors: return "outside"
            case .unknown: return ""
            }
        }

        /// Emotional support context based on location
        var supportContext: String {
            switch self {
            case .home:
                return "You're home - a safe space to be yourself."
            case .work:
                return "I know work can be stressful. I'm here if you need a break."
            case .commuting:
                return "Good time to decompress or prepare for what's ahead."
            case .traveling:
                return "Being away from home can be exciting but also draining."
            case .gym:
                return "Great job taking care of your body!"
            case .outdoors:
                return "Nature is good for the soul."
            case .unknown:
                return ""
            }
        }
    }

    // MARK: - Saved Locations

    struct SavedLocation: Codable {
        let name: String
        let latitude: Double
        let longitude: Double
        let radius: Double  // meters

        func contains(_ coordinate: CLLocationCoordinate2D) -> Bool {
            let savedLocation = CLLocation(latitude: latitude, longitude: longitude)
            let currentLocation = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
            return currentLocation.distance(from: savedLocation) <= radius
        }
    }

    // MARK: - Private

    private let locationManager = CLLocationManager()
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "Location")
    private let defaults = UserDefaults.standard

    private let homeLocationKey = "ferni_home_location"
    private let workLocationKey = "ferni_work_location"

    private var homeLocation: SavedLocation?
    private var workLocation: SavedLocation?

    // MARK: - Initialization

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.allowsBackgroundLocationUpdates = false
        locationManager.pausesLocationUpdatesAutomatically = true

        loadSavedLocations()
    }

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        let status = locationManager.authorizationStatus

        switch status {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
            // Wait for delegate callback
            return await withCheckedContinuation { continuation in
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    continuation.resume(returning: self.isAuthorized)
                }
            }

        case .authorizedWhenInUse, .authorizedAlways:
            isAuthorized = true
            return true

        case .denied, .restricted:
            isAuthorized = false
            return false

        @unknown default:
            return false
        }
    }

    // MARK: - Location Updates

    func startMonitoring() {
        guard isAuthorized else { return }
        locationManager.startMonitoringSignificantLocationChanges()
        logger.info("Started location monitoring")
    }

    func stopMonitoring() {
        locationManager.stopMonitoringSignificantLocationChanges()
        logger.info("Stopped location monitoring")
    }

    func getCurrentLocation() async -> CLLocation? {
        guard isAuthorized else { return nil }

        locationManager.requestLocation()

        // Wait for location update
        return await withCheckedContinuation { continuation in
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                continuation.resume(returning: self.locationManager.location)
            }
        }
    }

    // MARK: - Context Detection

    private func updateContext(for location: CLLocation) {
        let coordinate = location.coordinate

        // Check home
        if let home = homeLocation, home.contains(coordinate) {
            currentContext = .home
            isHome = true
            isAtWork = false
            isTraveling = false
            return
        }

        // Check work
        if let work = workLocation, work.contains(coordinate) {
            currentContext = .work
            isHome = false
            isAtWork = true
            isTraveling = false
            return
        }

        // Check if traveling (moving fast or far from known locations)
        if location.speed > 10 {  // > 36 km/h
            currentContext = .commuting
        } else {
            currentContext = .unknown
        }

        isHome = false
        isAtWork = false
        isTraveling = currentContext == .commuting || currentContext == .traveling
    }

    // MARK: - Save Locations

    /// Save current location as "Home"
    func saveCurrentAsHome() async {
        guard let location = await getCurrentLocation() else { return }

        homeLocation = SavedLocation(
            name: "Home",
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            radius: 100  // 100 meter radius
        )

        saveLocation(homeLocation!, forKey: homeLocationKey)
        logger.info("Saved home location")
    }

    /// Save current location as "Work"
    func saveCurrentAsWork() async {
        guard let location = await getCurrentLocation() else { return }

        workLocation = SavedLocation(
            name: "Work",
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            radius: 150  // 150 meter radius for larger offices
        )

        saveLocation(workLocation!, forKey: workLocationKey)
        logger.info("Saved work location")
    }

    private func saveLocation(_ location: SavedLocation, forKey key: String) {
        if let data = try? JSONEncoder().encode(location) {
            defaults.set(data, forKey: key)
        }
    }

    private func loadSavedLocations() {
        if let data = defaults.data(forKey: homeLocationKey),
           let location = try? JSONDecoder().decode(SavedLocation.self, from: data) {
            homeLocation = location
        }

        if let data = defaults.data(forKey: workLocationKey),
           let location = try? JSONDecoder().decode(SavedLocation.self, from: data) {
            workLocation = location
        }
    }

    // MARK: - Clear Saved Locations

    func clearHomeLocation() {
        homeLocation = nil
        defaults.removeObject(forKey: homeLocationKey)
    }

    func clearWorkLocation() {
        workLocation = nil
        defaults.removeObject(forKey: workLocationKey)
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        Task { @MainActor in
            updateContext(for: location)
            logger.debug("Location updated: \(self.currentContext.rawValue)")
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            logger.error("Location error: \(error.localizedDescription)")
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                isAuthorized = true
                startMonitoring()
            default:
                isAuthorized = false
            }
        }
    }
}

// MARK: - Voice Agent Integration

extension LocationService {
    /// Get location context for voice agent
    func getLocationContext() -> [String: Any] {
        return [
            "context": currentContext.rawValue,
            "contextDescription": currentContext.description,
            "supportContext": currentContext.supportContext,
            "isHome": isHome,
            "isAtWork": isAtWork,
            "isTraveling": isTraveling,
            "hasHomeLocation": homeLocation != nil,
            "hasWorkLocation": workLocation != nil
        ]
    }

    /// Get a greeting based on location
    func getLocationAwareGreeting() -> String? {
        switch currentContext {
        case .home:
            return "Welcome home."
        case .work:
            return "How's work going?"
        case .commuting:
            return "On the move?"
        case .traveling:
            return "How's the trip?"
        default:
            return nil
        }
    }
}
