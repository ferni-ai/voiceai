//
//  HealthData.swift
//  Ferni
//
//  Health-related entities for HealthKit integration.
//  Enables "Better than Human" awareness of user's physical state.
//

import Foundation

// MARK: - Health Snapshot

/// A snapshot of the user's current health state
public struct HealthSnapshot: Equatable {
    public let heartRate: HeartRateReading?
    public let hrv: HRVReading?
    public let sleepAnalysis: SleepAnalysis?
    public let activitySummary: ActivitySummary?
    public let mindfulMinutes: Int
    public let timestamp: Date
    
    public init(
        heartRate: HeartRateReading? = nil,
        hrv: HRVReading? = nil,
        sleepAnalysis: SleepAnalysis? = nil,
        activitySummary: ActivitySummary? = nil,
        mindfulMinutes: Int = 0,
        timestamp: Date = Date()
    ) {
        self.heartRate = heartRate
        self.hrv = hrv
        self.sleepAnalysis = sleepAnalysis
        self.activitySummary = activitySummary
        self.mindfulMinutes = mindfulMinutes
        self.timestamp = timestamp
    }
}

// MARK: - Heart Rate

/// A heart rate reading
public struct HeartRateReading: Equatable {
    public let value: Double // BPM
    public let timestamp: Date
    public let context: HeartRateContext
    
    public init(value: Double, timestamp: Date = Date(), context: HeartRateContext = .unknown) {
        self.value = value
        self.timestamp = timestamp
        self.context = context
    }
    
    /// Whether this reading indicates elevated heart rate
    public var isElevated: Bool {
        // Simplified - would compare to user's baseline
        value > 100
    }
}

/// Context for heart rate reading
public enum HeartRateContext: String, Codable {
    case resting
    case active
    case workout
    case sleep
    case unknown
}

// MARK: - HRV (Heart Rate Variability)

/// Heart Rate Variability - key stress indicator
public struct HRVReading: Equatable {
    public let value: Double // SDNN in milliseconds
    public let timestamp: Date
    
    public init(value: Double, timestamp: Date = Date()) {
        self.value = value
        self.timestamp = timestamp
    }
    
    /// Whether this represents a significant drop from typical
    public func isSignificantDrop(from baseline: Double) -> Bool {
        value < baseline * 0.8 // 20% drop
    }
    
    /// Interpret the HRV value
    public var interpretation: HRVInterpretation {
        // Simplified interpretation - would be personalized
        switch value {
        case 0..<30: return .veryLow
        case 30..<50: return .low
        case 50..<70: return .moderate
        case 70..<100: return .good
        default: return .excellent
        }
    }
}

/// Interpretation of HRV value
public enum HRVInterpretation: String {
    case veryLow = "Very stressed or fatigued"
    case low = "Elevated stress"
    case moderate = "Moderate recovery"
    case good = "Good recovery"
    case excellent = "Excellent recovery"
    
    public var stressLevel: StressLevel {
        switch self {
        case .veryLow: return .high
        case .low: return .elevated
        case .moderate: return .mild
        case .good, .excellent: return .calm
        }
    }
}

// MARK: - Sleep Analysis

/// Analysis of sleep data
public struct SleepAnalysis: Equatable {
    public let totalDuration: TimeInterval
    public let deepSleep: TimeInterval
    public let remSleep: TimeInterval
    public let lightSleep: TimeInterval
    public let awakenings: Int
    public let bedtime: Date?
    public let wakeTime: Date?
    public let date: Date
    
    public init(
        totalDuration: TimeInterval,
        deepSleep: TimeInterval = 0,
        remSleep: TimeInterval = 0,
        lightSleep: TimeInterval = 0,
        awakenings: Int = 0,
        bedtime: Date? = nil,
        wakeTime: Date? = nil,
        date: Date = Date()
    ) {
        self.totalDuration = totalDuration
        self.deepSleep = deepSleep
        self.remSleep = remSleep
        self.lightSleep = lightSleep
        self.awakenings = awakenings
        self.bedtime = bedtime
        self.wakeTime = wakeTime
        self.date = date
    }
    
    /// Sleep duration in hours
    public var hours: Double {
        totalDuration / 3600
    }
    
    /// Calculate sleep quality score (0-100)
    public var sleepScore: Double {
        // Simplified scoring
        var score = 0.0
        
        // Duration component (40%)
        let durationScore = min(hours / 8.0, 1.0) * 40
        score += durationScore
        
        // Deep sleep component (30%) - target 1.5-2 hours
        let deepHours = deepSleep / 3600
        let deepScore = min(deepHours / 1.5, 1.0) * 30
        score += deepScore
        
        // REM component (20%) - target 1.5-2 hours
        let remHours = remSleep / 3600
        let remScore = min(remHours / 1.5, 1.0) * 20
        score += remScore
        
        // Awakenings penalty (10%)
        let awakeningsPenalty = Double(min(awakenings, 5)) * 2
        score += max(0, 10 - awakeningsPenalty)
        
        return min(100, score)
    }
    
    /// Sleep quality interpretation
    public var quality: SleepQuality {
        switch sleepScore {
        case 0..<40: return .poor
        case 40..<60: return .fair
        case 60..<80: return .good
        default: return .excellent
        }
    }
}

/// Sleep quality level
public enum SleepQuality: String, Codable {
    case poor
    case fair
    case good
    case excellent
    
