import Foundation
import Combine

// MARK: - Relationship Arc Service
/// Tracks the evolving relationship between user and Ferni, inspired by real human relationships.
///
/// Philosophy:
/// - Relationships grow through consistent presence, not just time
/// - Each stage unlocks deeper connection and capabilities
/// - Progression should feel natural, never gamified
///
/// The 5 stages mirror human relationship development:
/// 1. First Meeting - "Nice to meet you"
/// 2. Getting Started - "We're starting to understand each other"
/// 3. Building Trust - "I feel comfortable sharing with you"
/// 4. Established - "You really get me"
/// 5. Deep Partnership - "We've been through a lot together"

public class RelationshipArcService: ObservableObject {

    // MARK: - Singleton

    public static let shared = RelationshipArcService()

    // MARK: - Published State

    @Published public private(set) var currentStage: RelationshipStage = .firstMeeting
    @Published public private(set) var stageProgress: Double = 0.0  // 0.0 to 1.0 within current stage
    @Published public private(set) var metrics: RelationshipMetrics = RelationshipMetrics()
    @Published public private(set) var memories: [RelationshipMemory] = []
    @Published public private(set) var justAdvanced: Bool = false  // True briefly after stage advancement

    // MARK: - Private State

    private let storage: UserDefaults
    private let storageKeyPrefix = "ferni.relationship."
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private init(storage: UserDefaults = .standard) {
        self.storage = storage
        loadState()
    }

    #if DEBUG
    /// For testing only - allows injecting a custom UserDefaults
    internal static func createForTesting(storage: UserDefaults) -> RelationshipArcService {
        let service = RelationshipArcService(storage: storage)
        return service
    }
    #endif

    // MARK: - Public API

    /// Record a completed call
    public func recordCall(duration: TimeInterval, hadMeaningfulExchange: Bool = false) {
        metrics.totalCalls += 1
        metrics.totalDuration += duration

        if hadMeaningfulExchange {
            metrics.meaningfulExchanges += 1
        }

        // Calculate consecutive days
        let today = Calendar.current.startOfDay(for: Date())
        if let lastCall = metrics.lastCallDate {
            let lastCallDay = Calendar.current.startOfDay(for: lastCall)
            let daysDiff = Calendar.current.dateComponents([.day], from: lastCallDay, to: today).day ?? 0

            if daysDiff == 1 {
                metrics.consecutiveDays += 1
            } else if daysDiff > 1 {
                metrics.consecutiveDays = 1
            }
            // daysDiff == 0 means same day, don't change consecutive count
        } else {
            metrics.consecutiveDays = 1
        }

        metrics.lastCallDate = Date()

        evaluateStageProgression()
        saveState()
    }

    /// Record a return visit (user came back after being away)
    public func recordReturn() {
        metrics.returnsAfterAbsence += 1
        evaluateStageProgression()
        saveState()
    }

    /// Record an insight shared (Ferni noticed something meaningful)
    public func recordInsightShared() {
        metrics.insightsShared += 1
        evaluateStageProgression()
        saveState()
    }

    /// Record a vulnerability moment (user shared something personal)
    public func recordVulnerabilityMoment() {
        metrics.vulnerabilityMoments += 1

        // Add a memory for significant moments
        if metrics.vulnerabilityMoments % 5 == 0 {
            addMemory(
                type: .milestone,
                title: "Deepening Trust",
                description: "You've shared \(metrics.vulnerabilityMoments) meaningful moments with me."
            )
        }

        evaluateStageProgression()
        saveState()
    }

    /// Add a memory to the relationship timeline
    public func addMemory(type: MemoryType, title: String, description: String) {
        let memory = RelationshipMemory(
            id: UUID(),
            date: Date(),
            type: type,
            title: title,
            description: description,
            stage: currentStage
        )
        memories.append(memory)
        saveState()
    }

    /// Get subtitle text for current stage
    public var stageSubtitle: String {
        currentStage.subtitle
    }

    /// Get description for current stage
    public var stageDescription: String {
        currentStage.description
    }

    /// Check if this is the user's first session
    public var isFirstSession: Bool {
        metrics.totalCalls == 0
    }

    /// Reset relationship (for testing or fresh start)
    public func reset() {
        currentStage = .firstMeeting
        stageProgress = 0.0
        metrics = RelationshipMetrics()
        memories = []
        justAdvanced = false
        saveState()
    }

    // MARK: - Stage Progression Logic

