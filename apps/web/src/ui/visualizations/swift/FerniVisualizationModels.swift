// MARK: - Ferni Visualization Models
// SwiftUI-ready data models for cross-platform visualizations
// Generated from TypeScript definitions in ../types.ts

import Foundation
import SwiftUI

// MARK: - Device Context

enum DeviceType: String, Codable {
    case watch
    case mobile
    case tablet
    case desktop
    case tv
}

enum Platform: String, Codable {
    case ios
    case android
    case web
}

struct DeviceContext: Codable {
    let type: DeviceType
    let platform: Platform
    let width: CGFloat
    let height: CGFloat
    let prefersReducedMotion: Bool
    let isDarkMode: Bool

    static var current: DeviceContext {
        #if os(watchOS)
        let type: DeviceType = .watch
        #elseif os(iOS)
        let type: DeviceType = UIDevice.current.userInterfaceIdiom == .pad ? .tablet : .mobile
        #elseif os(tvOS)
        let type: DeviceType = .tv
        #else
        let type: DeviceType = .desktop
        #endif

        let screen = UIScreen.main.bounds
        return DeviceContext(
            type: type,
            platform: .ios,
            width: screen.width,
            height: screen.height,
            prefersReducedMotion: UIAccessibility.isReduceMotionEnabled,
            isDarkMode: UITraitCollection.current.userInterfaceStyle == .dark
        )
    }
}

// MARK: - Mood Types

enum MoodType: String, Codable, CaseIterable {
    case calm
    case joyful
    case anxious
    case tired
    case focused
    case reflective
    case stressed
    case energized
    case peaceful
    case uncertain

    var color: Color {
        FerniColors.mood(self)
    }

    var displayName: String {
        rawValue.capitalized
    }
}

enum Trend: String, Codable {
    case improving
    case stable
    case declining
    case recovering
    case growing
    case needsAttention = "needs-attention"
    case deepening
    case fading
}

// MARK: - Energy Rings

struct EnergyRingsData: Codable, Identifiable {
    var id: String { "energy-rings" }

    let emotional: Int
    let mental: Int
    let physical: Int
    let overall: Int

    var status: EnergyStatus {
        switch overall {
        case 80...100: return .thriving
        case 60..<80: return .balanced
        case 40..<60: return .stretched
        case 20..<40: return .depleted
        default: return .critical
        }
    }

    enum EnergyStatus: String {
        case thriving, balanced, stretched, depleted, critical

        var color: Color {
            FerniColors.status(self)
        }

        var displayName: String {
            rawValue.capitalized
        }
    }
}

// MARK: - Mood Calendar

struct MoodEntry: Codable, Identifiable {
    var id: String { date }

    let date: String
    let mood: MoodType
    let intensity: Double
    let note: String?

    var dateValue: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: date)
    }
}

struct MoodCalendarSummary: Codable {
    let dominantMood: MoodType
    let calmDays: Int
    let trend: Trend
}

struct MoodCalendarData: Codable, Identifiable {
    var id: String { "mood-calendar-\(period)" }

    let entries: [MoodEntry]
    let summary: MoodCalendarSummary
    let period: String // "week" | "month" | "quarter"
}

// MARK: - Burnout Gauge

struct BurnoutFactors: Codable {
    let emotional: Int
    let mental: Int
    let physical: Int
}

enum BurnoutStatus: String, Codable {
    case thriving
    case balanced
    case stretched
    case depleted
    case critical

    var color: Color {
        switch self {
        case .thriving: return FerniColors.status(.thriving)
        case .balanced: return FerniColors.status(.balanced)
        case .stretched: return FerniColors.status(.stretched)
        case .depleted: return FerniColors.status(.depleted)
        case .critical: return FerniColors.status(.critical)
        }
    }
}

struct BurnoutGaugeData: Codable, Identifiable {
    var id: String { "burnout-gauge" }

    let capacity: Int
    let trend: Trend
    let status: BurnoutStatus
    let factors: BurnoutFactors
    let updatedAt: String
}

// MARK: - Life Timeline

enum ChapterType: String, Codable {
    case growth
    case challenge
    case transition
    case celebration
    case reflection

    var color: Color {
        switch self {
        case .growth: return FerniColors.accent
        case .challenge: return FerniColors.moods.anxious
        case .transition: return FerniColors.moods.reflective
        case .celebration: return FerniColors.moods.joyful
        case .reflection: return FerniColors.moods.peaceful
        }
    }