    public var displayName: String {
        rawValue.capitalized
    }
}

// MARK: - Activity Summary

/// Summary of daily activity
public struct ActivitySummary: Equatable {
    public let steps: Int
    public let activeCalories: Double
    public let exerciseMinutes: Int
    public let standHours: Int
    public let distance: Double // meters
    public let date: Date
    
    public init(
        steps: Int = 0,
        activeCalories: Double = 0,
        exerciseMinutes: Int = 0,
        standHours: Int = 0,
        distance: Double = 0,
        date: Date = Date()
    ) {
        self.steps = steps
        self.activeCalories = activeCalories
        self.exerciseMinutes = exerciseMinutes
        self.standHours = standHours
        self.distance = distance
        self.date = date
    }
    
    /// Activity level interpretation
    public var activityLevel: ActivityLevel {
        switch steps {
        case 0..<3000: return .sedentary
        case 3000..<7000: return .light
        case 7000..<10000: return .active
        default: return .veryActive
        }
    }
}

/// Activity level
public enum ActivityLevel: String, Codable {
    case sedentary
    case light
    case active
    case veryActive = "very_active"
    
    public var displayName: String {
        switch self {
        case .sedentary: return "Sedentary"
        case .light: return "Lightly Active"
        case .active: return "Active"
        case .veryActive: return "Very Active"
        }
    }
}

// MARK: - Stress Level

/// Overall stress level interpretation
public enum StressLevel: String, Codable {
    case calm
    case mild
    case elevated
    case high
    
    public var displayName: String {
        switch self {
        case .calm: return "Calm"
        case .mild: return "Mild stress"
        case .elevated: return "Elevated stress"
        case .high: return "High stress"
        }
    }
}

// MARK: - Energy Level

/// Energy level interpretation
public enum EnergyLevel: String, Codable {
    case low
    case moderate
    case high
    
    public var displayName: String {
        rawValue.capitalized
    }
}

// MARK: - Health Context

/// Conversational context built from health data
public struct HealthContext: Equatable {
    public let stressLevel: StressLevel
    public let energyLevel: EnergyLevel
    public let sleepQuality: SleepQuality?
    public let activityStatus: ActivityLevel?
    public let insights: [HealthInsight]
    public let timestamp: Date
    
    public init(
        stressLevel: StressLevel = .calm,
        energyLevel: EnergyLevel = .moderate,
        sleepQuality: SleepQuality? = nil,
        activityStatus: ActivityLevel? = nil,
        insights: [HealthInsight] = [],
        timestamp: Date = Date()
    ) {
        self.stressLevel = stressLevel
        self.energyLevel = energyLevel
        self.sleepQuality = sleepQuality
        self.activityStatus = activityStatus
        self.insights = insights
        self.timestamp = timestamp
    }
    
    /// Generate conversational context for AI
    public var conversationalContext: String {
        var context = """
        BODY STATE (from wearables - user gave permission):
        - Stress: \(stressLevel.displayName)
        - Energy: \(energyLevel.displayName)
        """
        
        if let sleep = sleepQuality {
            context += "\n- Sleep: \(sleep.displayName)"
        }
        
        if let activity = activityStatus {
            context += "\n- Activity: \(activity.displayName)"
        }
        
        if !insights.isEmpty {
            context += "\n\nNOTABLE PATTERNS:"
            for insight in insights {
                context += "\n- \(insight.description)"
            }
        }
        
        context += """
        
        
        GUIDANCE: Never say "your wearable shows" or mention data directly.
        Instead, use phrases like "I sense you might be..." or "Something tells me..."
        """
        
        return context
    }
}

// MARK: - Health Insight

/// An insight derived from health data patterns
public enum HealthInsight: Equatable {
    case sleepDebtAccumulating(days: Int, avgDeficit: TimeInterval)
    case hrvDeclineDetected(percentDrop: Double, overDays: Int)
    case activityDropOff(fromAvg: Int, toRecent: Int)
    case consistentSleepSchedule(bedtimeVariance: TimeInterval)
    case morningHRVSpike
    case exercisePositiveCorrelation
    
    public var description: String {
        switch self {
        case .sleepDebtAccumulating(let days, let deficit):
            let hours = deficit / 3600
            return "Sleep debt accumulating: \(String(format: "%.1f", hours))h below target over \(days) days"
        case .hrvDeclineDetected(let drop, let days):
            return "HRV trending down \(Int(drop))% over \(days) days"
        case .activityDropOff(let from, let to):
            return "Activity dropped from \(from) to \(to) steps daily"
        case .consistentSleepSchedule(let variance):
            let minutes = variance / 60
            return "Consistent bedtime (±\(Int(minutes)) min variance)"
        case .morningHRVSpike:
            return "Morning HRV higher than usual"
        case .exercisePositiveCorrelation:
            return "Exercise correlates with better sleep"
        }
    }
    
    public var severity: InsightSeverity {
        switch self {
        case .sleepDebtAccumulating, .hrvDeclineDetected:
            return .attention
        case .activityDropOff:
            return .mild
        case .consistentSleepSchedule, .exercisePositiveCorrelation:
            return .positive
        case .morningHRVSpike:
            return .neutral
        }
    }
}

/// Severity/valence of an insight
public enum InsightSeverity {
    case positive
    case neutral
    case mild
    case attention
}
