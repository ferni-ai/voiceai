import Foundation
import HealthKit

// MARK: - Health Data Models

/// Summary of health data to sync to backend
struct HealthSummary: Codable {
    var sleepHours: Double?
    var sleepQuality: String?
    var bedtime: String?
    var wakeTime: String?
    
    var hrvValue: Double?
    var hrvTrend: String?
    var restingHeartRate: Double?
    
    var stepsToday: Int?
    var activityTrend: String?
    var exerciseMinutes: Int?
    var lastWorkoutType: String?
    var lastWorkoutDate: String?
    
    var mindfulMinutes: Int?
    var lastMeditationDate: String?
}

/// Sync request to backend
struct HealthSyncRequest: Codable {
    let userId: String
    let deviceType: String
    let summary: HealthSummary
    let timestamp: String
    let appVersion: String?
}

/// Sync response from backend
struct HealthSyncResponse: Codable {
    let success: Bool
    let error: String?
    let nextSyncSuggested: String?
}

// MARK: - HealthKit Service

/// Provides superhuman health awareness through HealthKit integration
/// 
/// Privacy-first:
/// - All access is read-only
/// - User must explicitly authorize each data type
/// - We store summaries, not raw data
/// - Data never leaves Ferni
@MainActor
class HealthKitService: ObservableObject {
    
    // MARK: - Published State
    
    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var isAvailable: Bool = false
    @Published private(set) var lastSync: Date?
    @Published private(set) var syncError: String?
    
    // MARK: - Private Properties
    
    private let healthStore = HKHealthStore()
    private var userId: String?
    private var serverBaseUrl: String = "https://app.ferni.ai"
    