    var icon: String {
        switch self {
        case .growth: return "leaf.fill"
        case .challenge: return "mountain.2.fill"
        case .transition: return "arrow.triangle.branch"
        case .celebration: return "star.fill"
        case .reflection: return "moon.fill"
        }
    }
}

struct TimelineChapter: Codable, Identifiable {
    let id: String
    let title: String
    let type: ChapterType
    let startDate: String
    let endDate: String?
    let isActive: Bool
    let progress: Double
    let summary: String?
}

struct LifeTimelineData: Codable, Identifiable {
    var id: String { "life-timeline" }

    let chapters: [TimelineChapter]
    let currentChapter: TimelineChapter
    let totalChapters: Int
    let narrativeSummary: String?
}

// MARK: - Growth Radar

struct GrowthDimension: Codable, Identifiable {
    var id: String { name }

    let name: String
    let value: Double
    let previousValue: Double?
    let trend: Trend
}

struct GrowthRadarData: Codable, Identifiable {
    var id: String { "growth-radar" }

    let dimensions: [GrowthDimension]
    let overallGrowth: Double
    let focusArea: String?
}

// MARK: - Emotional Arcs

struct EmotionalArcPhase: Codable, Identifiable {
    var id: String { name }

    let name: String
    let position: Double
    let intensity: Double
    let description: String?
}

enum ArcType: String, Codable {
    case heroJourney = "hero-journey"
    case growth
    case recovery
    case discovery
}

struct EmotionalArcsData: Codable, Identifiable {
    var id: String { "emotional-arcs" }

    let currentPhase: EmotionalArcPhase
    let phases: [EmotionalArcPhase]
    let arcType: ArcType
}

// MARK: - Predictions

struct PredictionScenarios: Codable {
    let conservative: Double
    let expected: Double
    let optimistic: Double
}

struct Prediction: Codable, Identifiable {
    var id: String { metric }

    let metric: String
    let currentValue: Double
    let predictedValue: Double
    let confidence: Double
    let timeframe: String
    let scenarios: PredictionScenarios
}

struct PredictionsData: Codable, Identifiable {
    var id: String { "predictions" }

    let predictions: [Prediction]
    let primaryPrediction: Prediction
    let accuracy: Double
}

// MARK: - Relationship Network

enum RelationshipCategory: String, Codable {
    case family
    case friend
    case colleague
    case mentor
    case other

    var color: Color {
        switch self {
        case .family: return FerniColors.moods.joyful
        case .friend: return FerniColors.accent
        case .colleague: return FerniColors.energy.mental
        case .mentor: return FerniColors.moods.reflective
        case .other: return FerniColors.textMuted
        }
    }
}

struct Relationship: Codable, Identifiable {
    var id: String { name }

    let name: String
    let strength: Double
    let lastContact: String
    let category: RelationshipCategory
    let trend: Trend
}

struct RelationshipNetworkData: Codable, Identifiable {
    var id: String { "relationship-network" }

    let relationships: [Relationship]
    let totalConnections: Int
    let activeConnections: Int
    let needsAttention: [String]
}

// MARK: - Open Loops

enum LoopPriority: String, Codable {
    case high
    case medium
    case low

    var color: Color {
        switch self {
        case .high: return FerniColors.status(.critical)
        case .medium: return FerniColors.status(.stretched)
        case .low: return FerniColors.textMuted
        }
    }
}

enum LoopCategory: String, Codable {
    case commitment
    case question
    case intention
    case followUp = "follow-up"

    var icon: String {
        switch self {
        case .commitment: return "checkmark.circle"
        case .question: return "questionmark.circle"
        case .intention: return "sparkles"
        case .followUp: return "arrow.uturn.forward.circle"
        }
    }
}

struct OpenLoop: Codable, Identifiable {
    let id: String
    let description: String
    let createdAt: String
    let priority: LoopPriority
    let category: LoopCategory
    let relatedPerson: String?
}

struct OpenLoopsData: Codable, Identifiable {
    var id: String { "open-loops" }

    let loops: [OpenLoop]
    let totalOpen: Int
    let oldestLoop: OpenLoop?
    let recentlyClosed: Int
}

// MARK: - Complete API Response

struct VisualizationApiResponse: Codable {
    let userId: String
    let timestamp: String
    let moodCalendar: MoodCalendarData?
    let burnoutGauge: BurnoutGaugeData?
    let lifeTimeline: LifeTimelineData?
    let growthRadar: GrowthRadarData?
    let emotionalArcs: EmotionalArcsData?
    let predictions: PredictionsData?
    let relationshipNetwork: RelationshipNetworkData?
    let openLoops: OpenLoopsData?
    let energyRings: EnergyRingsData?
}
