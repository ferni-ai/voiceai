import Foundation
import CoreLocation
import CoreMotion
import UIKit
import UserNotifications

// MARK: - Ambient State Model

/// Current ambient state to sync to backend
struct AmbientState: Codable {
    var locationType: String?
    var region: String?
    var timezone: String
    var localTime: String
    var timeOfDay: String
    var deviceType: String
    var deviceActive: Bool
    var screenOn: Bool?
    var batteryLevel: Int?
    var isCharging: Bool?
    var connectivity: String?
    var activityType: String?
    var inMeeting: Bool?
    var meetingEndsAt: String?
    var focusModeEnabled: Bool?
    var doNotDisturbEnabled: Bool?
    var ambientNoise: String?
    var weather: WeatherInfo?
    
    struct WeatherInfo: Codable {
        let condition: String
        let temperature: Double
        let unit: String
    }
}

/// Sync request to backend
struct AmbientSyncRequest: Codable {
    let userId: String
    let state: AmbientState
    let appVersion: String?
}

/// Response from backend
struct AmbientSyncResponse: Codable {
    let success: Bool
    let pendingNudge: PendingNudge?
    let nextSyncInterval: Int
    let flags: SyncFlags?
    
    struct PendingNudge: Codable {
        let type: String
        let message: String
        let channel: String
    }
    
    struct SyncFlags: Codable {
        let shouldCheckIn: Bool?
        let urgentMessage: Bool?
    }
}

// MARK: - Location Type Detection

/// Maps location to coarse type (privacy-preserving)
enum LocationType: String {
    case home
    case work
    case gym
    case restaurant
    case transit
    case outdoors
    case unknown
}

// MARK: - Ambient Mode Service

/// Provides continuous background presence awareness
/// 
/// Privacy-first:
/// - Location is coarse (home/work/gym), not exact coordinates
/// - All tracking is opt-in
/// - User sets quiet hours
/// - No location history is stored on device
@MainActor
class AmbientModeService: NSObject, ObservableObject {
    
    // MARK: - Published State
    
    @Published private(set) var isEnabled: Bool = false
    @Published private(set) var currentState: AmbientState?
    @Published private(set) var lastSyncTime: Date?
    @Published private(set) var pendingNudge: AmbientSyncResponse.PendingNudge?
    
    // MARK: - Private Properties
    
    private var userId: String?
    private var serverBaseUrl: String = "https://app.ferni.ai"
    
    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionActivityManager()
    
    private var syncTimer: Timer?
    private var nextSyncInterval: TimeInterval = 900 // 15 minutes default
    