    // Types we want to read (all read-only, privacy-first)
    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        
        // Sleep
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleepType)
        }
        
        // Heart Rate Variability (stress indicator)
        if let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            types.insert(hrvType)
        }
        
        // Resting Heart Rate
        if let restingHRType = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            types.insert(restingHRType)
        }
        
        // Steps
        if let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) {
            types.insert(stepsType)
        }
        
        // Active Energy
        if let activeEnergyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            types.insert(activeEnergyType)
        }
        
        // Exercise Time
        if let exerciseType = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) {
            types.insert(exerciseType)
        }
        
        // Mindful Minutes
        if let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
            types.insert(mindfulType)
        }
        
        // Workouts
        types.insert(HKObjectType.workoutType())
        
        return types
    }()
    
    // MARK: - Initialization
    
    init() {
        isAvailable = HKHealthStore.isHealthDataAvailable()
    }
    
    // MARK: - Configuration
    
    func configure(userId: String, serverUrl: String? = nil) {
        self.userId = userId
        if let url = serverUrl {
            self.serverBaseUrl = url
        }
    }
    
    // MARK: - Authorization
    
    /// Request authorization for health data (user must approve)
    func requestAuthorization() async throws -> Bool {
        guard isAvailable else {
            throw HealthKitError.notAvailable
        }
        
        // Request read-only access (we never write to health data)
        try await healthStore.requestAuthorization(toShare: [], read: readTypes)
        
        // Check if we got at least some authorization
        isAuthorized = await checkAnyAuthorization()
        
        return isAuthorized
    }
    
    /// Check if we have any health data authorization
    private func checkAnyAuthorization() async -> Bool {
        for type in readTypes {
            let status = healthStore.authorizationStatus(for: type)
            if status == .sharingAuthorized {
                return true
            }
        }
        return false
    }
    
    // MARK: - Data Retrieval
    
    /// Get last night's sleep summary
    func getLastNightSleep() async -> (hours: Double, quality: String)? {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return nil
        }
        
        // Query for last night's sleep (8pm yesterday to noon today)
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let yesterdayEvening = calendar.date(byAdding: .hour, value: -4, to: startOfDay)!
        let todayNoon = calendar.date(byAdding: .hour, value: 12, to: startOfDay)!
        
        let predicate = HKQuery.predicateForSamples(
            withStart: yesterdayEvening,
            end: todayNoon,
            options: .strictStartDate
        )
        
        let samples = try? await fetchSamples(
            type: sleepType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit
        )
        
        guard let sleepSamples = samples as? [HKCategorySample], !sleepSamples.isEmpty else {
            return nil
        }
        
        // Calculate total sleep time (only count asleep states)
        var totalSleepSeconds: TimeInterval = 0
        let asleepValues: Set<Int> = [
            HKCategoryValueSleepAnalysis.asleepCore.rawValue,
            HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
            HKCategoryValueSleepAnalysis.asleepREM.rawValue,
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
        ]
        
        for sample in sleepSamples {
            if asleepValues.contains(sample.value) {
                totalSleepSeconds += sample.endDate.timeIntervalSince(sample.startDate)
            }
        }
        
        let hours = totalSleepSeconds / 3600
        
        // Simple quality assessment
        let quality: String
        if hours < 5 {
            quality = "poor"
        } else if hours < 6 {
            quality = "fair"
        } else if hours < 8 {
            quality = "good"
        } else {
            quality = "excellent"
        }
        
        return (hours, quality)
    }
    
    /// Get HRV trend (stress indicator)
    func getHRVTrend(days: Int = 7) async -> (average: Double, trend: String)? {
        guard let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else {
            return nil
        }
        
        let calendar = Calendar.current
        let now = Date()
        let startDate = calendar.date(byAdding: .day, value: -days, to: now)!
        
        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: now,
            options: .strictStartDate
        )
        
        let samples = try? await fetchSamples(
            type: hrvType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit
        )
        
        guard let hrvSamples = samples as? [HKQuantitySample], !hrvSamples.isEmpty else {
            return nil
        }
        
        // Calculate average and trend
        let values = hrvSamples.map { $0.quantity.doubleValue(for: HKUnit.secondUnit(with: .milli)) }
        let average = values.reduce(0, +) / Double(values.count)
        
        // Simple trend: compare first half to second half
        let midpoint = values.count / 2
        let firstHalf = Array(values.prefix(midpoint))
        let secondHalf = Array(values.suffix(midpoint))
        
        let firstAvg = firstHalf.isEmpty ? 0 : firstHalf.reduce(0, +) / Double(firstHalf.count)
        let secondAvg = secondHalf.isEmpty ? 0 : secondHalf.reduce(0, +) / Double(secondHalf.count)
        
        let trend: String
        let difference = secondAvg - firstAvg
        if abs(difference) < 5 {
            trend = "stable"
        } else if difference > 0 {
            trend = "improving"
        } else {
            trend = "declining"
        }
        
        return (average, trend)
    }
    
    /// Get today's step count
    func getTodaySteps() async -> Int? {
        guard let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            return nil
        }
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        
        let predicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: now,
            options: .strictStartDate
        )
        
        let statistics = try? await fetchStatistics(
            type: stepsType,
            predicate: predicate,
            options: .cumulativeSum
        )
        
        guard let sum = statistics?.sumQuantity() else {
            return nil
        }
        
        return Int(sum.doubleValue(for: HKUnit.count()))
    }
    
    /// Get last workout info
    func getLastWorkout() async -> (type: String, date: Date)? {
        let workoutType = HKObjectType.workoutType()
        
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let samples = try? await fetchSamples(
            type: workoutType,
            predicate: nil,
            limit: 1,
            sortDescriptors: [sortDescriptor]
        )
        
        guard let workouts = samples as? [HKWorkout], let lastWorkout = workouts.first else {
            return nil
        }
        
        let workoutTypeName = lastWorkout.workoutActivityType.displayName
        return (workoutTypeName, lastWorkout.endDate)
    }
    
    /// Get mindful minutes today
    func getMindfulMinutesToday() async -> Int? {
        guard let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
            return nil
        }
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        
        let predicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: now,
            options: .strictStartDate
        )
        
        let samples = try? await fetchSamples(
            type: mindfulType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit
        )
        
        guard let mindfulSamples = samples as? [HKCategorySample] else {
            return nil
        }
        
        let totalSeconds = mindfulSamples.reduce(0.0) { sum, sample in
            sum + sample.endDate.timeIntervalSince(sample.startDate)
        }
        
        return Int(totalSeconds / 60)
    }
    
    // MARK: - Sync to Backend
    
    /// Build health summary and sync to Ferni backend
    func syncToBackend() async throws {
        guard let userId = self.userId else {
            throw HealthKitError.notConfigured
        }
        
        guard isAuthorized else {
            throw HealthKitError.notAuthorized
        }
        
        // Build summary from available data
        var summary = HealthSummary()
        
        // Sleep
        if let sleep = await getLastNightSleep() {
            summary.sleepHours = sleep.hours
            summary.sleepQuality = sleep.quality
        }
        
        // HRV/Stress
        if let hrv = await getHRVTrend() {
            summary.hrvValue = hrv.average
            summary.hrvTrend = hrv.trend
        }
        
        // Steps
        if let steps = await getTodaySteps() {
            summary.stepsToday = steps
        }
        
        // Last workout
        if let workout = await getLastWorkout() {
            summary.lastWorkoutType = workout.type
            summary.lastWorkoutDate = ISO8601DateFormatter().string(from: workout.date)
        }
        
        // Mindfulness
        if let mindfulMinutes = await getMindfulMinutesToday() {
            summary.mindfulMinutes = mindfulMinutes
        }
        
        // Build sync request
        let request = HealthSyncRequest(
            userId: userId,
            deviceType: "ios",
            summary: summary,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        )
        
        // Send to backend
        try await sendSyncRequest(request)
        
        lastSync = Date()
        syncError = nil
    }
    
    private func sendSyncRequest(_ request: HealthSyncRequest) async throws {
        guard let url = URL(string: "\(serverBaseUrl)/api/health/sync") else {
            throw HealthKitError.invalidURL
        }
        
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let encoder = JSONEncoder()
        urlRequest.httpBody = try encoder.encode(request)
        
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HealthKitError.networkError
        }
        
        guard httpResponse.statusCode == 200 else {
            throw HealthKitError.serverError(httpResponse.statusCode)
        }
        
        let decoder = JSONDecoder()
        let syncResponse = try decoder.decode(HealthSyncResponse.self, from: data)
        
        if !syncResponse.success {
            throw HealthKitError.syncFailed(syncResponse.error ?? "Unknown error")
        }
    }
    
    // MARK: - HealthKit Query Helpers
    
    private func fetchSamples(
        type: HKSampleType,
        predicate: NSPredicate?,
        limit: Int,
        sortDescriptors: [NSSortDescriptor]? = nil
    ) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: limit,
                sortDescriptors: sortDescriptors
            ) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples ?? [])
                }
            }
            healthStore.execute(query)
        }
    }
    
    private func fetchStatistics(
        type: HKQuantityType,
        predicate: NSPredicate,
        options: HKStatisticsOptions
    ) async throws -> HKStatistics? {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: options
            ) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: statistics)
                }
            }
            healthStore.execute(query)
        }
    }
}

// MARK: - Errors

enum HealthKitError: LocalizedError {
    case notAvailable
    case notAuthorized
    case notConfigured
    case invalidURL
    case networkError
    case serverError(Int)
    case syncFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "HealthKit is not available on this device"
        case .notAuthorized:
            return "Health data access not authorized"
        case .notConfigured:
            return "HealthKit service not configured with user ID"
        case .invalidURL:
            return "Invalid server URL"
        case .networkError:
            return "Network error"
        case .serverError(let code):
            return "Server error: \(code)"
        case .syncFailed(let message):
            return "Sync failed: \(message)"
        }
    }
}

// MARK: - Workout Type Extension

extension HKWorkoutActivityType {
    var displayName: String {
        switch self {
        case .running: return "Running"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .yoga: return "Yoga"
        case .functionalStrengthTraining: return "Strength Training"
        case .traditionalStrengthTraining: return "Strength Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .pilates: return "Pilates"
        case .dance: return "Dance"
        case .elliptical: return "Elliptical"
        case .rowing: return "Rowing"
        case .hiking: return "Hiking"
        default: return "Workout"
        }
    }
}

