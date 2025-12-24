import SwiftUI
import Combine

// MARK: - Breath Sync Engine
/// Synchronizes Ferni's breathing rhythm with the user's detected breath pattern.
/// This creates "neural mirroring" - an unconscious sense of connection.
///
/// From BETTER-THAN-HUMAN.md:
/// - Detect user breath rate from pause patterns in speech
/// - Gradually sync (not exact - slightly slower for calming effect)
/// - Sync strength varies with conversation intensity

public class BreathSyncEngine: ObservableObject {

    // MARK: - Published State

    /// Current breath phase (0-1, where 0.5 is peak inhale)
    @Published public private(set) var currentBreathPhase: CGFloat = 0

    /// Current breath cycle rate (seconds per full cycle)
    @Published public private(set) var syncedBreathRate: TimeInterval = PixarTiming.breathCycleIdle

    /// How strongly we're synced to user (0-1)
    @Published public private(set) var syncStrength: CGFloat = 0

    // MARK: - Configuration

    private enum Config {
        static let minBreathRate: TimeInterval = 3.0      // Fastest (stressed user)
        static let maxBreathRate: TimeInterval = 10.0     // Slowest (relaxed)
        static let defaultRate: TimeInterval = 6.0        // Idle rate
        static let calmingOffset: TimeInterval = 0.5      // Slightly slower than user (calming)
        static let syncBuildupTime: TimeInterval = 5.0    // Time to reach full sync
        static let syncDecayTime: TimeInterval = 10.0     // Time to lose sync after silence
        static let pauseWindowSize: Int = 8              // Number of pauses to analyze
    }

    // MARK: - Private State

    private var isRunning: Bool = false
    private var timer: Timer?
    private var startTime: Date = Date()

    // Pause pattern analysis
    private var recentPauses: [TimeInterval] = []
    private var lastSpeechTime: Date = Date()
    private var isInPause: Bool = false
    private var pauseStartTime: Date?

    // Audio level tracking for pause detection
    private let silenceThreshold: Float = 0.05
    private var consecutiveSilentFrames: Int = 0
    private let framesForPause: Int = 10  // ~160ms at 60fps

    // MARK: - Public API

    public init() {}

    /// Start the breath sync engine
    public func start() {
        guard !isRunning else { return }
        isRunning = true
        startTime = Date()
        syncedBreathRate = Config.defaultRate
        syncStrength = 0

        // 60fps update timer for smooth breathing
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.updateBreathPhase()
        }
    }

    /// Stop the breath sync engine
    public func stop() {
        isRunning = false
        timer?.invalidate()
        timer = nil
        currentBreathPhase = 0
        syncStrength = 0
        recentPauses.removeAll()
    }

    /// Update with current audio level (0-1)
    public func updateFromAudioLevel(_ level: Float) {
        guard isRunning else { return }

        if level < silenceThreshold {
            consecutiveSilentFrames += 1

            // Start pause tracking
            if consecutiveSilentFrames == framesForPause && !isInPause {
                isInPause = true
                pauseStartTime = Date()
            }
        } else {
            // End of pause
            if isInPause, let start = pauseStartTime {
                let pauseDuration = Date().timeIntervalSince(start)
                recordPause(duration: pauseDuration)
                isInPause = false
                pauseStartTime = nil
            }

            consecutiveSilentFrames = 0
            lastSpeechTime = Date()
        }

        // Decay sync strength during long silences
        let silenceDuration = Date().timeIntervalSince(lastSpeechTime)
        if silenceDuration > 3.0 {
            let decayFactor = min(1.0, silenceDuration / Config.syncDecayTime)
            syncStrength = max(0, syncStrength - CGFloat(decayFactor * 0.01))
        }
    }

    // MARK: - Private Methods

    private func updateBreathPhase() {
        let elapsed = Date().timeIntervalSince(startTime)
        let cyclePosition = elapsed.truncatingRemainder(dividingBy: syncedBreathRate)
        currentBreathPhase = CGFloat(cyclePosition / syncedBreathRate)
    }

    private func recordPause(duration: TimeInterval) {
        // Only record meaningful pauses (breath-length)
        guard duration > 0.5 && duration < 4.0 else { return }

        recentPauses.append(duration)

        // Keep window size limited
        if recentPauses.count > Config.pauseWindowSize {
            recentPauses.removeFirst()
        }

        // Need enough samples to estimate
        guard recentPauses.count >= 3 else { return }

        // Estimate breath rate from pause patterns
        estimateBreathRate()
    }

    private func estimateBreathRate() {
        // Average pause duration suggests breath timing
        let avgPause = recentPauses.reduce(0, +) / Double(recentPauses.count)

        // Breath rate is roughly 2x the average pause (inhale + exhale)
        // Plus speaking time between pauses
        var estimatedRate = avgPause * 3.0  // Rough heuristic

        // Clamp to reasonable range
        estimatedRate = min(Config.maxBreathRate, max(Config.minBreathRate, estimatedRate))

        // Add calming offset (we breathe slightly slower)
        estimatedRate += Config.calmingOffset

        // Gradually sync (don't jump)
        let currentSync = syncStrength
        let targetSync = min(1.0, currentSync + 0.05)
        syncStrength = targetSync

        // Blend current rate with detected rate based on sync strength
        let blendedRate = syncedBreathRate * Double(1 - syncStrength * 0.3) +
                         estimatedRate * Double(syncStrength * 0.3)

        syncedBreathRate = blendedRate
    }

    /// Manually set breath rate (for testing or override)
    public func setBreathRate(_ rate: TimeInterval) {
        syncedBreathRate = min(Config.maxBreathRate, max(Config.minBreathRate, rate))
    }

    /// Reset to default idle breathing
    public func resetToIdle() {
        syncedBreathRate = Config.defaultRate
        syncStrength = 0
        recentPauses.removeAll()
    }
}