    // Learned locations (simplified - would use Core Data in production)
    private var homeLocation: CLLocation?
    private var workLocation: CLLocation?
    private var gymLocation: CLLocation?
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters // Coarse for privacy
        locationManager.allowsBackgroundLocationUpdates = false // Only when app active
    }
    
    // MARK: - Configuration
    
    func configure(userId: String, serverUrl: String? = nil) {
        self.userId = userId
        if let url = serverUrl {
            self.serverBaseUrl = url
        }
    }
    
    // MARK: - Enable/Disable
    
    func enable() async throws {
        // Request location authorization (when in use only)
        locationManager.requestWhenInUseAuthorization()
        
        // Start periodic sync
        startSyncTimer()
        
        isEnabled = true
        
        // Do initial sync
        try await syncToBackend()
    }
    
    func disable() {
        stopSyncTimer()
        locationManager.stopUpdatingLocation()
        isEnabled = false
    }
    
    // MARK: - Sync Timer
    
    private func startSyncTimer() {
        syncTimer?.invalidate()
        syncTimer = Timer.scheduledTimer(withTimeInterval: nextSyncInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                try? await self?.syncToBackend()
            }
        }
    }
    
    private func stopSyncTimer() {
        syncTimer?.invalidate()
        syncTimer = nil
    }
    
    // MARK: - Build Current State
    
    private func buildCurrentState() async -> AmbientState {
        let now = Date()
        let formatter = ISO8601DateFormatter()
        
        // Get location type
        let locationType = await detectLocationType()
        
        // Get activity type
        let activityType = await detectActivityType()
        
        // Get device state
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        
        // Build state
        return AmbientState(
            locationType: locationType?.rawValue,
            region: nil, // Don't send exact region for privacy
            timezone: TimeZone.current.identifier,
            localTime: formatter.string(from: now),
            timeOfDay: calculateTimeOfDay(now),
            deviceType: "ios",
            deviceActive: UIApplication.shared.applicationState == .active,
            screenOn: UIApplication.shared.applicationState == .active,
            batteryLevel: Int(device.batteryLevel * 100),
            isCharging: device.batteryState == .charging || device.batteryState == .full,
            connectivity: getConnectivityType(),
            activityType: activityType,
            inMeeting: isInMeeting(),
            meetingEndsAt: getMeetingEndTime(),
            focusModeEnabled: isFocusModeEnabled(),
            doNotDisturbEnabled: isDoNotDisturbEnabled(),
            ambientNoise: nil, // Would need audio processing
            weather: nil // Would need weather API
        )
    }
    
    private func calculateTimeOfDay(_ date: Date) -> String {
        let hour = Calendar.current.component(.hour, from: date)
        
        switch hour {
        case 5..<7: return "early_morning"
        case 7..<12: return "morning"
        case 12..<17: return "afternoon"
        case 17..<21: return "evening"
        case 21..<24, 0..<1: return "night"
        default: return "late_night"
        }
    }
    
    // MARK: - Location Detection
    
    private func detectLocationType() async -> LocationType? {
        guard let location = locationManager.location else {
            return nil
        }
        
        // Check against learned locations
        if let home = homeLocation, location.distance(from: home) < 200 {
            return .home
        }
        
        if let work = workLocation, location.distance(from: work) < 200 {
            return .work
        }
        
        if let gym = gymLocation, location.distance(from: gym) < 100 {
            return .gym
        }
        
        // Check if moving (transit)
        if let speed = locationManager.location?.speed, speed > 2.0 {
            return .transit
        }
        
        // Default to unknown
        return .unknown
    }
    
    // MARK: - Activity Detection
    
    private func detectActivityType() async -> String? {
        guard CMMotionActivityManager.isActivityAvailable() else {
            return nil
        }
        
        return await withCheckedContinuation { continuation in
            motionManager.queryActivityStarting(
                from: Date().addingTimeInterval(-60),
                to: Date(),
                to: .main
            ) { activities, error in
                guard let activity = activities?.last else {
                    continuation.resume(returning: nil)
                    return
                }
                
                if activity.walking {
                    continuation.resume(returning: "walking")
                } else if activity.running {
                    continuation.resume(returning: "running")
                } else if activity.cycling {
                    continuation.resume(returning: "cycling")
                } else if activity.automotive {
                    continuation.resume(returning: "driving")
                } else if activity.stationary {
                    continuation.resume(returning: "stationary")
                } else {
                    continuation.resume(returning: "unknown")
                }
            }
        }
    }
    
    // MARK: - Device State Helpers
    
    private func getConnectivityType() -> String {
        // Simplified - would use NWPathMonitor in production
        return "wifi"
    }
    
    private func isInMeeting() -> Bool {
        // Would check EventKit for current meetings
        return false
    }
    
    private func getMeetingEndTime() -> String? {
        // Would check EventKit
        return nil
    }
    
    private func isFocusModeEnabled() -> Bool {
        // iOS 15+ Focus mode API
        return false
    }
    
    private func isDoNotDisturbEnabled() -> Bool {
        // Would check DND settings
        return false
    }
    
    // MARK: - Learn Location
    
    /// Call this when user confirms they're at home/work/gym
    func learnLocation(as type: LocationType) {
        guard let location = locationManager.location else { return }
        
        switch type {
        case .home:
            homeLocation = location
            UserDefaults.standard.set(
                ["lat": location.coordinate.latitude, "lng": location.coordinate.longitude],
                forKey: "learned_home_location"
            )
        case .work:
            workLocation = location
            UserDefaults.standard.set(
                ["lat": location.coordinate.latitude, "lng": location.coordinate.longitude],
                forKey: "learned_work_location"
            )
        case .gym:
            gymLocation = location
            UserDefaults.standard.set(
                ["lat": location.coordinate.latitude, "lng": location.coordinate.longitude],
                forKey: "learned_gym_location"
            )
        default:
            break
        }
    }
    
    /// Load learned locations from storage
    func loadLearnedLocations() {
        if let homeData = UserDefaults.standard.dictionary(forKey: "learned_home_location"),
           let lat = homeData["lat"] as? Double,
           let lng = homeData["lng"] as? Double {
            homeLocation = CLLocation(latitude: lat, longitude: lng)
        }
        
        if let workData = UserDefaults.standard.dictionary(forKey: "learned_work_location"),
           let lat = workData["lat"] as? Double,
           let lng = workData["lng"] as? Double {
            workLocation = CLLocation(latitude: lat, longitude: lng)
        }
        
        if let gymData = UserDefaults.standard.dictionary(forKey: "learned_gym_location"),
           let lat = gymData["lat"] as? Double,
           let lng = gymData["lng"] as? Double {
            gymLocation = CLLocation(latitude: lat, longitude: lng)
        }
    }
    
    // MARK: - Sync to Backend
    
    func syncToBackend() async throws {
        guard let userId = self.userId else {
            throw AmbientModeError.notConfigured
        }
        
        guard isEnabled else {
            throw AmbientModeError.notEnabled
        }
        
        // Build current state
        let state = await buildCurrentState()
        currentState = state
        
        // Build request
        let request = AmbientSyncRequest(
            userId: userId,
            state: state,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        )
        
        // Send to backend
        let response = try await sendSyncRequest(request)
        
        // Update state based on response
        lastSyncTime = Date()
        pendingNudge = response.pendingNudge
        
        // Adjust sync interval based on server response
        nextSyncInterval = TimeInterval(response.nextSyncInterval)
        startSyncTimer() // Restart with new interval
        
        // Handle pending nudge
        if let nudge = response.pendingNudge {
            await handlePendingNudge(nudge)
        }
    }
    
    private func sendSyncRequest(_ request: AmbientSyncRequest) async throws -> AmbientSyncResponse {
        guard let url = URL(string: "\(serverBaseUrl)/api/ambient/sync") else {
            throw AmbientModeError.invalidURL
        }
        
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let encoder = JSONEncoder()
        urlRequest.httpBody = try encoder.encode(request)
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AmbientModeError.networkError
        }
        
        guard httpResponse.statusCode == 200 else {
            throw AmbientModeError.serverError(httpResponse.statusCode)
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode(AmbientSyncResponse.self, from: data)
    }
    
    // MARK: - Handle Nudge
    
    private func handlePendingNudge(_ nudge: AmbientSyncResponse.PendingNudge) async {
        switch nudge.channel {
        case "push_notification":
            // Schedule local notification
            await scheduleLocalNotification(
                title: "Ferni",
                body: nudge.message
            )
            
        case "in_app":
            // Keep in pendingNudge for app to display
            break
            
        case "silent":
            // Log only, don't notify
            print("Silent nudge: \(nudge.message)")
            
        default:
            break
        }
    }
    
    private func scheduleLocalNotification(title: String, body: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: trigger
        )
        
        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            print("Failed to schedule notification: \(error)")
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension AmbientModeService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.startUpdatingLocation()
            default:
                break
            }
        }
    }
    
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Location updated - will be used in next sync
    }
}

// MARK: - Errors

enum AmbientModeError: LocalizedError {
    case notConfigured
    case notEnabled
    case invalidURL
    case networkError
    case serverError(Int)
    
    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Ambient mode not configured with user ID"
        case .notEnabled:
            return "Ambient mode is not enabled"
        case .invalidURL:
            return "Invalid server URL"
        case .networkError:
            return "Network error"
        case .serverError(let code):
            return "Server error: \(code)"
        }
    }
}