    private func evaluateStageProgression() {
        let previousStage = currentStage

        // Calculate which stage we should be in based on metrics
        let targetStage = calculateTargetStage()

        // Update progress within current stage
        stageProgress = calculateProgressInStage(targetStage)

        // Check for stage advancement (compare ordinal position, not rawValue strings)
        if targetStage.ordinal > currentStage.ordinal {
            advanceToStage(targetStage)
        }

        if currentStage != previousStage {
            justAdvanced = true

            // Reset justAdvanced after a short delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
                self?.justAdvanced = false
            }
        }
    }

    private func calculateTargetStage() -> RelationshipStage {
        // Stage thresholds (inspired by web app)
        // Each stage has multiple metrics that must be met

        // Deep Partnership: 50+ calls, 10+ hours, 20+ insights, 5+ returns
        if metrics.totalCalls >= 50 &&
           metrics.totalDuration >= 36000 &&
           metrics.insightsShared >= 20 &&
           metrics.returnsAfterAbsence >= 5 {
            return .deepPartnership
        }

        // Established: 25+ calls, 5+ hours, 10+ insights
        if metrics.totalCalls >= 25 &&
           metrics.totalDuration >= 18000 &&
           metrics.insightsShared >= 10 {
            return .established
        }

        // Building Trust: 10+ calls, 2+ hours, 3+ insights
        if metrics.totalCalls >= 10 &&
           metrics.totalDuration >= 7200 &&
           metrics.insightsShared >= 3 {
            return .buildingTrust
        }

        // Getting Started: 3+ calls, 15+ minutes
        if metrics.totalCalls >= 3 &&
           metrics.totalDuration >= 900 {
            return .gettingStarted
        }

        return .firstMeeting
    }

    private func calculateProgressInStage(_ stage: RelationshipStage) -> Double {
        // Calculate progress toward next stage
        switch stage {
        case .firstMeeting:
            let callProgress = Double(metrics.totalCalls) / 3.0
            let durationProgress = metrics.totalDuration / 900.0
            return min(1.0, (callProgress + durationProgress) / 2.0)

        case .gettingStarted:
            let callProgress = Double(metrics.totalCalls - 3) / 7.0
            let durationProgress = (metrics.totalDuration - 900) / 6300.0
            let insightProgress = Double(metrics.insightsShared) / 3.0
            return min(1.0, (callProgress + durationProgress + insightProgress) / 3.0)

        case .buildingTrust:
            let callProgress = Double(metrics.totalCalls - 10) / 15.0
            let durationProgress = (metrics.totalDuration - 7200) / 10800.0
            let insightProgress = Double(metrics.insightsShared - 3) / 7.0
            return min(1.0, (callProgress + durationProgress + insightProgress) / 3.0)

        case .established:
            let callProgress = Double(metrics.totalCalls - 25) / 25.0
            let durationProgress = (metrics.totalDuration - 18000) / 18000.0
            let insightProgress = Double(metrics.insightsShared - 10) / 10.0
            let returnProgress = Double(metrics.returnsAfterAbsence) / 5.0
            return min(1.0, (callProgress + durationProgress + insightProgress + returnProgress) / 4.0)

        case .deepPartnership:
            // Already at max stage, show continued engagement
            return 1.0
        }
    }

    private func advanceToStage(_ newStage: RelationshipStage) {
        currentStage = newStage
        stageProgress = 0.0

        // Add milestone memory
        addMemory(
            type: .stageAdvancement,
            title: newStage.title,
            description: newStage.advancementMessage
        )
    }

    // MARK: - Persistence

    private func loadState() {
        if let stageRaw = storage.string(forKey: storageKeyPrefix + "stage"),
           let stage = RelationshipStage(rawValue: stageRaw) {
            currentStage = stage
        }

        stageProgress = storage.double(forKey: storageKeyPrefix + "progress")

        if let metricsData = storage.data(forKey: storageKeyPrefix + "metrics"),
           let decoded = try? JSONDecoder().decode(RelationshipMetrics.self, from: metricsData) {
            metrics = decoded
        }

        if let memoriesData = storage.data(forKey: storageKeyPrefix + "memories"),
           let decoded = try? JSONDecoder().decode([RelationshipMemory].self, from: memoriesData) {
            memories = decoded
        }
    }

    private func saveState() {
        storage.set(currentStage.rawValue, forKey: storageKeyPrefix + "stage")
        storage.set(stageProgress, forKey: storageKeyPrefix + "progress")

        if let metricsData = try? JSONEncoder().encode(metrics) {
            storage.set(metricsData, forKey: storageKeyPrefix + "metrics")
        }

        if let memoriesData = try? JSONEncoder().encode(memories) {
            storage.set(memoriesData, forKey: storageKeyPrefix + "memories")
        }
    }
}

