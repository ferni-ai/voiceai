/**
 * Swift/iOS Type Definitions for Visualizations
 *
 * This module generates Swift-compatible type documentation.
 * Use `npx ts-to-swift` or similar tools to convert these to .swift files.
 *
 * These types mirror the TypeScript definitions for native iOS rendering.
 *
 * @module visualizations/native/swift-types
 */

// ============================================================================
// SWIFT TYPE COMMENTS (for codegen tools)
// ============================================================================

/**
 * @swift
 * ```swift
 * enum DeviceType: String, Codable {
 *     case watch
 *     case mobile
 *     case tablet
 *     case desktop
 *     case tv
 * }
 *
 * enum Platform: String, Codable {
 *     case ios
 *     case android
 *     case web
 * }
 *
 * struct DeviceContext: Codable {
 *     let type: DeviceType
 *     let platform: Platform
 *     let width: CGFloat
 *     let height: CGFloat
 *     let prefersReducedMotion: Bool
 *     let isDarkMode: Bool
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * enum MoodType: String, Codable {
 *     case calm
 *     case joyful
 *     case anxious
 *     case tired
 *     case focused
 *     case reflective
 *     case stressed
 *     case energized
 *     case peaceful
 *     case uncertain
 * }
 *
 * struct MoodEntry: Codable, Identifiable {
 *     let id: String { date }
 *     let date: String
 *     let mood: MoodType
 *     let intensity: Double
 *     let note: String?
 * }
 *
 * struct MoodCalendarSummary: Codable {
 *     let dominantMood: MoodType
 *     let calmDays: Int
 *     let trend: String // "improving" | "stable" | "declining"
 * }
 *
 * struct MoodCalendarData: Codable {
 *     let entries: [MoodEntry]
 *     let summary: MoodCalendarSummary
 *     let period: String // "week" | "month" | "quarter"
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct BurnoutFactors: Codable {
 *     let emotional: Int
 *     let mental: Int
 *     let physical: Int
 * }
 *
 * struct BurnoutGaugeData: Codable {
 *     let capacity: Int
 *     let trend: String // "recovering" | "stable" | "declining"
 *     let status: String // "thriving" | "balanced" | "stretched" | "depleted" | "critical"
 *     let factors: BurnoutFactors
 *     let updatedAt: String
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct TimelineChapter: Codable, Identifiable {
 *     let id: String
 *     let title: String
 *     let type: String // "growth" | "challenge" | "transition" | "celebration" | "reflection"
 *     let startDate: String
 *     let endDate: String?
 *     let isActive: Bool
 *     let progress: Double
 *     let summary: String?
 * }
 *
 * struct LifeTimelineData: Codable {
 *     let chapters: [TimelineChapter]
 *     let currentChapter: TimelineChapter
 *     let totalChapters: Int
 *     let narrativeSummary: String?
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct GrowthDimension: Codable {
 *     let name: String
 *     let value: Double
 *     let previousValue: Double?
 *     let trend: String // "growing" | "stable" | "needs-attention"
 * }
 *
 * struct GrowthRadarData: Codable {
 *     let dimensions: [GrowthDimension]
 *     let overallGrowth: Double
 *     let focusArea: String?
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct EmotionalArcPhase: Codable {
 *     let name: String
 *     let position: Double
 *     let intensity: Double
 *     let description: String?
 * }
 *
 * struct EmotionalArcsData: Codable {
 *     let currentPhase: EmotionalArcPhase
 *     let phases: [EmotionalArcPhase]
 *     let arcType: String // "hero-journey" | "growth" | "recovery" | "discovery"
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct PredictionScenarios: Codable {
 *     let conservative: Double
 *     let expected: Double
 *     let optimistic: Double
 * }
 *
 * struct Prediction: Codable {
 *     let metric: String
 *     let currentValue: Double
 *     let predictedValue: Double
 *     let confidence: Double
 *     let timeframe: String
 *     let scenarios: PredictionScenarios
 * }
 *
 * struct PredictionsData: Codable {
 *     let predictions: [Prediction]
 *     let primaryPrediction: Prediction
 *     let accuracy: Double
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct Relationship: Codable, Identifiable {
 *     var id: String { name }
 *     let name: String
 *     let strength: Double
 *     let lastContact: String
 *     let category: String // "family" | "friend" | "colleague" | "mentor" | "other"
 *     let trend: String // "deepening" | "stable" | "fading"
 * }
 *
 * struct RelationshipNetworkData: Codable {
 *     let relationships: [Relationship]
 *     let totalConnections: Int
 *     let activeConnections: Int
 *     let needsAttention: [String]
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct OpenLoop: Codable, Identifiable {
 *     let id: String
 *     let description: String
 *     let createdAt: String
 *     let priority: String // "high" | "medium" | "low"
 *     let category: String // "commitment" | "question" | "intention" | "follow-up"
 *     let relatedPerson: String?
 * }
 *
 * struct OpenLoopsData: Codable {
 *     let loops: [OpenLoop]
 *     let totalOpen: Int
 *     let oldestLoop: OpenLoop?
 *     let recentlyClosed: Int
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct EnergyRingsData: Codable {
 *     let emotional: Int
 *     let mental: Int
 *     let physical: Int
 *     let overall: Int
 * }
 * ```
 */

/**
 * @swift
 * ```swift
 * struct VisualizationApiResponse: Codable {
 *     let userId: String
 *     let timestamp: String
 *     let moodCalendar: MoodCalendarData?
 *     let burnoutGauge: BurnoutGaugeData?
 *     let lifeTimeline: LifeTimelineData?
 *     let growthRadar: GrowthRadarData?
 *     let emotionalArcs: EmotionalArcsData?
 *     let predictions: PredictionsData?
 *     let relationshipNetwork: RelationshipNetworkData?
 *     let openLoops: OpenLoopsData?
 *     let energyRings: EnergyRingsData?
 * }
 * ```
 */

// ============================================================================
// EXPORTS (for TypeScript validation)
// ============================================================================

export type {
  DeviceType,
  Platform,
  DeviceContext,
  MoodType,
  MoodEntry,
  MoodCalendarData,
  BurnoutGaugeData,
  TimelineChapter,
  LifeTimelineData,
  GrowthDimension,
  GrowthRadarData,
  EmotionalArcPhase,
  EmotionalArcsData,
  Prediction,
  PredictionsData,
  Relationship,
  RelationshipNetworkData,
  OpenLoop,
  OpenLoopsData,
  EnergyRingsData,
  VisualizationApiResponse,
} from '../types.js';
