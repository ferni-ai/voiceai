/**
 * Kotlin/Android Type Definitions for Visualizations
 *
 * This module generates Kotlin-compatible type documentation.
 * Use `npx ts-to-kotlin` or kotlinx.serialization codegen tools.
 *
 * These types mirror the TypeScript definitions for native Android rendering.
 *
 * @module visualizations/native/kotlin-types
 */

// ============================================================================
// KOTLIN TYPE COMMENTS (for codegen tools)
// ============================================================================

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * enum class DeviceType {
 *     @SerialName("watch") WATCH,
 *     @SerialName("mobile") MOBILE,
 *     @SerialName("tablet") TABLET,
 *     @SerialName("desktop") DESKTOP,
 *     @SerialName("tv") TV
 * }
 *
 * @Serializable
 * enum class Platform {
 *     @SerialName("ios") IOS,
 *     @SerialName("android") ANDROID,
 *     @SerialName("web") WEB
 * }
 *
 * @Serializable
 * data class DeviceContext(
 *     val type: DeviceType,
 *     val platform: Platform,
 *     val width: Float,
 *     val height: Float,
 *     val prefersReducedMotion: Boolean,
 *     val isDarkMode: Boolean
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * enum class MoodType {
 *     @SerialName("calm") CALM,
 *     @SerialName("joyful") JOYFUL,
 *     @SerialName("anxious") ANXIOUS,
 *     @SerialName("tired") TIRED,
 *     @SerialName("focused") FOCUSED,
 *     @SerialName("reflective") REFLECTIVE,
 *     @SerialName("stressed") STRESSED,
 *     @SerialName("energized") ENERGIZED,
 *     @SerialName("peaceful") PEACEFUL,
 *     @SerialName("uncertain") UNCERTAIN
 * }
 *
 * @Serializable
 * data class MoodEntry(
 *     val date: String,
 *     val mood: MoodType,
 *     val intensity: Double,
 *     val note: String? = null
 * )
 *
 * @Serializable
 * data class MoodCalendarSummary(
 *     val dominantMood: MoodType,
 *     val calmDays: Int,
 *     val trend: String
 * )
 *
 * @Serializable
 * data class MoodCalendarData(
 *     val entries: List<MoodEntry>,
 *     val summary: MoodCalendarSummary,
 *     val period: String
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class BurnoutFactors(
 *     val emotional: Int,
 *     val mental: Int,
 *     val physical: Int
 * )
 *
 * @Serializable
 * data class BurnoutGaugeData(
 *     val capacity: Int,
 *     val trend: String,
 *     val status: String,
 *     val factors: BurnoutFactors,
 *     val updatedAt: String
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class TimelineChapter(
 *     val id: String,
 *     val title: String,
 *     val type: String,
 *     val startDate: String,
 *     val endDate: String? = null,
 *     val isActive: Boolean,
 *     val progress: Double,
 *     val summary: String? = null
 * )
 *
 * @Serializable
 * data class LifeTimelineData(
 *     val chapters: List<TimelineChapter>,
 *     val currentChapter: TimelineChapter,
 *     val totalChapters: Int,
 *     val narrativeSummary: String? = null
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class GrowthDimension(
 *     val name: String,
 *     val value: Double,
 *     val previousValue: Double? = null,
 *     val trend: String
 * )
 *
 * @Serializable
 * data class GrowthRadarData(
 *     val dimensions: List<GrowthDimension>,
 *     val overallGrowth: Double,
 *     val focusArea: String? = null
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class EmotionalArcPhase(
 *     val name: String,
 *     val position: Double,
 *     val intensity: Double,
 *     val description: String? = null
 * )
 *
 * @Serializable
 * data class EmotionalArcsData(
 *     val currentPhase: EmotionalArcPhase,
 *     val phases: List<EmotionalArcPhase>,
 *     val arcType: String
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class PredictionScenarios(
 *     val conservative: Double,
 *     val expected: Double,
 *     val optimistic: Double
 * )
 *
 * @Serializable
 * data class Prediction(
 *     val metric: String,
 *     val currentValue: Double,
 *     val predictedValue: Double,
 *     val confidence: Double,
 *     val timeframe: String,
 *     val scenarios: PredictionScenarios
 * )
 *
 * @Serializable
 * data class PredictionsData(
 *     val predictions: List<Prediction>,
 *     val primaryPrediction: Prediction,
 *     val accuracy: Double
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class Relationship(
 *     val name: String,
 *     val strength: Double,
 *     val lastContact: String,
 *     val category: String,
 *     val trend: String
 * )
 *
 * @Serializable
 * data class RelationshipNetworkData(
 *     val relationships: List<Relationship>,
 *     val totalConnections: Int,
 *     val activeConnections: Int,
 *     val needsAttention: List<String>
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class OpenLoop(
 *     val id: String,
 *     val description: String,
 *     val createdAt: String,
 *     val priority: String,
 *     val category: String,
 *     val relatedPerson: String? = null
 * )
 *
 * @Serializable
 * data class OpenLoopsData(
 *     val loops: List<OpenLoop>,
 *     val totalOpen: Int,
 *     val oldestLoop: OpenLoop? = null,
 *     val recentlyClosed: Int
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class EnergyRingsData(
 *     val emotional: Int,
 *     val mental: Int,
 *     val physical: Int,
 *     val overall: Int
 * )
 * ```
 */

/**
 * @kotlin
 * ```kotlin
 * @Serializable
 * data class VisualizationApiResponse(
 *     val userId: String,
 *     val timestamp: String,
 *     val moodCalendar: MoodCalendarData? = null,
 *     val burnoutGauge: BurnoutGaugeData? = null,
 *     val lifeTimeline: LifeTimelineData? = null,
 *     val growthRadar: GrowthRadarData? = null,
 *     val emotionalArcs: EmotionalArcsData? = null,
 *     val predictions: PredictionsData? = null,
 *     val relationshipNetwork: RelationshipNetworkData? = null,
 *     val openLoops: OpenLoopsData? = null,
 *     val energyRings: EnergyRingsData? = null
 * )
 * ```
 */

// ============================================================================
// COLOR TOKENS (for Compose theming)
// ============================================================================

/**
 * @kotlin
 * ```kotlin
 * object VisualizationColors {
 *     val accent = Color(0xFF3D5A45)
 *     val accentSecondary = Color(0xFF4a6741)
 *     val background = Color(0xFFFFFDFB)
 *     val backgroundElevated = Color(0xFFFFFFFF)
 *     val textPrimary = Color(0xFF2C2520)
 *     val textSecondary = Color(0xFF5c544a)
 *     val textMuted = Color(0xFF9a8f85)
 *
 *     object Moods {
 *         val calm = Color(0xFF3D5A45)
 *         val joyful = Color(0xFFf5a623)
 *         val anxious = Color(0xFFe74c3c)
 *         val tired = Color(0xFF9a8f85)
 *         val focused = Color(0xFF3a6b73)
 *         val reflective = Color(0xFF8a7a9a)
 *         val stressed = Color(0xFFc0392b)
 *         val energized = Color(0xFF27ae60)
 *         val peaceful = Color(0xFF5a8b73)
 *         val uncertain = Color(0xFF7f8c8d)
 *     }
 *
 *     object Energy {
 *         val emotional = Color(0xFFa67a6a)
 *         val mental = Color(0xFF3a6b73)
 *         val physical = Color(0xFF4a6741)
 *     }
 *
 *     object Status {
 *         val thriving = Color(0xFF27ae60)
 *         val balanced = Color(0xFF3D5A45)
 *         val stretched = Color(0xFFf5a623)
 *         val depleted = Color(0xFFe67e22)
 *         val critical = Color(0xFFe74c3c)
 *     }
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