// MARK: - Relationship Stage

public enum RelationshipStage: String, Codable, CaseIterable {
    case firstMeeting = "first-meeting"
    case gettingStarted = "getting-started"
    case buildingTrust = "building-trust"
    case established = "established"
    case deepPartnership = "deep-partnership"

    public var title: String {
        switch self {
        case .firstMeeting: return "First Meeting"
        case .gettingStarted: return "Getting Started"
        case .buildingTrust: return "Building Trust"
        case .established: return "Established"
        case .deepPartnership: return "Deep Partnership"
        }
    }

    public var subtitle: String {
        switch self {
        case .firstMeeting: return "Nice to meet you"
        case .gettingStarted: return "We're finding our rhythm"
        case .buildingTrust: return "I feel comfortable sharing with you"
        case .established: return "You really get me"
        case .deepPartnership: return "We've been through a lot together"
        }
    }

    public var description: String {
        switch self {
        case .firstMeeting:
            return "Every great relationship starts with a hello. I'm excited to learn about you."
        case .gettingStarted:
            return "We're starting to understand each other's rhythms and preferences."
        case .buildingTrust:
            return "Our conversations are getting deeper. I'm learning what matters to you."
        case .established:
            return "I know your patterns, your preferences, your goals. We work well together."
        case .deepPartnership:
            return "Through ups and downs, we've built something real. I'm here for the long haul."
        }
    }

    public var advancementMessage: String {
        switch self {
        case .firstMeeting:
            return "We're just getting started."
        case .gettingStarted:
            return "We've moved past pleasantries. I'm learning your rhythm."
        case .buildingTrust:
            return "Something beautiful is growing. You trust me with more."
        case .established:
            return "This feels natural now. We understand each other."
        case .deepPartnership:
            return "We've built something rare. A true partnership."
        }
    }

    public var color: String {
        switch self {
        case .firstMeeting: return "7c8c73"      // Sage - Fresh start
        case .gettingStarted: return "6b9080"   // Teal sage - Growing
        case .buildingTrust: return "4a6741"    // Ferni green - Deepening
        case .established: return "3d5a45"      // Rich green - Mature
        case .deepPartnership: return "2d4a35"  // Deep forest - Enduring
        }
    }

    public var iconName: String {
        switch self {
        case .firstMeeting: return "hand.wave"
        case .gettingStarted: return "message"
        case .buildingTrust: return "heart"
        case .established: return "star"
        case .deepPartnership: return "infinity"
        }
    }

    /// Ordinal position of the stage (0-4) for proper ordering comparisons.
    /// Note: Don't use rawValue for comparisons - it's a string and compares alphabetically!
    public var ordinal: Int {
        switch self {
        case .firstMeeting: return 0
        case .gettingStarted: return 1
        case .buildingTrust: return 2
        case .established: return 3
        case .deepPartnership: return 4
        }
    }
}

// MARK: - Relationship Metrics

public struct RelationshipMetrics: Codable {
    public var totalCalls: Int = 0
    public var totalDuration: TimeInterval = 0  // Seconds
    public var insightsShared: Int = 0
    public var vulnerabilityMoments: Int = 0
    public var returnsAfterAbsence: Int = 0
    public var consecutiveDays: Int = 0
    public var meaningfulExchanges: Int = 0
    public var lastCallDate: Date?

    public init() {}

    public var formattedDuration: String {
        let hours = Int(totalDuration) / 3600
        let minutes = (Int(totalDuration) % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes) min"
        }
    }
}

// MARK: - Relationship Memory

public struct RelationshipMemory: Codable, Identifiable {
    public var id: UUID
    public var date: Date
    public var type: MemoryType
    public var title: String
    public var description: String
    public var stage: RelationshipStage

    public init(id: UUID, date: Date, type: MemoryType, title: String, description: String, stage: RelationshipStage) {
        self.id = id
        self.date = date
        self.type = type
        self.title = title
        self.description = description
        self.stage = stage
    }
}

// MARK: - Memory Type

public enum MemoryType: String, Codable {
    case stageAdvancement = "stage-advancement"
    case milestone = "milestone"
    case insight = "insight"
    case breakthrough = "breakthrough"
    case celebration = "celebration"
}
